# Cristalina v4
## Core Types

**Status:** Draft  
**Purpose:** Freeze the minimum type vocabulary required to start implementing the core

---

## 1. Why This Document Exists

Architecture alone is not enough anymore.

The repo now needs a minimum type vocabulary so that:

- implementation is possible
- adapters do not invent semantics
- storage and transitions can be checked against a stable core

This document defines the minimum base types for the first executable core.

---

## 2. Core Type Families

The MVP should begin with these type families:

- `SourceRecord`
- `Observation`
- `ActorIdentity`
- `RuntimeInstance`
- `RuntimeSession`
- `RuntimeMemoryBlock`
- `ConversationThread`
- `Episode`
- `Entity`
- `Relation`
- `WorldClaim`
- `CanonicalMemoryObject`
- `Proposal`
- `CurationPacket`
- `RatificationRecord`
- `Contradiction`
- `ContradictionResolution`
- `OntologyDefinition`
- `PolicySnapshot`
- `WikiPage`
- `WikiClaim`
- `ProjectionArtifact`
- `ProjectionManifest`
- `Diagnostic`
- `DispositionRecord`
- `SymbolAnchor`
- `RetrievalQuery`
- `RetrievalRecipe`
- `RetrievalCandidate`
- `RetrievalResult`
- `RetrievalTrace`
- `VectorCorpus`
- `VectorChunk`
- `EmbeddingModelManifest`
- `EmbeddingRecord`
- `EmbeddingBatchRun`
- `VectorIndexManifest`
- `VectorSearchRun`
- `RetrievalAudit`
- `RetrievalEvalRun`
- `VectorMaintenanceRun`
- `SessionResumeReceipt`

These are not all equally mature.

They are the minimum vocabulary needed to stop the architecture from collapsing back into a generic "memory item" blob.

---

## 3. Shared Enums and Axes

### 3.1 Memory object kinds

The core should begin with:

- `fact`
- `belief`
- `preference`
- `constraint`
- `goal`
- `procedure`
- `value`
- `identity_trait`
- `entity`
- `relation`
- `episode`

### 3.2 Epistemic states

The core should distinguish at least:

- `observed`
- `inferred`
- `hypothesized`
- `confirmed`
- `disputed`

### 3.3 Governance states

The core should distinguish at least:

- `draft`
- `proposed`
- `ratified`
- `superseded`
- `archived`
- `rejected`

### 3.4 Temporal status

The core should distinguish at least:

- `active`
- `bounded`
- `historical`
- `unresolved`

### 3.5 Visibility scopes

The core should begin with:

- `runtime_private`
- `owner_private`
- `agent_operational`
- `project_private`
- `shareable`
- `public_safe`

These scopes are currently retained as runtime and publication metadata.

For the current product direction they should not be treated as a per-participant secrecy model inside one owner-controlled group.

### 3.6 Disposition outcomes

The core should begin with:

- `evidence_only`
- `runtime_only`
- `world_update`
- `wiki_update`
- `proposal_for_canon`
- `queued_review`
- `diagnostic_only`

`queued_review` should now be read together with governed review records such as `curation_packet`, so deferred authority checks can be listed and later applied without reconstructing the original intake input.

---

## 4. Shared Cross-Cutting Contracts

### 4.1 Shared object envelope

The core should now assume one normalized envelope with at least:

- `id`
- `kind`
- `layer`
- `authoritative_home`
- `created_at`
- `updated_at`
- `visibility_state`
- `provenance`

Optional but strongly expected by many families:

- `epistemic_state`
- `governance_state`
- `temporal_state`
- `upstream_refs`

`upstream_refs` is cumulative provenance for the current record state, not a strict chronological "came before" list.
It may include creation inputs and later lifecycle refs such as ratifications, replacements, or reconciliation events.

### 4.2 Reference

Reference records should preserve at least:

- `id`
- `kind`
- `layer`

### 4.3 Provenance

Provenance records should preserve at least:

- `source_type`
- `source_ref`
- `evidence_refs`
- `actor_ref`
- `speaker_ref`
- `runtime_ref`
- `session_ref`
- `thread_ref`

`actor_ref` and `speaker_ref` answer different questions:

- `actor_ref`: which identity context emitted or materialized the record
- `speaker_ref`: which actor produced the underlying turn or evidence item when that distinction matters

### 4.4 Visibility state

Visibility state should preserve at least:

- `privacy_scope`

### 4.5 Temporal state

Temporal state should preserve at least:

- `temporal_status`
- `valid_from`
- `valid_to`
- `temporal_confidence`

---

## 5. Type Contracts

All type families below inherit the shared envelope.

The lists below emphasize family-specific fields and the most important required specializations.

### 4.1 `SourceRecord`

Represents a durable registered source artifact.

Minimum fields:

- `id`
- `kind`
- `layer`
- `authoritative_home`
- `created_at`
- `content_ref`
- `visibility_state`
- `provenance`

`content_ref` must be a normalized store-relative raw evidence path under
`raw/sources/`, `raw/imports/`, or `raw/attachments/`.

### 4.2 `Observation`

Represents something seen, read, heard, inferred, or produced during runtime activity.

Minimum fields:

- `id`
- `kind`
- `layer`
- `authoritative_home`
- `summary`
- `created_at`
- `epistemic_state`
- `visibility_state`
- `provenance`

Observations should also be able to preserve:

- `runtime_instance_ref`
- `session_ref`
- `thread_ref`

### 4.3 `ActorIdentity`

Represents a durable actor identity such as:

- owner
- agent
- external person
- external organization

Minimum fields:

- `id`
- `kind`
- `actor_kind`
- `label`
- `status`
- `created_at`

### 4.4 `RuntimeInstance`

Represents one active embodiment of the agent in one runtime.

Minimum fields:

- `id`
- `kind`
- `runtime`
- `agent_identity_ref`
- `owner_identity_ref`
- `created_at`
- `status`

### 4.5 `RuntimeSession`

Represents one bounded continuity interval inside a runtime instance.

Minimum fields:

- `id`
- `kind`
- `runtime_instance_ref`
- `created_at`
- `updated_at`
- `status`

### 4.6 `Episode`

Represents grouped observations that form a bounded event arc or meaningful temporal chunk.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `summary`
- `observation_refs`
- `temporal_state`

Episodes should be treated as provenance anchors for the world layer, not merely as summaries.

### 4.7 `Entity`

Represents a durable referent in the world model.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `entity_kind`
- `label`
- `status`

### 4.8 `Relation`

Represents a structured relationship between entities.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `subject_ref`
- `object_ref`
- `relation_type`
- `temporal_state`

### 4.9 `WorldClaim`

Represents a world-model claim that is useful structurally but not necessarily canonical yet.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `kind`
- `statement`
- `semantic_slot`
- `epistemic_state`
- `temporal_state`
- `support_refs`

`semantic_slot` should preserve the normalized "same claim domain" key that lets the core compare active world claims without collapsing all claims of the same kind together.

### 4.10 `CanonicalMemoryObject`

Represents durable memory that passed through governance.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `kind`
- `statement`
- `semantic_slot`
- `epistemic_state`
- `governance_state`
- `created_at`
- `visibility_state`
- `provenance`

Canonical records may also carry:

- `actor_identity_ref`
- `owner_identity_ref`

These refs bind owner-private canonical memory to durable identities for projection read policy. They do not replace provenance; `provenance.runtime_ref`, `provenance.session_ref`, and `provenance.thread_ref` remain evidence lineage for where the claim came from.

### 4.11 `RuntimeMemoryBlock`

Represents pinned or attachable runtime memory that remains available to the running agent.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `name`
- `description`
- `content`
- `read_only`
- `visibility_state`
- `created_at`
- `updated_at`

### 4.12 `ConversationThread`

Represents a persistent runtime conversation or interaction thread.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `runtime`
- `runtime_instance_ref`
- `runtime_session_ref`
- `created_at`
- `updated_at`
- `message_refs`
- `summary`

### 4.13 `Proposal`

Represents a candidate transition toward canonical memory or another managed layer.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `operation`
- `candidate_kind`
- `target_layer`
- `target_ref`
- `candidate_payload`
- `reason`
- `evidence_refs`
- `governance_state`

For claim-like promotion into canon, `candidate_payload` should preserve the same `semantic_slot` used by the upstream world claim so governance can apply conflict gates against the right active memory slot.

For `Proposal`, `governance_state` describes the proposal stage before ratification, not the lifecycle state of a canonical record. Valid proposal stages are `draft`, `proposed`, `archived`, and `rejected`. Approved ratification is recorded in a `RatificationRecord`, and durable `ratified` state belongs to the created or updated canonical record.

In the executable baseline, `supersede` means retirement without replacement; `revise` is the operation that creates a successor record.

### 4.14 `CurationPacket`

Represents a governance packet presented for human or approved higher-order review.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `created_at`
- `proposal_refs`
- `question_count`
- `status`

When `review_kind` is present, the packet should also carry the refs needed to reopen the exact pending branch without reconstructing input:

- `owner_ratification` review packets require `canonical_target_ref`
- `contradiction_manual_review` packets require `contradiction_ref` and `contradiction_resolution_ref`

### 4.15 `RatificationRecord`

Represents an applied governance decision.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `proposal_ref`
- `decision`
- `actor`
- `authenticated_principal`
- `created_at`

### 4.16 `Contradiction`

Represents an unresolved tension between claims, structures, or memory objects.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `left_ref`
- `right_ref`
- `status`
- `created_at`

### 4.17 `ContradictionResolution`

Represents the explicit proposed or applied handling path for a contradiction.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `contradiction_ref`
- `strategy`
- `status`
- `winning_ref`
- `losing_ref`
- `rationale`
- `created_at`

`ContradictionResolution` belongs to governance because detecting tension and deciding how to legally handle it are different acts.

The initial executable baseline supports these strategies:

- `manual_review`
- `coexist_temporally`
- `supersede_existing`
- `supersede_candidate`
- `dismiss_contradiction`

The initial executable baseline supports these statuses:

- `proposed`
- `accepted`
- `rejected`
- `applied`

### 4.18 `OntologyDefinition`

Represents the active ontology contract for the world layer.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `mode`
- `entity_types`
- `relation_types`
- `created_at`
- `updated_at`

The initial mode may be:

- `prescribed`
- `learned`
- `hybrid`

### 4.19 `PolicySnapshot`

Represents a versioned governance or authority configuration.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `policy_family`
- `version`
- `created_at`
- `active`

### 4.20 `WikiPage`

Represents an editorial knowledge page.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `page_kind`
- `title`
- `path`
- `created_at`
- `updated_at`
- `source_refs`
- `canonical_refs`
- `world_refs`

### 4.21 `WikiClaim`

Represents an explicit claim stated inside a wiki page.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `page_ref`
- `statement`
- `claim_status`
- `source_refs`

### 4.22 `ProjectionArtifact`

Represents a runtime-facing derived artifact.

Minimum fields:

- `id`
- `layer`
- `adapter`
- `artifact_kind`
- `path`
- `source_layer`
- `authoritative_home`
- `upstream_refs`
- `created_at`

Here `upstream_refs` should capture the material refs that led to this derived artifact, not just immediately previous records.

### 4.23 `ProjectionManifest`

Represents the common metadata contract for a compiled runtime package.

Minimum fields:

- `id`
- `layer`
- `adapter`
- `projection_profile`
- `audience`
- `read_policy_version`
- `created_at`
- `context_refs`
- `suppressed_refs`
- `retrieval_trace_refs`
- `included_retrieval_candidate_refs`
- `suppressed_retrieval_candidate_refs`
- `policy_snapshot_ref`
- `upstream_refs`
- `artifact_refs`

For manifests, `upstream_refs` should remain the cumulative source set that materially shaped the compiled package.

Retrieval metadata in a projection manifest is traceability only. It may expose which retrieval candidates were included or suppressed, and which retrieval trace refs explain that decision, but it must not convert retrieval rank into authority, truth, or proposal legality.

### 4.24 `Diagnostic`

Represents bounded machine-readable feedback about failures, ignored edits, or unresolved tensions.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `code`
- `severity`
- `message`
- `related_refs`

### 4.25 `DispositionRecord`

Represents the explicit fate assigned to an intake or candidate set.

Minimum fields:

- `id`
- `layer`
- `authoritative_home`
- `kind`
- `created_at`
- `input_refs`
- `outcomes`
- `target_layers`
- `proposal_refs`
- `diagnostic_refs`
- `reason_codes`

### 4.26 `SymbolAnchor`

Represents a stable conceptual navigation address across memory layers.

Minimum fields:

- `id`
- `kind`
- `label`
- `aliases`
- `target_refs`
- `upstream_refs`
- `authority`
- `lifecycle_state`
- `namespace`

`authority` must remain `navigation_only`. A symbol may point to raw, runtime, world, wiki, canon, governance, or derived refs, but it must not assert truth or bypass governance.

### 4.27 Retrieval Contracts

Retrieval contracts describe search requests, recipes, candidates, results, and traces before vector infrastructure expands.

Minimum query/result families:

- `RetrievalQuery`
- `RetrievalRecipe`
- `RetrievalCandidate`
- `RetrievalResult`
- `RetrievalTrace`

Retrieval candidates must preserve layer, authority, provenance-bearing refs, symbol refs, scoring signals, inclusion reasons, suppression reasons, and explicit proposal-support legality.

Wiki/editorial candidates may be useful retrieval results, but proposal support must come from eligible upstream refs rather than score or wiki prose alone.

### 4.28 Vector Artifact Contracts

Vector artifacts represent rebuildable derived records, not a new authority layer.

Minimum vector families:

- `VectorCorpus`
- `VectorChunk`
- `EmbeddingModelManifest`
- `EmbeddingRecord`
- `EmbeddingBatchRun`
- `VectorIndexManifest`
- `VectorSearchRun`
- `RetrievalAudit`

Minimum chunk fields:

- `id`
- `kind`
- `layer`
- `authoritative_home`
- `source_ref`
- `source_layer`
- `chunk_text_ref`
- `chunk_hash`
- `chunk_policy_version`
- `symbol_refs`
- `upstream_refs`
- `corpus_generation`
- `chunk_generation`
- `normalized_text_hash`
- `source_record_hash`

Minimum embedding and index fields:

- `embedding_model_ref`
- `dimensions`
- `metric`
- `vector_encoding`
- `source_text_hash`
- `vector_checksum`
- `corpus_generation`
- `embedding_generation`
- `index_generation`

Every vector artifact must be recoverable from upstream records or from schema-validated metadata plus referenced sidecar blobs. Vector score may influence retrieval rank, but it must not decide authority, truth, visibility, or proposal legality.

Retrieval eval runs are derived audit artifacts. They compare expected relevance and legal labels against an observed retrieval result, and they must report authority correctness and provenance completeness separately from relevance metrics.

Vector maintenance runs are derived audit artifacts. They may detect drift, missing metadata, generation mismatches, invalid refs, and invalidation candidates, but repair or rebuild work must remain explicit and replayable rather than hidden inside retrieval.

---

## 6. The Minimum Rule

If a new subsystem cannot explain which of these type families it creates, reads, updates, or emits, then the subsystem is still architecturally underspecified.
