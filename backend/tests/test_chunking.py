"""
Tests for extract_text and chunk_text.

For the PDF test, place a small PDF at tests/fixtures/sample.pdf before running.
For the TXT test, the fixture is created programmatically — no file needed.
"""

import textwrap
from pathlib import Path

import pytest

from app.services.chunking import chunk_text, extract_text

FIXTURES = Path(__file__).parent / "fixtures"


# ── chunk_text unit tests (no file I/O) ──────────────────────────────────────

def _make_words(n: int) -> str:
    """Return a deterministic string of n words: word0 word1 … wordN-1."""
    return " ".join(f"word{i}" for i in range(n))


def test_chunk_text_single_chunk_when_text_is_short():
    text = _make_words(100)
    chunks = chunk_text(text, chunk_size=400, overlap=50)
    assert len(chunks) == 1
    assert chunks[0] == text


def test_chunk_text_splits_at_chunk_size():
    text = _make_words(900)
    chunks = chunk_text(text, chunk_size=400, overlap=50)
    # 900 words with size=400 overlap=50: windows at 0–400, 350–750, 700–900
    assert len(chunks) == 3


def test_chunk_text_overlap_is_present():
    text = _make_words(500)
    chunks = chunk_text(text, chunk_size=400, overlap=50)
    assert len(chunks) == 2

    # The last 50 words of chunk 0 should appear as the first 50 words of chunk 1.
    tail_of_first = chunks[0].split()[-50:]
    head_of_second = chunks[1].split()[:50]
    assert tail_of_first == head_of_second


def test_chunk_text_each_chunk_within_expected_word_count():
    text = _make_words(1000)
    chunks = chunk_text(text, chunk_size=400, overlap=50)
    for chunk in chunks:
        word_count = len(chunk.split())
        # Every chunk except the last should be exactly chunk_size words.
        # The last may be smaller (but >= min_chunk_words after merging).
        assert word_count <= 400


def test_chunk_text_short_trailing_chunk_is_merged():
    # 410 words → chunk 0 is words 0–400, remainder is 10 words (< min_chunk_words=20)
    # Those 10 words should be merged into chunk 0, leaving exactly 1 chunk.
    text = _make_words(410)
    chunks = chunk_text(text, chunk_size=400, overlap=50)
    assert len(chunks) == 1
    assert len(chunks[0].split()) == 410


def test_chunk_text_empty_string_returns_empty_list():
    assert chunk_text("") == []


def test_chunk_text_whitespace_only_returns_empty_list():
    assert chunk_text("   \n\t  ") == []


# ── extract_text integration tests (require fixture files) ───────────────────

def test_extract_text_from_txt(tmp_path):
    sample = tmp_path / "hello.txt"
    sample.write_text("Hello world.\nSecond line.", encoding="utf-8")
    text = extract_text(str(sample), "hello.txt")
    assert "Hello world." in text
    assert "Second line." in text


def test_extract_text_from_md(tmp_path):
    sample = tmp_path / "note.md"
    sample.write_text("# Title\n\nSome body text.", encoding="utf-8")
    text = extract_text(str(sample), "note.md")
    assert "Title" in text
    assert "Some body text." in text


@pytest.mark.skipif(
    not (FIXTURES / "sample.pdf").exists(),
    reason="tests/fixtures/sample.pdf not present — drop in a small PDF to enable",
)
def test_extract_text_from_pdf():
    path = FIXTURES / "sample.pdf"
    text = extract_text(str(path), "sample.pdf")
    assert len(text.strip()) > 0, "PDF extraction returned empty text"


def test_extract_text_raises_for_unsupported_extension(tmp_path):
    fake = tmp_path / "file.xyz"
    fake.write_text("irrelevant")
    with pytest.raises(ValueError, match="Unsupported file extension"):
        extract_text(str(fake), "file.xyz")


# ── end-to-end: extract then chunk ───────────────────────────────────────────

def test_extract_and_chunk_txt(tmp_path):
    # 500-word document
    body = " ".join(f"word{i}" for i in range(500))
    sample = tmp_path / "big.txt"
    sample.write_text(body, encoding="utf-8")

    text = extract_text(str(sample), "big.txt")
    chunks = chunk_text(text, chunk_size=400, overlap=50)

    assert len(chunks) >= 2
    # Verify overlap: tail of chunk 0 matches head of chunk 1
    assert chunks[0].split()[-50:] == chunks[1].split()[:50]
