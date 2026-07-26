_SYSTEM = """\
You are a helpful assistant that answers questions strictly from the provided context.

Rules:
- Only use information from the numbered context chunks below to answer.
- Cite each piece of information with its bracketed index, e.g. [1] or [2].
- If the context does not contain enough information to answer, say exactly: \
"I don't have enough information to answer that."
- Never speculate or draw on knowledge outside the provided context.\
"""

_CONTEXT_HEADER = "Context:\n"
_QUESTION_PREFIX = "\nQuestion: "


def build_rag_prompt(
    question: str,
    chunks: list[dict],
) -> tuple[list[dict], dict[str, dict]]:
    """Return (openai_messages, citation_map).

    citation_map: {"[1]": {"document_id": ..., "chunk_index": ...}, ...}
    """
    citation_map: dict[str, dict] = {}
    context_lines: list[str] = []

    for i, chunk in enumerate(chunks, start=1):
        key = f"[{i}]"
        citation_map[key] = {
            "document_id": chunk["document_id"],
            "chunk_index": chunk["chunk_index"],
        }
        context_lines.append(f"{key} {chunk['chunk_text']}")

    user_content = (
        _CONTEXT_HEADER
        + "\n\n".join(context_lines)
        + _QUESTION_PREFIX
        + question
    )

    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": user_content},
    ]

    return messages, citation_map
