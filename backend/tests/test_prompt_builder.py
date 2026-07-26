import pytest

from app.services.prompt_builder import build_rag_prompt

_CHUNKS = [
    {
        "chunk_text": "Refunds are processed within 5 business days.",
        "score": 0.91,
        "document_id": "doc-aaa",
        "chunk_index": 0,
    },
    {
        "chunk_text": "Items must be returned in original packaging.",
        "score": 0.85,
        "document_id": "doc-bbb",
        "chunk_index": 2,
    },
    {
        "chunk_text": "Shipping labels are provided free of charge.",
        "score": 0.78,
        "document_id": "doc-aaa",
        "chunk_index": 5,
    },
]

_QUESTION = "How do I get a refund?"


@pytest.fixture
def prompt_output():
    return build_rag_prompt(_QUESTION, _CHUNKS)


def test_returns_two_messages(prompt_output):
    messages, _ = prompt_output
    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert messages[1]["role"] == "user"


def test_system_message_contains_citation_instruction(prompt_output):
    messages, _ = prompt_output
    system = messages[0]["content"]
    assert "[1]" in system or "[2]" in system  # example citation format is shown
    assert "I don't have enough information to answer that" in system


def test_user_message_contains_all_chunk_texts(prompt_output):
    messages, _ = prompt_output
    user = messages[1]["content"]
    for chunk in _CHUNKS:
        assert chunk["chunk_text"] in user


def test_user_message_numbers_chunks_in_order(prompt_output):
    messages, _ = prompt_output
    user = messages[1]["content"]
    pos1 = user.index("[1]")
    pos2 = user.index("[2]")
    pos3 = user.index("[3]")
    assert pos1 < pos2 < pos3


def test_user_message_contains_question(prompt_output):
    messages, _ = prompt_output
    assert _QUESTION in messages[1]["content"]


def test_citation_map_keys(prompt_output):
    _, citation_map = prompt_output
    assert set(citation_map.keys()) == {"[1]", "[2]", "[3]"}


def test_citation_map_resolves_to_correct_document_ids(prompt_output):
    _, citation_map = prompt_output
    assert citation_map["[1]"]["document_id"] == "doc-aaa"
    assert citation_map["[2]"]["document_id"] == "doc-bbb"
    assert citation_map["[3]"]["document_id"] == "doc-aaa"


def test_citation_map_resolves_to_correct_chunk_indices(prompt_output):
    _, citation_map = prompt_output
    assert citation_map["[1]"]["chunk_index"] == 0
    assert citation_map["[2]"]["chunk_index"] == 2
    assert citation_map["[3]"]["chunk_index"] == 5


def test_empty_chunks_returns_empty_citation_map():
    messages, citation_map = build_rag_prompt("Any question?", [])
    assert citation_map == {}
    assert len(messages) == 2
