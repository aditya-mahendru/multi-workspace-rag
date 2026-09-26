# CLAUDE.md

Project conventions for Claude Code (or any AI assistant) working in this repo.

## What this is

Multi-Workspace Document Assistant: two microservices, `backend/` (Node/TypeScript/Express) and
`frontend/` (React/Vite). Users sign in, manage multiple workspaces, upload documents, and chat
with an assistant grounded in that workspace's documents, with tool calling. All workspace data
lives in one shared Postgres/pgvector store (Supabase) — see the "Non-negotiables" below.

## Non-negotiables

- **Workspace isolation is enforced inside the SQL query itself.** Any new retrieval or listing
  query must filter by `workspace_id` (or explicit `shared_documents`) in the same statement that
  fetches the data — never fetch broadly and filter in application code afterward.
- **Never trust a client-supplied `workspace_id` without verifying membership first.** Every
  workspace-scoped route goes through `requireWorkspaceMember` in `backend/src/middleware/auth.ts`.
- **Retrieved document text is data, not instructions.** It is passed to the LLM inside a
  `<retrieved_context>` block with an explicit system-prompt instruction not to follow anything
  inside it. Don't remove that wrapping when touching `backend/src/services/llm.ts`.
- **Tool arguments are always validated (zod) before execution.** Unknown tool names or
  schema-invalid arguments must produce a structured error back to the model, never a thrown
  exception or a partial side effect.
- **No secrets in the frontend.** `GROQ_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  and the notification webhook URL live only in `backend/.env` — the frontend only ever holds the
  Supabase URL + anon key and the backend's base URL.
- **Ingestion must stay idempotent.** Don't remove the `(workspace_id, content_hash)` unique
  constraint or the pre-insert hash lookup in `backend/src/services/ingestion.ts`.

## Structure

- `backend/src/routes/*` — thin Express handlers; business logic lives in `backend/src/services/*`.
- `backend/src/db/migrations/001_init.sql` — the single source of truth for schema, RPCs, and RLS.
  If you change the data model, update this file (don't just apply ad hoc SQL in the Supabase UI).
- `frontend/src/state/*` — React contexts for auth and the active workspace; components read from
  these rather than re-fetching session/workspace state themselves.

## Conventions

- TypeScript everywhere, `strict: true`. Backend is ESM (`"type": "module"`) — relative imports
  need explicit `.js` extensions in source (`from "../db/client.js"`), even though the source
  files are `.ts`.
- Prefer small, focused service modules over one large file; a new tool goes in
  `backend/src/services/tools/<name>.ts` and is registered in `backend/src/services/tools/index.ts`.
- Don't add abstractions or config options for hypothetical future providers — this project
  intentionally commits to Groq (chat) + Gemini (embeddings) + Supabase (data/auth).

## Running locally

See the root `README.md` for full setup. Quick reference: `npm run dev` in `backend/` (port
8080) and in `frontend/` (port 5173), against a Supabase project with
`backend/src/db/migrations/001_init.sql` applied.
