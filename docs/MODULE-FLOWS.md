# Cristalina v4
## Module Flows

**Status:** Draft  
**Purpose:** Show how the planned modules interact so implementation can grow on top of a readable systems map

---

## 1. Why This Document Exists

The architecture is already strong enough that it should be visualized in module terms, not only in layer terms.

Layers answer:

- what kind of memory exists

Modules answer:

- which subsystem is responsible for moving and shaping that memory

Both are necessary.

---

## 2. Primary Module Interaction

```mermaid
flowchart TD
    A[source-intake] --> B[kernel-types]
    A --> C[store-io]
    A --> D[runtime-self]
    A --> E[world-engine]

    D --> F[governance-engine]
    E --> F
    G[wiki-engine] --> F

    F --> H[canon-engine]
    H --> C
    H --> I[projection-engine]

    D --> I
    E --> I
    G --> I
    J[audit-and-recovery] --> I

    I --> K[adapter-sdk]
    K --> L[openclaw-adapter]
    K --> M[hermes-adapter]

    N[retrieval-orchestrator] --> D
    N --> E
    N --> G
    N --> H
    N --> I

    C --> J
    F --> J
    H --> J
```

Interpretation:

- `source-intake` emits evidence and operational observations
- `source-intake` should be profile-driven so new sources extend contracts instead of cloning workflow code
- `runtime-self`, `world-engine`, and `wiki-engine` can all produce governance candidates
- only `governance-engine` can authorize transitions into `canon-engine`
- `projection-engine` assembles outputs for runtimes without turning runtimes into truth owners
- `retrieval-orchestrator` queries across layers but does not own truth
- `audit-and-recovery` watches important transitions and preserves rollback

---

## 3. Information Promotion Flow

```mermaid
flowchart LR
    A[raw source] --> B[source-intake]
    B --> C[observation]
    C --> D[runtime-self]
    C --> E[world-engine]
    C --> F[wiki-engine]

    D --> G[proposal candidate]
    E --> G
    F --> G

    G --> H[governance-engine]
    H -->|approve| I[canon-engine]
    H -->|world only| E
    H -->|wiki only| F
    H -->|evidence only| J[audit-and-recovery]
    H -->|reject| J

    I --> K[projection-engine]
    E --> K
    F --> K
    J --> K

    K --> L[openclaw-adapter]
    K --> M[hermes-adapter]
```

This is the key flow that preserves memory law:

- raw evidence does not become canon directly
- wiki does not become canon directly
- world structure does not become canon directly
- runtimes consume projections, not truth ownership

---

## 4. Reuse-Oriented Build Flow

```mermaid
flowchart TD
    A[ancestor repo code] --> B{reuse band}
    B -->|direct reuse| C[small transplanted module]
    B -->|port or translate| D[natural-language contract]
    D --> E[new v4 module]
    B -->|concept only| F[architectural constraint]
    F --> E
    C --> E
```

This is the correct way to reuse old code without losing architectural clarity.

The important point is:

- reuse does not happen directly from ancestor repo to final v4 subsystem in every case
- sometimes the right move is to translate old code into contract first

---

## 5. Direct Reuse Concentration

The current expectation is:

```mermaid
flowchart LR
    A[current Cristalina] --> B[governance-engine]
    A --> C[canon-engine]
    A --> D[audit-and-recovery]
    A --> E[projection-engine]
    A --> F[openclaw-adapter]

    G[Letta] --> H[runtime-self]
    G --> I[portable runtime package]

    J[Graphiti] --> K[world-engine]
    J --> L[retrieval-orchestrator]
```

This means:

- the current Cristalina contributes the most direct code reuse
- Letta contributes most strongly to runtime-state design
- Graphiti contributes most strongly to temporal world modeling and retrieval orchestration

---

## 6. Module Ownership Rule

Every future module should pass this quick test:

1. Which layer does it primarily serve?
2. Which upstream modules may it trust?
3. Which downstream modules may trust it?
4. Does it create evidence, structure, editorial synthesis, truth, projection, or diagnostics?

If that answer is fuzzy, the module boundary is not ready.
