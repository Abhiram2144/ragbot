"""
Phase 5 — full pipeline eval runner (retrieval + generation).

Unlike eval_retrieval.py, this exercises the REAL query pipeline: it calls
the same internal functions the /knowledge-bases/{kb_id}/query endpoint
calls (app.api.knowledge_bases._retrieve + app.services.generation.
generate_answer), non-streaming. Retrieval is never reimplemented here —
whatever chunks the real pipeline actually retrieves are what's scored.

Adds on top of eval_retrieval.py's retrieval metrics:
  - faithfulness_score (1 LLM judge call per question)
  - citation_accuracy (deterministic)
  - total latency (retrieval + generation) and token usage

Does NOT write to query_logs — these are eval questions, not real user
traffic, and shouldn't pollute production query logs / analytics.

Run from the backend/ directory:

    python scripts/eval_full.py --search-mode dense
    python scripts/eval_full.py --search-mode hybrid
"""

import argparse
import json
import logging
import statistics
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.api.knowledge_bases import _retrieve
from app.config import settings
from app.database import SessionLocal
from app.models.eval_run import EvalRun
from app.models.knowledge_base import KnowledgeBase
from app.services.eval_generation import citation_accuracy, faithfulness_score
from app.services.eval_loader import EvalEntry, load_eval_set
from app.services.eval_metrics import hit_rate, mrr, precision_at_k, recall_at_k
from app.services.generation import generate_answer
from app.services.vector_store import _chunk_point_id

logging.basicConfig(level=logging.INFO, format="%(message)s")
log = logging.getLogger(__name__)

_DEFAULT_EVAL_SET = Path(__file__).resolve().parent.parent / "eval" / "eval_set.yaml"
_REPORTS_DIR = Path(__file__).resolve().parent.parent / "eval" / "reports"
_RETRIEVAL_METRIC_NAMES = ("hit_rate", "recall_at_k", "precision_at_k", "mrr")


def _org_ids_by_kb(kb_ids: set) -> dict:
    db = SessionLocal()
    try:
        rows = db.query(KnowledgeBase).filter(KnowledgeBase.id.in_(kb_ids)).all()
        return {kb.id: kb.org_id for kb in rows}
    finally:
        db.close()


def _run_entry(entry: EvalEntry, org_id: uuid.UUID, search_mode: str, k: int) -> dict:
    expected_chunk_id = str(entry.expected_chunk_id)
    expected_document_id = str(entry.expected_document_id)

    start = time.perf_counter()
    hits, rerank_used, _stage_latencies = _retrieve(
        question=entry.question,
        search_mode=search_mode,
        org_id=str(org_id),
        kb_id=str(entry.kb_id),
    )
    result = generate_answer(entry.question, hits)
    latency_ms = (time.perf_counter() - start) * 1000

    retrieved_ids = [str(_chunk_point_id(h["document_id"], h["chunk_index"])) for h in hits]
    judgment = faithfulness_score(
        entry.question, result["answer"], [h["chunk_text"] for h in hits]
    )

    return {
        "id": entry.id,
        "kb_id": str(entry.kb_id),
        "question": entry.question,
        "answer": result["answer"],
        "expected_chunk_id": expected_chunk_id,
        "expected_document_id": expected_document_id,
        "retrieved_ids": retrieved_ids,
        "hit_rate": hit_rate(retrieved_ids, expected_chunk_id),
        "recall_at_k": recall_at_k(retrieved_ids, expected_chunk_id, k),
        "precision_at_k": precision_at_k(retrieved_ids, expected_chunk_id, k),
        "mrr": mrr(retrieved_ids, expected_chunk_id),
        "faithfulness_score": judgment["score"],
        "faithfulness_justification": judgment["justification"],
        "citation_accuracy": citation_accuracy(result["sources"], expected_document_id),
        "input_tokens": result["input_tokens"],
        "output_tokens": result["output_tokens"],
        "latency_ms": round(latency_ms, 1),
        "rerank_used": rerank_used,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Full pipeline eval runner (retrieval + generation).")
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

    aggregate = _build_aggregate(per_question, args.search_mode)

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
    report_path = _REPORTS_DIR / f"full_{args.search_mode}_{timestamp}.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    _save_eval_run(entries, args.search_mode, org_id_by_kb, aggregate)
    _print_summary(report, report_path)


def _build_aggregate(per_question: list[dict], search_mode: str) -> dict:
    if not per_question:
        return {name: None for name in _RETRIEVAL_METRIC_NAMES} | {
            "faithfulness_score_mean": None,
            "citation_accuracy_mean": None,
            "latency_ms_mean": None,
            "input_tokens_mean": None,
            "output_tokens_mean": None,
        }

    aggregate = {
        metric: round(statistics.mean(float(r[metric]) for r in per_question), 4)
        for metric in _RETRIEVAL_METRIC_NAMES
    }
    aggregate["faithfulness_score_mean"] = round(
        statistics.mean(r["faithfulness_score"] for r in per_question), 4
    )
    aggregate["citation_accuracy_mean"] = round(
        statistics.mean(r["citation_accuracy"] for r in per_question), 4
    )
    aggregate["latency_ms_mean"] = round(statistics.mean(r["latency_ms"] for r in per_question), 1)
    aggregate["input_tokens_mean"] = round(statistics.mean(r["input_tokens"] for r in per_question), 1)
    aggregate["output_tokens_mean"] = round(statistics.mean(r["output_tokens"] for r in per_question), 1)

    if search_mode == "hybrid":
        aggregate["rerank_used_rate"] = round(
            sum(1 for r in per_question if r["rerank_used"]) / len(per_question), 4
        )

    return aggregate


def _save_eval_run(
    entries: list[EvalEntry],
    search_mode: str,
    org_id_by_kb: dict,
    aggregate: dict,
) -> None:
    """Insert one eval_runs row. org_id/kb_id are only set when every entry
    in the eval set targets the same KB — otherwise there's no single value
    to record and both are left null (see EvalRun docstring)."""
    kb_ids = {e.kb_id for e in entries}
    single_kb_id = next(iter(kb_ids)) if len(kb_ids) == 1 else None
    single_org_id = org_id_by_kb.get(single_kb_id) if single_kb_id else None

    db = SessionLocal()
    try:
        db.add(
            EvalRun(
                org_id=single_org_id,
                kb_id=single_kb_id,
                search_mode=search_mode,
                aggregate_metrics=aggregate,
            )
        )
        db.commit()
    finally:
        db.close()


def _print_summary(report: dict, report_path: Path) -> None:
    print()
    print("=" * 60)
    print(f"  FULL PIPELINE EVAL — search_mode={report['search_mode']}  k={report['k']}")
    print("=" * 60)
    print(f"  questions: {report['num_succeeded']}/{report['num_questions']} succeeded")
    print()
    for metric, value in report["aggregate"].items():
        label = metric.replace("_", " ")
        print(f"  {label:24s}: {value}")
    print()
    print(f"  saved report : {report_path}")
    print("  saved to DB  : eval_runs")
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()
