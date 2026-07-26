from pathlib import Path


def extract_text(file_path: str, filename: str) -> str:
    ext = Path(filename).suffix.lstrip(".").lower()

    if ext in ("txt", "md"):
        return Path(file_path).read_text(encoding="utf-8")

    if ext == "pdf":
        import pypdf

        reader = pypdf.PdfReader(file_path)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)

    if ext == "docx":
        import docx

        doc = docx.Document(file_path)
        return "\n".join(para.text for para in doc.paragraphs)

    raise ValueError(f"Unsupported file extension: .{ext}")


def chunk_text(
    text: str,
    chunk_size: int = 400,
    overlap: int = 50,
    min_chunk_words: int = 20,
) -> list[str]:
    words = text.split()
    if not words:
        return []

    chunks: list[str] = []
    start = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk_words = words[start:end]

        if len(chunk_words) >= min_chunk_words:
            chunks.append(" ".join(chunk_words))
        elif chunks:
            # Merge a short trailing chunk into the previous one rather than
            # emitting a near-empty chunk.
            chunks[-1] = chunks[-1] + " " + " ".join(chunk_words)

        if end == len(words):
            break

        start = end - overlap

    return chunks
