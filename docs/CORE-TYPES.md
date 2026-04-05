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
- `OntologyDefinition`
- `PolicySnapshot`
- `WikiPage`
- `WikiClaim`
- `ProjectionArtifact`
- `ProjectionManifest`
- `Diagnostic`

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

---

## 4. Type Contracts

### 4.1 `SourceRecord`

Represents a durable registered source artifact.

Minimum fields:

- `id`
- `kind`
- `created_at`
- `source_type`
- `source_ref`
- `content_ref`
- `visibility`

### 4.2 `Observation`

Represents something seen, read, heard, inferred, or produced during runtime activity.

Minimum fields:

- `id`
- `kind`
- `summary`
- `created_at`
- `epistemic_state`
- `source_ref`
- `visibility`

### 4.3 `Episode`

Represents grouped observations that form a bounded event arc or meaningful temporal chunk.

Minimum fields:

- `id`
- `summary`
- `observation_refs`
- `valid_from`
- `valid_to`

Episodes should be treated as provenance anchors for the world layer, not merely as summaries.

### 4.4 `Entity`

Represents a durable referent in the world model.

Minimum fields:

- `id`
- `entity_kind`
- `label`
- `status`

### 4.5 `Relation`

Represents a structured relationship between entities.

Minimum fields:

- `id`
- `subject_ref`
- `object_ref`
- `relation_type`
- `valid_from`
- `valid_to`

### 4.6 `WorldClaim`

Represents a world-model claim that is useful structurally but not necessarily canonical yet.

Minimum fields:

- `id`
- `kind`
- `statement`
- `epistemic_state`
- `temporal_status`
- `support_refs`

### 4.7 `CanonicalMemoryObject`

Represents durable memory that passed through governance.

Minimum fields:

- `id`
- `kind`
- `statement`
- `epistemic_state`
- `governance_state`
- `created_at`
- `source_ref`
- `visibility`

### 4.8 `RuntimeMemoryBlock`

Represents pinned or attachable runtime memory that remains available to the running agent.

Minimum fields:

- `id`
- `name`
- `description`
- `content`
- `read_only`
- `visibility`
- `created_at`
- `updated_at`

### 4.9 `ConversationThread`

Represents a persistent runtime conversation or interaction thread.

Minimum fields:

- `id`
- `runtime`
- `created_at`
- `updated_at`
- `message_refs`
- `summary`

### 4.10 `Proposal`

Represents a candidate transition toward canonical memory or another managed layer.

Minimum fields:

- `id`
- `operation`
- `candidate_kind`
- `target_layer`
- `target_ref`
- `candidate_payload`
- `reason`
- `evidence_refs`
- `governance_state`

### 4.11 `CurationPacket`

Represents a governance packet presented for human or approved higher-order review.

Minimum fields:

- `id`
- `created_at`
- `proposal_refs`
- `question_count`
- `status`

### 4.12 `RatificationRecord`

Represents an applied governance decision.

Minimum fields:

- `id`
- `proposal_ref`
- `decision`
- `actor`
- `created_at`

### 4.13 `Contradiction`

Represents an unresolved tension between claims, structures, or memory objects.

Minimum fields:

- `id`
- `left_ref`
- `right_ref`
- `status`
- `created_at`

### 4.14 `OntologyDefinition`

Represents the active ontology contract for the world layer.

Minimum fields:

- `id`
- `mode`
- `entity_types`
- `relation_types`
- `created_at`
- `updated_at`

The initial mode may be:

- `prescribed`
- `learned`
- `hybrid`

### 4.15 `PolicySnapshot`

Represents a versioned governance or authority configuration.

Minimum fields:

- `id`
- `policy_family`
- `version`
- `created_at`
- `active`

### 4.16 `WikiPage`

Represents an editorial knowledge page.

Minimum fields:

- `id`
- `page_kind`
- `title`
- `path`
- `created_at`
- `updated_at`
- `source_refs`
- `canonical_refs`
- `world_refs`

### 4.17 `WikiClaim`

Represents an explicit claim stated inside a wiki page.

Minimum fields:

- `id`
- `page_ref`
- `statement`
- `claim_status`
- `source_refs`

### 4.18 `ProjectionArtifact`

Represents a runtime-facing derived artifact.

Minimum fields:

- `id`
- `adapter`
- `artifact_kind`
- `path`
- `upstream_refs`
- `created_at`

### 4.19 `ProjectionManifest`

Represents the common metadata contract for a compiled runtime package.

Minimum fields:

- `id`
- `adapter`
- `projection_profile`
- `audience`
- `created_at`
- `upstream_refs`
- `artifact_refs`

### 4.20 `Diagnostic`

Represents bounded machine-readable feedback about failures, ignored edits, or unresolved tensions.

Minimum fields:

- `id`
- `code`
- `severity`
- `message`
- `related_refs`

---

## 5. The Minimum Rule

If a new subsystem cannot explain which of these type families it creates, reads, updates, or emits, then the subsystem is still architecturally underspecified.
