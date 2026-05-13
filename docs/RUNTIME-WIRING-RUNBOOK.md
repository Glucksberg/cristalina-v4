# Cristalina Runtime Wiring Runbook

**Status:** Native Hermes provider baseline
**Scope:** local OpenClaw wiring through hooks and Hermes wiring through the native memory provider

This runbook is the operator path for connecting one OpenClaw runtime and one
Hermes runtime to the same Cristalina store. The current production-shaped path
is Hermes first: Hermes loads Cristalina as a native memory provider, while
OpenClaw still uses generated hook metadata until its parity phase begins.

It assumes the current trust model:

- Cristalina owns memory semantics.
- OpenClaw emits bridge event files through the generated hook.
- Hermes loads Cristalina as `memory.provider`.
- The Hermes provider consumes derived Cristalina projections before LLM calls
  and emits post-turn evidence through `cristalina bridge event`.
- Runtime config selects integration points; it does not define memory law.

The goal is a controlled first live loop, not a daemon or hosted service.

---

## 1. Prerequisites

Required locally:

- Node.js 20 or newer
- pnpm 10 or newer
- a checked-out `cristalina-v4` repository
- candidate OpenClaw and Hermes runtime roots

Install and verify Cristalina:

```bash
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm smoke:runtime-wiring
```

The smoke command proves the bridge without touching real OpenClaw or Hermes
config. Inspect:

```bash
cat examples/runtime-wiring/generated/runtime-wiring-summary.json
```

Do not wire real runtimes until the smoke passes.

---

## 2. Initialize The Store And Config

Create or select the Cristalina config:

```bash
pnpm cristalina config --init --non-interactive --config .cristalina-v4/config.json
```

For a real operator setup, set stable identities explicitly:

```bash
pnpm cristalina config --init --non-interactive \
  --config .cristalina-v4/config.json \
  --store-root .cristalina-v4/store \
  --owner actor_owner_local_001 \
  --agent actor_agent_local_001 \
  --operator actor_operator_local_001 \
  --principal-kind owner \
  --principal-actor actor_owner_local_001 \
  --openclaw-runtime runtime_openclaw_local_001 \
  --hermes-runtime runtime_hermes_local_001
```

Check the config and store:

```bash
pnpm cristalina doctor --config .cristalina-v4/config.json
pnpm cristalina store inspect --config .cristalina-v4/config.json
```

Identity refs should be stable across runs. Changing them creates a different
authority/runtime story.

---

## 3. Preflight Runtime Roots

Before installing hook metadata into real runtime roots:

```bash
pnpm cristalina runtime preflight \
  --openclaw-root /path/to/openclaw \
  --hermes-root /path/to/hermes \
  --config .cristalina-v4/config.json
```

The preflight report should show:

- the selected config path
- the resolved store root
- OpenClaw and Hermes runtime roots
- expected hook descriptor paths
- install commands for both runtimes
- config diagnostics, if any

Fix diagnostics before continuing.

---

## 4. Install Hook Metadata And Hermes Provider

Install OpenClaw hook metadata and the Hermes provider:

```bash
pnpm cristalina install openclaw \
  --runtime-root /path/to/openclaw \
  --config .cristalina-v4/config.json \
  --non-interactive

pnpm cristalina install hermes \
  --runtime-root /path/to/hermes \
  --config .cristalina-v4/config.json \
  --non-interactive
```

Each install writes Cristalina-owned metadata under the runtime root. For
Hermes, the default installer mode is the native memory provider:

```text
/path/to/hermes/plugins/cristalina/plugin.yaml
/path/to/hermes/plugins/cristalina/__init__.py
/path/to/hermes/.cristalina-v4/provider-hermes.json
```

When `/path/to/hermes/config.yaml` exists, the installer sets:

```yaml
memory:
  provider: cristalina
```

In provider mode, `cristalina-bridge` is removed from `plugins.enabled` so the
bridge does not run as a parallel write path. The provider still emits completed
turns through the public `cristalina bridge event` command; the bridge contract
is the evidence intake boundary, not the Hermes runtime integration.

For rollback or parity testing, install explicitly with:

```text
pnpm cristalina install hermes \
  --runtime-root /path/to/hermes \
  --config .cristalina-v4/config.json \
  --non-interactive \
  --integration-mode bridge
```

Bridge mode writes the older general hook plugin under
`/path/to/hermes/plugins/cristalina-bridge/` and enables it in
`plugins.enabled`.

The installer also records the runtime binding in
`.cristalina-v4/installations.json` beside the Cristalina config. Future updates
can then refresh the checkout and reapply runtime metadata without the operator
remembering every runtime path:

```bash
pnpm cristalina update --config .cristalina-v4/config.json
```

For older installs that do not have the registry yet, run update once with the
runtime root:

```bash
pnpm cristalina update \
  --runtime hermes \
  --runtime-root /path/to/hermes \
  --config .cristalina-v4/config.json
```

Record where the real OpenClaw runtime config should point:

```bash
pnpm cristalina runtime hook-map \
  --runtime openclaw \
  --runtime-root /path/to/openclaw \
  --target-config /path/to/openclaw/config/hooks.json
```

The generated map records:

- hook descriptor path
- executable hook script path
- target runtime config path
- required `CRISTALINA_EVENT_PATH` invocation

Wire the real OpenClaw config to invoke the generated hook script after writing
an event file. For Hermes, restart the session/gateway after installation so the
native memory provider is loaded from `memory.provider`.

Validate the provider-side read path:

```bash
pnpm cristalina projection recognition \
  --config .cristalina-v4/config.json \
  --format context
```

---

## 5. Validate Event Files Before Live Sessions

Generate example events:

```bash
pnpm cristalina runtime event-template \
  --runtime openclaw \
  --event-type message_observed \
  --output /tmp/openclaw-event.json \
  --config .cristalina-v4/config.json

pnpm cristalina runtime event-template \
  --runtime hermes \
  --event-type runtime_diagnostic \
  --output /tmp/hermes-event.json \
  --config .cristalina-v4/config.json
```

Validate them:

```bash
pnpm cristalina runtime event-check \
  --event /tmp/openclaw-event.json \
  --config .cristalina-v4/config.json

pnpm cristalina runtime event-check \
  --event /tmp/hermes-event.json \
  --config .cristalina-v4/config.json
```

Verify one OpenClaw event and one Hermes event against the same store:

```bash
pnpm cristalina runtime event-verify \
  --openclaw-event /tmp/openclaw-event.json \
  --hermes-event /tmp/hermes-event.json \
  --config .cristalina-v4/config.json
```

For the first live test, capture the real event JSON emitted by each runtime
and run `event-check` on those files before letting hooks call the bridge
automatically.

---

## 6. Start The First Live Loop

The generated hook script expects:

```bash
CRISTALINA_EVENT_PATH=/path/to/event.json /path/to/cristalina-bridge-event.sh
```

The runtime-side integration should:

1. write a complete `cristalina.runtime_bridge_event.v1` JSON file
2. set `CRISTALINA_EVENT_PATH` to that file
3. invoke the generated hook script
4. leave the event file available for audit during the first tests

The event file is evidence and operational input, not an authority boundary.
The bridge derives the effective authenticated principal from trusted local
config or explicit operator commands. A runtime event that declares owner
authority in JSON does not become owner authority, and runtime hook events do
not apply owner review queue items directly.

Use event ids that are stable for retries. Re-sending the same logical event
should converge instead of creating unrelated memory.

For the seamless Hermes test path, restart Hermes after installation, send a
normal message, and then inspect the generated files under:

```text
/path/to/hermes/.cristalina-v4/events/
```

If no event appears, Hermes did not load the generated general plugin yet. In
that case, enable `cristalina-bridge` in Hermes' plugin mechanism and retry
before falling back to manual `CRISTALINA_EVENT_PATH` invocation.

---

## 7. Inspect Projections And Store State

List projections:

```bash
pnpm cristalina projection list --config .cristalina-v4/config.json
```

Show a projection manifest:

```bash
pnpm cristalina projection show \
  --manifest <projection_manifest_id> \
  --config .cristalina-v4/config.json
```

Verify both runtime projections:

```bash
pnpm cristalina projection verify --config .cristalina-v4/config.json
```

Inspect the store summary:

```bash
pnpm cristalina store inspect --config .cristalina-v4/config.json
```

List diagnostics:

```bash
pnpm cristalina diagnostics list --config .cristalina-v4/config.json
```

Projection artifacts are derived. If they look stale, refresh through the CLI
instead of editing files by hand:

```bash
pnpm cristalina projection refresh --config .cristalina-v4/config.json
```

---

## 8. Review Owner-Gated Writes

List review queues:

```bash
pnpm cristalina reviews list \
  --runtime openclaw \
  --config .cristalina-v4/config.json

pnpm cristalina reviews list \
  --runtime hermes \
  --config .cristalina-v4/config.json
```

Apply an explicit owner review item:

```bash
pnpm cristalina reviews apply \
  --runtime openclaw \
  --queue-id <queue_id> \
  --config .cristalina-v4/config.json
```

Only use this command for a queue item the operator intends to approve. Review
application goes through the adapter boundary and core authority checks; it is
not a raw canon edit path.

Do not approve owner-gated writes through a `review_action_requested` runtime
event. Runtime hook events may surface evidence and diagnostics, but owner
ratification remains an explicit operator/owner action.

After applying a review:

```bash
pnpm cristalina projection verify --config .cristalina-v4/config.json
pnpm cristalina store inspect --config .cristalina-v4/config.json
```

---

## 9. Verify Handoff From OpenClaw To Hermes

Run the continuity proof against an existing OpenClaw checkpoint:

```bash
pnpm cristalina session-pack verify-handoff \
  --checkpoint-id <checkpoint_id> \
  --config .cristalina-v4/config.json
```

The report should return `status: "verified"` and include:

- the checked OpenClaw checkpoint ref
- Hermes session-pack manifest
- Hermes resume receipt
- empty diagnostics

To let the proof command create a fresh OpenClaw checkpoint first, make that
write explicit:

```bash
pnpm cristalina session-pack verify-handoff \
  --create-checkpoint \
  --config .cristalina-v4/config.json
```

Session packs are derived artifacts. Resume receipts prove that Hermes consumed
the derived pack; they do not become a new truth source. `--create-checkpoint`
also writes a new checkpoint, so do not use it as a read-only inspection
command.

---

## 10. Recover And Diagnose

Start with inspect-only recovery:

```bash
pnpm cristalina store recover --config .cristalina-v4/config.json
```

This command reports recovery posture without bypassing write-path law.

For live-session failures, inspect in this order:

1. `runtime event-check` on the event file
2. `diagnostics list`
3. `reviews list`
4. `projection verify`
5. `store inspect`
6. `store recover`

Common blocked states:

- missing or unstable runtime refs
- event file does not match `cristalina.runtime_bridge_event.v1`
- event runtime differs from configured runtime binding
- review queue item is waiting for owner authority
- projection artifact is stale or context-incompatible
- checkpoint id is ambiguous or not current enough for the requested handoff

Do not repair by editing canon, projections, session packs, or resume receipts
directly. Use bridge events, review actions, projection refresh, checkpoint
creation, and handoff verification commands.

---

## 11. First-Live-Test Checklist

Before a real OpenClaw/Hermes session:

- `pnpm smoke:runtime-wiring` passes
- `doctor` reports a valid config
- `runtime preflight` names the intended OpenClaw and Hermes roots
- the Hermes installer has written `plugins/cristalina/` and set
  `memory.provider: cristalina`
- the OpenClaw installer has written hook descriptors and executable hook
  scripts
- `runtime hook-map` exists for the OpenClaw runtime config target
- captured OpenClaw event files pass `event-check`
- Hermes provider turns create runtime evidence without manual
  `CRISTALINA_EVENT_PATH`
- `projection verify` passes
- `session-pack verify-handoff` passes
- `diagnostics list` contains no unexplained blocking diagnostics

After the session:

- archive the event files used during the first run
- inspect pending reviews before treating memory as accepted
- verify projections again
- verify handoff again if Hermes resumes from OpenClaw context

---

## 12. Current Limits

This runbook does not yet provide:

- a daemon that watches runtime event directories
- automatic editing of native OpenClaw config files
- OpenClaw native-provider parity
- a final package-published installer
- polished runtime-specific UI
- hosted synchronization
- hostile multi-tenant hardening as the main operating model

Those can be added later without changing the current law: runtime convenience
must remain downstream of Cristalina's store, authority checks, and projection
contracts.
