# Cristalina v4
## Retrieval And Vector Engine Plan

**Status:** Draft  
**Created:** 2026-04-21  
**Purpose:** Define a full Cristalina-native retrieval and vector-search plan that preserves layer law, provenance, symbolic navigation, and governance authority.

---

## 1. Core Decision

Cristalina v4 should build its own retrieval and vector engine.

That does not mean vector similarity becomes the architecture.

The core rule is:

`provenance > authority > layer law > symbolic anchors > vector similarity`

Vector search helps the system find relevant candidates. It does not decide what a candidate means, whether it is authoritative, whether it can support canonical promotion, or whether it may enter a runtime projection.

Cristalina owns:

- retrieval contracts
- symbolic anchors
- chunking policy
- embedding and index manifests
- vector index lifecycle
- hybrid ranking
- authority and layer filters
- projection integration
- retrieval audit and evals

External tools may remain compatible as import/export or benchmark adapters, but they should not define Cristalina's retrieval semantics.

### Relationship To The Master Plan

[SYMBOLIC-RETRIEVAL-VECTOR-MASTER-PLAN.md](SYMBOLIC-RETRIEVAL-VECTOR-MASTER-PLAN.md) owns sequencing and cross-road dependencies.

This document owns the retrieval/vector technical details.

When implementation begins, changes should keep these documents convergent:

- master plan: phase order, dependency order, acceptance gates
- this plan: retrieval contracts, vector records, chunking, embedding, indexing, ranking, evals, interoperability

---

## 2. Non-Negotiable Rules

1. Vector records are derived artifacts.
2. Every vector chunk must dereference an upstream source record, world record, wiki record, canonical record, governance record, runtime record, or projection artifact.
3. Embeddings must never replace source text, provenance, or layer identity.
4. A high vector score must not make wiki prose canonical.
5. A proposal candidate must dereference eligible upstream records, not vector similarity alone.
6. Wiki retrieval must remain labeled as editorial unless governed promotion changes the authoritative home.
7. Canonical records outrank editorial synthesis for truth claims even when vector similarity is lower.
8. Retrieval results must explain why they were included or suppressed.
9. Retrieval search runs must be replayable enough for audit, diagnostics, and evals.
10. External semantic tools may provide candidates, but Cristalina applies final authority, layer, temporal, provenance, and projection policy.

---

## 3. Symbolic Anchors

Symbolic anchors are stable conceptual addresses.

They are inspired by Serena's useful lesson: names and relationships can make navigation more precise than raw text search. In Cristalina, symbols are not code symbols. They are conceptual anchors across memory layers.

Initial shape:

```ts
interface SymbolAnchor {
  id: string;
  kind:
    | "concept"
    | "entity"
    | "relation_type"
    | "semantic_slot"
    | "intake_profile"
    | "wiki_topic";
  label: string;
  aliases: string[];
  description?: string;
  target_refs: string[];
  upstream_refs: string[];
  authority: "navigation_only";
}
```

Examples:

- `sym:concept/user-interaction-preferences`
- `sym:semantic-slot/preference/answer-style`
- `sym:entity/owner`

Symbolic anchors may point to wiki pages, world claims, canonical records, raw evidence, semantic slots, and profile contracts.

They must not assert truth by themselves.

### Lifecycle

Symbol anchors need explicit lifecycle state because aliases and concepts will drift.

Required lifecycle states:

- `active`
- `merged`
- `superseded`
- `archived`

Required lifecycle fields:

```ts
interface SymbolAnchorLifecycle {
  lifecycle_state: "active" | "merged" | "superseded" | "archived";
  namespace: string;
  canonical_symbol_ref?: string | null;
  supersedes_ref?: string | null;
  superseded_by_ref?: string | null;
  merged_into_ref?: string | null;
  diagnostic_refs?: string[];
}
```

Rules:

- alias collisions must emit diagnostics or merge candidates
- stale target refs must be diagnostically visible
- merge and supersession must preserve historical symbol refs
- symbols may be derived/navigation records, but their lifecycle still needs auditability
- symbol ids must be namespace-scoped, stable, and deterministic enough for fixtures

---

## 4. Retrieval Contracts

Cristalina should define retrieval as a core contract before implementing vector infrastructure.

Initial contracts:

```ts
interface RetrievalQuery {
  id: string;
  query_text: string;
  recipe_ref: string;
  requested_layers: Layer[];
  symbol_hints?: string[];
  semantic_slot_hints?: string[];
  runtime_context_ref?: string | null;
  actor_ref?: string | null;
  authenticated_principal?: AuthenticatedPrincipal | null;
  read_policy_version: string;
  projection_profile?: string | null;
  audience?: string | null;
  runtime_instance_ref?: string | null;
  runtime_session_ref?: string | null;
  conversation_thread_ref?: string | null;
}

interface RetrievalCandidate {
  id: string;
  ref: Reference;
  layer: Layer;
  authority:
    | "evidence"
    | "runtime"
    | "world"
    | "editorial"
    | "canon"
    | "governance"
    | "derived";
  text_ref?: string;
  text_preview?: string;
  visibility_state?: VisibilityState;
  symbol_refs: string[];
  semantic_slot?: string;
  vector_score?: number;
  lexical_score?: number;
  symbolic_score?: number;
  authority_score?: number;
  temporal_score?: number;
  provenance_score?: number;
  final_score?: number;
  why_retrieved: string[];
  suppression_reasons?: RetrievalSuppressionReason[];
  can_support_proposal: boolean;
  eligible_upstream_refs?: string[];
}

interface RetrievalResult {
  query_ref: string;
  recipe_ref: string;
  included_candidates: RetrievalCandidate[];
  suppressed_candidates: RetrievalCandidate[];
  trace_ref?: string;
}
```

Retrieval recipes define layer scope, ranking weights, projection budgets, and authority rules.

Required suppression reason families:

- `visibility_scope_mismatch`
- `authority_mismatch`
- `stale_record`
- `contradicted_record`
- `unsupported_wiki_claim`
- `missing_upstream_ref`
- `projection_budget_exceeded`
- `invalid_external_candidate`
- `embedding_generation_mismatch`

Retrieval must preserve authenticated authority. `actor_ref`, `speaker_ref`, and authenticated principal are not interchangeable.

---

## 5. Vector Object Model

Vector artifacts should live under `derived`, not under a new authority layer.

Planned object families:

- `vector_corpus`
- `vector_chunk`
- `embedding_record`
- `embedding_batch_run`
- `vector_index_manifest`
- `vector_search_run`
- `retrieval_audit`

`retrieval_audit` is the durable audit envelope for a retrieval result. It
should be buildable from explicit retrieval results and provider/search run
records without reading hidden provider state. The audit may summarize included
and suppressed candidate refs, suppression reasons, trace refs, and vector
search run refs, but it must not recompute authority or turn retrieval rank into
truth.

Initial `VectorChunk` shape:

```ts
interface VectorChunk {
  id: string;
  kind: "vector_chunk";
  layer: "derived";
  authoritative_home: AuthoritativeHome;
  source_ref: string;
  source_layer: Layer;
  chunk_text_ref: string;
  chunk_hash: string;
  chunk_policy_version: string;
  symbol_refs: string[];
  semantic_slot?: string;
  temporal_state?: TemporalState;
  upstream_refs: string[];
  corpus_generation: string;
  chunk_generation: string;
  normalized_text_hash: string;
  source_record_hash: string;
}
```

Initial `EmbeddingRecord` shape:

```ts
interface EmbeddingRecord {
  id: string;
  kind: "embedding_record";
  layer: "derived";
  chunk_ref: string;
  embedding_model_ref: string;
  dimensions: number;
  metric: "cosine" | "dot" | "euclidean";
  vector_ref: string;
  source_text_hash: string;
  created_at: string;
  embedding_generation: string;
  vector_encoding: "json_float32" | "binary_float32" | "binary_float16";
  vector_checksum: string;
}
```

Initial `VectorIndexManifest` shape:

```ts
interface VectorIndexManifest {
  id: string;
  kind: "vector_index_manifest";
  layer: "derived";
  index_ref: string;
  corpus_ref: string;
  embedding_model_ref: string;
  dimensions: number;
  metric: "cosine" | "dot" | "euclidean";
  index_kind: "exact" | "ann";
  chunk_policy_version: string;
  source_refs: string[];
  stale_chunk_refs?: string[];
  invalidated_refs?: string[];
  created_at: string;
  updated_at?: string | null;
  corpus_generation: string;
  embedding_generation: string;
  index_generation: string;
  vector_encoding: "json_float32" | "binary_float32" | "binary_float16";
  index_checksum?: string;
}
```

### Metadata Records And Sidecar Blobs

Vector metadata records and vector/text blobs should be distinct.

Metadata records are JSON and schema-validated.

Sidecar blobs may contain:

- normalized chunk text
- raw vector arrays for fixtures
- binary vector pages for larger indexes
- ANN index binary state

Every sidecar blob must be referenced by a metadata record with:

- path
- checksum
- encoding
- dimensions when vector-shaped
- generation id
- producing policy/model id

Maintenance validation may inspect supplied sidecar payloads, but sidecar drift
must be reported as explicit maintenance issues rather than silently repaired
during retrieval.

---

## 6. Storage Layout

Proposed layout:

```text
derived/vector/
  corpora/
  chunks/
  embeddings/
  indexes/
  manifests/
  search-runs/
  evals/
```

Examples:

```text
derived/vector/chunks/vchunk_001.json
derived/vector/embeddings/embed_001.json
derived/vector/indexes/main/index.bin
derived/vector/indexes/main/manifest.json
derived/vector/search-runs/run_001.json
```

The layout must be recoverable and rebuildable from upstream records.

The layout should distinguish:

- metadata records under `derived/vector/*/*.json`
- sidecar blobs under deterministic paths referenced by metadata
- index manifests as the only legal entrypoint for loading an index

---

## 7. Chunking Engine

Chunking must be layer-aware.

Initial policies:

| Source layer | Chunk policy |
|---|---|
| `raw` | document, message, section, or bounded attachment text |
| `runtime` | observation, session summary, thread summary, runtime memory block |
| `world` | entity, relation, episode, world claim |
| `wiki` | page heading, wiki claim, source summary section |
| `canon` | canonical record |
| `governance` | proposal, ratification, contradiction resolution, diagnostic |
| `derived` | projection artifact fragments when explicitly allowed |

Every chunk must carry:

- source ref
- source layer
- authoritative home
- upstream refs
- symbol refs when known
- semantic slot when known
- chunk hash
- chunk policy version

Chunking should be deterministic enough for tests and replay.

### Required Chunking Policy Fields

Each chunking policy must define:

- `policy_id`
- `policy_version`
- max characters or tokens
- overlap amount and overlap strategy
- boundary strategy
- markdown heading handling
- frontmatter handling
- normalized text rules
- redaction or exclusion rules
- stable chunk id derivation
- source hash derivation
- claim-level handling for wiki, world, and canon records

### Normalization Rules

The first implementation should define deterministic normalization before embedding:

- preserve meaningful line boundaries
- normalize repeated whitespace where safe
- keep source-layer labels out of embedded text unless intentionally part of the chunk
- exclude projection-only labels from authoritative chunks
- keep frontmatter available as metadata, not necessarily as embedding text
- compute hash from normalized text plus policy id/version

---

## 8. Embedding Engine

Cristalina owns the embedding pipeline contract.

Embedding models may be local or remote.

Initial interface:

```ts
interface EmbeddingProvider {
  provider_id: string;
  model_id: string;
  dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
```

Provider examples:

- local model
- OpenAI-compatible embeddings endpoint
- Ollama/local embeddings
- future custom model

Rules:

- embedding records must include model identity and dimensions
- source text hash must match the chunk hash used for embedding
- embedding model changes require index rebuild or parallel index manifests
- changed chunks invalidate embeddings
- superseded or stale upstream records must invalidate or demote vector candidates
- embedding records cannot be reused across incompatible model ids, dimensions, metrics, vector encodings, or normalization modes
- fixture embeddings should use JSON float arrays; production-sized vectors may use binary sidecars

### Model Manifest

An embedding model manifest should record:

- provider id
- model id
- dimensions
- metric compatibility
- normalization mode
- vector encoding
- deterministic fixture mode flag
- created_at
- deprecation or replacement refs when applicable

---

## 9. Vector Index V1 And V2

### V1: Exact Index

The first implementation should use an exact index.

Purpose:

- prove contracts
- make evals deterministic
- expose ranking bugs
- avoid hiding semantic errors inside approximate nearest neighbor behavior

V1 should:

- load embedding records
- compute cosine similarity
- apply layer, authority, visibility, temporal, and recipe filters
- return top-k vector candidates
- write a `vector_search_run`

### V2: ANN Index

After V1 is proven, add approximate indexing.

Possible shape:

- HNSW-like index
- IVF-like index
- pluggable ANN strategy

V2 must keep:

- exact-index fallback for tests
- manifest validation
- rebuild support
- consistency checks
- stale vector detection

### ANN Adoption Gates

ANN should not be implemented merely because it is expected eventually.

It requires:

- exact index fixture coverage
- retrieval evals with exact baseline metrics
- corpus size or latency evidence that exact search is insufficient
- recall comparison against exact search
- drift validation and repair paths
- manifest fields for ANN strategy, parameters, and index checksum

---

## 10. Hybrid Retrieval

Final retrieval must combine more than vector score.

Signals:

- vector similarity
- lexical/BM25 similarity
- symbol match
- semantic slot match
- ref expansion
- authority weight
- temporal validity
- provenance strength
- wiki staleness state
- contradiction status
- projection budget

Illustrative scoring:

```text
final_score =
  vector_score
  + lexical_score
  + symbolic_score
  + semantic_slot_score
  + authority_score
  + temporal_score
  + provenance_score
  - contradiction_penalty
  - stale_or_unsupported_penalty
```

Recipes should make these weights explicit.

Example recipe:

```ts
interface RetrievalRecipe {
  id: string;
  name: string;
  layer_scope: Layer[];
  allow_editorial_wiki: boolean;
  require_canon_for_truth_claims: boolean;
  vector_top_k: number;
  final_top_k: number;
  include_suppression_trace: boolean;
}
```

Recipes should also define:

- required authenticated principal kind when applicable
- read policy version
- visibility/audience rules
- layer-specific score caps or floors
- stale/contradiction behavior
- external candidate allowance
- whether candidates may support proposal generation
- maximum candidates per layer before final merge

---

## 11. Symbol And Vector Bridge

The retrieval flow should combine symbols and vectors:

1. receive query
2. resolve symbol hints and alias matches
3. expand symbolic refs
4. run vector search over eligible chunks
5. run lexical search over eligible records/chunks
6. merge candidates
7. apply authority and layer policy
8. suppress illegal or stale candidates
9. produce included candidates and trace

The initial lexical provider may be deterministic token overlap, not BM25.
Its job is to create an auditable baseline and to prove candidate signal
merging. Lexical candidates must preserve the same layer, authority,
provenance, visibility, and proposal-support labels as vector candidates.

The first executable bridge should be a kernel runner, not an adapter feature.

The runner should assemble deterministic chunks, deterministic fixture
embeddings, an exact index manifest, an exact vector search run, and a hybrid
retrieval result from explicit inputs. It may return derived artifacts and
sidecar payloads to callers, but it must not persist them implicitly and must
not hide maintenance, eval, projection, or authority decisions behind provider
state.

Result explanations should mention the contributing signals:

- vector similarity
- matched symbol
- semantic slot match
- upstream canonical record
- wiki editorial synthesis
- source evidence support
- temporal validity
- contradiction or staleness suppression

---

## 12. Governance Integration

Retrieval can support governance only through dereferenced upstream refs.

Allowed:

- vector result points to raw evidence
- vector result points to world claim with support refs
- vector result points to canonical record
- vector result points to wiki claim with source refs
- retrieval trace helps explain why a proposal candidate was suggested

Forbidden:

- vector similarity alone creates canon
- wiki prose alone creates canon
- high score overrides contradiction gates
- external provider score overrides Cristalina authority law

Required tests:

- high-scoring wiki prose cannot become canonical proposal without eligible upstream refs
- raw evidence retrieved by vector can support proposal candidate only after dereferencing source refs
- canon is labeled as canon, wiki as editorial, world as world, and raw as evidence in retrieval output

---

## 13. Projection Integration

Projection compilers should be able to use retrieval recipes.

Example:

```ts
compileProjection({
  retrieval_recipe: "openclaw_runtime_context",
  query_context: "...",
});
```

Projection artifacts should include:

- included retrieval refs
- suppressed retrieval refs
- why each result was included
- authority label
- source layer
- retrieval signals used
- projection budget decision

Projection must not hide retrieval decisions.

---

## 14. Compatibility Layer

Even with a native vector engine, Cristalina should remain compatible with external semantic tools.

Compatibility surfaces:

- `ExternalCandidateProvider`
- `Mem0ImportAdapter`
- `GraphitiImportAdapter`
- `VectorExportJSONL`
- OpenAI-compatible embedding provider

External tools may:

- provide candidate refs
- provide similarity scores
- import/export chunks and metadata
- serve as benchmarks

External tools may not:

- define authority
- bypass layer filtering
- promote memory
- override projection suppression
- collapse wiki, raw, world, and canon into one truth bucket

Common candidate exchange shape:

```json
{
  "id": "candidate_001",
  "external_provider_id": "mem0",
  "external_candidate_id": "mem0_candidate_001",
  "text": "...",
  "ref": "...",
  "layer": "wiki",
  "score": 0.82,
  "score_normalization": "provider_raw_cosine",
  "retrieved_at": "2026-04-21T00:00:00.000Z",
  "metadata": {
    "symbol_refs": [],
    "semantic_slot": "...",
    "authority": "editorial",
    "model_id": "unknown",
    "unsupported_mapping_reasons": []
  }
}
```

External candidates that cannot be mapped to legal Cristalina refs must remain diagnostics or benchmark artifacts.

---

## 15. Evals

Retrieval evals must test both relevance and legality.

Eval families:

- lexical baseline vs vector
- vector vs symbol + vector
- canon-priority eval
- wiki-editorial-label eval
- contradiction retrieval eval
- stale-claim suppression eval
- projection-budget eval
- recall@k
- precision@k
- authority correctness
- provenance completeness

Example questions:

- "How should the runtime answer the owner?"
- "Which interaction preferences are canonized?"
- "What is only editorial wiki synthesis about this topic?"
- "Is there anything contradictory about this preference?"
- "Which sources support this memory?"

Success requires retrieving useful content with the correct authority labels.

Initial executable eval shape:

```ts
interface RetrievalEvalRun {
  kind: "retrieval_eval_run";
  layer: "derived";
  eval_case_ref: string;
  query_ref: string;
  recipe_ref: string;
  result_ref?: string | null;
  trace_ref?: string | null;
  expected_included_candidate_refs: string[];
  expected_suppressed_candidate_refs: string[];
  observed_included_candidate_refs: string[];
  observed_suppressed_candidate_refs: string[];
  recall_at_k: number;
  precision_at_k: number;
  authority_correct: boolean;
  provenance_complete: boolean;
  passed: boolean;
  failure_reasons: string[];
}
```

Eval success must not be relevance-only. A run can have good recall and still fail if a wiki/editorial candidate is treated as canon, if suppression reasons disappear, or if proposal-supporting candidates lack eligible upstream refs.

---

## 16. Maintenance Jobs

Vector maintenance must be explicit and replayable.

Planned jobs:

- rebuild vector corpus
- refresh embedding batch
- rebuild exact index
- rebuild ANN index
- invalidate changed chunks
- demote stale wiki chunks
- detect orphan embeddings
- compare manifest against store
- repair vector manifest
- run retrieval eval
- audit vector drift

Possible entrypoints:

```ts
rebuildVectorCorpus()
refreshEmbeddingBatch()
validateVectorIndex()
planVectorInvalidation()
runRetrievalEval()
repairVectorManifest()
```

Initial executable maintenance shape:

```ts
interface VectorMaintenanceRun {
  kind: "vector_maintenance_run";
  layer: "derived";
  job:
    | "validate_vector_artifacts"
    | "invalidate_changed_chunks"
    | "rebuild_vector_corpus"
    | "refresh_embedding_batch"
    | "rebuild_exact_index"
    | "rebuild_ann_index"
    | "repair_vector_manifest"
    | "run_retrieval_eval"
    | "audit_vector_drift";
  status: "passed" | "completed_with_issues" | "rejected";
  corpus_ref?: string | null;
  index_manifest_ref?: string | null;
  checked_artifact_refs: string[];
  issue_codes: string[];
  diagnostic_refs?: string[];
  invalidated_artifact_refs?: string[];
  rebuilt_artifact_refs?: string[];
  rebuild_candidate_refs?: string[];
  repair_candidate_refs?: string[];
}
```

The first maintenance jobs should validate and plan invalidation. Rebuild,
repair, and ANN refresh must remain explicit durable runs; validation and
invalidation planning may identify candidate refs but must not rewrite vector
artifacts as a side effect.

Exact index rebuild is the next safe rebuild job because it only produces a
new exact-index manifest from already validated corpus, embedding model, and
embedding records. It must record the rebuilt manifest ref in the maintenance
run and must not introduce ANN behavior.

Embedding batch refresh is also safe while it remains bound to the deterministic
fixture provider. It may produce embedding records and vector sidecars from
explicit chunk text inputs, but provider/model mismatch and missing chunk text
must reject the run rather than falling back to hidden provider behavior.

Maintenance must check generation consistency:

- source record hash vs chunk source hash
- normalized text hash vs embedding source hash
- chunk generation vs embedding generation
- embedding generation vs index generation
- manifest membership vs store records
- stale, superseded, archived, or contradicted upstream refs
- missing text/vector/index blobs
- vector dimension mismatch
- vector checksum mismatch

---

## 17. Memory Browser

The Memory Browser should eventually expose:

- symbol anchors
- vector corpora
- chunks
- embedding records
- index manifests
- recent search runs
- retrieval traces
- included and suppressed candidates
- authority labels
- stale flags
- contradiction flags
- projection decisions

The browser remains read-only and downstream of core records, manifests, diagnostics, and retrieval runs.

---

## 18. Implementation Order

1. Write this retrieval/vector plan.
2. Write `docs/SYMBOLIC-ANCHORS.md` or fold symbolic anchors into this doc if duplication stays low.
3. Define `SymbolAnchor` in docs, then types.
4. Add `symbol-anchor.schema.json`.
5. Define retrieval query/candidate/result/recipe docs, then types.
6. Add retrieval schemas.
7. Define vector chunk, embedding, index manifest, and search run docs, then types.
8. Add vector schemas.
9. Add a minimal fixture proving symbol + wiki/world/canon refs.
10. Add deterministic layer-aware chunking.
11. Add embedding provider interface.
12. Add test embedding provider for deterministic fixtures.
13. Add exact vector index.
14. Add vector search run materialization.
15. Add hybrid retrieval scorer.
16. Add retrieval governance tests.
17. Add projection integration.
18. Add retrieval eval fixtures.
19. Add vector maintenance jobs.
20. Add ANN index only after exact index and evals are stable.
21. Add external compatibility adapters.

### Required First Slice

The first implementation slice must prove:

- one symbol anchor
- deterministic chunks for raw, wiki, world, and canon
- deterministic fixture embeddings
- exact vector search
- hybrid retrieval result with symbol, vector, authority, and provenance signals
- wiki candidate suppression or editorial labeling
- projection trace of included and suppressed retrieval candidates

---

## 19. Acceptance Criteria

The plan is successful when:

- symbolic anchors provide stable conceptual navigation without becoming truth claims
- vector chunks are derived, traceable, and rebuildable
- exact vector search works over at least wiki, world, canon, and raw records
- retrieval results preserve layer and authority labels
- high-scoring wiki content cannot bypass governance
- proposal candidates dereference eligible upstream refs
- projection artifacts expose retrieval inclusion and suppression reasons
- evals measure relevance and legal authority correctness
- external semantic tools can interoperate without defining core semantics

---

## 20. Session Lesson Candidate

Retrieval becomes part of Cristalina's core only when vectors remain derived evidence paths, symbols provide stable navigation, and authority law decides what relevance is allowed to mean.
