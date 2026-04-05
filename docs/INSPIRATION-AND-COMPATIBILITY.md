# Cristalina v4
## Inspiration and Compatibility

**Status:** Draft

---

## 1. Inspiration Repositories and Patterns

Cristalina v4 is directly inspired by three architectural ancestors and one key operating pattern:

### 1.1 Cristalina

Why it matters:

- governed canonical memory
- proposal and ratification discipline
- provenance and auditability
- canonical truth versus runtime projection
- policy objects separate from ordinary memory
- human curation as part of the memory protocol
- rollback, supersession, and audit surfaces

Primary lesson:

- memory law matters more than retrieval convenience

### 1.2 Letta

Why it matters:

- stateful runtime self
- pinned always-visible memory
- practical continuity of agent identity
- strong operational notion of the running mind
- portable packaged agent state
- editable runtime memory blocks distinct from external recall
- checkpoint and evaluation friendliness

Primary lesson:

- the agent needs a living runtime self, not only a memory database

### 1.3 Zep / Graphiti

Why it matters:

- temporal world memory
- entities and relations as first-class structures
- world-state evolution over time
- structured retrieval beyond keyword or embeddings alone
- episodes as provenance roots
- validity windows and historical queries
- ontology as an explicit part of the design

Primary lesson:

- memory must represent change, not just store snapshots

### 1.4 LLM Wiki Pattern

Why it matters:

- persistent synthesized wiki as an intermediate layer
- accumulated cross-linked understanding
- source summaries, indexes, and logs as first-class maintenance artifacts
- lower rediscovery cost at query time

Primary lesson:

- editorial synthesis deserves its own persistent layer, but it must remain distinct from canonical truth

---

## 2. Synthesis Position

Cristalina v4 is not a fork of any one of these.

It is a new architecture that selectively inherits:

- runtime-self ideas from Letta
- temporal world-model ideas from Zep/Graphiti
- governed canonical memory ideas from Cristalina
- persistent knowledge-wiki ideas from the LLM Wiki pattern

It must also preserve the mechanisms, not only the labels:

- from **Cristalina**: curation packets, policy surfaces, projection discipline
- from **Letta**: always-visible runtime memory and portable agent-state packaging
- from **Zep/Graphiti**: episodes, validity windows, invalidation instead of silent overwrite

---

## 3. Compatibility Targets

Cristalina v4 is being designed to support two first-class runtime integrations:

### 3.1 OpenClaw

Why it is first-class:

- Cristalina already has a strong OpenClaw lineage
- OpenClaw uses runtime projections in a way that maps well onto governed memory compilation
- OpenClaw is a practical reference runtime for projection, ingest, and diagnostic feedback

### 3.2 Hermes Agent

Why it is first-class:

- the v4 core should prove that its memory law is portable across runtimes
- Hermes will act as the second reference runtime for projection and ingest compatibility
- supporting both OpenClaw and Hermes forces the core to remain runtime-agnostic

---

## 4. Compatibility Rule

The core must be written so that:

- both adapters can project from the same governed memory substrate
- both adapters can ingest runtime edits into the same proposal and governance path
- runtime-specific surfaces do not fork the object semantics

The core must also remain faithful to the ancestor lessons:

- runtime state is real and must not be reduced to a scratchpad
- world state is temporal and must not be flattened into canonical memory
- canonical memory is governed and must not be replaced by wiki or runtime convenience

That is the main compatibility requirement for v4.
