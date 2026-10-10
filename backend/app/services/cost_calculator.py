"""Rough per-query cost estimation, for observability only (query_logs.estimated_cost_usd).

Pricing constants below are USD, believed accurate as of when this file was
last edited. Verify against current OpenAI/Cohere pricing pages before
trusting this number — these drift and this file will silently go stale.

Caveats baked into this estimate:
- Chat pricing assumes gpt-4o-mini rates. estimate_cost() takes raw token
  counts, not a model name, so if settings.OPENAI_CHAT_MODEL points at a
  different model these constants no longer reflect actual spend — there
  is no per-model pricing table here by design (keeping the signature the
  caller asked for: token/call counts in, one float out).
- `embedding_tokens` is usually an approximation (~len(text)/4), not an
  exact count read from an API response, since embed_query() doesn't
  surface token usage today.
- `rerank_calls` counts query-level Cohere rerank invocations (0 or 1 per
  query), not documents scored — priced as one "search unit" per call.
"""

# OpenAI text-embedding-3-small — USD per 1M tokens
_EMBEDDING_COST_PER_1M_TOKENS = 0.02

# OpenAI gpt-4o-mini chat completion — USD per 1M tokens
_CHAT_INPUT_COST_PER_1M_TOKENS = 0.15
_CHAT_OUTPUT_COST_PER_1M_TOKENS = 0.60

# Cohere rerank-v3.5 — USD per 1000 rerank calls (~$2 / 1000 search units)
_RERANK_COST_PER_1000_CALLS = 2.00


def estimate_cost(
    input_tokens: int,
    output_tokens: int,
    embedding_tokens: int,
    rerank_calls: int,
) -> float:
    """Rough USD cost estimate for one query.

    Pure arithmetic over pricing constants — does no measurement of its
    own. Callers pass counts they already have from the pipeline they just
    ran (or a cheap approximation, for embedding_tokens).
    """
    chat_cost = (
        input_tokens * _CHAT_INPUT_COST_PER_1M_TOKENS
        + output_tokens * _CHAT_OUTPUT_COST_PER_1M_TOKENS
    ) / 1_000_000
    embedding_cost = embedding_tokens * _EMBEDDING_COST_PER_1M_TOKENS / 1_000_000
    rerank_cost = rerank_calls * _RERANK_COST_PER_1000_CALLS / 1000

    return round(chat_cost + embedding_cost + rerank_cost, 8)
