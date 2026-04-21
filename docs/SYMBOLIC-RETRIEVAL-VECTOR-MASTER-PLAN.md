# Cristalina v4
## Symbolic Retrieval And Vector Master Plan

**Status:** Draft  
**Created:** 2026-04-21  
**Purpose:** Consolidate the session plan for symbolic anchors, Cristalina-native retrieval, full vector search, wiki maintenance, non-canonical intake, projection integration, memory browser, compatibility adapters, and execution sequencing.

---

## 1. Master Decision

Cristalina v4 should build a complete native retrieval and vector-search subsystem.

This subsystem must be part of the core engine, not merely an adapter convenience.

However, vector search must stay subordinate to Cristalina's memory law:

`provenance > authority > layer law > symbolic anchors > vector similarity`

The vector engine may find relevant candidates. It must not decide truth, authority, promotion legality, or projection eligibility by itself.

This plan integrates:

- reusable kernel runner and registered intake profiles
- non-canonical intake roads
- wiki maintenance and memory browser roads
- symbolic anchors
- retrieval contracts
- native vector chunking, embedding, and indexing
- hybrid retrieval
- governance and projection integration
- compatibility with external semantic tools
- operational/session-memory compatibility
- evals and maintenance jobs

The detailed vector subsystem plan lives in [RETRIEVAL-AND-VECTOR-ENGINE.md](RETRIEVAL-AND-VECTOR-ENGINE.md).

### Document Precedence

This document owns sequencing, phase boundaries, and cross-road dependency order.

[RETRIEVAL-AND-VECTOR-ENGINE.md](RETRIEVAL-AND-VECTOR-ENGINE.md) owns the detailed retrieval/vector technical contract.

If the two documents conflict:

1. this master plan governs implementation order and scope boundaries
2. the retrieval/vector plan governs vector, chunking, embedding, ranking, and interoperability details
3. `AGENTS.md` and existing legal-transition/governance docs override both when authority, provenance, or layer law is at stake

---

## 2. Architectural Thesis

Cristalina's long-term retrieval system should not be a single vector bucket.

It should retrieve across:

- raw evidence
- runtime state
- temporal world model
- governed canon
- editorial wiki
- governance records
- derived projections

Each result must carry:

- layer
- authority
- provenance
- upstream refs
- symbolic anchors
- semantic slot when applicable
- temporal state when applicable
- contradiction/staleness status when applicable
- explanation of inclusion or suppression

This is the difference between a memory architecture and a semantic search plugin.

---

## 3. Non-Negotiable Rules

1. Docs lead implementation.
2. Types and schemas must converge before fixtures grow.
3. Fixtures must prove write paths before broad adapters expand.
4. Kernel logic owns semantics; adapters consume them.
5. Symbolic anchors navigate concepts but do not assert truth.
6. Wiki remains editorial unless governance promotes supported upstream records.
7. Vector chunks are derived and rebuildable.
8. Embeddings never replace source text, provenance, or authority.
9. Retrieval can support proposals only through dereferenced eligible upstream refs.
10. External semantic systems may interoperate, but they must not define Cristalina semantics.

---

## 4. First Executable Slice

Before the whole road expands, prove one narrow end-to-end slice.

The first slice should use deterministic fixtures only:

1. one preference-oriented source enters through the current legal write path
2. the flow emits raw, runtime, world, wiki, governance, and canon/proposal records as legally appropriate
3. one `SymbolAnchor` points to the relevant raw/world/wiki/canon refs without asserting truth
4. deterministic chunks are created for at least one raw record, one wiki page or claim, one world claim, and one canonical record
5. a deterministic embedding provider emits stable test vectors
6. the exact vector index returns candidates
7. hybrid retrieval merges vector, symbol, semantic slot, layer, authority, and provenance signals
8. a high-scoring wiki candidate is labeled editorial and cannot support canon without eligible upstream refs
9. projection output exposes included and suppressed retrieval candidates
10. Memory Browser output can inspect the symbol, chunks, search run, and suppression reasons

This slice is the first proof that retrieval is useful without becoming memory law.

### Slice Acceptance Criteria

- no network embedding provider is required
- exact search results are deterministic
- every candidate has source layer, authority, upstream refs, and inclusion or suppression reasons
- wiki-derived candidates remain editorial
- proposal-support legality is derived from upstream refs, not score
- adapter behavior is not required to prove the slice

---

## 5. Phase 0: Align The Roadmap

### Goal

Register this plan as a core road, not an isolated retrieval experiment.

### Work

- Add a short cross-reference from `docs/KERNEL-ROAD-BUILDOUT-PLAN.md` to this master plan.
- Clarify that retrieval/vector work depends on wiki/world/canon layer contracts and must not replace them.
- Keep `docs/RETRIEVAL-AND-VECTOR-ENGINE.md` as the focused vector subsystem plan.
- Optionally create `docs/SYMBOLIC-ANCHORS.md` only if the symbol section grows too large for this master plan and the vector plan.

### Acceptance Criteria

- The buildout plan has an explicit place for symbolic retrieval and vector search.
- The new road is sequenced after core layer contracts, not ahead of them.
- No doc suggests embeddings are an authority layer.

---

## 6. Phase 1: Reusable Kernel Runner And Registered Profiles

### Goal

Make the existing preference-oriented flow less special before retrieval expands.

### Work

- Extract reusable runner mechanics:
  - write lock
  - recovery journal
  - authoritative record materialization
  - derived artifact recompilation
  - validation log append
  - audit append
  - idempotent rerun and repair
- Keep registered intake profiles as the semantic boundary:
  - source normalization
  - semantic profile resolution
  - stable semantic-profile fingerprint
  - disposition routing
  - proposal emission
  - optional contradiction detection
  - projection recompilation inputs
- Preserve compatibility profiles:
  - `conversation_preference`
  - `openclaw_projection_feedback`
  - `structured_preference_signal`

### Why It Matters For Retrieval

Vector indexing must not index hidden adapter semantics.

It should index records produced by reusable core write paths whose profile, source payload, authority, identity, and semantic fingerprint are explicit.

### Acceptance Criteria

- Profile-specific assumptions do not own durability, replay, or reuse law.
- Retrieval and vector chunks can point to stable records emitted by generic runner mechanics.

---

## 7. Phase 2: Non-Canonical Intake Roads

### Goal

Prove that not every source must become world, wiki, or canon.

### Work

- Implement and test:
  - `evidence_only`
  - `runtime_only`
  - `diagnostic_only`
- Add raw import and attachment-reference fixtures.
- Ensure these modes may write only their legal outputs:
  - raw source records
  - disposition records
  - runtime observations where applicable
  - diagnostics where applicable
  - validation/audit entries
- Prevent proposal, canon, world claim, wiki page, and wiki claim emission in non-canonical modes unless a later governed path dereferences them.

### Why It Matters For Retrieval

Vector search must be able to retrieve raw/runtime/diagnostic evidence without treating it as truth.

### Acceptance Criteria

- Non-canonical records can be retrieved as evidence or runtime context.
- Retrieval results correctly label them as non-canonical.
- No vector candidate from these modes can support promotion without a later legal intake path.

---

## 8. Phase 3: Wiki Maintenance Road

### Goal

Turn the wiki into a maintained editorial layer that retrieval can use safely.

### Work

- Define `WikiMaintenanceRun` or equivalent minimal workflow contract.
- Support event-driven wiki maintenance:
  - `source_ingested`
  - `page_refreshed`
  - `query_captured`
  - `lint_run`
  - `claim_superseded`
  - `session_crystallized`
  - `retention_reviewed`
- Implement:
  - source summary pages
  - entity/concept/topic/comparison page refresh
  - query capture into editorial synthesis pages
  - wiki claim extraction with support refs
  - `wiki/index.md`
  - `wiki/log.md`
  - stale-page diagnostics
  - orphan/broken-link/unsupported-claim diagnostics
  - duplicate or near-duplicate page diagnostics
  - missing concept page diagnostics
- Keep wiki proposals evidence-backed:
  - wiki claim may emit proposal candidate only if upstream refs support it
  - wiki prose alone must produce diagnostic or research question, not canon

### Why It Matters For Retrieval

The wiki is the best human-readable substrate for retrieval, but it is also the easiest layer to accidentally treat as truth.

Vector search should index wiki pages and claims, but retrieval must label them as editorial.

### Acceptance Criteria

- Wiki index/log are maintained.
- Wiki chunks are indexable.
- Wiki-derived retrieval stays editorial.
- Wiki-originated proposals dereference upstream source/world/canon/governance refs.

---

## 9. Phase 4: Symbolic Anchors

### Goal

Create stable conceptual navigation across layers.

### Contract

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
  lifecycle_state: "active" | "merged" | "superseded" | "archived";
  canonical_symbol_ref?: string | null;
  supersedes_ref?: string | null;
  superseded_by_ref?: string | null;
  merged_into_ref?: string | null;
  namespace: string;
}
```

### Work

- Define SymbolAnchor docs.
- Add types.
- Add schema.
- Add store/read/write support only after the docs and schema converge.
- Define namespace rules:
  - `sym:concept/...`
  - `sym:entity/...`
  - `sym:semantic-slot/...`
  - `sym:intake-profile/...`
- Define alias collision handling.
- Define merge and supersession semantics.
- Define stale target-ref diagnostics.
- Add fixture:
  - a preference source emits raw/runtime/world/wiki/governance/canon records
  - a symbol anchor points to relevant wiki/world/canon/raw refs
  - projection/retrieval can explain the symbol relationship

### Rules

- Symbols are not claims.
- Symbols are not canon.
- Symbols may improve retrieval and navigation.
- Symbols may point to records from multiple layers without collapsing their authority.
- Symbol creation, merge, and supersession must be auditable.
- Alias collisions must produce diagnostics or explicit merge candidates, not silent rewrites.
- A symbol with stale or missing target refs must remain inspectable and diagnostically marked.

### Acceptance Criteria

- Symbol anchors are stable, inspectable, and layer-aware.
- Retrieval can use symbol matches and aliases.
- Symbol matches do not bypass governance.
- Symbol lifecycle transitions are explicit and replayable.
- Duplicate or near-duplicate symbols do not silently fork conceptual navigation.

---

## 10. Phase 5: Retrieval Contracts

### Goal

Define Cristalina's retrieval law before vector implementation expands.

### Work

- Define:
  - `RetrievalQuery`
  - `RetrievalRecipe`
  - `RetrievalCandidate`
  - `RetrievalResult`
  - `RetrievalTrace`
  - `CandidateProvider`
- Include:
  - layer
  - authority
  - refs
  - symbol refs
  - semantic slot
  - vector score
  - lexical score
  - symbolic score
  - authority score
  - temporal score
  - provenance score
  - final score
  - inclusion reasons
  - suppression reasons
  - proposal-support legality
  - authenticated principal
  - read policy version
  - projection profile
  - runtime/session/thread refs
  - audience and visibility policy
  - suppression reason codes

### Acceptance Criteria

- A retrieval result can be audited without reading hidden provider state.
- External candidates can be normalized into Cristalina's contract.
- Projection can consume retrieval results without losing authority labels.
- Retrieval cannot collapse `speaker_ref`, actor labels, and authenticated authority.
- Visibility and audience filtering are explicit in query, recipe, result, and trace records.

---

## 11. Phase 6: Native Vector Object Model And Storage

### Goal

Create Cristalina-native vector records as derived, rebuildable artifacts.

### Object Families

- `vector_corpus`
- `vector_chunk`
- `embedding_record`
- `embedding_batch_run`
- `vector_index_manifest`
- `vector_search_run`
- `retrieval_audit`

### Storage Layout

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

### Rules

- Vector artifacts live under `derived`.
- Each chunk must point to upstream source records.
- Each embedding must point to a chunk and model identity.
- Each index must have a manifest.
- Changed source text invalidates chunk/embedding/index artifacts.
- Vector records distinguish metadata records from sidecar text/vector blobs.
- Every corpus, chunk, embedding batch, and index carries a generation id.
- Index manifests record metric, dimensions, vector encoding, model identity, corpus generation, and chunk policy version.

### Acceptance Criteria

- Vector records validate against schemas.
- Vector storage is rebuildable from upstream records.
- Store validation detects orphan chunks, orphan embeddings, and manifest drift.
- Store validation detects dimension mismatch, model mismatch, stale generation membership, missing blobs, and checksum drift.

---

## 12. Phase 7: Chunking Engine

### Goal

Create deterministic, layer-aware chunks.

### Policies

| Source layer | Chunk policy |
|---|---|
| `raw` | document, message, section, or bounded attachment text |
| `runtime` | observation, session summary, thread summary, runtime memory block |
| `world` | entity, relation, episode, world claim |
| `wiki` | page heading, wiki claim, source summary section |
| `canon` | canonical record |
| `governance` | proposal, ratification, contradiction resolution, diagnostic |
| `derived` | projection artifact fragments when explicitly allowed |

### Required V1 Policy Fields

Each chunking policy must define:

- max characters or tokens
- overlap policy
- boundary strategy
- markdown/frontmatter handling
- normalized text rules
- redaction or exclusion rules
- stable chunk id derivation
- source hash derivation
- claim-level handling for wiki/world/canon records

### Acceptance Criteria

- Chunk output is deterministic in fixtures.
- Chunks preserve source layer and authoritative home.
- Chunks carry symbol refs and semantic slots when available.
- Chunking fixtures prove markdown headings, frontmatter, world claims, canon records, and raw message payloads.
- Chunk hashes change when normalized chunk text changes and remain stable when unrelated metadata changes.

---

## 13. Phase 8: Embedding Engine

### Goal

Own the embedding pipeline while allowing model providers to vary.

### Work

- Define `EmbeddingProvider`.
- Add deterministic test provider.
- Add model manifest records.
- Add embedding batch runs.
- Add hash validation between chunk text and embedding records.
- Define vector blob format:
  - JSON float array for fixtures
  - binary sidecar for production-sized indexes
  - checksum and dimension validation for both
- Define model compatibility rules.

### Provider Strategy

Possible providers:

- deterministic fixture provider
- local embedding model
- OpenAI-compatible endpoint
- Ollama/local endpoint
- future custom model

### Acceptance Criteria

- Tests do not depend on network embeddings.
- Provider identity and model dimensions are persisted.
- Model changes require parallel manifests or rebuild.
- Embedding records cannot be reused across incompatible model ids, dimensions, metrics, or normalization modes.

---

## 14. Phase 9: Exact Vector Index

### Goal

Implement the first vector index as exact search.

### Work

- Load embedding records.
- Compute cosine similarity.
- Apply layer, authority, visibility, temporal, and recipe filters.
- Return top-k candidates.
- Write `vector_search_run`.

### Why Exact First

Exact search is slower but easier to prove.

It gives reliable fixtures and eval baselines before approximate indexing complicates debugging.

### Acceptance Criteria

- Exact vector search works over wiki, world, canon, and raw records.
- Search runs are materialized.
- Results include authority labels and upstream refs.

---

## 15. Phase 10: Hybrid Retrieval

### Goal

Combine vector search with Cristalina-native structure.

### Signals

- vector similarity
- lexical/BM25 similarity
- symbol match
- semantic slot match
- ref expansion
- authority weight
- temporal validity
- provenance strength
- wiki staleness
- contradiction status
- projection budget

### Acceptance Criteria

- Hybrid retrieval can outperform vector-only and lexical-only baselines in evals.
- Canon has correct authority priority for truth claims.
- Wiki remains useful but labeled editorial.
- Suppression reasons are visible.

---

## 16. Phase 11: Governance Integration

### Goal

Ensure retrieval supports governance without replacing it.

### Tests

- High-scoring wiki prose cannot become canon without eligible upstream refs.
- Raw evidence retrieved by vector can support proposal only after dereferencing source refs.
- Contradicted or stale records are suppressed or labeled according to recipe.
- Canon/world/wiki/raw labels survive retrieval, projection, and audit.

### Acceptance Criteria

- Retrieval never bypasses proposal gates.
- Vector similarity never overrides contradiction gates.
- Proposal candidates cite eligible upstream refs, not embeddings.

---

## 17. Phase 12: Projection Integration

### Goal

Allow projections to consume retrieval recipes transparently.

### Work

- Projection compiler accepts retrieval recipe refs.
- Projection artifacts include:
  - included retrieval refs
  - suppressed retrieval refs
  - inclusion reasons
  - suppression reasons
  - authority labels
  - source layers
  - retrieval signals
  - budget decisions

### Acceptance Criteria

- Runtime context can include retrieval results without hiding their source authority.
- Projection manifests preserve retrieval traceability.
- Adapter-facing views consume core semantics rather than defining retrieval behavior.

---

## 18. Phase 13: Memory Browser

### Goal

Expose the memory system and retrieval subsystem read-only.

### Work

- Browser projection shows:
  - layer counts
  - raw/world/wiki/canon/governance/runtime records
  - symbol anchors
  - vector corpora
  - chunks
  - embedding records
  - index manifests
  - search runs
  - retrieval traces
  - included/suppressed candidates
  - stale and contradiction flags
  - governance queues
  - projection suppression reasons

### Acceptance Criteria

- Humans can inspect why a result appeared.
- Humans can inspect why a result was suppressed.
- Browser is read-only and downstream of core records.

---

## 19. Phase 14: Compatibility With External Semantic Tools

### Goal

Keep Cristalina interoperable even though it owns its native vector engine.

### Surfaces

- `ExternalCandidateProvider`
- `Mem0ImportAdapter`
- `GraphitiImportAdapter`
- `VectorExportJSONL`
- OpenAI-compatible embedding provider

### External Tools May

- provide candidate refs
- provide similarity scores
- import/export chunks and metadata
- serve as benchmarks

### External Tools May Not

- define authority
- bypass layer filtering
- promote memory
- override projection suppression
- collapse wiki, raw, world, and canon into one truth bucket

### Required Normalization Fields

External candidate import must preserve:

- external provider id
- external candidate id
- mapped Cristalina ref
- source layer
- authority label
- score and score normalization method
- model or index identity when known
- retrieval timestamp
- symbol refs and semantic slot when supplied
- unsupported mapping reasons when the candidate cannot be made legal

### Acceptance Criteria

- External systems can interoperate without becoming the architecture.
- Cristalina can compare native retrieval against external retrieval in evals.
- External candidates without legal refs remain diagnostics or benchmark artifacts, not retrieval context.

---

## 20. Phase 15: Operational Session Memory Compatibility

### Goal

Ensure retrieval and vector search can support future session continuity without defining it prematurely.

### Work

- Treat session packs and operational checkpoints as runtime/derived records.
- Allow chunking of eligible session summaries and checkpoints.
- Preserve continuity epoch, generation, and upstream refs when those contracts exist.
- Keep resume/handoff packages downstream of source runtime/world/wiki/canon/governance records.

### Acceptance Criteria

- Vector search can later retrieve session continuity artifacts.
- Retrieval does not treat session packs as canonical truth.
- Session-derived candidates preserve upstream semantic authority.

---

## 21. Phase 16: ANN Index

### Goal

Add approximate vector search after exact search and evals are stable.

### Work

- Add ANN index strategy.
- Keep exact fallback.
- Persist ANN manifests.
- Add rebuild and validation jobs.
- Compare ANN results against exact results in evals.

### Adoption Gates

ANN may be implemented only after:

- exact index has deterministic fixture coverage
- retrieval evals include exact baseline metrics
- corpus size or latency makes exact search measurably insufficient
- ANN recall is compared against exact search
- ANN index drift has validation and repair paths

### Acceptance Criteria

- ANN improves performance without losing authority correctness.
- ANN index drift is detectable.
- Exact index remains available for tests and audits.

---

## 22. Phase 17: Evals

### Goal

Evaluate relevance and legality together.

### Eval Families

- lexical baseline vs vector
- vector vs symbol + vector
- exact vs ANN
- native vs external provider
- canon-priority eval
- wiki-editorial-label eval
- contradiction retrieval eval
- stale-claim suppression eval
- projection-budget eval
- recall@k
- precision@k
- authority correctness
- provenance completeness

### Acceptance Criteria

- Evals catch retrieval that is relevant but legally mislabeled.
- Evals catch wiki/canon collapse.
- Evals catch stale or contradicted candidate leakage.

---

## 23. Phase 18: Maintenance Jobs

### Goal

Keep vector and retrieval artifacts healthy.

### Jobs

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

### Required Generation Checks

Maintenance must check:

- source record hash vs chunk hash
- chunk generation vs embedding generation
- embedding model generation vs index generation
- manifest membership vs store records
- tombstoned/superseded/stale upstream refs
- missing sidecar blobs
- vector dimension mismatch

### Acceptance Criteria

- Store validation can diagnose vector drift.
- Maintenance is replayable.
- Rebuilds do not mutate authoritative source records.

---

## 24. Phase 19: Adapter Consumption

### Goal

Expose retrieval to OpenClaw, Hermes, and future runtimes through core contracts.

### Work

- Add adapter SDK calls for retrieval-backed projection reads.
- Keep writeback authenticated and governed.
- Ensure adapter UX does not define retrieval semantics.
- Emit runtime diagnostics when retrieval cannot satisfy a recipe.

### Acceptance Criteria

- OpenClaw and Hermes consume the same retrieval law.
- Adapter differences are projection/profile differences, not memory-law differences.

---

## 25. Implementation Order

1. Save this master plan.
2. Cross-reference this master plan from `docs/KERNEL-ROAD-BUILDOUT-PLAN.md`.
3. Keep `docs/RETRIEVAL-AND-VECTOR-ENGINE.md` as focused subsystem detail.
4. Formalize `SymbolAnchor` docs.
5. Add `SymbolAnchor` types and schema.
6. Add retrieval contracts docs, types, and schemas.
7. Add vector object docs, types, and schemas.
8. Add symbol fixture spanning wiki/world/canon/raw refs.
9. Add deterministic chunking fixtures.
10. Add deterministic embedding provider.
11. Add exact vector index.
12. Add vector search run materialization.
13. Add hybrid retrieval scorer.
14. Add governance tests for retrieval legality.
15. Add projection integration.
16. Add memory browser retrieval inspection.
17. Add retrieval evals.
18. Add vector maintenance jobs.
19. Add ANN index.
20. Add external compatibility adapters.
21. Add adapter SDK consumption.

---

## 26. Acceptance Criteria For The Whole Road

The road is successful when:

- existing kernel tests remain green
- non-canonical records can be retrieved without becoming truth
- wiki maintenance produces indexable editorial knowledge
- symbols provide stable navigation without becoming claims
- vector chunks are derived, traceable, and rebuildable
- exact vector search works over raw, world, wiki, and canon
- retrieval results preserve layer, authority, and provenance
- high-scoring wiki content cannot bypass governance
- projection artifacts expose retrieval inclusion and suppression reasons
- memory browser makes retrieval inspectable
- evals measure relevance and authority correctness
- external semantic tools interoperate without defining core semantics
- adapters consume retrieval through core contracts

---

## 27. Session Lesson Candidate

Native vector retrieval only strengthens Cristalina when non-canonical roads, wiki maintenance, symbolic anchors, retrieval law, and projection traces all preserve the authority of the upstream records they make easier to find.
