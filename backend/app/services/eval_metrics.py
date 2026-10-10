"""Retrieval evaluation metrics — pure functions, no DB/API calls.

Each eval_set.yaml entry pins exactly one expected chunk per question, so
these metrics are the single-relevant-item form of the usual IR metrics
(hit rate, recall@k, precision@k, MRR).

`retrieved_ids` is a ranked list of chunk ids (best match first).
"""


def hit_rate(retrieved_ids: list, expected_id: str) -> bool:
    """Whether the expected chunk appears anywhere in the retrieved list."""
    return expected_id in retrieved_ids


def recall_at_k(retrieved_ids: list, expected_id: str, k: int) -> float:
    """1.0 if the expected chunk is within the top k retrieved, else 0.0.

    With exactly one relevant item, recall@k is binary (found or not).
    """
    return 1.0 if expected_id in retrieved_ids[:k] else 0.0


def precision_at_k(retrieved_ids: list, expected_id: str, k: int) -> float:
    """1/k if the expected chunk is within the top k retrieved, else 0.0.

    With exactly one relevant item, at most one of the k slots can be a hit.
    """
    if k <= 0:
        raise ValueError("k must be positive")
    return (1.0 / k) if expected_id in retrieved_ids[:k] else 0.0


def mrr(retrieved_ids: list, expected_id: str) -> float:
    """Reciprocal rank of the expected chunk (1-based), 0.0 if not found."""
    for rank, rid in enumerate(retrieved_ids, start=1):
        if rid == expected_id:
            return 1.0 / rank
    return 0.0
