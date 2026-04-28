# Runtime Wiring Smoke

This example proves the first real-runtime wiring contract without requiring a
local OpenClaw or Hermes installation.

Run it with:

```bash
pnpm smoke:runtime-wiring
```

The smoke command resets `examples/runtime-wiring/generated`, then:

1. writes a local Cristalina config with OpenClaw and Hermes runtime refs
2. runs `cristalina install openclaw`
3. runs `cristalina install hermes`
4. verifies both installer hook descriptors and hook scripts
5. sends the OpenClaw event fixture through `cristalina bridge event`
6. applies the resulting OpenClaw owner-review queue item
7. sends the Hermes preference fixture through the same bridge contract
8. sends the Hermes diagnostic fixture through the same bridge contract
9. reads both runtime projections from the same store
10. creates an OpenClaw checkpoint
11. compiles a Hermes session pack from that OpenClaw checkpoint
12. records a Hermes resume receipt

Versioned event fixtures live under:

- `events/openclaw-preference.json`
- `events/hermes-preference.json`
- `events/hermes-diagnostic.json`

Generated output is intentionally ignored by git. After running the smoke, read:

- `generated/runtime-wiring-summary.json`
- `generated/openclaw-runtime/.cristalina-v4/hooks/openclaw-cristalina-hook.json`
- `generated/hermes-runtime/.cristalina-v4/hooks/hermes-cristalina-hook.json`

The hook descriptor contract is deliberately small. A real runtime only needs
to write a JSON event file matching `cristalina.runtime_bridge_event.v1`, set
`CRISTALINA_EVENT_PATH` to that file, and invoke the generated hook script.
