# Cristalina v4
## Storage Model

**Status:** Draft  
**Purpose:** Freeze the minimum storage layout for the v4 architecture before implementation expands

---

## 1. Why This Document Exists

Cristalina v4 now has enough architectural clarity that the repository needs a minimum storage contract.

Without it, implementation will drift in one of three bad directions:

- adapter-first layout drift
- world-model and canonical-memory conflation
- wiki growth without authority boundaries

This document defines the minimum persistent surfaces the system should support.

---

## 2. Storage Thesis

Cristalina v4 should not begin as:

- one giant document folder
- one vector index with metadata
- one graph store pretending to be all memory
- one canonical ledger doing every job

It should begin with distinct persistent zones that match the architecture:

- `raw/`
- `runtime/`
- `world/`
- `canon/`
- `wiki/`
- `governance/`
- `derived/`

Each zone exists because it solves a different memory problem.

---

## 3. Minimum Top-Level Layout

```text
.cristalina-v4/
  manifest.yaml
  raw/
  runtime/
  world/
  canon/
  wiki/
  governance/
  derived/
  audits/
```

This is a logical baseline.

The exact file count and internal partitioning may evolve, but the zone boundaries should remain stable unless the architecture itself changes.

---

## 4. Zone Definitions

### 4.1 `raw/`

Purpose:

- preserve high-fidelity inputs
- preserve immutable or near-immutable evidence
- support reinspection and provenance

Expected contents:

- transcripts
- clipped pages
- imported markdown
- images
- structured exports
- attachments
- source manifests

This layer should be append-heavy and authority-light.

It is evidence, not memory law.

### 4.2 `runtime/`

Purpose:

- preserve runtime-local state and runtime-originated observations
- separate live operational mind from durable memory

Expected contents:

- observations
- runtime sessions
- attention state snapshots
- working-memory checkpoints
- runtime-local diagnostics

This layer should be replaceable and ephemeral-friendly.

It must not be treated as canon.

### 4.3 `world/`

Purpose:

- preserve temporal world structure
- store entities, relations, episodes, and evolving world claims

Expected contents:

- entity records
- relation records
- episodic records
- temporal claims
- contradiction clusters
- world-model indexes

This layer is machine-optimized structure.

It is not the same thing as canonical truth.

### 4.4 `canon/`

Purpose:

- preserve governed durable truth
- store the memory objects that passed through governance

Expected contents:

- ratified facts
- ratified beliefs
- preferences
- constraints
- values
- identity traits
- supersession chains

This is the memory authority layer.

### 4.5 `wiki/`

Purpose:

- preserve editorial accumulated synthesis
- provide a durable, readable, navigable knowledge body

Expected contents:

- source summary pages
- entity pages
- topic pages
- comparison pages
- synthesis pages
- `index.md`
- `log.md`
- metadata or link indexes

This layer is extremely valuable.

It is still derived.

### 4.6 `governance/`

Purpose:

- preserve policy and transition machinery
- keep governance data separate from world content and canon

Expected contents:

- proposal queues
- ratification packets
- policy snapshots
- authority rules
- audience rules
- transition records

### 4.7 `derived/`

Purpose:

- hold runtime-specific compiled outputs
- keep projections explicitly downstream of memory layers

Expected contents:

- OpenClaw projections
- Hermes projections
- session packs
- bootstrap surfaces
- projection manifests
- diagnostics bundles

This layer must always be reproducible from upstream data.

### 4.8 `audits/`

Purpose:

- preserve audit logs and rollback surfaces
- keep operational history of memory changes

Expected contents:

- change logs
- validation logs
- rollback manifests
- snapshot manifests

---

## 5. Example Layout

```text
.cristalina-v4/
  manifest.yaml
  raw/
    sources/
    attachments/
    imports/
  runtime/
    observations/
    sessions/
    working-memory/
  world/
    entities/
    relations/
    episodes/
    claims/
    contradictions/
  canon/
    facts/
    beliefs/
    preferences/
    constraints/
    values/
    identity/
  wiki/
    pages/
    index.md
    log.md
  governance/
    proposals/
    ratifications/
    policy/
  derived/
    openclaw/
    hermes/
  audits/
    changes.log
    validation.log
    snapshots/
```

---

## 6. Storage Rules

### 6.1 One authoritative home rule

No memory claim should have more than one authoritative home.

In practice:

- the same claim may appear in `wiki/` and `derived/`
- the authoritative durable version belongs in `canon/`
- the authoritative temporal-structural version belongs in `world/`

### 6.2 Derived surfaces may duplicate, but must reference upstream

Anything in:

- `wiki/`
- `derived/`

may duplicate content for usability.

But it should preserve references to upstream objects whenever possible.

### 6.3 Runtime must not write canon directly

Writes originating from runtimes must flow through:

- `runtime/`
- optionally `world/` or `wiki/`
- `governance/`
- then `canon/`

### 6.4 World state and canon may disagree temporarily

That is not necessarily a bug.

The world model may evolve ahead of canon.

The architecture explicitly allows that distinction.

### 6.5 Wiki may be rich and useful without being sovereign

The wiki is allowed to be:

- extensive
- cross-linked
- high quality
- extremely useful

It is still not sovereign memory.

---

## 7. Implementation Guidance

The first implementation should optimize for:

- simple file-native storage
- stable IDs
- explicit references
- human-inspectable artifacts

Do not optimize the first version around:

- maximal retrieval performance
- embeddings-first architecture
- graph database lock-in
- adapter-specific layout

The first version should optimize for semantic clarity, not infrastructure cleverness.
