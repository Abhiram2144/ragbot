"""Run the small, reproducible Quality Center evaluation."""

import statistics
import time
import uuid
from pathlib import Path

from app.database import SessionLocal
from app.models.eval_run import EvalRun
from app.models.knowledge_base import KnowledgeBase
from app.services.cost_calculator import estimate_cost
from app.services.eval_generation import citation_accuracy, faithfulness_score
from app.services.eval_loader import load_eval_set
from app.services.eval_metrics import hit_rate, mrr, precision_at_k, recall_at_k
from app.services.generation import generate_answer
from app.services.vector_store import _chunk_point_id


DEFAULT_EVAL_SET = Path(__file__).resolve().parent.parent.parent / "eval" / "eval_set.yaml"


def run_evaluation(
    search_mode: str,
    org_id: uuid.UUID,
    kb_id: uuid.UUID,
    use_faithfulness: bool = False,
) -> EvalRun:
    from app.api.knowledge_bases import _retrieve

    entries = [entry for entry in load_eval_set(DEFAULT_EVAL_SET) if entry.kb_id == kb_id]
    if not entries:
        raise ValueError("The evaluation set has no questions for this knowledge base")

    per_question = []
    for entry in entries:
        start = time.perf_counter()
        hits, rerank_used, _ = _retrieve(
            question=entry.question,
            search_mode=search_mode,
            org_id=str(org_id),
            kb_id=str(entry.kb_id),
        )
        result = generate_answer(entry.question, hits)
        latency_ms = round((time.perf_counter() - start) * 1000, 1)
        retrieved_ids = [str(_chunk_point_id(h["document_id"], h["chunk_index"])) for h in hits]
        row = {
            "id": entry.id,
            "question": entry.question,
            "expected_document_id": str(entry.expected_document_id),
            "expected_chunk_id": str(entry.expected_chunk_id),
            "hit_rate": float(hit_rate(retrieved_ids, str(entry.expected_chunk_id))),
            "recall_at_5": recall_at_k(retrieved_ids, str(entry.expected_chunk_id), 5),
            "precision_at_5": precision_at_k(retrieved_ids, str(entry.expected_chunk_id), 5),
            "mrr": mrr(retrieved_ids, str(entry.expected_chunk_id)),
            "citation_accuracy": citation_accuracy(result["sources"], str(entry.expected_document_id)),
            "latency_ms": latency_ms,
            "estimated_cost_usd": estimate_cost(
                input_tokens=result["input_tokens"],
                output_tokens=result["output_tokens"],
                embedding_tokens=max(1, len(entry.question) // 4),
                rerank_calls=1 if rerank_used else 0,
            ),
            "rerank_used": rerank_used,
        }
        if use_faithfulness:
            judgment = faithfulness_score(entry.question, result["answer"], [h["chunk_text"] for h in hits])
            row["faithfulness_score"] = judgment["score"]
            row["faithfulness_justification"] = judgment["justification"]
        per_question.append(row)

    def mean(key: str, digits: int = 4):
        values = [float(row[key]) for row in per_question if row.get(key) is not None]
        return round(statistics.mean(values), digits) if values else None

    aggregate = {
        "dataset_size": len(entries),
        "num_succeeded": len(per_question),
        "hit_rate": mean("hit_rate"),
        "recall_at_5": mean("recall_at_5"),
        "precision_at_5": mean("precision_at_5"),
        "mrr": mean("mrr"),
        "citation_accuracy": mean("citation_accuracy"),
        "latency_ms_mean": mean("latency_ms", 1),
        "estimated_cost_usd_mean": mean("estimated_cost_usd", 8),
        "faithfulness_score": mean("faithfulness_score") if use_faithfulness else None,
        "faithfulness_enabled": use_faithfulness,
        "per_question": per_question,
    }

    db = SessionLocal()
    try:
        run = EvalRun(
            org_id=org_id,
            kb_id=kb_id,
            search_mode=search_mode,
            aggregate_metrics=aggregate,
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run
    finally:
        db.close()