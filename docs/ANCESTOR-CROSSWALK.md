# Cristalina v4
## Ancestor Crosswalk

**Status:** Draft  
**Purpose:** Prevent important business logic from the ancestor systems from being flattened into vague inspiration language

---

## 1. Why This Document Exists

Cristalina v4 is being designed by reading older systems closely and then rewriting their real logic into a new architecture.

That process is risky.

The usual failure mode is:

- remember the slogan
- forget the mechanism
- rebuild a weaker imitation

This document exists to stop that from happening.

It translates each ancestor into:

- what the original system actually does
- what v4 must preserve from it
- where that behavior lives in the v4 architecture
- what v4 intentionally does **not** inherit

---

## 2. Crosswalk Rule

For every ancestor capability, the design team should be able to answer:

1. Is this capability foundational, useful, or incidental?
2. If foundational, which v4 layer owns it?
3. If useful but not foundational, is it deferred or adapted?
4. If rejected, what failure mode are we avoiding?

If the answer is unclear, the ancestor has not been translated cleanly enough yet.

---

## 3. Cristalina -> Cristalina v4

### 3.1 What the current Cristalina actually does

The current Cristalina repository is not just "governed memory" in the abstract.

It concretely implements or defines:

- a hard separation between `events`, `proposals`, `core`, `compiled`, and `bootstrap`
- human curation packets and question selection as a first-class governance ritual
- answer normalization into canonical operations such as `CREATE`, `CONFIRM`, `REVISE`, and `SUPERSEDE`
- policy objects separated from ordinary memory objects
- runtime projections that are intentionally derived and machine-constrained
- writeback from runtime drift into proposals rather than direct memory overwrite
- audit logs, snapshots, rollback, and supersession chains

### 3.2 What v4 must preserve

These behaviors are foundational and should survive into v4:

- governed write discipline
- proposal-first promotion into durable memory
- faithful interpretation of human ratification
- policy as a separate governance substrate
- explicit distinction between canonical truth and runtime projections
- diagnostics and auditability around failed or partial promotion

### 3.3 Where it lives in v4

| Cristalina ancestor capability | v4 home |
|---|---|
| events | `raw/` and `runtime/observations` |
| proposals | `governance/proposals` |
| curation packets | `governance/curation` |
| policy objects | `governance/policy` and `governance/policy-snapshots` |
| canonical memory | `canon/` |
| compiled/bootstrap projections | `derived/` |
| audit / rollback | `audits/` |

### 3.4 What v4 should add beyond the ancestor

The current Cristalina is strongest on memory law, but weaker on world modeling and runtime state packaging.

v4 therefore extends the old model by adding:

- a separate temporal world layer
- a richer runtime-self layer
- a persistent wiki layer
- runtime-portable projection contracts for more than one runtime

### 3.5 What v4 intentionally does not inherit

v4 should not inherit:

- any tendency to let the canonical layer swallow every other memory function
- any tendency to keep runtime cognition underdescribed
- any assumption that one runtime's markdown contract should define the whole architecture

---

## 4. Letta -> Cristalina v4

### 4.1 What Letta actually contributes

Letta is not only "persistent memory".

Its most important architectural contributions are:

- the agent is treated as a **stateful service**, not a stateless chat endpoint
- always-visible memory blocks remain in-context instead of being merely retrieved on demand
- editable memory is packaged as part of agent state
- archival memory exists as out-of-context searchable memory
- the agent's portable state includes prompt, tools, memory blocks, configuration, and history
- `AgentFile (.af)` treats the whole agent package as a transportable, versionable artifact

This is a stronger runtime thesis than most memory systems have.

### 4.2 What v4 must preserve

These Letta lessons are important enough to translate directly:

- runtime self is a real layer, not just "whatever the adapter needs"
- some memory must stay pinned and always visible
- runtime state should be packageable and portable
- agent continuity depends on more than a database of facts
- the system should be checkpoint-friendly and evaluation-friendly

### 4.3 Where it lives in v4

| Letta capability | v4 home |
|---|---|
| always-visible memory blocks | `runtime/blocks` |
| running conversation state | `runtime/threads` and `runtime/sessions` |
| portable runtime package | `derived/` projection manifests plus adapter packaging |
| editable runtime memory separate from canon | `runtime/` |
| archival out-of-context recall | distributed across `wiki/`, `world/`, and `raw/` rather than one opaque bucket |

### 4.4 What v4 adds beyond Letta

Letta is excellent at runtime continuity, but it does not put the same weight on governed canonical truth.

v4 therefore adds:

- stronger promotion law
- clearer distinction between runtime memory and durable memory
- explicit temporal world state outside the runtime package
- stronger provenance and ratification requirements

### 4.5 What v4 intentionally does not inherit

v4 should not inherit:

- any design where convenience of runtime editing quietly becomes truth authority
- any packaging model that treats the whole agent state as if all of it had equal epistemic status

---

## 5. Zep / Graphiti -> Cristalina v4

### 5.1 What Zep / Graphiti actually contributes

Graphiti's strongest contribution is not "graph storage" in the generic sense.

It is the combination of:

- episodes as the provenance root
- entities and relations as first-class structures
- facts with validity windows
- invalidation of outdated facts instead of destructive overwrite
- historical queries across time
- hybrid retrieval across semantic signals, keyword signals, and graph structure
- prescribed or learned ontology as an explicit design choice
- incremental graph updates instead of periodic total recomputation

Zep adds the product lesson on top of that:

- context assembly needs to be operationally useful and low-latency, not only theoretically rich

### 5.2 What v4 must preserve

These behaviors should survive into v4:

- episodes are the provenance root of world updates
- world structure is temporal, not static
- invalidated facts should remain historically inspectable
- ontology must be explicit enough to reason about
- retrieval should eventually be hybrid, not single-method
- the world layer is a distinct cognitive layer with its own authority rules

### 5.3 Where it lives in v4

| Zep / Graphiti capability | v4 home |
|---|---|
| episodes as raw provenance | `world/episodes` anchored by `raw/` and `runtime/observations` |
| entities and relations | `world/entities` and `world/relations` |
| temporal claims | `world/claims` |
| contradiction clusters | `world/contradictions` |
| ontology definitions | `world/ontology` |
| context assembly from multiple signals | `derived/` with adapter-specific retrieval and assembly |

### 5.4 What v4 adds beyond Zep / Graphiti

Zep / Graphiti is strong on structure and change, but that is still not the same thing as durable governed truth.

v4 therefore adds:

- canonical promotion gates
- ratified memory distinct from world-model state
- explicit memory law above retrieval quality
- human-governed interpretation where needed

### 5.5 What v4 intentionally does not inherit

v4 should not inherit:

- the assumption that structural consistency alone is enough to justify durable memory
- the assumption that graph centrality is equivalent to truth or importance

---

## 6. Non-Loss Checklist

When reviewing future v4 documents or code, the following questions should all still have a clear answer:

### From Cristalina

- Where do proposals live?
- Where do curation packets live?
- What prevents runtime drift from becoming truth directly?
- What preserves audit and rollback?

### From Letta

- What remains always visible to the runtime?
- What belongs to runtime state but not canon?
- How is runtime state checkpointed or projected portably?

### From Zep / Graphiti

- Where do episodes live?
- Where do validity windows live?
- How are invalidated world claims preserved historically?
- How will retrieval eventually combine structure, time, and semantics?

If any of these answers becomes vague, the v4 architecture is losing important inheritance.
