# Cristalina v4
## Universal Semantic Maturation

**Status:** Active Draft  
**Purpose:** Define the bridge between runtime evidence and governed memory workflows.

---

## Thesis

Semantic maturation is a source-neutral compiler over accumulated runtime evidence.

It does not create a parallel memory ontology. It converts consolidated observations
into structured memory claim candidates that reuse Cristalina's existing contract:

- memory object kinds
- epistemic states
- disposition outcomes
- authority roles
- proposals
- governance gates
- ratification records
- world, wiki, canon, and projection artifacts

The source channel is provenance only. X/Twitter, Telegram, heartbeat jobs, direct
chat, and imported logs do not define separate product routes.

---

## Flow

```text
runtime observations
-> nightly consolidation
-> semantic maturation
-> structured_memory_claim candidates
-> disposition/governance
-> world/wiki/review/proposal/canon
-> projection back to runtime
```

`message_observed` remains `runtime_only` at ingestion. The deeper memory
machinery starts when maturation compiles structured claims from accumulated
evidence.

---

## LLM Boundary

The LLM interprets evidence. It does not hold authority.

The model may propose:

- statement
- memory kind
- epistemic state
- semantic slot
- subject authority role
- confidence and risk
- support refs
- recommended dispositions
- rationale

Cristalina validates the output before writing anything. Invalid JSON, missing
evidence refs, illegal enum values, unsupported dispositions, or unsafe authority
classification fail closed.

Remote LLM use is explicit at the runtime boundary. In normal product use,
semantic maturation runs from the installed Hermes/OpenClaw provider jobs. The
job prepares a Cristalina evidence package, wakes the runtime's own scheduled
agent turn, and lets that turn produce structured candidate JSON through the
same model/provider harness used by ordinary crons and heartbeats. Cristalina
does not require a separate memory-specific API key or LLM configuration.

If the host runtime is configured for remote inference, runtime-managed semantic
maturation sends the full selected evidence text to that same remote LLM
provider. That is the expected remote-inference contract: complete context is
necessary for reliable classification, synthesis, and governance proposal
generation. Users who require privacy should configure the host runtime for
local inference.

The `memory mature` CLI path is an operator/debug interface, not the expected
user experience. It uses `--llm-output` for offline/local review and recovery;
runtime LLM execution happens through the installed provider jobs and the host
runtime's own model harness.

Installed providers schedule maturation as a phase inside the nightly memory
cycle, not as a second independent cron. The cycle writes consolidation first,
then prepares one maturation evidence package. If the package has selected
items, the runtime agent produces `llm-output.json` with its configured model
harness and Cristalina applies that output through `memory mature --llm-output`.

Maturation selection is progressive. Successful maturation records carry the
observation refs they processed, and later evidence packages skip those refs so
the nightly cycle can move through the accumulated backlog. This is a cursor-like
contract, not a second memory store: old evidence may be revisited later when
new support, conflict, or confidence changes create a fresh reason to reprocess
it.

---

## Authority

Owner approval is not required for every memory decision.

Cristalina may autonomously ratify non-owner-authority claims when evidence is
strong, risk is low enough, conflicts are absent, and governance gates pass.

Owner-scoped preferences, decisions, identity claims, authorization claims,
overrides, and high-impact authority boundaries require explicit owner signal or
review.

Autonomous promotion still travels through governance:

```text
evidence -> proposal -> governance gates -> ratification record -> canon
```

There is no direct `runtime -> canon` or `raw -> canon` promotion.

---

## Product Boundary

Cristalina is not a self-modifying code agent.

During development, observations about Cristalina's implementation may be stored
as ordinary evidence. They do not become an internal product workflow for applying
patches to Cristalina itself. Code changes remain a repository and contributor
process.

Farol is temporary development observability. Cristalina must not depend on Farol
to mature or retrieve memory.
