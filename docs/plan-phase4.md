# Phase 4 — Hybrid Search + Reranking: Implementation Plan

> Status: planning only — no code written yet.  
> Locked decisions referenced: CLAUDE.md ("Hybrid search = Qdrant's native dense+sparse,
> merged via RRF. Not a custom-built fusion algorithm. Cohere API for reranking.")

---

## 1. Sparse Vector Approach

### Which sparse embedding method

**Recommendation: FastEmbed BM25 (`Qdrant/bm25` model via the `fastembed` library).**

BM25 is a classical term-frequency inverse-document-frequency model that produces
a sparse vector where each dimension is a vocab term and its weight is the BM25 score
for that term in the document. It has no trainable parameters — it's a deterministic
function of term frequencies and corpus statistics.

The two plausible alternatives are:

- **SPLADE** (e.g. `prithvida/Splade_PP_en_v1`) — a learned sparse encoder that
  produces sparse vectors capturing semantic proximity, not just lexical overlap.
  The upside is higher quality on paraphrase-style queries. The downside is that
  it requires downloading and running a ~500 MB transformer model in the Celery
  worker, adds GPU-beneficial inference to the indexing pipeline, and has meaningful
  semantic overlap with the dense path (both `text-embedding-3-small` and SPLADE
  capture semantics, so the two paths are less complementary than dense + BM25).

- **Manual BM25 via `rank_bm25`** — compute sparse vectors entirely in Python
  without FastEmbed. More control, zero new dependencies, but produces a
  corpus-specific vocabulary that must be persisted and kept consistent between
  indexing and query time. This is a coordination headache (the vocabulary is not
  stored in Qdrant).

FastEmbed BM25 is the right choice here because:
1. **Complementarity**: BM25 catches exact keyword matches (error codes, product IDs,
   version strings) — exactly the failure mode that dense-only search misses.
   SPLADE would partially duplicate the dense path's coverage.
2. **No new infrastructure**: FastEmbed runs in-process in the Celery worker.
   No GPU, no additional service, no API cost.
3. **Qdrant integration**: `qdrant-client` has built-in FastEmbed support.
   The `SparseTextEmbedding` class produces `{indices, values}` dicts directly
   compatible with Qdrant's `SparseVectorParams`.
4. **New dependency to flag**: `fastembed` is not in `requirements.txt`.
   Add `fastembed>=0.3` when implementing. It is a pure-Python package with
   a small (~2 MB) BM25 tokenizer download on first use.

### Collection schema change

**Yes, a breaking schema change is required.**

The current `chunks` collection is created with:
```python
VectorParams(size=1536, distance=Distance.COSINE)  # single unnamed vector
```

Qdrant's named + sparse vector configuration requires:
```python
vectors_config={"dense": VectorParams(size=1536, distance=Distance.COSINE)},
sparse_vectors_config={"sparse": SparseVectorParams()}
```

Qdrant does not allow adding named vectors to an existing unnamed-vector collection
in-place. The collection must be recreated. There is no Alembic-style migration
for Qdrant — collection recreation is the only path.

`ensure_collection()` in `vector_store.py` must be updated to:
1. Detect whether the existing `chunks` collection uses the old unnamed format.
2. If so (or if it doesn't exist), recreate it with the named format.

**Ambiguity flag**: detecting "old vs. new schema" at startup introduces logic that
only runs once and then becomes dead weight. A simpler alternative is to rename
`ensure_collection()` into a one-time `migrate_collection()` management command,
run explicitly as part of the Phase 4 deployment, not on every worker startup.
The trade-off is operational discipline (someone must remember to run it) vs.
code bloat. For a single-developer portfolio project, a management script is
the cleaner choice.

### Re-indexing existing documents

**Yes, all documents must be re-indexed.** Each stored point must include both
a `dense` vector and a `sparse` vector. The old points have neither (they use the
unnamed default slot, which will be gone in the new schema).

Re-indexing approach:
- Add a management script `backend/scripts/reindex_all.py` that queries
  `documents` where `status = 'complete'`, then calls `process_document.delay(doc.id)`
  for each one.
- Because chunk point IDs are deterministic (`uuid5(document_id, chunk_index)`),
  re-indexing the same document is idempotent — upsert overwrites the existing
  point without creating a duplicate.
- The original files are still present on disk (`doc.file_path`), so re-extraction
  and re-chunking require no additional state.
- Status should NOT flip to `pending` during re-indexing in the script — this
  is a background re-population, not a user-visible event. The document is still
  queryable on the dense-only path until the worker finishes.

**Ambiguity flag**: do we re-index in-place (status stays `complete`) or run through
the full status cycle (`complete → processing → complete`)? In-place is cleaner UX
but means the document is briefly queryable without a sparse vector during the
worker run. Given this is a development environment, in-place is fine.

---

## 2. RRF Merge Logic

### Formula and k constant

**Recommendation: standard RRF with k = 60.**

```
RRF_score(chunk) = Σ  1 / (k + rank_i(chunk))
                  i ∈ {dense, sparse}
```

Where `rank_i(chunk)` is the 1-based position of the chunk in result list `i`
(1 = highest score), and the chunk receives a contribution only from lists where
it appears.

`k = 60` is the value from the original Cormack et al. (2009) paper, where it was
tuned empirically across TREC tasks. It controls rank sensitivity: lower k amplifies
the advantage of top-ranked results; higher k makes the function flatter. At k=60,
the score difference between rank 1 (0.0164) and rank 2 (0.0161) is small but not
zero — sufficient differentiation without being brittle.

There is no strong reason to deviate from k=60 without running an evaluation (Phase 5).
Make it a named constant (`_RRF_K = 60`) so it can be tuned later.

### Where this logic lives

A new function `hybrid_search_chunks()` in `vector_store.py`, alongside the existing
`search_chunks()`. The caller (`knowledge_bases.py`) decides which to invoke based
on the search mode flag (see §5). Nothing in the service layer needs to know about
the two-step internals.

```
hybrid_search_chunks(org_id, kb_id, dense_vector, sparse_vector, top_k)
  → calls search_chunks_dense() and search_chunks_sparse() each for top_n candidates
  → applies RRF in Python
  → returns top_k results with merged score
```

**Ambiguity flag**: Qdrant 1.7+ exposes a native `FusionQuery(fusion=Fusion.RRF)`
in the `query_points()` API that runs RRF inside the Qdrant engine in a single
network round-trip. This is simpler and more efficient. However, it hides the
individual dense/sparse scores, making Phase 6 observability harder (you cannot
log per-stage scores to `query_logs` if Qdrant gives you only the fused result).

Recommendation: implement RRF in Python for now, keeping individual scores visible.
Switch to native Qdrant RRF in Phase 6 only if the Python overhead becomes
measurable — it won't be at this scale.

### Edge cases

| Case | Handling |
|------|----------|
| Dense returns 0 results | RRF runs over the sparse list only. Each chunk gets `1/(k + rank)` from sparse only. Correct behavior — no special case needed. |
| Sparse returns 0 results | Symmetric. Falls back to dense-only ranking via RRF scores. Functionally identical to the old path, just with RRF ordering instead of raw cosine scores. |
| Both return 0 results | Return empty list. Generation path already handles this (the "no context" answer). |
| Chunk appears in both lists | Gets contributions from both, so its score is higher than a chunk appearing in only one list. This is the intended behavior. |
| Ties in RRF score | Break ties by dense cosine score (higher = better). Dense is the primary quality signal; BM25 is a retrieval aid, not a quality scorer. |

---

## 3. Query Rewriting

### What the rewrite prompt should do

The rewriting call should instruct the model to:
1. **Expand technical acronyms and abbreviations** — `"JWT auth errors"` →
   `"JSON Web Token JWT authentication errors"`. BM25 will now match either form.
2. **Add closely related technical synonyms** — `"can't log in"` →
   `"cannot log in login failure authentication error"`.
3. **Remove filler words** that dilute BM25 term matching — `"How do I..."`,
   `"What is the way to..."` → stripped.
4. **Preserve the core question intact** — the rewritten query is used for
   retrieval only; the original is preserved for the generation prompt.

What it should NOT do:
- Split compound questions into sub-queries (requires multiple retrievals — Phase 5+).
- Infer intent beyond what is stated (speculative rewrites hurt precision).
- Resolve references to prior turns (the system is single-turn per query; no context exists).

Prompt sketch:
```
Rewrite the following search query to improve recall from a keyword and 
semantic document index. Expand technical acronyms, add common synonyms 
and related terms for the core concepts, and remove conversational filler. 
Do not invent information or change the intent. Return only the rewritten 
query on a single line, no explanation.

Query: {question}
```

### Always or conditionally

**Recommendation: always, with a cheap model (GPT-4o-mini or `gpt-4o-mini`).**

The conditional alternative — only rewrite when the query is short, contains
acronyms, or looks "ambiguous" — requires a classifier or heuristic that will
get the boundary cases wrong. Always-on is predictable and testable.

The one valid conditional approach would be toggling rewriting off when
`search_mode=dense` (the A/B comparison path) so the comparison is clean:
dense-only gets the original query, hybrid+rerank gets the rewritten query.
Whether to couple these two features is a judgment call flagged below.

**Ambiguity flag**: should query rewriting be part of the hybrid-search feature
or orthogonal to it? If orthogonal, it applies to the dense-only path too and
you can A/B rewriting independently. If coupled, `search_mode=dense` uses the
raw query and `search_mode=hybrid` uses the rewritten one, meaning the hybrid
path benefits from two improvements simultaneously (making it harder to isolate
which improvement drove the score gain in Phase 5 eval). Recommendation: keep
rewriting orthogonal and always-on, add a separate `query_rewrite=true/false`
param in Phase 5 when you want to isolate its contribution.

### Estimated latency and cost

- Model: `gpt-4o-mini` (cheapest OpenAI chat model).
- Typical input: ~50 tokens (system prompt + question). Typical output: ~40 tokens.
- Cost: ~$0.00003/query at current pricing — negligible.
- Latency: ~200–400 ms cold, ~100–200 ms warm (API round-trip).
- This call is **sequential before embedding** — it cannot be parallelized with
  embedding the original query because we want to embed the rewritten version.
  Total additional latency added to the query path: ~200–400 ms.
- Optimization available but not needed for Phase 4: embed the original query
  concurrently with the rewrite call, then re-embed the rewritten query only if
  it differs meaningfully. Defer this to Phase 7.

---

## 4. Reranking

### Where Cohere rerank sits in the pipeline

**Recommendation: after RRF merge.**

The pipeline order is:

```
query rewrite
    ↓
embed rewritten query (dense) + generate sparse vector (BM25)
    ↓
dense search top-20 + sparse search top-20  [parallel]
    ↓
RRF merge → deduplicated top-20 candidates
    ↓
Cohere rerank → top-5
    ↓
generation
```

Argument for reranking after merge:
- Cohere rerank is a cross-encoder: it scores `(query, chunk)` pairs by full
  attention over the concatenated text. It is more expensive per call than
  vector search, so you want to call it once on the best merged candidate set,
  not twice (once for dense results, once for sparse results).
- The merged list contains candidates that excelled at either semantic similarity
  or keyword match. Reranking over this joint set means the cross-encoder can
  elevate a chunk that was ranked 15th in dense but 1st in sparse — it gets a
  fair shot it would not have had if reranking happened before merge.
- Two rerank calls (pre-merge) would cost twice as much and require a second RRF
  pass on reranked scores, conflating two different score spaces.

The only argument for reranking before merge is that it could improve the quality
of the inputs to RRF. But RRF operates on ranks, not scores — it doesn't benefit
from "better" scores, only from "better ranks", and the cross-encoder's rank
ordering might not be a better input to RRF than the retrieval model's native
ordering on its own output.

### Candidates in → candidates out

| Stage | Count | Rationale |
|-------|-------|-----------|
| Dense search | top-20 | Wider recall net than the current top-5 |
| Sparse search | top-20 | Symmetric |
| After RRF dedup | ≤ 40, typically 25–35 | Overlap between lists |
| Into Cohere rerank | top-20 (by RRF score) | Cost/quality sweet spot; Cohere charges per candidate |
| Out of Cohere rerank | top-5 | Matches current LLM context budget |

`TOP_K_RETRIEVAL = 5` stays as the final output to the generation step.
Add two new settings: `RERANK_CANDIDATES_PER_PATH = 20` and
`RERANK_TOP_N = 20` (candidates sent to Cohere). Both should be in `config.py`
so they can be tuned without code changes.

**Ambiguity flag**: should the retrieval fan-out (20 per path) be hardcoded
relative to `TOP_K_RETRIEVAL`, or independently configurable? Independently
configurable is more flexible but creates a footgun: setting `TOP_K_RETRIEVAL=10`
without increasing `RERANK_CANDIDATES_PER_PATH` would silently degrade quality.
Recommendation: document the dependency clearly in `config.py` comments and
keep them separate values.

### Fallback if Cohere fails

- Catch the exception in the reranking function, log a warning with the error,
  and return the RRF-ordered candidates truncated to `TOP_K_RETRIEVAL`.
- Do NOT raise an HTTP 500 — the user gets a slightly lower-quality answer
  rather than a failed request.
- Add a boolean field `rerank_used` to `query_logs` so degraded requests are
  identifiable in Phase 6 observability.
- Apply the same retry logic already present in `embedding.py`
  (`_MAX_ATTEMPTS = 3`, exponential backoff) before triggering the fallback.

```
Cohere call
  → success: return reranked top-5
  → failure after retries: log warning, return RRF top-5, set rerank_used=False
```

---

## 5. A/B Comparison Path

### Where the flag lives

**Recommendation: query parameter `search_mode: Literal["dense", "hybrid"] = "hybrid"`
added to the existing `QueryRequest` Pydantic schema.**

The alternatives:
- **Request header** (`X-Search-Mode: hybrid`) — harder to test interactively,
  not visible in query logs, requires client changes for every test call.
- **Environment variable / config toggle** — a single global switch. You cannot
  compare both paths in the same session or per-request, which makes it useless
  for A/B comparison.
- **Separate endpoint** (`/query-hybrid`) — duplicates routing, auth, logging,
  SSE plumbing. CLAUDE.md's philosophy explicitly rejects this kind of duplication.

The query parameter approach:
- Works with the existing `QueryRequest` schema (one new optional field, default `"hybrid"`).
- The existing `QuerySchema` already reaches the `query_kb` handler; no routing change.
- `search_mode` should be logged to `query_logs` (a new nullable string column, or
  just include it in the existing `retrieved_chunk_ids` JSONB as metadata).
- Allows exact per-request comparison: two curl calls with the same question, one
  `search_mode=dense`, one `search_mode=hybrid`.

### Implementation inside the handler

```
if body.search_mode == "dense":
    hits = search_chunks(...)          # existing function, unchanged
else:
    rewritten = rewrite_query(question)
    dense_vec = embed_query(rewritten)
    sparse_vec = sparse_embed(rewritten)
    hits = hybrid_search_chunks(...)   # new function
    hits = rerank(question, hits)      # Cohere, with fallback
```

No endpoint duplication. The dense path remains exactly as it exists today —
the existing `search_chunks()` function is not modified, only conditionally
bypassed.

**Ambiguity flag**: should `search_mode=dense` also skip query rewriting?
If yes, the A/B comparison tests dense-only-everything vs. hybrid+rewriting+reranking
— which conflates three improvements and makes it hard to isolate which one
drove any score change in Phase 5 eval. If no, both paths use the rewritten
query, which means the comparison is cleaner on the retrieval dimension but the
dense path gets a "free upgrade" from rewriting.

My recommendation: `search_mode=dense` bypasses rewriting, sparse retrieval, RRF,
and reranking — it is a true baseline. The hybrid path enables all four. Phase 5
can introduce finer-grained toggles once you have eval infrastructure to measure
each component's contribution independently.

---

## Open Questions / Decisions Needed Before Implementation

1. **Collection migration trigger**: one-time management script (run manually at
   deploy time) vs. auto-detect-and-migrate in `ensure_collection()` at worker
   startup. Script is cleaner but requires an explicit ops step.

2. **Re-indexing during business hours**: re-indexing all documents triggers
   OpenAI embedding API calls for every chunk. For a portfolio project this is
   inconsequential, but flag it: is there a rate limit concern with the current
   OpenAI tier?

3. **Sparse embedding at query time**: BM25 sparse vector generation for the
   query is cheap and local. Should it run in the API process (synchronously
   in the request handler) or be abstracted behind `embedding.py` alongside
   `embed_query()`? Recommend: add `sparse_embed_query()` to `embedding.py`
   for consistency, even though it's local (no API call).

4. **Cohere API key**: not yet in `config.py` or `.env`. Add `COHERE_API_KEY`
   as a required setting and `cohere>=5.0` to `requirements.txt` before Phase 4
   starts.

5. **RRF in Python vs. native Qdrant `FusionQuery`**: Python RRF is recommended
   above for observability, but if Qdrant is upgraded to 1.7+ and the native API
   is available, switching is a one-function change. Confirm the Qdrant container
   version in `docker-compose.yml` before deciding.
