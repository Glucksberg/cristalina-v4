# Cristalina v4
## Reuse Matrix

**Status:** Draft  
**Purpose:** Turn the ancestor analysis into a practical map of what can be reused, what must be ported, and what should remain inspiration only

---

## 1. Why This Document Exists

Cristalina v4 is not being built in a vacuum.

It has three main technical ancestors:

- the current `Cristalina`
- `Letta`
- `Graphiti`

That creates a practical question:

**what exactly should be reused, when, and at what risk?**

This document answers that in a way that is actionable during implementation.

It is not a philosophical inheritance document.

It is a build-planning document.

---

## 2. Reuse Bands

Every candidate is classified into one of these bands.

### `direct`

The code or module is close enough to transplant with limited reshaping.

Typical signs:

- small and cohesive
- low runtime coupling
- same language or easy-to-port logic
- compatible with v4 memory law

### `port`

The logic is valuable, but the implementation is tied to another codebase, runtime model, or language.

Typical signs:

- right mechanism
- wrong packaging
- wrong dependencies
- still worth rewriting into v4

### `concept`

The ancestor contribution is mainly architectural.

Typical signs:

- product-specific code
- heavy external dependencies
- too much accidental historical structure

These should influence contracts, not be copied.

---

## 3. Effort Scale

- `low`: a small transplant or straightforward rewrite
- `medium`: requires reshaping or new interfaces
- `high`: requires major redesign even if the idea is good

---

## 4. Coupling Risk Scale

- `low`: little danger of dragging old architecture into v4
- `medium`: useful but needs boundary discipline
- `high`: easy to import the ancestor's constraints by mistake

---

## 5. Matrix

| v4 module | ancestor | source file(s) | reuse band | effort | coupling risk | roadmap timing | notes |
|---|---|---|---|---|---|---|---|
| `kernel-types` | Cristalina | [packages/types/src](/home/dev/projects/cristalina/packages/types/src) | direct | low | low | 1A | Good source for IDs, enums, and object vocabulary discipline, but v4 types must not inherit old directory assumptions. |
| `kernel-types` | Letta | [letta/schemas/block.py](/home/dev/projects/letta/letta/schemas/block.py) | port | low | medium | 1A | Useful for `RuntimeMemoryBlock` shape, labels, read-only semantics, and metadata fields. |
| `kernel-types` | Graphiti | [graphiti_core/nodes.py](/home/dev/projects/graphiti/graphiti_core/nodes.py), [graphiti_core/edges.py](/home/dev/projects/graphiti/graphiti_core/edges.py) | port | medium | medium | 1A-1B | Good source for temporal node/edge fields and validity semantics. |
| `store-io` | Cristalina | [packages/core/src/store/paths.ts](/home/dev/projects/cristalina/packages/core/src/store/paths.ts), [packages/core/src/store/writer.ts](/home/dev/projects/cristalina/packages/core/src/store/writer.ts), [packages/validate/src/store](/home/dev/projects/cristalina/packages/validate/src/store) | direct | low | low | 1A | Strongest low-risk reuse area for file-first persistence. |
| `audit-and-recovery` | Cristalina | [packages/core/src/audit/diff.ts](/home/dev/projects/cristalina/packages/core/src/audit/diff.ts), [packages/core/src/audit/logger.ts](/home/dev/projects/cristalina/packages/core/src/audit/logger.ts), [packages/core/src/audit/rollback.ts](/home/dev/projects/cristalina/packages/core/src/audit/rollback.ts) | direct | low | low | 1A | Likely the cleanest transplant candidate in the whole ancestry map. |
| `source-intake` | Cristalina | current event/provenance patterns in [packages/core/src/adapter/writeback.ts](/home/dev/projects/cristalina/packages/core/src/adapter/writeback.ts) | port | medium | medium | 1B | Useful for disciplined evidence emission, not for final v4 structure. |
| `source-intake` | Graphiti | [graphiti_core/prompts/extract_nodes.py](/home/dev/projects/graphiti/graphiti_core/prompts/extract_nodes.py), [graphiti_core/prompts/extract_edges.py](/home/dev/projects/graphiti/graphiti_core/prompts/extract_edges.py) | port | high | medium | 1B-2 | Valuable as extraction recipe scaffolding, but tightly coupled to Graphiti's LLM pipeline. |
| `runtime-self` | Letta | [letta/schemas/block.py](/home/dev/projects/letta/letta/schemas/block.py), [letta/schemas/memory.py](/home/dev/projects/letta/letta/schemas/memory.py), [letta/schemas/conversation.py](/home/dev/projects/letta/letta/schemas/conversation.py), [letta/schemas/message.py](/home/dev/projects/letta/letta/schemas/message.py) | port | medium | medium | 1B | Best source for pinned blocks, thread continuity, and packaging of in-context state. |
| `runtime-self` | Letta | [letta/schemas/agent_file.py](/home/dev/projects/letta/letta/schemas/agent_file.py) | port | medium | medium | 1D-2 | Not for full import/export parity, but excellent for thinking about portable runtime packages. |
| `runtime-self` | Cristalina | [packages/core/src/compiler/bootstrap.ts](/home/dev/projects/cristalina/packages/core/src/compiler/bootstrap.ts) | port | medium | low | 1B | Useful for shaping runtime surfaces, but v4 should not inherit the old bootstrap file contract too early. |
| `world-engine` | Graphiti | [graphiti_core/nodes.py](/home/dev/projects/graphiti/graphiti_core/nodes.py) | port | medium | medium | 1B | Strong source for episode/entity modeling and provenance anchoring. |
| `world-engine` | Graphiti | [graphiti_core/edges.py](/home/dev/projects/graphiti/graphiti_core/edges.py) | port | medium | medium | 1B | Strong source for relation modeling, `valid_at`, `invalid_at`, and invalidation semantics. |
| `world-engine` | Graphiti | `graphiti_core` ontology and extraction pattern overall | concept | high | high | 1B-2 | The ontology lesson should be inherited, but the whole Graphiti stack should not be copied wholesale. |
| `governance-engine` | Cristalina | [packages/core/src/promotion/curation.ts](/home/dev/projects/cristalina/packages/core/src/promotion/curation.ts) | direct | low | low | 1C | Excellent direct candidate for curation scoring and packet generation. |
| `governance-engine` | Cristalina | [packages/core/src/promotion/ratification.ts](/home/dev/projects/cristalina/packages/core/src/promotion/ratification.ts), [packages/core/src/promotion/ratification-operations.ts](/home/dev/projects/cristalina/packages/core/src/promotion/ratification-operations.ts), [packages/core/src/promotion/ratification-types.ts](/home/dev/projects/cristalina/packages/core/src/promotion/ratification-types.ts) | direct | low | low | 1C | Core v4 memory law should reuse a lot from here. |
| `governance-engine` | Cristalina | [packages/core/src/promotion/policy.ts](/home/dev/projects/cristalina/packages/core/src/promotion/policy.ts), [packages/core/src/promotion/proposal-type-policy.ts](/home/dev/projects/cristalina/packages/core/src/promotion/proposal-type-policy.ts), [packages/core/src/policy/resolver.ts](/home/dev/projects/cristalina/packages/core/src/policy/resolver.ts) | direct | low | low | 1C | Strong foundation for approval rules and proposal typing. |
| `canon-engine` | Cristalina | [packages/core/src/operations/create.ts](/home/dev/projects/cristalina/packages/core/src/operations/create.ts), [packages/core/src/operations/revise.ts](/home/dev/projects/cristalina/packages/core/src/operations/revise.ts), [packages/core/src/operations/supersede.ts](/home/dev/projects/cristalina/packages/core/src/operations/supersede.ts), [packages/core/src/operations/archive.ts](/home/dev/projects/cristalina/packages/core/src/operations/archive.ts), [packages/core/src/operations/confirm.ts](/home/dev/projects/cristalina/packages/core/src/operations/confirm.ts), [packages/core/src/operations/contradict.ts](/home/dev/projects/cristalina/packages/core/src/operations/contradict.ts) | direct | low | low | 1C | This is one of the clearest continuity lines between v3 and v4. |
| `wiki-engine` | Karpathy LLM Wiki pattern | architectural note, not local code | concept | medium | low | 1B-2 | The wiki layer should be mostly new code built from v4 contracts. |
| `retrieval-orchestrator` | Graphiti | [graphiti_core/search/search_config.py](/home/dev/projects/graphiti/graphiti_core/search/search_config.py), [graphiti_core/search/search_config_recipes.py](/home/dev/projects/graphiti/graphiti_core/search/search_config_recipes.py), [graphiti_core/search/search.py](/home/dev/projects/graphiti/graphiti_core/search/search.py) | port | high | high | 2 | Very valuable, but easy to import Graphiti's whole architecture accidentally. |
| `retrieval-orchestrator` | Cristalina | compiler scoring patterns in [packages/core/src/compiler/scoring.ts](/home/dev/projects/cristalina/packages/core/src/compiler/scoring.ts) | port | medium | medium | 2 | Useful for projection ranking and tiering, but not enough by itself for hybrid retrieval. |
| `projection-engine` | Cristalina | [packages/core/src/compiler/index.ts](/home/dev/projects/cristalina/packages/core/src/compiler/index.ts), [packages/core/src/compiler/hot.ts](/home/dev/projects/cristalina/packages/core/src/compiler/hot.ts), [packages/core/src/compiler/warm.ts](/home/dev/projects/cristalina/packages/core/src/compiler/warm.ts), [packages/core/src/compiler/cold.ts](/home/dev/projects/cristalina/packages/core/src/compiler/cold.ts), [packages/core/src/compiler/channel.ts](/home/dev/projects/cristalina/packages/core/src/compiler/channel.ts) | direct | medium | low | 1D | Strong source for compiler shape and projection manifest discipline. |
| `projection-engine` | Letta | [letta/schemas/agent_file.py](/home/dev/projects/letta/letta/schemas/agent_file.py) | concept | medium | medium | 1D-2 | Useful for projection packaging mindset, not for direct projection rendering. |
| `adapter-sdk` | none cleanly | new v4 design | new | medium | low | 1D | This should be intentionally new so neither OpenClaw nor Hermes dictate semantics. |
| `openclaw-adapter` | Cristalina | [packages/openclaw/src/workspace.ts](/home/dev/projects/cristalina/packages/openclaw/src/workspace.ts), [packages/openclaw/src/cli.ts](/home/dev/projects/cristalina/packages/openclaw/src/cli.ts) | direct | medium | low | 2 | Strong source for safe workspace baselines, ingest, and diagnostics. |
| `openclaw-adapter` | Cristalina | [packages/core/src/adapter/writeback.ts](/home/dev/projects/cristalina/packages/core/src/adapter/writeback.ts) | adapted | medium | medium | 2 | Valuable, but must be generalized under `adapter-sdk`. |
| `hermes-adapter` | Letta | portable state and agent packaging patterns | concept | high | medium | 2-3 | No Hermes ancestor code is local yet; this is a theory-backed greenfield area. |
| `operator-surface` | Cristalina | [packages/portal/src](/home/dev/projects/cristalina/packages/portal/src) | direct | medium | low | 2 | The current portal can likely seed a v4 observability surface very effectively. |
| `eval-harness` | Letta | `.af` packaging mindset in [letta/schemas/agent_file.py](/home/dev/projects/letta/letta/schemas/agent_file.py) | concept | medium | medium | 2 | Good precedent for portable evaluation targets. |
| `eval-harness` | Graphiti | `tests/evals` directory under [/home/dev/projects/graphiti/tests/evals](/home/dev/projects/graphiti/tests/evals) | concept | medium | low | 2 | Useful as a reminder to build retrieval/world-model evals early. |

---

## 6. Highest-Leverage Reuse Opportunities

If the goal is to gain real speed without architectural compromise, these are the best bets.

### Tier 1

- current Cristalina `audit-and-recovery`
- current Cristalina `governance-engine`
- current Cristalina `canon-engine`
- current Cristalina `store-io`

These are closest to v4's law-first architecture.

### Tier 2

- Letta block and memory schema patterns for `runtime-self`
- current Cristalina compiler skeleton for `projection-engine`
- current Cristalina OpenClaw adapter safety logic

These are useful, but need stronger v4 boundaries first.

### Tier 3

- Graphiti world modeling
- Graphiti retrieval orchestration
- Letta portable agent packaging

These are powerful, but easiest to misuse if brought in before the v4 kernel is stable.

---

## 7. Paths You Can Choose From Here

This matrix enables several legitimate build strategies.

### Path A: law-first

Start with the modules that have the best direct reuse from current Cristalina:

- `kernel-types`
- `store-io`
- `audit-and-recovery`
- `governance-engine`
- `canon-engine`

Best if the priority is integrity and stable foundations.

### Path B: runtime-visible

After the kernel, pull in the Letta-inspired pieces:

- `runtime-self`
- `projection-engine`
- `openclaw-adapter`

Best if the priority is making the system feel alive early.

### Path C: world-expansion

After the kernel, start porting Graphiti-inspired modules:

- `world-engine`
- `retrieval-orchestrator`

Best if the priority is proving the temporal world-model thesis early.

### Path D: observability-first

Use the existing portal ancestry to create an operator surface early.

Best if the priority is making the architecture legible and inspectable during development.

---

## 8. Recommendation

Given the current state of the repo, the safest recommendation is:

1. direct-reuse the strongest current Cristalina modules first
2. keep Letta and Graphiti in `port` mode until the v4 kernel is firmer
3. only then begin importing stronger runtime-self and world-engine behavior

That sequence preserves the project story:

- first the law
- then the living runtime
- then the evolving world

That is the cleanest path to a system that feels both elegant and inevitable.
