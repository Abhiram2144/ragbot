# RAGBot Codebase Guide

This document explains the current RAGBot implementation as it exists in the repository. It is intended to be read from top to bottom by someone who wants to understand the architecture, request flows, data model, retrieval design, frontend behavior, operational setup, tests, and current limitations.

The most important distinction is:

- `docs/plan.md` describes the product roadmap.
- `docs/plan-phase4.md` describes the Phase 4 design decisions.
- The Python and TypeScript source files are the source of truth for what runs today.

The project is a multi-tenant B2B retrieval-augmented generation platform. An organization can create knowledge bases, upload documents, wait for an asynchronous indexing job, and ask questions whose answers are generated from retrieved document chunks with citations.

## 1. System At A Glance

```text
Browser (React + Vite)
        |
        | HTTP, JSON, multipart uploads, Server-Sent Events
        v
FastAPI application
        |
        +--> PostgreSQL: organizations, users, KBs, documents, query logs
        |
        +--> Redis: Celery broker/backend and query rate-limit counters
        |
        +--> OpenAI: dense embeddings, query rewriting, answer generation
        |
        +--> Cohere: optional cross-encoder reranking
        |
        +--> Qdrant: dense and sparse chunk vectors plus payload metadata
        |
        +--> Celery worker
                |
                +--> extract -> chunk -> embed -> index
```

There are two major runtime pipelines:

1. **Ingestion**: upload a file, record it in PostgreSQL, enqueue a Celery task, extract and chunk its text, generate dense and sparse vectors, and write the chunks to Qdrant.
2. **Query**: authenticate, retrieve chunks using dense or hybrid search, optionally rerank hybrid candidates, ask the chat model for a grounded answer, stream or return the answer, and write a trace to `query_logs`.

Tenant isolation is based on `org_id`. Every tenant-scoped relational record stores an organization identifier, and Qdrant searches filter by both `org_id` and `kb_id` before results are returned.

## 2. Repository Layout

### Root files

- [CLAUDE.md](../CLAUDE.md): project constraints, locked architectural decisions, commands, and current phase.
- [docker-compose.yml](../docker-compose.yml): local PostgreSQL, Redis, and Qdrant services. The API and Celery worker are run separately from Compose.
- `docs/`: roadmap and technical documentation.
- `backend/`: FastAPI application, worker, database migrations, scripts, and tests.
- `frontend/`: React/Vite application.

### Backend package

- `app/main.py`: creates the FastAPI app, configures local-development CORS, registers routers, and exposes `/health`.
- `app/config.py`: loads `.env` settings through Pydantic Settings.
- `app/database.py`: creates the SQLAlchemy engine and request/task sessions.
- `app/dependencies.py`: JWT authentication and organization-scoped KB lookup.
- `app/api/`: HTTP route handlers. These contain request orchestration but most domain work is delegated to services.
- `app/models/`: SQLAlchemy ORM models.
- `app/schemas/`: Pydantic request and response contracts.
- `app/services/`: extraction, chunking, embeddings, vector search, prompt construction, generation, reranking, logging, costing, and evaluation.
- `app/workers/tasks.py`: Celery document-processing task.
- `alembic/`: PostgreSQL schema migration history.
- `scripts/`: management and evaluation commands.
- `tests/`: unit tests for the currently isolated service behavior.

### Frontend package

- `src/main.tsx`: React bootstrap and provider setup.
- `src/App.tsx`: route table and protected-route wrapper.
- `src/api/client.ts`: typed API client, JWT header handling, upload helper, and SSE query streaming.
- `src/context/AuthContext.tsx`: in-memory authentication state.
- `src/pages/`: login, signup, dashboard, and settings screens.
- `src/components/`: dashboard, upload, chat, history, analytics, and layout components.
- `src/index.css`: Tailwind import, design tokens, typography, and animations.
- `verify_dashboard.mjs` and `verify_states.mjs`: Playwright-based UI checks using mocked API responses.

## 3. Startup And Configuration

### Local infrastructure

From the repository root:

```powershell
docker compose up -d
```

This starts:

| Service | Port | Purpose |
| --- | ---: | --- |
| PostgreSQL 15 | 5432 | Relational application data |
| Redis 7 | 6379 | Celery transport/result backend and rate limiting |
| Qdrant latest | 6333 | Vector collection and payload storage |

The Docker volumes preserve database, Redis, and Qdrant state between restarts.

### Backend processes

Run commands from `backend/` after installing [requirements.txt](../backend/requirements.txt):

```powershell
alembic upgrade head
uvicorn app.main:app --reload
celery -A app.celery_app worker --loglevel=info
```

For local Windows development, `backend/start-dev.ps1` starts both the API and
Celery worker together:

```powershell
cd backend
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\start-dev.ps1
```

Keep that terminal open while using the application. Press `Ctrl+C` to stop both
processes. The API and worker remain separate processes because the API queues
jobs and the worker consumes them from Redis.

The API process and worker are separate. Importing `app.workers.tasks` from the document route registers the task, while the Celery application discovers the worker task module through `celery.autodiscover_tasks(["app.workers"])`.

### Environment variables

`app/config.py` requires these values:

- `DATABASE_URL`: SQLAlchemy PostgreSQL connection string.
- `REDIS_URL`: Redis connection string.
- `QDRANT_URL`: Qdrant HTTP URL.
- `OPENAI_API_KEY`: used for dense embeddings, query rewriting, and chat.
- `OPENAI_CHAT_MODEL`: answer-generation model.
- `COHERE_API_KEY`: used by the reranker.
- `SECRET_KEY`: JWT signing key.

Defaults and controls include:

- JWT algorithm: `HS256`.
- Token lifetime: seven days.
- Upload directory: `./uploads`.
- Maximum upload size: 20 MB.
- Allowed extensions: `pdf`, `txt`, `md`, `docx`.
- Final retrieval size: 5 chunks.
- Hybrid fanout: 20 results from each search path.
- Rerank candidate count: 20.
- Per-organization query limit: 20 requests per fixed 60-second window.

The environment file is resolved as the repository root `.env`, because `config.py` is three directories below the repository root.

## 4. Authentication And Tenant Isolation

### Signup

`POST /auth/signup` accepts organization name, email, and password.

1. The route rejects an existing email with HTTP 409.
2. It creates an `Organization` and flushes it to obtain its UUID.
3. It creates the first `User` with role `admin` and a bcrypt password hash.
4. It commits both records.
5. It signs a JWT containing `sub`, `org_id`, and `exp`.

### Login

`POST /auth/login` finds the user by globally unique email, verifies the bcrypt hash, and issues the same JWT shape. Invalid credentials return HTTP 401.

### Request authentication

`get_current_user()` uses FastAPI's `HTTPBearer` dependency. It decodes the token using the configured secret and algorithm, requires both `sub` and `org_id`, and returns a small `CurrentUser` dataclass containing UUIDs.

`get_kb_or_404()` then loads a knowledge base with both conditions:

```text
knowledge_base.id == requested kb_id
knowledge_base.org_id == current_user.org_id
```

This dependency is the main tenant boundary for KB, document, query, history, and analytics routes. The feedback route has no KB in its URL, so it checks `query_logs.org_id` directly against the current user organization.

### Rate limiting

Only the query endpoint currently depends on `enforce_query_rate_limit`. It increments a Redis key of the form `ratelimit:{org_id}:{minute_bucket}`. The first increment sets a 60-second TTL; requests above the configured limit receive HTTP 429 and a `Retry-After` header.

This is an organization-level fixed-window limiter, not an API-key limiter.

## 5. Relational Data Model

All primary keys are PostgreSQL UUIDs. Timestamps are timezone-aware and use database `now()` defaults.

```text
Organization 1---N User
Organization 1---N KnowledgeBase
Organization 1---N Document
KnowledgeBase 1---N Document
Organization 1---1 Subscription
Organization 1---N ApiKey
Organization 1---N QueryLog
KnowledgeBase 1---N QueryLog
User 1---N QueryLog (nullable user_id)
Organization/KnowledgeBase 1---N EvalRun (nullable for multi-KB evals)
```

### Core tables

- `organizations`: tenant identity and timestamps.
- `users`: organization membership, globally unique email, bcrypt hash, and role string.
- `knowledge_bases`: organization-owned name and optional description.
- `documents`: organization/KB ownership, original filename, filesystem path, processing status, and error message.
- `query_logs`: question, prompt, answer, retrieved chunk references, token counts, latency, search mode, rerank status, stage timings, per-chunk scores, estimated cost, feedback, and timestamp.

### Supporting tables

- `api_keys` exists in the initial migration but is not wired into request authentication yet.
- `subscriptions` stores plan and status, and the organization endpoint reports its plan. Signup does not create a subscription row, so the endpoint falls back to `free` when no row exists.
- `eval_runs` stores aggregate metrics from full evaluation runs. Its organization and KB columns are nullable because one eval set can span more than one KB.

### Migrations

The Alembic chain is:

1. `d62c0760b90c`: initial organizations, users, API keys, KBs, subscriptions, documents, and basic query logs.
2. `f1e2d3c4b5a6`: adds `search_mode` and `rerank_used`.
3. `a7b3c9d1e2f4`: adds `eval_runs`.
4. `b8c4d2e6f1a3`: adds stage latencies, chunk scores, estimated cost, and feedback.

`alembic/env.py` imports `app.models` so all ORM classes are registered with `Base.metadata`, and gets the database URL from runtime settings.

## 6. HTTP API Surface

### Authentication

- `POST /auth/signup`: create an organization and admin user; return JWT.
- `POST /auth/login`: verify credentials; return JWT.

### Health

- `GET /health`: returns `{"status": "ok"}`. It is an application liveness response; it does not actively test PostgreSQL, Redis, or Qdrant.

### Knowledge bases

- `POST /knowledge-bases`: create an organization-owned KB.
- `GET /knowledge-bases`: list the current organization's KBs.
- `GET /knowledge-bases/{kb_id}`: fetch one organization-owned KB.
- `PATCH /knowledge-bases/{kb_id}`: update fields supplied by the caller.
- `DELETE /knowledge-bases/{kb_id}`: delete the relational KB row.

### Documents

- `POST /knowledge-bases/{kb_id}/documents`: validate, store, create a pending document, and enqueue `process_document`.
- `GET /knowledge-bases/{kb_id}/documents`: list documents in a KB.
- `GET /knowledge-bases/{kb_id}/documents/{document_id}`: fetch one document after verifying that it belongs to the requested KB.
- `DELETE /knowledge-bases/{kb_id}/documents/{document_id}`: remove the local file and relational row.

### Querying and observability

- `POST /knowledge-bases/{kb_id}/query`: dense or hybrid retrieval followed by answer generation; supports normal JSON or SSE streaming.
- `GET /knowledge-bases/{kb_id}/queries`: paginated newest-first query history.
- `GET /knowledge-bases/{kb_id}/queries/{query_log_id}`: full trace detail.
- `GET /knowledge-bases/{kb_id}/analytics`: aggregate traffic metrics for the last 1 to 365 days.
- `PATCH /queries/{query_log_id}/feedback`: set `up` or `down` feedback for a query log owned by the current organization.

### Organization

- `GET /organization`: organization metadata and subscription plan.
- `GET /organization/members`: organization users ordered by creation time.

## 7. Ingestion Pipeline

### Upload route

`app/api/documents.py` performs these steps synchronously:

1. Resolve the KB through the organization-scoped dependency.
2. Strip directory components from the incoming filename with `Path.name`.
3. Check the extension against `ALLOWED_EXTENSIONS`.
4. Read the entire upload into memory and enforce the byte limit.
5. Create `uploads/{org_id}/{kb_id}/`.
6. Store the file as `{document_uuid}_{safe_filename}`.
7. Insert a `Document` with status `pending`.
8. Dispatch `process_document.delay(document_id)`.
9. Return the document row immediately.

The user therefore sees a document before its vectors exist. The frontend polls the document endpoint while the status is `pending` or `processing`.

### Celery task

`app/workers/tasks.py::process_document` creates its own SQLAlchemy session. The task lifecycle is:

```text
pending -> processing -> complete
                    \\-> failed
```

The task:

1. Loads the document by UUID.
2. Sets `processing` and clears the previous error.
3. Calls `chunking.extract_text()`.
4. Calls `chunking.chunk_text()`.
5. Calls `embedding.embed_chunks()` for dense vectors.
6. Calls `embedding.sparse_embed_chunks()` for BM25 sparse vectors.
7. Ensures the Phase 4 Qdrant collection exists.
8. Upserts all chunk points.
9. Marks the document `complete`.

On any exception it sets `failed`, stores at most 2,000 characters of the error, commits that state, and asks Celery to retry with exponential delays. The task allows two retries.

### Text extraction

`chunking.extract_text()` supports:

- TXT and Markdown: UTF-8 file read.
- PDF: `pypdf` page extraction joined with newlines.
- DOCX: `python-docx` paragraph text joined with newlines.

### Chunking

`chunk_text()` uses word windows rather than tokens. Defaults are 400 words per chunk and 50 words of overlap. A trailing chunk shorter than 20 words is merged into the previous chunk. Empty or whitespace-only documents produce no chunks.

This gives overlapping context windows so a fact near a boundary can be retrieved from either neighboring chunk.

## 8. Embeddings And Qdrant

### Dense embeddings

`embedding.py` uses OpenAI `text-embedding-3-small`, which produces the 1,536 dimensional dense vector expected by the collection. Documents are embedded in batches of 100. Rate-limit and transient 5xx errors retry up to three attempts with delays of 1, 2, and 4 seconds. Non-retryable 4xx errors are raised immediately.

### Sparse embeddings

FastEmbed lazily loads `Qdrant/bm25`. The first sparse call downloads the small tokenizer/model data. Sparse vectors are represented as:

```json
{"indices": [token_id, "..."], "values": [weight, "..."]}
```

BM25 complements dense search by matching exact terms such as error codes, product identifiers, and version strings.

### Collection schema

The collection is named `chunks` and has:

- named dense vector `dense`: size 1536, cosine distance;
- named sparse vector `sparse`;
- payload fields: `org_id`, `kb_id`, `document_id`, `chunk_index`, and `chunk_text`.

Each point ID is deterministic: UUIDv5 of the document UUID and chunk index. Re-indexing the same document therefore overwrites the same points rather than creating duplicates.

### Dense-only search

`search_chunks()` filters Qdrant by `org_id` and `kb_id`, searches the named `dense` vector, and returns chunk text, point ID, cosine score, document ID, and chunk index.

### Hybrid search

`hybrid_search_chunks()` retrieves up to 20 results from both dense and sparse search, keyed by `(document_id, chunk_index)`, then applies Reciprocal Rank Fusion:

```text
RRF(chunk) = sum(1 / (60 + rank))
```

The result receives a contribution from each list in which it appears. Ties are broken with the dense score. The returned records preserve dense score, sparse score, RRF score, and chunk metadata for observability.

### Collection migration

The Phase 4 schema is breaking because the original collection used an unnamed dense vector. `scripts/migrate_collection.py --confirm` deletes and recreates the entire `chunks` collection. It must be followed by `scripts/reindex_all.py`, with a Celery worker running. The normal `ensure_collection()` intentionally does not migrate an existing collection; this makes destructive migration an explicit operator action.

## 9. Query Pipeline

The main orchestration is in `app/api/knowledge_bases.py`, while the actual provider calls live in services.

### Search mode selection

`QueryRequest` contains:

- `question`: user question;
- `stream`: whether the response should be SSE;
- `search_mode`: `dense` or `hybrid`, defaulting to `hybrid`.

#### Dense path

1. Embed the original question with OpenAI.
2. Search Qdrant's dense vector.
3. Return up to `TOP_K_RETRIEVAL` chunks.
4. Do not rewrite or rerank.

#### Hybrid path

1. Rewrite the question with `gpt-4o-mini`.
2. Embed the rewritten text densely and sparsely.
3. Search dense and BM25 paths.
4. Merge with Python RRF.
5. Send the merged candidates to Cohere.
6. Return the top final chunks.

The original question, not the rewritten query, is used for answer generation. This preserves the user's intent and wording while improving retrieval recall.

### Query rewriting

The rewrite prompt asks the cheap chat model to expand acronyms, add related terms, remove conversational filler, preserve intent, and return only one line. It uses temperature zero and the same retry policy as other OpenAI calls.

### Reranking

`reranking.py` sends candidate chunk texts and the original question to Cohere `rerank-v3.5`. It retries rate limits and non-4xx failures up to three times. If Cohere is unavailable, the service returns the original RRF ordering and sets `rerank_used` to `False`. It does not fail the entire user query merely because reranking failed.

### Prompt construction

`prompt_builder.py` builds exactly two chat messages:

1. A system message requiring answers strictly from numbered context, citations for claims, and the exact insufficient-context phrase.
2. A user message containing numbered chunks followed by the question.

The citation map links `[1]`, `[2]`, and so on to document IDs and chunk indexes. The generator scans the model answer for valid markers and returns only citations that exist in this map.

### Answer generation

The non-streaming path calls the configured `OPENAI_CHAT_MODEL` with temperature zero, records provider token usage, parses citations, and returns:

```json
{
  "answer": "...",
  "sources": [{"marker": "[1]", "document_id": "...", "chunk_text": "..."}],
  "query_log_id": "..."
}
```

The streaming path opens an OpenAI streaming completion and yields server-sent events:

- `data: {"type":"token","text":"..."}` for each text delta;
- one `data: {"type":"done", ...}` event containing sources and the log ID.

The prompt is deliberately not sent in the final SSE event; it remains a server-side trace field.

### Empty context behavior

The generation prompt tells the model to answer exactly `I don't have enough information to answer that.` when the supplied context is insufficient. The application does not invent an answer outside retrieved chunks.

## 10. Query Logging And Analytics

`query_logging.log_query()` opens a separate database session and writes one `QueryLog` row after generation completes. The trace includes:

- original question;
- full prompt messages;
- generated response;
- retrieved document/chunk references;
- input/output token counts;
- total latency;
- search mode and whether reranking was used;
- per-stage timings: rewrite, embedding, retrieval, rerank, generation, total;
- per-chunk dense, sparse, RRF, rerank scores, and final rank;
- rough estimated cost;
- optional feedback.

Embedding token usage is currently approximated as roughly one token per four characters. The cost calculator uses hard-coded pricing constants and should be treated as an observability estimate, not billing data.

The analytics endpoint aggregates real query traffic, not controlled evals:

- total queries;
- average latency;
- average estimated cost;
- positive feedback ratio among explicitly rated queries;
- daily count and average latency.

## 11. Evaluation Layer

The eval system is separate from production query logging.

- `eval/eval_set.yaml`: hand-labeled questions and expected chunks/documents.
- `eval_loader.py`: parses eval entries.
- `eval_metrics.py`: hit rate, recall@k, precision@k, and MRR.
- `eval_generation.py`: faithfulness judge and citation accuracy.
- `scripts/eval_retrieval.py`: compares dense versus hybrid retrieval without generation or query-log pollution.
- `scripts/eval_full.py`: runs the real retrieval and generation path, adds faithfulness/citation metrics, writes a JSON report, and stores an `eval_runs` aggregate row.

The retrieval evaluator intentionally omits query rewriting so repeated tuning does not incur an additional LLM call. The full evaluator calls the real `_retrieve()` path, which includes rewriting for hybrid mode.

Other management scripts include:

- `dump_chunks.py`: inspect indexed chunks for building or checking eval data.
- `test_hybrid.py`, `test_rerank.py`, `test_rewrite.py`, and `test_search_modes.py`: manual/provider-backed checks for Phase 4 behavior.
- `migrate_collection.py`: destructive Qdrant schema migration.
- `reindex_all.py`: dispatch completed documents for re-indexing.

## 12. Frontend Architecture

The frontend is React 19 with TypeScript, Vite, Tailwind CSS, React Router, and Recharts.

### Routes

`App.tsx` exposes:

- `/signup`: create an organization account;
- `/login`: sign in;
- `/dashboard`: protected workspace;
- `/settings`: protected organization settings;
- all unknown paths redirect to `/login`.

`ProtectedRoute` checks whether the AuthContext has a token. It does not validate token expiry client-side.

### API client

`src/api/client.ts` centralizes calls. JSON requests add `Content-Type` and an `Authorization: Bearer` header when a token is set. Multipart uploads omit the content type so the browser can add the multipart boundary.

The API base is `VITE_API_URL`, defaulting to `http://localhost:8000`. The query client uses `fetch`, `ReadableStream.getReader()`, and SSE line parsing to deliver answer tokens incrementally to callbacks.

### Authentication state

After login or signup, the pages put the token into both the API client's module variable and AuthContext. AuthContext is memory-only: a browser refresh loses the token and returns the user to the login route. There is no refresh-token flow or persistent storage.

### Dashboard

`DashboardPage` loads KBs on mount and selects the first one. Selecting a KB loads its documents. It polls each non-terminal document every two seconds, which makes Celery status transitions visible in the UI.

The selected KB has four views:

- **Documents**: upload dropzone and document cards with pending, processing, complete, and failed states.
- **Query**: streaming chat interface, source cards, inline citation markers, and thumbs-up/down feedback.
- **History**: paginated query-log list and trace detail.
- **Analytics**: Recharts-based production traffic metrics.

The design tokens are defined in `index.css`: warm off-white background, white surface, dark ink, green primary color, amber accent, IBM Plex Sans/Mono, and Source Serif display text. Animations include auth entrance, document state changes, query entrance, thinking dots, and source highlighting. Reduced-motion media rules disable the major animations.

## 13. Tests And Verification

The backend tests currently focus on deterministic service logic:

- `test_chunking.py`: text extraction, empty input, window size, overlap, trailing-chunk merge, unsupported extensions, and TXT end-to-end behavior.
- `test_prompt_builder.py`: two-message shape, context inclusion, numbering, question inclusion, and citation-map correctness.

Run them from `backend/`:

```powershell
pytest -x
```

The PDF test is skipped unless `backend/tests/fixtures/sample.pdf` exists.

The frontend has a production build and lint scripts:

```powershell
cd frontend
npm run build
npm run lint
```

The Playwright verification scripts mock API routes so they can check dashboard states without a live backend. `verify_states.mjs` specifically exercises processing, pending, complete, and failed document cards and checks polling transitions.

## 14. Important Current Boundaries And Gaps

These are implementation facts to keep in mind when changing the system:

1. **The plan and code differ in provider wording.** `CLAUDE.md` and the early roadmap mention a Claude API, but the current implementation uses OpenAI for embeddings, rewriting, and answer generation.
2. **Qdrant migration is destructive.** Existing vectors are deleted by the migration script and must be regenerated.
3. **Document deletion removes the file and SQL row, but the route does not delete the corresponding Qdrant points.** A future cleanup path must remove vectors by document ID to avoid orphaned retrieval results.
4. **Knowledge-base deletion has no explicit vector cleanup either.** Its relational deletion behavior depends on the database's foreign-key setup, while Qdrant payloads remain unless explicitly removed.
5. **API keys are schema-only today.** The `api_keys` table exists, but JWT is the only wired authentication method.
6. **Subscriptions are schema-only today.** The organization endpoint reads a subscription if one exists but signup does not create one.
7. **The health endpoint is shallow.** It returns application status without dependency probes.
8. **Query logging happens after generation.** A failed generation or a client disconnect before the generator's final event can leave no completed trace.
9. **The cost estimate is approximate and can become stale.** It assumes fixed pricing and approximates embedding tokens.
10. **Frontend auth is not persistent.** Reloading the page clears the token.
11. **Upload reads the whole file into memory.** The 20 MB limit bounds this for normal use, but streaming-to-disk would be more robust at larger limits.
12. **The current test suite does not cover authentication, tenant isolation, routes, Celery, Qdrant, provider failures, SSE parsing, or real frontend browser flows against the live API.**

These are not necessarily defects for the current portfolio phase; they are the boundaries that matter when extending the platform.

## 15. Recommended Reading Order

For a new engineer, this sequence gives the clearest mental model:

1. Read [CLAUDE.md](../CLAUDE.md) and [docs/plan.md](plan.md) for constraints and product intent.
2. Read [app/main.py](../backend/app/main.py), [app/dependencies.py](../backend/app/dependencies.py), and [app/config.py](../backend/app/config.py) for process startup and auth.
3. Read [app/api/documents.py](../backend/app/api/documents.py) and [app/workers/tasks.py](../backend/app/workers/tasks.py) for ingestion.
4. Read [app/services/chunking.py](../backend/app/services/chunking.py), [embedding.py](../backend/app/services/embedding.py), and [vector_store.py](../backend/app/services/vector_store.py) for indexing.
5. Read the query portion of [knowledge_bases.py](../backend/app/api/knowledge_bases.py), then [prompt_builder.py](../backend/app/services/prompt_builder.py), [generation.py](../backend/app/services/generation.py), and [reranking.py](../backend/app/services/reranking.py).
6. Read [query_logging.py](../backend/app/services/query_logging.py) and [query_log.py](../backend/app/models/query_log.py) for observability.
7. Read [frontend/src/api/client.ts](../frontend/src/api/client.ts), [frontend/src/App.tsx](../frontend/src/App.tsx), and [frontend/src/pages/DashboardPage.tsx](../frontend/src/pages/DashboardPage.tsx) for the browser-side workflow.
8. Run the unit tests, then inspect the Phase 4 scripts and evaluation reports.

The essential design idea is simple: PostgreSQL owns tenant and workflow metadata, the filesystem holds original uploads, Qdrant owns searchable chunk representations, Redis coordinates asynchronous work and throttling, and the LLM providers perform retrieval enhancement and grounded answer generation.
