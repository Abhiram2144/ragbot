"""
Smoke-test for rewrite_query().

Runs 4 messy sample questions through the rewriter and prints before/after
so you can eyeball whether the rewrite expands acronyms, adds synonyms, and
strips filler without changing intent.

Run from the backend/ directory:

    python scripts/test_rewrite.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.generation import rewrite_query

QUESTIONS = [
    # Acronym expansion + synonym enrichment
    "How do I fix JWT auth errors when logging in?",
    # Casual spelling, filler, acronym (SSO, SAML)
    "whats the best way 2 set up SSO w/ SAML for our enterprise customers lol",
    # Verbose filler — "Can you tell me a bit about..."
    "Can you tell me a bit about what the main error codes are for the API and how to handle them?",
    # Dense technical jargon (k8s, OOMKilled, version string)
    "k8s pod OOMKilled after deploying v2.3.1",
]

_SEP = "-" * 72


def main() -> None:
    print("Query rewrite smoke test")
    print("=" * 72)
    print()
    for i, q in enumerate(QUESTIONS, start=1):
        print(f"[{i}] Original : {q}")
        rewritten = rewrite_query(q)
        print(f"    Rewritten: {rewritten}")
        print(_SEP)
    print()
    print(f"Done — {len(QUESTIONS)} queries rewritten.")


if __name__ == "__main__":
    main()
