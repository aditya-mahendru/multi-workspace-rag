# AI Notes

## Tools and split of work

Built with Claude Code (Claude Sonnet 5), acting as a pair-programmer for the entire build: schema
design, backend services, frontend components, and this documentation. I made the architectural
and stack decisions up front (see below); Claude Code wrote the implementation against a plan I
reviewed and approved before any code was written, and I reviewed/adjusted the generated code
directly rather than accepting it blind (e.g. fixing a `tsconfig`/`rootDir` build error, dropping
an unused JWT-secret env var once I decided to verify sessions via `supabase.auth.getUser()`
instead of manual JWT verification).

## Key decisions I made

1. **Workspace filter lives inside the SQL, not the application layer.** Rather than fetching
   candidate chunks and filtering in JS, the vector search is a Postgres RPC
   (`match_chunks`/`match_chunks_hybrid`) whose `WHERE` clause includes `workspace_id = any($ids)`
   in the same statement that does the ANN ordering. This was non-negotiable given the spec's
   explicit warning that the filter "has to be part of the vector search itself." It also made the
   opt-in cross-workspace sharing stretch goal a natural extension: a second predicate branch
   (`or document_id = any(shared_ids)`) in the same query, rather than a separate code path that
   could accidentally bypass isolation.

2. **Chunking strategy: character-based with paragraph/sentence-aware breakpoints, not fixed-size
   token windows.** ~1800 chars (~450-500 tokens) with 200-char overlap, biased to break on a
   blank line or sentence boundary when one exists near the target length. Simple markdown-heading
   detection tags each chunk with a `section_label` used in citations. This is a pragmatic
   middle ground — no extra tokenizer dependency, and citations read more like "the Vacation
   Policy section" instead of an arbitrary byte offset.

3. **Content-hash idempotency instead of filename-based dedup.** Ingestion hashes the raw file
   bytes (SHA-256) and enforces a unique `(workspace_id, content_hash)` constraint at the database
   level (not just an application check), so even a concurrent double-upload race can't create
   duplicate chunks — the second insert hits the unique constraint and the code falls back to
   returning the existing document.

4. **Streaming and the tool loop are the same code path.** Rather than treating "stream the
   answer" and "the model might call a tool" as separate cases, every iteration of the tool loop
   is a streaming call: text deltas are forwarded to the client immediately, and `tool_calls`
   deltas are accumulated and executed once the stream ends. This means multi-step tool use
   (model calls a tool, sees the result, decides to call another) and token-by-token streaming
   of the final answer both fall out of one loop instead of needing two.

## Hardest bug / wrong turn

The schema Claude Code generated created an `ivfflat` index on `chunks.embedding` in the same
migration that creates the (empty) table — reasonable-looking DDL, wrong in practice. pgvector's
`ivfflat` index clusters the rows *present at CREATE INDEX time*; building it against a zero-row
table produces a permanently degenerate index. The failure mode was nasty precisely because it was
intermittent: during manual end-to-end testing, `match_chunks` returned the correct grounded
answer sometimes and a false "I don't know" other times, for the exact same seeded question and
data. I initially suspected the RPC's parameter binding (spent time proving via a scratch
`debug_match_params` SQL function that PostgREST was passing the right `workspace_id`s and that a
plain `count(*)` on the same filter matched), then suspected Gemini embedding non-determinism,
before realizing the common factor was whether Postgres's planner chose to use the broken ANN
index for that particular call's cost estimate — a seq scan (correct) and an index scan through
the empty-built index (returns nothing) were both valid plans, and which one ran depended on
incidental things like which other parameters were present. The fix was to drop the index outright
(the demo's data volume needs no ANN index) and document in the migration exactly why one isn't
there and how to add it correctly later — after the table has representative data. Separately,
during the same test pass I found the ingestion idempotency check was too broad: it treated *any*
existing `(workspace_id, content_hash)` row as "already ingested," so a document whose first
ingestion attempt failed (e.g. a transient embedding API error) got permanently stuck at 0 chunks
with no way to retry short of deleting the row by hand. Fixed by only short-circuiting on
`status = 'ready'` and otherwise reusing the row and re-running ingestion.

## What I'd improve with more time

- Add automated tests for the isolation and prompt-injection scenarios (currently verified
  manually via the seed script + walkthrough in the README) so regressions are caught in CI.
- Re-rank retrieved chunks with a small cross-encoder instead of relying solely on RRF between
  vector and full-text scores, and tune the similarity threshold used for the "I don't know"
  short-circuit against a larger, more varied document set.
- Add pagination and streaming upload progress for larger documents, and support more file types
  (currently PDF/txt/md only).
- Add per-user rate limiting on the chat endpoint to bound Groq/Gemini free-tier usage.
- Re-add an ANN index (ivfflat or HNSW) on `chunks.embedding` once there's enough real data to
  build it against, with a migration step that runs after a representative seed rather than at
  table-creation time — see the note in `backend/src/db/migrations/001_init.sql`.

## AI context files

See [`CLAUDE.md`](./CLAUDE.md) for the project conventions file used throughout this build.
