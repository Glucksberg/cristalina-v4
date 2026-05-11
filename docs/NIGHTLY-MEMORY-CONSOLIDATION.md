# Nightly Memory Consolidation

The nightly memory consolidation is Cristalina's conservative digestion loop for
runtime evidence. It is deliberately separate from the agent's own heartbeat:
heartbeats can happen many times per day, while memory consolidation needs enough
accumulated experience to produce a useful signal.

In Hermes provider installs, consolidation and universal semantic maturation run
as one nightly memory cycle. Consolidation classifies accumulated evidence;
maturation converts selected evidence into governed `structured_memory_claim`
candidates through the host runtime's own model harness.

It is installed with the Hermes native provider and is designed to answer a
small question once per day:

> What recent experience has accumulated, and what kind of memory action might
> it deserve later?

The nightly consolidation does not promote truth. It does not write wiki, canon, world
claims, or owner authority. It creates a structured runtime consolidation that remains
auditable evidence until a later governed flow decides whether anything should be
synthesized, proposed, reviewed, or retired.

## Why `message_observed` Stays Runtime-Only

`message_observed` is the legal intake for ordinary runtime experience:

```text
message_observed
-> raw source
-> runtime observation
-> runtime_only disposition
```

That conservative route is intentional. A turn, report, search result, or agent
statement proves that something was observed; it does not prove that the content
is true, stable, owner-ratified, or worth projecting as durable knowledge.

The nightly consolidation adds a second step without weakening that invariant:

```text
runtime observations
-> memory_consolidation
-> runtime observation of the consolidation
-> memory mature
-> structured_memory_claim candidates
-> disposition and governance
```

## Event Contract

The nightly consolidation emits a runtime bridge event:

```json
{
  "event_type": "memory_consolidation",
  "consolidation": {
    "consolidation_contract": "cristalina.memory_consolidation.v1",
    "mode": "conservative",
    "items": []
  }
}
```

The consolidation classifies recent observations into suggested routes:

- `keep_runtime`
- `dedupe_or_archive`
- `candidate_operator_review`
- `candidate_research_synthesis`
- `candidate_governed_proposal_later`

These are suggestions, not transitions. Promotion remains owned by governance
flows.

Semantic maturation is the next governed step. It may create world/wiki updates,
review packets, proposals, or canon records, but only through existing
disposition and governance contracts.

## Operator CLI

The normal product path is seamless: `cristalina install hermes` or
`cristalina install openclaw` installs the provider, metadata, scripts, and
scheduled jobs. Users should not need to run memory consolidation or maturation
commands during ordinary use.

The commands below exist for tests, recovery, fixture generation, and operator
debugging.

Compile a consolidation without writing:

```bash
cristalina memory consolidation --runtime hermes --config .cristalina-v4/config.json
```

Write the consolidation back through the runtime event path:

```bash
cristalina memory consolidation --runtime hermes --write --config .cristalina-v4/config.json
```

Limit the consolidated window:

```bash
cristalina memory consolidation --runtime hermes --write --max-recent-events 200 --config .cristalina-v4/config.json
```

Run semantic maturation after consolidation in an operator/debug flow:

```bash
cristalina memory mature --runtime hermes --write --max-items 40 --llm-output llm-output.json --config .cristalina-v4/config.json
```

Inspect accumulated canon candidates and corroboration state:

```bash
cristalina memory candidates --runtime hermes --config .cristalina-v4/config.json
```

Operator CLI use does not call a remote LLM just because an API key exists. It
uses `--llm-output` for offline/local review and recovery.

Installed runtime jobs are different: they are part of the Hermes/OpenClaw
runtime that already owns the normal agent LLM configuration. The generated
nightly memory cycle first writes deterministic consolidation, then prepares a
Cristalina maturation evidence package, wakes the Hermes cron agent, lets that
agent produce the structured JSON through the same Hermes model/provider harness
used for ordinary cron turns, and then applies the JSON with `--llm-output`.

When that runtime is configured for remote inference, semantic maturation sends
the full selected evidence text to the same remote LLM provider. This is
intentional: reliable memory maturation needs complete context, not only short
previews. Users who need the memory loop to remain local should configure the
host runtime to use local inference.

## Hermes Install

`cristalina install hermes` writes:

```text
$HERMES_HOME/.cristalina-v4/memory-consolidation-hermes.json
$HERMES_HOME/.cristalina-v4/memory-maturation-hermes.json
$HERMES_HOME/.cristalina-v4/memory-cycle-hermes.json
$HERMES_HOME/scripts/cristalina-memory-consolidation.sh
$HERMES_HOME/scripts/cristalina-memory-consolidation.py
$HERMES_HOME/scripts/cristalina-memory-maturation.sh
$HERMES_HOME/scripts/cristalina-memory-maturation.py
$HERMES_HOME/scripts/cristalina-memory-cycle.py
$HERMES_HOME/cron/jobs.json
```

The default metadata uses:

```text
enabled: true
interval_minutes: 1440
schedule_kind: cron
schedule_expr: 0 3 * * *
schedule_display: daily at 03:00
mode: conservative
auto_promote: false
max_recent_events: 200
```

Hermes cron runs `cristalina-nightly-memory-cycle` once per day at 03:00 local
runtime time. The old split jobs `cristalina-nightly-memory-consolidation` and
`cristalina-nightly-memory-maturation` are removed during install/update. The
separate consolidation and maturation scripts remain useful phase/debug scripts,
but the scheduled product path is the single cycle.

Maturation also keeps a progressive backlog boundary. Successfully matured
observation refs are skipped on later nightly runs, so a fresh consolidation can
advance through accumulated evidence instead of repeatedly selecting the same
top items. Old evidence should only be reopened when new support, conflict, or
confidence changes justify another pass.

Canon promotion is no longer gated only by a single LLM confidence label.
Corroboration across recurring `semantic_slot` clusters can elevate low-risk,
non-owner claims into `world_update`, `wiki_update`, and `proposal_for_canon`.
When support is strong enough and governance gates pass, system ratification may
create canon without owner review. Owner-scoped claims and higher-risk claims
still route to review.

## Farol

Farol observes the memory consolidation as part of maturation:

- whether the nightly memory consolidation script and metadata are installed
- whether the unified `cristalina-nightly-memory-cycle` cron is installed
- how many `memory_consolidation` observations exist
- how many maturation runs, selected items, skipped backlog items, and LLM
  candidates exist
- how many semantic slots are already canon or ready for automatic canon
- store counts for runtime, proposals, wiki, canon, world, and derived layers
- research heartbeat and AI Pulse artifact counts

Farol remains read-only. It should diagnose maturation gaps, not become a memory
writer or a hidden steering loop.
