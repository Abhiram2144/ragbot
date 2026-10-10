"""
Phase 4.5 verification — side-by-side comparison of dense vs. hybrid search.

Sends the SAME question to both search_mode=dense and search_mode=hybrid,
prints the retrieved chunks for each, then checks query_logs to confirm
search_mode and rerank_used are stored correctly.

Prerequisites:
  - API server running:  uvicorn app.main:app --reload
  - Migration applied:   alembic upgrade head
  - At least one document indexed in the target KB

Environment variables (required):
  AUTH_TOKEN   Bearer token from POST /auth/login
  KB_ID        UUID of a knowledge base with indexed documents

Optional:
  API_BASE     Defaults to http://localhost:8000
  QUESTION     Defaults to the keyword-heavy question below

Run from the backend/ directory:

    AUTH_TOKEN=<token> KB_ID=<uuid> python scripts/test_search_modes.py
"""

import os
import sys
import urllib.request
import urllib.error
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

API_BASE   = os.environ.get("API_BASE", "http://localhost:8000")
AUTH_TOKEN = os.environ.get("AUTH_TOKEN", "")
KB_ID      = os.environ.get("KB_ID", "")

# Use a keyword-heavy question so BM25 has a chance to add signal the dense
# path misses (product IDs, error codes, exact version strings, etc.).
QUESTION = os.environ.get(
    "QUESTION",
    "What does error code ERR_AUTH_TOKEN_EXPIRED mean and how do I fix it?",
)

_SEP  = "=" * 72
_SEP2 = "-" * 72


def _post(path: str, payload: dict) -> dict:
    url = f"{API_BASE}{path}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {AUTH_TOKEN}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        print(f"HTTP {e.code} from {url}: {body}")
        sys.exit(1)


def _check_db(question: str) -> None:
    """Query the DB directly for the two most recent logs matching this question."""
    from app.database import SessionLocal
    from app.models.query_log import QueryLog
    from sqlalchemy import desc

    db = SessionLocal()
    try:
        logs = (
            db.query(QueryLog)
            .filter(QueryLog.question == question)
            .order_by(desc(QueryLog.created_at))
            .limit(2)
            .all()
        )
        if not logs:
            print("No query_log rows found for this question — check that logging works.")
            return

        print("\nquery_logs (2 most recent for this question):")
        print(_SEP2)
        for log in logs:
            print(f"  id          : {log.id}")
            print(f"  search_mode : {log.search_mode!r}")
            print(f"  rerank_used : {log.rerank_used!r}")
            print(f"  latency_ms  : {log.latency_ms}")
            print(f"  chunks      : {log.retrieved_chunk_ids}")
            print(_SEP2)
    finally:
        db.close()


def _run_query(search_mode: str) -> dict:
    path = f"/knowledge-bases/{KB_ID}/query"
    return _post(path, {"question": QUESTION, "stream": False, "search_mode": search_mode})


def _print_result(mode: str, result: dict) -> None:
    print(f"\n[{mode.upper()}]  answer (first 300 chars):")
    print(_SEP2)
    print(result.get("answer", "")[:300])
    sources = result.get("sources", [])
    print(f"\n  Sources returned ({len(sources)}):")
    for i, s in enumerate(sources, start=1):
        preview = s.get("chunk_text", "")[:100].replace("\n", " ")
        print(f"  {i}. [{s.get('marker')}] doc={s.get('document_id', '')[:8]}…  {preview!r}")
    print(_SEP2)


def main() -> None:
    if not AUTH_TOKEN:
        print("ERROR: AUTH_TOKEN environment variable is required.")
        print("  Get one with: curl -X POST http://localhost:8000/auth/login \\")
        print("    -H 'Content-Type: application/json' \\")
        print("    -d '{\"email\": \"you@example.com\", \"password\": \"yourpassword\"}'")
        sys.exit(1)

    if not KB_ID:
        print("ERROR: KB_ID environment variable is required (UUID from your DB).")
        sys.exit(1)

    print(_SEP)
    print("  Phase 4.5 — Dense vs. Hybrid search comparison")
    print(_SEP)
    print(f"  Question  : {QUESTION!r}")
    print(f"  KB        : {KB_ID}")
    print(f"  API base  : {API_BASE}")
    print()

    print("Running dense query...")
    dense_result = _run_query("dense")
    _print_result("dense", dense_result)

    print("\nRunning hybrid query...")
    hybrid_result = _run_query("hybrid")
    _print_result("hybrid", hybrid_result)

    print("\nChecking query_logs...")
    _check_db(QUESTION)

    print()
    print(_SEP)
    print("  What to look for:")
    print("    dense  row: search_mode='dense',  rerank_used=None")
    print("    hybrid row: search_mode='hybrid', rerank_used=True (or False if Cohere failed)")
    print("    Hybrid sources should rank keyword-match chunks higher than dense-only")
    print(_SEP)


if __name__ == "__main__":
    main()
