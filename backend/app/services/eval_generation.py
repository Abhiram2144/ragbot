"""Generation-quality eval metrics.

faithfulness_score() makes one LLM call (a judge); citation_accuracy() is
pure and deterministic. Retrieval metrics stay in eval_metrics.py — this
module is generation-only, per the 5.2/5.3 split.
"""

import json
import time

from openai import APIStatusError, OpenAI, RateLimitError

from app.config import settings

_MAX_ATTEMPTS = 3

# Judged by the same model that generates answers — a weaker judge model
# would be cheaper but less trustworthy for a task that already leans on
# subjective partial-credit scoring.
_JUDGE_MODEL = settings.OPENAI_CHAT_MODEL

_client = OpenAI(api_key=settings.OPENAI_API_KEY)

_JUDGE_SYSTEM_PROMPT = """You are grading whether an answer is faithful to the provided source \
chunks: every factual claim in the answer must be directly supported by the sources, not drawn \
from outside knowledge or invented.

Score faithfulness from 0.0 to 1.0:
- 1.0 = every claim in the answer is directly supported by the source chunks.
- 0.0 = the answer is entirely unsupported by the sources, contradicts them, or is fabricated.
- Use intermediate values for PARTIAL support. For example, if roughly half the claims are \
supported and half are not, or the answer adds unsupported detail alongside supported claims, \
score around 0.5. Do NOT round partial support up to 1.0 or down to 0.0 — the score should \
reflect the actual proportion of supported claims.

Respond with ONLY a JSON object of the form:
{"score": <float between 0 and 1>, "justification": "<one or two sentences on what is and \
is not supported>"}"""


def faithfulness_score(question: str, answer: str, source_chunks: list[str]) -> dict:
    """Judge whether every claim in `answer` is supported by `source_chunks`.

    One LLM call, temperature=0. Returns {"score": float 0-1, "justification": str}.
    Raises RuntimeError if the judge call fails after retries or returns an
    unparseable / out-of-range response — callers (the eval runner) decide
    how to handle a failed judgment per question.
    """
    sources_block = "\n\n".join(f"[{i + 1}] {text}" for i, text in enumerate(source_chunks))
    user_prompt = (
        f"Question: {question}\n\n"
        f"Answer: {answer}\n\n"
        f"Source chunks:\n{sources_block or '(no source chunks were retrieved)'}"
    )

    raw = _judge_with_retry(user_prompt)
    return _parse_judge_response(raw)


def _judge_with_retry(user_prompt: str) -> str:
    delay = 1.0
    last_exc: Exception | None = None

    for attempt in range(_MAX_ATTEMPTS):
        try:
            response = _client.chat.completions.create(
                model=_JUDGE_MODEL,
                messages=[
                    {"role": "system", "content": _JUDGE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0,
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content
        except RateLimitError as exc:
            last_exc = exc
        except APIStatusError as exc:
            if exc.status_code < 500:
                raise
            last_exc = exc

        if attempt < _MAX_ATTEMPTS - 1:
            time.sleep(delay)
            delay *= 2

    raise RuntimeError(f"Faithfulness judge failed after {_MAX_ATTEMPTS} attempts") from last_exc


def _parse_judge_response(raw: str) -> dict:
    try:
        parsed = json.loads(raw)
        score = float(parsed["score"])
        justification = str(parsed["justification"])
    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
        raise RuntimeError(f"Faithfulness judge returned an unparseable response: {raw!r}") from exc

    if not 0.0 <= score <= 1.0:
        raise RuntimeError(f"Faithfulness judge returned an out-of-range score: {score}")

    return {"score": score, "justification": justification}


def citation_accuracy(sources: list[dict], expected_document_id: str) -> float:
    """Fraction of cited sources whose document_id matches expected_document_id.

    Deterministic, no LLM call. An answer that cites nothing scores 0.0 —
    it cannot be judged accurate against the expected document.
    """
    if not sources:
        return 0.0
    matches = sum(1 for s in sources if str(s["document_id"]) == str(expected_document_id))
    return matches / len(sources)
