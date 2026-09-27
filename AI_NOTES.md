# AI Notes

## Tools and split of work

Built with Claude Code (Claude Sonnet 5) as a pair-programmer across the entire lifecycle: schema
design, backend services, frontend UI, deployment, and this documentation. I made the
architectural/stack decisions up front (Groq for chat+tools, Gemini for embeddings, Supabase for
Postgres+pgvector+Auth, Render+Vercel for hosting) and reviewed a written plan before any code was
written. After the initial build, most of the session was live, iterative debugging and feature
work driven by actually using the deployed app rather than trusting the code in isolation: I ran
it end-to-end against real Groq/Gemini/Supabase, found real bugs that way (see below), asked for UI
redesigns after seeing the first pass looked "first-gen," and asked follow-up questions like "have
we covered all stretch goals" that surfaced a genuine gap (token-count observability was schema'd
but never wired up — Claude Code had reported it as done). I treated its self-reports as claims to
verify, not facts, which is what actually caught most of the bugs listed here.

## Key decisions I made

1. **Workspace filter lives inside the SQL, not the application layer.** The vector search is a
   Postgres RPC (`match_chunks`/`match_chunks_hybrid`) whose `WHERE` clause includes
   `workspace_id = any($ids)` in the same statement that does the ANN ordering — non-negotiable
   given the spec's explicit warning. It also made opt-in cross-workspace sharing a natural
   extension: a second predicate branch (`or document_id = any(shared_ids)`) in the same query,
   not a separate code path that could bypass isolation.

2. **Content-hash idempotency, scoped per workspace, not globally.** Uploading identical bytes into
   the *same* workspace is a no-op; uploading the same bytes into two *different* workspaces
   creates two independent documents. I decided this deliberately after testing it: a chunk row
   belongs to exactly one workspace, and cross-workspace access should only ever happen through the
   explicit `shared_documents` opt-in — never as an accidental side effect of two workspaces
   happening to upload the same file.

3. **Tool calling must never be gated behind retrieval success.** The first version short-circuited
   to a canned "I don't know" whenever retrieval missed, skipping the LLM call entirely — which
   silently broke any tool-only request (e.g. "save a task") that had nothing to do with document
   content, since it never reached the tool-calling loop. Found this via a user report against the
   live deployed app, not code review. Fixed by always invoking the model with (possibly empty)
   context and letting the system prompt handle grounding honesty, so tool requests always get
   through regardless of retrieval outcome.

4. **Streaming and the tool loop are the same code path.** Every iteration of the tool loop is a
   streaming call: text deltas forward to the client immediately, `tool_calls` deltas accumulate
   and execute once the stream ends. Multi-step tool use and token-by-token streaming both fall out
   of one loop instead of needing two — verified genuinely multi-step (not just batched) via
   iteration logging: the model calls one tool, sees its result, then decides to call a second
   before answering.

## Hardest bug / wrong turn

The schema created an `ivfflat` index on `chunks.embedding` in the same migration that creates the
(empty) table. pgvector's `ivfflat` clusters the rows *present at CREATE INDEX time*; building it
against a zero-row table produces a permanently degenerate index. This was nasty because it was
intermittent: `match_chunks` returned the correct grounded answer sometimes and a false "I don't
know" other times, for the exact same seeded question and data. I initially suspected the RPC's
parameter binding (proved via a scratch `debug_match_params` SQL function that PostgREST was
passing the right `workspace_id`s and that a plain `count(*)` on the same filter matched), then
suspected embedding non-determinism, before realizing the actual variable was whether Postgres's
planner chose the broken ANN index for that call's cost estimate — a seq scan (correct) and an
index scan through the empty-built index (returns nothing) were both valid plans, and which one ran
depended on incidental things like which other parameters were present in the call. Fixed by
dropping the index outright (the demo's data volume needs none) and documenting in the migration
exactly why one isn't there and how to add it correctly later, after real data exists.

A close second: two Groq/Gemini model IDs picked during the initial build
(`llama-3.3-70b-versatile`, `text-embedding-004`) had been deprecated/renamed by the time of actual
deployment, causing 404s that only appeared once hitting the real APIs — a reminder that model
availability isn't something a static plan can get right once and forget.

## What I'd improve with more time

- Add automated tests for isolation, prompt-injection, and idempotency (currently verified manually
  via the seed script + live walkthrough) so regressions are caught in CI, not by re-clicking
  through the app.
- Re-rank retrieved chunks with a small cross-encoder instead of relying solely on RRF between
  vector and full-text scores; tune the similarity threshold against a larger, more varied corpus.
- Fix mobile/responsive layout — the dashboard grid doesn't hold up below ~980px width yet.
- Add per-user rate limiting on the chat endpoint to bound Groq/Gemini free-tier usage.
- Re-add an ANN index (ivfflat or HNSW) once there's enough real data to build it against, as a
  migration step that runs after a representative seed rather than at table-creation time.

## AI context files

See [`CLAUDE.md`](./CLAUDE.md) for the project conventions file used throughout this build.
