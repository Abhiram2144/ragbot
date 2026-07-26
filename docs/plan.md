# Enterprise RAG Platform — Build Plan

## How to use this document
- Each numbered step (e.g. 1.3) is ONE self-contained Claude Code prompt — one logical unit, not a whole phase at once.
- Work top to bottom. Don't skip ahead even if a later step looks easy.
- After each step: verify against its listed criterion, then `git commit`, then move on.
- Update the "Current phase" line in `CLAUDE.md` whenever you start a new phase.
- Run `/clear` between phases (not mid-phase) to avoid context rot.
- For any step marked ⚠️ **plan first**, have Claude Code write a plan for that step alone, review/annotate it, then implement — don't let it code straight from the one-line description.
- When you're ready for a step, ask: "give me the exact Claude Code prompt for step X.Y" — full prompt text gets written at that point, scoped against whatever actually exists in the repo by then.

---

## Phase 0 — Foundations (Week 1)
Goal: a running skeleton with infra, schema, and auth. No business logic yet.

- **0.1** Repo scaffold + Docker Compose (Postgres, Redis, Qdrant) — *done*
- **0.2** Database schema + Alembic migrations: `organizations`, `users`, `api_keys`, `knowledge_bases`, `documents`, `query_logs`, `subscriptions` (placeholder columns only, no billing logic yet)
- **0.3** JWT auth: signup creates an org + first admin user, login issues a JWT, one protected test endpoint
- **0.4** Health checks for API + each infra dependency (DB, Redis, Qdrant reachability)

**Phase verification:** fresh clone → `docker compose up -d` → `alembic upgrade head` runs clean → can signup, log in, and hit a protected endpoint with the returned JWT.

---

## Phase 1 — Ingestion pipeline (Week 2)
Goal: upload a document, end up with searchable vectors in Qdrant.

- **1.1** Knowledge base CRUD — create/list/delete, scoped to the caller's org
- **1.2** File upload endpoint — type/size validation, stores raw file, creates a `document` row with status `pending`
- **1.3** Celery + Redis worker wiring (separate from the API process)
- **1.4** Chunking service — split extracted text into ~300-500 word chunks with overlap
- **1.5** Embedding service — batch calls to the embedding API, handles rate limits/retries
- **1.6** Qdrant indexing — store each chunk's vector tagged with `org_id`, `kb_id`, `document_id`, `chunk_id`
- **1.7** Status tracking — document flips `pending → processing → complete/failed`, errors are visible, not silent

**Phase verification:** upload a real document, watch status reach `complete`, confirm chunks exist in Qdrant with correct metadata tags via a direct query.

---

## Phase 2 — Query pipeline v1 (Week 3)
Goal: ask a question, get a grounded, cited answer. First fully demoable milestone.

- **2.1** Query endpoint — embed the question, dense-search Qdrant filtered by `org_id`/`kb_id`
- **2.2** Prompt builder — inject retrieved chunks + explicit citation-formatting instructions
- **2.3** Claude API call — start non-streaming, add streaming once the basic path works
- **2.4** Citation parsing — structure the response so each claim maps back to a source chunk
- **2.5** Query logging — every query writes question, retrieved chunk IDs, full prompt, response, token counts, and latency to `query_logs` (this seeds Phases 5 and 6 — don't skip it)

**Phase verification:** ask a real question against an uploaded doc, get an answer that correctly cites the source chunk; confirm the `query_logs` row has everything populated.

---

## Phase 3 — Frontend (Week 3-4, can overlap Phase 2)
Goal: the product becomes clickable, not just curl-able.

- **3.1** Auth pages — signup/login, token storage
- **3.2** Knowledge base UI — create KB, upload documents, see ingestion status live
- **3.3** Chat/test interface — ask questions, see answers with visible cited sources
- **3.4** Basic org settings page (structure only — team invites can be a stub for now)

**Phase verification:** a new user can sign up, create a KB, upload a doc, and get a cited answer — entirely through the UI, no API client needed.

---

## Phase 4 — Hybrid search + reranking (Week 4-5) ⚠️ plan first
Goal: retrieval quality jump — the first "real engineering" milestone.

- **4.1** Enable Qdrant sparse vectors alongside dense (locked decision: native Qdrant hybrid, not custom-built)
- **4.2** RRF merge logic combining dense + sparse result lists
- **4.3** Query rewriting — one LLM call before retrieval to clean up/expand the question
- **4.4** Cohere reranker on the merged top-k candidates
- **4.5** Keep the old dense-only path behind a flag so you can compare before/after

**Phase verification:** run a keyword-heavy test query (e.g. an error code or product ID) through both paths — hybrid+rerank should visibly outperform dense-only. Save this comparison; it's a strong interview artifact.

---

## Phase 5 — Evaluation layer (Week 5-6)
Goal: stop guessing whether changes are improvements.

- **5.1** Build a 30-50 pair hand-labeled eval set (question → correct chunk/document) from your own uploaded docs
- **5.2** Retrieval metrics script — hit rate, recall@k, precision@k, MRR, latency
- **5.3** Generation metrics — faithfulness/groundedness (LLM-as-judge), citation accuracy
- **5.4** Metrics dashboard — run the eval suite, see a scored report

**Phase verification:** run the full eval suite against the current pipeline and get a report you could screenshot in an interview. Re-run it against Phase 4's before/after flag to quantify the hybrid search improvement.

---

## Phase 6 — AI Observability (Week 6-7)
Goal: full per-query trace, not just logs.

- **6.1** Extend `query_logs` with per-stage data: retrieved chunk scores, rerank scores, prompt token count, cost, latency breakdown per pipeline stage
- **6.2** Trace detail view — pick any past query, see its full journey step by step
- **6.3** Feedback capture — thumbs up/down wired to the corresponding `query_log` row
- **6.4** Aggregate dashboard — average latency, cost/query, feedback ratio over time

**Phase verification:** click into any historical query and see exactly what happened at every stage, with real numbers, not placeholders.

---

## Phase 7 — Hardening (Week 7-8)
Goal: survive real failure modes, not just the happy path.

- **7.1** Rate limiting per API key/org
- **7.2** Retry + exponential backoff on embedding/LLM API calls
- **7.3** Redis caching for repeat queries
- **7.4** Structured JSON logging with a correlation ID per request
- **7.5** Input validation/security pass on uploads and stored content

**Phase verification:** simulate a failing embedding call and confirm retry/backoff kicks in correctly; exceed the rate limit and confirm a proper 429 response, not a crash.

---

## Phase 8 — DevOps + docs (Week 8-9)
Goal: a repo that reads like a real engineering project.

- **8.1** GitHub Actions CI — lint, test, build on every PR
- **8.2** Backend properly dockerized and added to the full `docker-compose.yml`
- **8.3** One real deployment (Railway/Render/single VM + Nginx)
- **8.4** Architecture doc + sequence diagrams for the ingestion and query flows
- **8.5** README polish — setup instructions, screenshots, link to the architecture doc

**Phase verification:** a fresh clone + `docker compose up` brings up the entire stack with no manual fixes; CI passes on a real PR; the deployed URL actually works.

---

## Stretch goals (only after Phase 8 ships — pick based on remaining time/target roles)
- Public API keys + embeddable JS widget (the actual B2B hook, if you pursue the SaaS angle)
- Stripe billing + usage metering
- Google Drive / Notion / Slack connectors + incremental indexing
- Kubernetes/Helm, Terraform
- Python/JS SDKs

---

## Rejected / out of scope for now
(See `CLAUDE.md` and `docs/decisions.md` for the full locked-decisions list — this is just the plan-level scope note.)
- No multi-repo SDK structure until the core product is solid
- No Kubernetes until Phase 8 ships — Docker Compose + one deploy is enough to answer "how do you deploy?" in an interview