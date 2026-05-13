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

Cristalina also applies corroboration after the LLM proposes candidates. The LLM
does not need to mark every useful claim as `high` confidence for the system to
learn. Recurring `semantic_slot` clusters accumulate support refs across
maturation runs. A low-risk, non-owner claim can be elevated from `evidence_only`
into `world_update`, `wiki_update`, and `proposal_for_canon` when it is supported
by enough observations across the backlog.

The current conservative auto-canon rule is:

```text
non-owner authority
+ risk=low
+ confidence is medium or high
+ epistemic state is not hypothesized/disputed
+ at least 3 support refs across 2 observed days, or at least 5 support refs
=> system ratification may pass without owner review
```

Owner-scoped preferences, identity, authorization, and high-impact decisions
still require explicit review. Corroboration is a way to prevent weeks of
evidence from staying forever in runtime/evidence layers; it is not a way to
grant owner authority to external or agent-originated claims.

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

The operator/debug view for this funnel is:

```bash
cristalina memory candidates --runtime hermes --config .cristalina-v4/config.json
```

It summarizes recurring `semantic_slot` clusters, support counts, distinct
observation days, already-canonical slots, and candidates ready for automatic
canon.

The deterministic promotion step is:

```bash
cristalina memory promote-candidates --runtime hermes --write --config .cristalina-v4/config.json
```

It reads previously matured candidates and advances historical `auto_canon_ready`
slots through the same world/wiki/proposal/ratification/canon path. Operational
self-observations about the live experiment, such as heartbeat workflow notes,
are promoted to wiki context instead of canon by default. This keeps current
runtime process knowledge useful without treating every temporary method detail
as durable truth.

The same report includes a short `owner_review` section for candidates that need
human direction. Delivery is owned by the host runtime, not by the memory core:
Cristalina produces the questions and refs; Hermes/OpenClaw may decide how to
surface them.

---

## Product Boundary

Cristalina is not a self-modifying code agent.

During development, observations about Cristalina's implementation may be stored
as ordinary evidence. They do not become an internal product workflow for applying
patches to Cristalina itself. Code changes remain a repository and contributor
process.

Farol is temporary development observability. Cristalina must not depend on Farol
to mature or retrieve memory.
