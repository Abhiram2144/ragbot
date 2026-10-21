# AnswerDesk - Practical Resume Project Plan

## Product target

Build **AnswerDesk**, a small company knowledge operations platform for HR teams.
It should demonstrate one complete, believable workflow:

```text
HR uploads policies
        -> documents are indexed asynchronously
Employees ask questions
        -> answers include citations and confidence signals
Employees give feedback
        -> admins see knowledge gaps and stale documents
HR updates the policy
```

The goal is a polished, deployable portfolio project that proves good product
judgment and retrieval engineering. It does not need to become a real billing,
permissions, or integrations product.

## Finish line

Call the project complete when all of these are true:

- A new user can sign up, create an **HR Policies** knowledge base, and upload a
  PDF, Markdown, TXT, or DOCX policy.
- The document is processed by the Celery worker and reaches a visible status of
  `complete` or `failed`.
- An employee can ask a question and receive a grounded answer with clickable
  source citations.
- The answer shows a simple confidence level, source count, response time, and
  freshness warning when appropriate.
- Employees can mark an answer helpful or not helpful and optionally report it.
- An admin dashboard shows common questions, low-rated questions, unanswered
  questions, and documents that need review.
- The Quality Center compares dense-only retrieval with hybrid search plus
  reranking using a small, real evaluation set.
- The project runs from a fresh clone with documented setup and has screenshots,
  tests, and one deployed demo or recorded walkthrough.

## Working rules

1. Work in order. Do not start a later feature until the current phase's check
   passes.
2. Keep the existing architecture: FastAPI, PostgreSQL, Qdrant, Redis/Celery,
   OpenAI, Cohere, and React/Vite.
3. Keep route handlers thin. Put retrieval, scoring, analytics, and other
   business logic in services.
4. After each step, run the smallest relevant test or manual check and record
   the result in the PR/project notes.
5. Use mock data only for empty dashboard states. The final screenshots should
   use real queries and real indexed documents.

## Phase 0 - Finish and freeze the retrieval core

**Target: 2-4 days.** The repository is already in the hybrid-search and
reranking phase, so make this the first milestone before adding product work.

### 0.1 Verify the existing Phase 4 path

- Run the API, worker, and infrastructure.
- Upload one HR policy and wait for indexing to complete.
- Run the existing search-mode and reranking scripts.
- Confirm dense-only, hybrid, query rewrite, and Cohere reranking each have a
  visible result and failure path.

**Done when:** one keyword-heavy question and one paraphrased question return
relevant cited chunks, and failures are visible in logs rather than silently
falling back.

### 0.2 Make evaluation repeatable

- Use 8-12 representative HR questions from the sample policies.
- Record the expected document or chunk for each question.
- Run dense-only and hybrid-plus-rerank against the same set.
- Save hit rate, MRR, latency, and cost in a small report under `docs/` or
  `backend/eval/`.

**Done when:** one command produces a before/after comparison that can be shown
in an interview. Do not build a sophisticated evaluation platform yet.

### 0.3 Add a reliable local demo dataset

- Add 3-5 fictional HR policies: leave, benefits, remote work, expenses, and
  conduct.
- Include effective dates and a few deliberately ambiguous or missing answers.
- Keep all documents fictional and safe to publish in a portfolio repository.

**Done when:** a fresh local setup can be demonstrated without private files or
manual document hunting.

## Phase 1 - Make the product feel like AnswerDesk

**Target: 3-5 days.** Improve the existing frontend before adding new backend
features.

### 1.1 Establish the product shell

- Rename the visible product to **AnswerDesk**.
- Add a compact left navigation: Overview, Ask AI, Knowledge Base, Quality
  Center, and Settings.
- Add the active organization and current knowledge base to the header.
- Add clear loading, empty, error, and processing states.
- Keep team, billing, and integrations as disabled or clearly marked future
  areas only if they are needed in the visual shell.

**Done when:** the app reads as one coherent product instead of separate demo
screens.

### 1.2 Build the employee Ask AI experience

- Make asking a question the primary screen.
- Show the answer, source title, section/page when available, and a source
  preview beside or below the answer.
- Add confidence: `High`, `Medium`, or `Low`, based on retrieval/rerank signals
  and whether enough context was found.
- Show `Sources used`, response time, and a short outdated-policy warning when a
  source is past its review date.
- Preserve the original question while showing any rewritten query only in a
  technical details area.

**Done when:** an employee can understand both the answer and why the system
believes it.

### 1.3 Add answer feedback

- Add helpful/not helpful controls to each completed answer.
- Add a small report form with reasons such as `Incorrect`, `Outdated`, and
  `Missing information`.
- Store feedback against the existing query log.

**Done when:** feedback survives a page refresh and can be found by the admin
analytics endpoint.

## Phase 2 - Add document lifecycle metadata

**Target: 3-4 days.** This is the strongest product differentiator and is much
more valuable for a resume than generic file management.

### 2.1 Add focused document metadata

Add only these fields to documents:

- Department, defaulting to `HR`
- Owner name or email
- Effective date
- Review date
- Status: `draft`, `published`, or `archived`

Use one Alembic migration and update the API schema, upload form, and document
list together.

**Done when:** an admin can edit metadata without re-uploading the file.

### 2.2 Add freshness and publishing rules

- Only `published` documents participate in employee retrieval.
- Display a warning for documents whose review date has passed.
- Show draft and archived documents to admins but not employees.
- Keep the existing one-file-per-document model; do not build collaborative
  editing.

**Done when:** a draft or archived policy cannot appear as an employee citation,
and a stale published policy is visibly flagged.

### 2.3 Add a usable document management screen

- Show filename, department, owner, status, effective date, review date, and
  ingestion status.
- Add filters for status and stale documents.
- Add a simple edit metadata action and archive action.

**Done when:** an HR user can identify which policy needs attention in under a
minute.

## Phase 3 - Build the admin intelligence dashboard

**Target: 4-6 days.** Turn existing query logs and feedback into useful product
signals. Prefer a few trustworthy metrics over a crowded dashboard.

### 3.1 Add aggregate analytics endpoints

Implement server-side queries for:

- Total questions in the selected period
- Helpful-answer rate
- Questions with low confidence or no retrieved context
- Most common question themes or normalized question text
- Average response time
- Questions by knowledge base
- Stale published documents

Use a selectable period such as 7, 30, or 90 days. Avoid a general-purpose
analytics framework.

**Done when:** the API returns real values from PostgreSQL and an empty dataset
returns zeros/empty arrays cleanly.

### 3.2 Add the Overview screen

- Put four or five key metric cards at the top.
- Add a trend chart for questions and helpful-answer rate.
- Add a `Knowledge gaps detected` list showing low-confidence or repeatedly
  asked questions.
- Add a `Needs review` list for stale documents.
- Link each problem back to the relevant query or document.

**Done when:** the dashboard helps an admin decide what policy to improve next.

### 3.3 Add a query detail view

- Show the original question, answer, feedback, confidence, latency, and cited
  sources.
- Show a compact pipeline summary: rewrite, dense+sparse retrieval, RRF,
  reranking, generation.
- Keep raw prompts and internal payloads out of the default view; expose only a
  collapsible technical section.

**Done when:** one query can be explained end to end during a demo.

## Phase 4 - Ship the Quality Center

**Target: 3-5 days.** This is the strongest engineering evidence in the project.

### 4.1 Make the evaluation set and metrics explicit

- Store 20-30 question/expected-source pairs in YAML or JSON.
- Report hit rate/recall at 5, MRR, average retrieval latency, answer citation
  accuracy, and estimated cost per query.
- Compare at least `dense` versus `hybrid + rerank`.
- Keep faithfulness as an optional LLM-judge metric, clearly labeled as an
  estimate rather than ground truth.

### 4.2 Build the Quality Center page

- Add a `Run evaluation` action for an admin.
- Show the last run time, dataset size, metric cards, and comparison table.
- Show a small list of improved and regressed questions.
- Link to the saved evaluation run if the existing `eval_runs` model supports
  it.

**Done when:** the page answers “did hybrid retrieval improve this system?” with
real numbers and examples.

## Phase 5 - Add one shareable, auditable workflow

**Target: 2-3 days.** Choose permanent answer links instead of a real Slack or
Teams integration. It gives most of the product value at a fraction of the
complexity.

### 5.1 Add answer snapshots

- Add a public, random opaque ID to a query log or create a small answer-share
  table.
- Add `POST /queries/{id}/share` or equivalent to create a shareable snapshot.
- Add a read-only page showing the original question, answer, citations,
  timestamp, and knowledge base name.
- Do not expose tenant data: verify that only explicitly shared snapshots are
  public and never include private prompts, tokens, or internal IDs.

**Done when:** a copied link opens a stable answer page that is useful without
requiring the sender's active session.

## Phase 6 - Polish, verify, and present

**Target: 3-5 days.** This is where the work becomes a strong resume artifact.

### 6.1 Add the minimum hardening

- Test tenant isolation for knowledge bases, documents, queries, and shared
  answers.
- Validate upload type and size limits.
- Add retry/backoff tests for embedding, generation, and reranking failures.
- Add rate-limit and authentication checks.
- Add backend tests for analytics calculations and document visibility rules.
- Add frontend checks for loading, empty, failure, and stale-policy states.

### 6.2 Make setup reproducible

- Update the README with prerequisites, `.env` variables, migration commands,
  infrastructure startup, API/worker startup, frontend startup, and demo data.
- Add one CI workflow for backend tests and frontend build.
- Document any paid API requirement and provide a mocked UI verification path.

### 6.3 Deploy or record the product

- Deploy the frontend and API to simple services, or record a clean local demo
  if deployment would consume the remaining time.
- Capture screenshots of Ask AI, document lifecycle, Overview, and Quality
  Center.
- Include one architecture diagram and one retrieval evaluation chart.

**Done when:** another developer can run the project, understand the design,
and see the complete workflow in under ten minutes.

## Explicitly out of scope

Do not spend time on these for the resume version:

- Stripe billing, invoices, or real plan enforcement
- Real Slack, Teams, Google Drive, or Notion integrations
- SSO, SCIM, enterprise identity, or advanced RBAC
- Kubernetes, Helm, Terraform, or multi-region deployment
- Collaborative document editing or full version-diff tooling
- A general-purpose notification/reminder system
- Multiple LLM providers or a self-hosted reranker
- A separate Qdrant collection per organization
- A large analytics warehouse or event-streaming platform

These features can be listed as future work, but they should not delay the
finished demo.

## Suggested execution order

If time is limited, stop after the highest completed row:

| Priority | Deliverable | Resume value |
| --- | --- | --- |
| 1 | Reliable hybrid retrieval + evaluation report | Shows real RAG engineering |
| 2 | Ask AI with citations, confidence, and feedback | Shows user-facing quality |
| 3 | Document metadata and stale-policy warnings | Shows a clear product niche |
| 4 | Admin overview with knowledge gaps | Shows business usefulness |
| 5 | Quality Center | Shows measurement and iteration |
| 6 | Shareable answer snapshots | Shows an auditable workflow |
| 7 | Deployment, CI, and documentation | Shows engineering completeness |

## Final resume description

> Built AnswerDesk, a multi-tenant HR policy intelligence platform using FastAPI,
> PostgreSQL, Qdrant, Redis/Celery, OpenAI, Cohere, and React. Implemented
> asynchronous document ingestion, dense and sparse hybrid retrieval with RRF,
> reranking, cited answers, confidence and freshness signals, feedback-driven
> knowledge-gap analytics, and an evaluation center comparing retrieval quality,
> latency, and cost.