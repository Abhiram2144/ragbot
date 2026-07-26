import re
import time
from collections.abc import Iterator

from openai import APIStatusError, OpenAI, RateLimitError

from app.config import settings
from app.services.prompt_builder import build_rag_prompt

_MAX_ATTEMPTS = 3
_CITATION_RE = re.compile(r"\[(\d+)\]")

_client = OpenAI(api_key=settings.OPENAI_API_KEY)


def generate_answer(question: str, chunks: list[dict]) -> dict:
    messages, citation_map = build_rag_prompt(question, chunks)
    chunk_text_by_key = {f"[{i + 1}]": c["chunk_text"] for i, c in enumerate(chunks)}

    answer_text, input_tokens, output_tokens = _chat_with_retry(messages)

    # Collect markers that appear in the answer and exist in our citation map,
    # in order of first appearance, deduplicated.
    seen: set[str] = set()
    sources: list[dict] = []
    for m in _CITATION_RE.finditer(answer_text):
        key = f"[{m.group(1)}]"
        if key in citation_map and key not in seen:
            seen.add(key)
            sources.append(
                {
                    "marker": key,
                    "document_id": citation_map[key]["document_id"],
                    "chunk_text": chunk_text_by_key[key],
                }
            )

    return {
        "answer": answer_text,
        "sources": sources,
        "prompt": messages,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
    }


def _chat_with_retry(messages: list[dict]) -> tuple[str, int, int]:
    delay = 1.0
    last_exc: Exception | None = None

    for attempt in range(_MAX_ATTEMPTS):
        try:
            response = _client.chat.completions.create(
                model=settings.OPENAI_CHAT_MODEL,
                messages=messages,
                temperature=0,
            )
            text = response.choices[0].message.content
            usage = response.usage
            return text, usage.prompt_tokens, usage.completion_tokens
        except RateLimitError as exc:
            last_exc = exc
        except APIStatusError as exc:
            if exc.status_code < 500:
                raise
            last_exc = exc

        if attempt < _MAX_ATTEMPTS - 1:
            time.sleep(delay)
            delay *= 2

    raise RuntimeError(f"Chat completion failed after {_MAX_ATTEMPTS} attempts") from last_exc


def generate_answer_stream(question: str, chunks: list[dict]) -> Iterator[dict]:
    """Yield token-delta dicts, then one final done dict with sources and usage."""
    messages, citation_map = build_rag_prompt(question, chunks)
    chunk_text_by_key = {f"[{i + 1}]": c["chunk_text"] for i, c in enumerate(chunks)}

    stream = _open_stream_with_retry(messages)

    full_text_parts: list[str] = []
    input_tokens = 0
    output_tokens = 0

    for chunk in stream:
        # The usage-only sentinel chunk has empty choices; skip content extraction for it.
        if chunk.choices and chunk.choices[0].delta.content:
            delta = chunk.choices[0].delta.content
            full_text_parts.append(delta)
            yield {"type": "token", "text": delta}

        if chunk.usage is not None:
            input_tokens = chunk.usage.prompt_tokens
            output_tokens = chunk.usage.completion_tokens

    stream.close()

    answer_text = "".join(full_text_parts)
    seen: set[str] = set()
    sources: list[dict] = []
    for m in _CITATION_RE.finditer(answer_text):
        key = f"[{m.group(1)}]"
        if key in citation_map and key not in seen:
            seen.add(key)
            sources.append(
                {
                    "marker": key,
                    "document_id": citation_map[key]["document_id"],
                    "chunk_text": chunk_text_by_key[key],
                }
            )

    yield {
        "type": "done",
        "sources": sources,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "prompt": messages,
        "answer": answer_text,
    }


def _open_stream_with_retry(messages: list[dict]):
    """Open a streaming chat completion, retrying on rate-limit / 5xx errors."""
    delay = 1.0
    last_exc: Exception | None = None

    for attempt in range(_MAX_ATTEMPTS):
        try:
            return _client.chat.completions.create(
                model=settings.OPENAI_CHAT_MODEL,
                messages=messages,
                temperature=0,
                stream=True,
                stream_options={"include_usage": True},
            )
        except RateLimitError as exc:
            last_exc = exc
        except APIStatusError as exc:
            if exc.status_code < 500:
                raise
            last_exc = exc

        if attempt < _MAX_ATTEMPTS - 1:
            time.sleep(delay)
            delay *= 2

    raise RuntimeError(f"Chat completion failed after {_MAX_ATTEMPTS} attempts") from last_exc
