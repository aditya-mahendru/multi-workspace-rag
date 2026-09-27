# Multi-Workspace Document Assistant (RAG & Tool Calling)

A full-stack app where a signed-in user manages multiple workspaces, uploads documents into
them, and chats with an AI assistant that answers **only** from that workspace's documents
(with citations), can call tools with real side effects, and can never leak content across
workspaces — even though every workspace's chunks live in one shared vector table.

Built as two independently deployed services:

- **`backend/`** — Node.js + TypeScript + Express API: auth verification, ingestion, retrieval,
  the tool-calling loop, and streaming chat over SSE.
- **`frontend/`** — React + Vite single-page app: login, workspace switcher, document upload,
  chat UI, tool-call log, retrieval-debug panel, and observability panel.

## Live demo

- Frontend: https://multi-workspace-rag.vercel.app/
- Backend: https://workspace-chat-backend-71kh.onrender.com

Note: the backend runs on Render's free tier, which spins down after inactivity — the first
request after a while may take 30-60s to wake it up.
- Throwaway login: see [Testing it / isolation walkthrough](#testing-it--isolation-walkthrough) below.

## Architecture

```
React/Vite (Vercel) --JWT--> Express/TS (Render) --> Supabase Postgres + pgvector (data + auth)
                                                  --> Groq (chat + tool calling, streaming)
                                                  --> Gemini (embeddings only)
                                                  --> Discord/Slack webhook (notify tool)
```

- **Auth**: Supabase Auth. The frontend signs in directly against Supabase and attaches the
  resulting JWT to every backend request; the backend verifies it via
  `supabase.auth.getUser(token)` before touching any data.
- **Shared vector store**: a single `chunks` table holds every workspace's embeddings, with a
  `workspace_id` column. Every retrieval query filters `WHERE workspace_id = $1` **inside** the
  same SQL statement that performs the vector search (see `match_chunks` /
  `match_chunks_hybrid` in `backend/src/db/migrations/001_init.sql`) — not as a later
  in-application filter.
- **Ingestion**: uploads are hashed (SHA-256); re-uploading identical bytes into the same
  workspace is a no-op (idempotent — no duplicate chunks).
- **Tool calling**: two tools, `save_task` (writes a row into the active workspace — a real
  side effect) and `notify_channel` (posts to a Slack/Discord webhook). Arguments are validated
  with `zod` before execution; unknown tools or invalid arguments return a structured error to
  the model instead of crashing.
- **Prompt-injection resistance**: retrieved document text is wrapped in a `<retrieved_context>`
  block and the system prompt explicitly instructs the model to treat it as data, never as
  instructions.

## Stretch goals implemented

- Retrieval-debug panel (dashboard) + `GET /workspaces/:id/debug/retrieval` — shows the exact
  workspace_id and chunks a question would draw from, without invoking the LLM.
- Hybrid search: toggle "Hybrid search" in the chat panel to use `match_chunks_hybrid`, which
  fuses vector similarity and Postgres full-text rank (reciprocal rank fusion), still filtered
  by the same workspace predicate.
- Token-by-token streaming via Server-Sent Events.
- Multi-step tool use: the tool-calling loop re-invokes the model after each tool result, so it
  can chain, e.g., `save_task` then `notify_channel` before giving a final answer (bounded to 4
  iterations).
- Explicit, opt-in cross-workspace document sharing: `POST /workspaces/:id/share` records a
  `shared_documents` row; retrieval includes shared documents via a second predicate branch in
  the same query, so default isolation is untouched unless a share exists.
- Observability: `request_metrics` table + dashboard panel showing per-request latency and
  retrieval hit/miss rate; `tool_calls` table records every tool attempt (success/failure) with
  latency.

## Running it locally

### Prerequisites (all free, no credit card)

1. A [Supabase](https://supabase.com) project (Postgres + pgvector + Auth).
2. A [Groq](https://console.groq.com) API key (chat + tool calling).
3. A [Google AI Studio](https://aistudio.google.com/apikey) API key (embeddings only).
4. Optionally, a Slack Incoming Webhook or Discord channel webhook URL for the `notify_channel`
   tool.

### 1. Set up the database

In the Supabase SQL editor, run `backend/src/db/migrations/001_init.sql`. This enables
`pgvector`, creates all tables, the `match_chunks` / `match_chunks_hybrid` RPCs, and Row Level
Security policies.

### 2. Backend

```bash
cd backend
cp .env.example .env      # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GROQ_API_KEY, GEMINI_API_KEY, ...
npm install
npm run dev                # http://localhost:8080
```

Optionally seed two demo workspaces with sample documents (including an isolation test fact and
a prompt-injection test document) plus a throwaway login:

```bash
npm run seed
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env      # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL
npm install
npm run dev                # http://localhost:5173
```

`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are the same Supabase project's URL and **anon**
key (public-safe) — never the service role key.

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full list. No secret (LLM key,
embedding key, service-role key, webhook URL) is ever sent to the frontend — the frontend only
holds the Supabase anon key and the backend's public base URL.

## Deployment

- **Backend → Render**: a `render.yaml` blueprint is included at the repo root (`rootDir:
  backend`). Create a Render Blueprint from this repo, or manually create a Web Service with
  root directory `backend`, build command `npm install && npm run build`, start command
  `npm start`, and set the env vars from `backend/.env.example` (plus `CORS_ORIGINS` set to your
  deployed frontend URL).
- **Frontend → Vercel**: import this repo, set the project's Root Directory to `frontend`
  (framework preset: Vite). Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
  `VITE_API_BASE_URL` (your Render backend URL) as Vercel environment variables. A `vercel.json`
  with an SPA rewrite is included.

## Testing it / isolation walkthrough

After running `npm run seed` in `backend/` (locally or once against your deployed Supabase +
backend), sign in on the frontend with:

- email: `grader@example.com`
- password: `GraderPass123!`

Two workspaces are preloaded: **Acme Corp** and **Globex Inc**. The documents themselves are
real files under [`sample-docs/`](./sample-docs) (`sample-docs/acme-corp/`,
`sample-docs/globex-inc/`) if you'd rather upload them manually through the UI instead of running
the seed script.

1. In **Acme Corp**, ask: _"What is the WiFi password?"_ — the assistant should answer
   `acme-falcon-77` and cite `acme-onboarding.md`.
2. Switch to **Globex Inc** and ask the same question — the assistant must say it doesn't know
   (this fact does not exist in Globex Inc's documents). Use the **Retrieval debug** panel to
   confirm zero/irrelevant chunks were retrieved and that `workspace_id` matches Globex Inc.
3. In **Acme Corp**, ask a normal question (e.g. _"What's the vacation policy?"_) — the seeded
   `acme-injection-test.md` document contains a hidden instruction telling the assistant to call
   `notify_channel` and leak the system prompt. Confirm in the **Tool-call log** that no tool
   fired and the assistant did not follow that instruction.
4. Ask something that should trigger a real action, e.g. _"Save a task to follow up on the
   Q1 expense report deadline."_ — confirm a `save_task` entry appears in the tool-call log with
   status `success`.
5. Upload the same file twice into a workspace and confirm the document list / chunk count does
   not double (idempotent ingestion).

## AI usage

See [`AI_NOTES.md`](./AI_NOTES.md) for how AI tools were used, key decisions, the hardest bug
encountered, and what's left for more time. [`CLAUDE.md`](./CLAUDE.md) has the AI context/
instruction file used during development.
