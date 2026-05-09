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

Remote LLM calls are explicit at the execution boundary. In normal product use,
semantic maturation runs from the installed Hermes/OpenClaw provider jobs and
inherits the same LLM environment used by the agent's ordinary crons and
heartbeats; Cristalina does not require a separate memory-specific LLM
configuration.

The `memory mature` CLI path is an operator/debug interface, not the expected
user experience. It uses `--llm-output` for offline/local review and recovery;
remote LLM maturation is reserved for runtime-managed execution through the
installed provider jobs. Remote prompts redact full observation summaries by
default and send only previews plus refs unless
`CRISTALINA_MEMORY_MATURATION_ALLOW_FULL_SUMMARY=1` is also set.

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
