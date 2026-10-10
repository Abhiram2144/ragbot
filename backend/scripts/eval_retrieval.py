"""
Phase 5 — retrieval-only eval runner.

Measures retrieval quality (hit_rate / recall@k / precision@k / MRR) and
latency against the hand-labeled eval set, without touching generation.

- --search-mode dense:  embed_query() -> search_chunks(). No rewriting,
  no sparse vector, no RRF, no reranking — an untouched baseline, exactly
  matching what search_mode=dense means in the query endpoint.
- --search-mode hybrid: embed_query() + sparse_embed_query() ->
  hybrid_search_chunks() -> rerank_chunks(). Query rewriting is
  intentionally NOT included here (it's an LLM call) so this script stays
  cheap enough to re-run often while tuning retrieval.

Does NOT call the OpenAI generation endpoint. Faithfulness/citation
metrics are 5.3, not built here.

Run from the backend/ directory:

    python scripts/eval_retrieval.py --search-mode dense
    python scripts/eval_retrieval.py --search-mode hybrid
"""

import argparse
import json
import logging
import statistics
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings
from app.database import SessionLocal
from app.models.knowledge_base import KnowledgeBase
from app.services.embedding import embed_query, sparse_embed_query
from app.services.eval_loader import EvalEntry, load_eval_set
from app.services.eval_metrics import hit_rate, mrr, precision_at_k, recall_at_k
from app.services.reranking import rerank_chunks
from app.services.vector_store import _chunk_point_id, hybrid_search_chunks, search_chunks

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

_DEFAULT_EVAL_SET = Path(__file__).resolve().parent.parent / "eval" / "eval_set.yaml"
_REPORTS_DIR = Path(__file__).resolve().parent.parent / "eval" / "reports"
_METRIC_NAMES = ("hit_rate", "recall_at_k", "precision_at_k", "mrr")


def _org_ids_by_kb(kb_ids: set) -> dict:
    db = SessionLocal()
    try:
        rows = db.query(KnowledgeBase).filter(KnowledgeBase.id.in_(kb_ids)).all()
        return {kb.id: kb.org_id for kb in rows}
    finally:
        db.close()


def _retrieve(entry: EvalEntry, org_id: uuid.UUID, search_mode: str, k: int) -> tuple[list, bool | None]:
    """Run retrieval for one entry. Returns (hits, rerank_used)."""
    if search_mode == "dense":
        vector = embed_query(entry.question)
        hits = search_chunks(
            org_id=str(org_id),
            kb_id=str(entry.kb_id),
            query_vector=vector,
            top_k=k,
        )
        return hits, None

    dense_vec = embed_query(entry.question)
    sparse_vec = sparse_embed_query(entry.question)
    candidates = hybrid_search_chunks(
        org_id=str(org_id),
        kb_id=str(entry.kb_id),
        dense_vector=dense_vec,
        sparse_vector=sparse_vec,
        top_k=settings.RERANK_TOP_N,
    )
    hits, rerank_used = rerank_chunks(entry.question, candidates, top_n=k)
    return hits, rerank_used


def _run_entry(entry: EvalEntry, org_id: uuid.UUID, search_mode: str, k: int) -> dict:
    expected_id = str(entry.expected_chunk_id)

    start = time.perf_counter()
    hits, rerank_used = _retrieve(entry, org_id, search_mode, k)
    latency_ms = (time.perf_counter() - start) * 1000

    retrieved_ids = [str(_chunk_point_id(h["document_id"], h["chunk_index"])) for h in hits]

    return {
        "id": entry.id,
        "kb_id": str(entry.kb_id),
        "question": entry.question,
        "expected_chunk_id": expected_id,
        "retrieved_ids": retrieved_ids,
        "hit_rate": hit_rate(retrieved_ids, expected_id),
        "recall_at_k": recall_at_k(retrieved_ids, expected_id, k),
        "precision_at_k": precision_at_k(retrieved_ids, expected_id, k),
        "mrr": mrr(retrieved_ids, expected_id),
        "latency_ms": round(latency_ms, 1),
        "rerank_used": rerank_used,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Retrieval-only eval runner (no generation).")
    parser.add_argument("--search-mode", choices=["dense", "hybrid"], required=True)
    parser.add_argument("--eval-set", default=str(_DEFAULT_EVAL_SET), help="Path to eval_set.yaml")
    parser.add_argument(
        "--k",
        type=int,
        default=settings.TOP_K_RETRIEVAL,
        help="k for recall@k/precision@k (default: settings.TOP_K_RETRIEVAL)",
    )
    args = parser.parse_args()

    entries = load_eval_set(args.eval_set)
    if not entries:
        log.info("Eval set is empty — nothing to run.")
        return

    org_id_by_kb = _org_ids_by_kb({e.kb_id for e in entries})

    per_question: list[dict] = []
    errors: list[dict] = []

    for entry in entries:
        try:
            per_question.append(_run_entry(entry, org_id_by_kb[entry.kb_id], args.search_mode, args.k))
        except Exception as exc:
            log.warning("  entry %s failed: %s", entry.id, exc)
            errors.append({"id": entry.id, "error": str(exc)})

    aggregate = {
        metric: (
            round(statistics.mean(float(r[metric]) for r in per_question), 4)
            if per_question
            else None
        )
        for metric in _METRIC_NAMES
    }
    aggregate["latency_ms_mean"] = (
        round(statistics.mean(r["latency_ms"] for r in per_question), 1) if per_question else None
    )
    if args.search_mode == "hybrid" and per_question:
        aggregate["rerank_used_rate"] = round(
            sum(1 for r in per_question if r["rerank_used"]) / len(per_question), 4
        )

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report = {
        "search_mode": args.search_mode,
        "k": args.k,
        "eval_set": str(args.eval_set),
        "timestamp": timestamp,
        "num_questions": len(entries),
        "num_succeeded": len(per_question),
        "num_errored": len(errors),
        "aggregate": aggregate,
        "per_question": per_question,
        "errors": errors,
    }

    _REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = _REPORTS_DIR / f"retrieval_{args.search_mode}_{timestamp}.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    _print_summary(report, report_path)


def _print_summary(report: dict, report_path: Path) -> None:
    print()
    print("=" * 60)
    print(f"  RETRIEVAL EVAL — search_mode={report['search_mode']}  k={report['k']}")
    print("=" * 60)
    print(f"  questions: {report['num_succeeded']}/{report['num_questions']} succeeded")
    print()
    for metric, value in report["aggregate"].items():
        label = metric.replace("_", " ")
        print(f"  {label:20s}: {value}")
    print()
    print(f"  saved: {report_path}")
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()
