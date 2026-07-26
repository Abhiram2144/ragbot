# Project: Enterprise RAG Platform

## What this is
Multi-tenant B2B RAG platform. Companies create knowledge bases, upload docs, 
get grounded Q&A via API/widget. Optimizes for: correctness over cleverness, 
defensible architecture over feature count. This is a portfolio-grade system — 
every component should be explainable in an interview, not just working.

## Stack
- Backend: Python 3.11+, FastAPI
- DB: PostgreSQL (SQLAlchemy + Alembic)
- Vector DB: Qdrant
- Queue: Celery + Redis
- LLM: OPENAI API

## Commands
- Start infra: docker compose up -d
- Run API: uvicorn app.main:app --reload
- New migration: alembic revision --autogenerate -m "message"
- Apply migrations: alembic upgrade head
- Tests: pytest -x

## Architecture (map, not full detail — see docs/architecture.md)
- backend/app/models/    — SQLAlchemy models
- backend/app/api/       — route handlers (thin — no business logic here)
- backend/app/services/  — business logic (ingestion, retrieval, eval)
- backend/app/workers/   — Celery tasks

## Engineering philosophy
- Simplest approach that works. No unsolicited abstractions, no premature 
  interfaces/factories, no "just in case" flexibility.
- Don't refactor code outside the current task's scope, even if you notice 
  something you'd do differently. Flag it instead, don't fix it.
- If a decision isn't in "Locked decisions" below and materially changes 
  architecture, ask me before proceeding rather than picking one.

## Locked decisions — do not revisit or re-propose alternatives
(Full rationale in docs/decisions.md — this is just the "don't re-litigate" list)
- ONE Qdrant collection for all tenants, filtered by org_id/kb_id metadata 
  at query time. NOT a collection-per-tenant.
- Multi-tenancy via org_id column on every tenant-scoped table, filtered 
  before ranking, not after.
- Hybrid search = Qdrant's native dense+sparse, merged via RRF. Not a 
  custom-built fusion algorithm.
- Cohere API for reranking. Not a self-hosted cross-encoder, for now.

## Explicitly rejected — don't suggest these again
- Separate Qdrant collection per organization — doesn't scale past a 
  handful of tenants, adds ops overhead for no retrieval benefit.
- Kubernetes/Helm at MVP stage — Docker Compose + single deploy is enough 
  until the core product works. Revisit only as an explicit later phase.

## Boundaries
- Don't add auth methods beyond JWT unless asked.
- Don't touch docker-compose.yml service definitions outside the current 
  phase's scope.
- Don't add dependencies not already in requirements.txt without flagging it.

## Compaction instructions
When compacting or summarizing context, NEVER summarize the "Locked decisions" 
or "Explicitly rejected" sections above — preserve verbatim. Always preserve: 
current phase, files modified this session, and pass/fail status of last 
verification step. Tool output and file-read contents can be dropped first.

## Current phase
Phase 2 — Query pipeline v1 (see docs/plan.md for full phase breakdown)