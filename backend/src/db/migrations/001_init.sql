-- Multi-Workspace Document Assistant: initial schema
-- Run this in the Supabase SQL editor (or via `psql`) on a fresh project.

create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists idx_workspace_members_user on workspace_members(user_id);

-- ---------------------------------------------------------------------------
-- Documents (one row per uploaded file, per workspace)
-- ---------------------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  filename text not null,
  content_hash text not null,
  status text not null default 'ready' check (status in ('processing', 'ready', 'failed')),
  chunk_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (workspace_id, content_hash)
);

create index if not exists idx_documents_workspace on documents(workspace_id);

-- ---------------------------------------------------------------------------
-- Chunks: the single shared vector store for ALL workspaces.
-- workspace_id is denormalized here (not just reachable via a join) so the
-- tenant filter can live directly in the WHERE clause of the vector query.
-- Gemini text-embedding-004 produces 768-dim vectors.
-- ---------------------------------------------------------------------------
create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  section_label text,
  embedding vector(768) not null,
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  created_at timestamptz not null default now()
);

-- btree on workspace_id as the leading filter column for the tenant predicate.
create index if not exists idx_chunks_workspace on chunks(workspace_id);
create index if not exists idx_chunks_tsv on chunks using gin (content_tsv);

-- NOTE: no ivfflat/HNSW ANN index on `embedding` here on purpose. pgvector's
-- ivfflat index must be built AFTER representative data exists (it clusters
-- the rows present at CREATE INDEX time); building it against an empty table
-- - as happens on a fresh migration, before any document is ingested -
-- produces a permanently degenerate index that can make `match_chunks`
-- silently return zero rows once the planner chooses to use it. At this
-- project's data volumes a sequential scan over `embedding` is fast and,
-- crucially, always correct. If you later need to scale past that, add the
-- ANN index manually once the table has a realistic amount of data:
--   create index idx_chunks_embedding on chunks
--     using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- Explicit, opt-in cross-workspace sharing (stretch goal).
-- A row here means: chunks belonging to `document_id` are also retrievable
-- from `shared_with_workspace_id`, without weakening the default isolation.
-- ---------------------------------------------------------------------------
create table if not exists shared_documents (
  document_id uuid not null references documents(id) on delete cascade,
  shared_with_workspace_id uuid not null references workspaces(id) on delete cascade,
  shared_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (document_id, shared_with_workspace_id)
);

-- ---------------------------------------------------------------------------
-- Chat history
-- ---------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id),
  role text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_workspace on messages(workspace_id, created_at);

-- ---------------------------------------------------------------------------
-- Tool call log (also the "did a tool actually fire" audit trail)
-- ---------------------------------------------------------------------------
create table if not exists tool_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  message_id uuid references messages(id) on delete cascade,
  tool_name text not null,
  arguments jsonb not null,
  result jsonb,
  status text not null check (status in ('success', 'failed')),
  error text,
  latency_ms int,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_calls_workspace on tool_calls(workspace_id, created_at);

-- Side-effect table written by the save_task tool.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  details text,
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_workspace on tasks(workspace_id);

-- ---------------------------------------------------------------------------
-- Observability (stretch goal)
-- ---------------------------------------------------------------------------
create table if not exists request_metrics (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  endpoint text not null,
  token_count_in int,
  token_count_out int,
  latency_ms int not null,
  retrieval_hit boolean,
  created_at timestamptz not null default now()
);

create index if not exists idx_metrics_workspace on request_metrics(workspace_id, created_at);

-- ---------------------------------------------------------------------------
-- Vector + hybrid search RPCs. The workspace/sharing filter is baked into the
-- WHERE clause of the same statement that performs the ANN ordering — never
-- applied after the fact in application code.
-- ---------------------------------------------------------------------------
create or replace function match_chunks(
  query_embedding vector(768),
  p_workspace_ids uuid[],
  match_count int default 8,
  p_shared_document_ids uuid[] default '{}'
)
returns table (
  id uuid,
  document_id uuid,
  workspace_id uuid,
  chunk_index int,
  content text,
  section_label text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.document_id,
    c.workspace_id,
    c.chunk_index,
    c.content,
    c.section_label,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.workspace_id = any(p_workspace_ids)
     or c.document_id = any(p_shared_document_ids)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Hybrid search: reciprocal-rank fusion of vector similarity and full-text
-- rank, still scoped by the same workspace predicate on every branch.
create or replace function match_chunks_hybrid(
  query_embedding vector(768),
  query_text text,
  p_workspace_ids uuid[],
  match_count int default 8,
  p_shared_document_ids uuid[] default '{}'
)
returns table (
  id uuid,
  document_id uuid,
  workspace_id uuid,
  chunk_index int,
  content text,
  section_label text,
  score float
)
language sql stable
as $$
  with vector_ranked as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding) as rank
    from chunks c
    where c.workspace_id = any(p_workspace_ids) or c.document_id = any(p_shared_document_ids)
    order by c.embedding <=> query_embedding
    limit 50
  ),
  text_ranked as (
    select c.id, row_number() over (order by ts_rank(c.content_tsv, plainto_tsquery('english', query_text)) desc) as rank
    from chunks c
    where (c.workspace_id = any(p_workspace_ids) or c.document_id = any(p_shared_document_ids))
      and c.content_tsv @@ plainto_tsquery('english', query_text)
    limit 50
  ),
  fused as (
    select id, sum(1.0 / (60 + rank)) as rrf_score
    from (
      select id, rank from vector_ranked
      union all
      select id, rank from text_ranked
    ) both_ranks
    group by id
  )
  select
    c.id, c.document_id, c.workspace_id, c.chunk_index, c.content, c.section_label,
    f.rrf_score as score
  from fused f
  join chunks c on c.id = f.id
  order by f.rrf_score desc
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: defense-in-depth beneath the app-level workspace check.
-- The backend talks to Postgres with the service_role key (bypasses RLS), so
-- these policies matter chiefly if a client key is ever used directly.
-- ---------------------------------------------------------------------------
alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
alter table messages enable row level security;
alter table tool_calls enable row level security;
alter table tasks enable row level security;
alter table shared_documents enable row level security;

create policy workspace_members_select on workspaces for select
  using (exists (select 1 from workspace_members m where m.workspace_id = id and m.user_id = auth.uid()));

create policy workspace_members_self on workspace_members for select
  using (user_id = auth.uid());

create policy documents_member_only on documents for select
  using (exists (select 1 from workspace_members m where m.workspace_id = documents.workspace_id and m.user_id = auth.uid()));

create policy chunks_member_only on chunks for select
  using (exists (select 1 from workspace_members m where m.workspace_id = chunks.workspace_id and m.user_id = auth.uid()));

create policy messages_member_only on messages for select
  using (exists (select 1 from workspace_members m where m.workspace_id = messages.workspace_id and m.user_id = auth.uid()));

create policy tool_calls_member_only on tool_calls for select
  using (exists (select 1 from workspace_members m where m.workspace_id = tool_calls.workspace_id and m.user_id = auth.uid()));

create policy tasks_member_only on tasks for select
  using (exists (select 1 from workspace_members m where m.workspace_id = tasks.workspace_id and m.user_id = auth.uid()));

create policy shared_documents_member_only on shared_documents for select
  using (exists (select 1 from workspace_members m where m.workspace_id = shared_documents.shared_with_workspace_id and m.user_id = auth.uid()));
