# Cristal Hermes Test Monitor

This is the operator-side observation loop for the first Hermes/Cristalina live
tests.

The monitor is intentionally read-only with respect to Cristalina memory. It
observes:

- Hermes native Cristalina memory provider files and enablement
- Hermes bridge plugin files and enablement when rollback mode is active
- Hermes-emitted runtime bridge event files
- provider/bridge background logs per event
- Cristalina status, recognition projection, projections, diagnostics, review
  queue, and store shape

It does not infer owner authority, apply reviews, repair records, or mutate the
store.

## One Shot

```bash
node scripts/monitor-cristal-hermes.mjs
```

By default this uses:

```text
HERMES_ROOT=/mnt/c/Users/Markus/desktop/projetos/hermes-cristalina-sandbox/home
CRISTALINA_ROOT=/mnt/c/Users/Markus/desktop/projetos/cristalina-v4-runtime
CRISTALINA_CONFIG=$CRISTALINA_ROOT/.cristalina-v4/config.json
```

Each run writes:

```text
.cristalina-v4/test-monitor/<timestamp>.json
.cristalina-v4/test-monitor/snapshots.jsonl
```

## Watch Mode

```bash
node scripts/monitor-cristal-hermes.mjs --watch --interval-ms 5000
```

Use this while Cristal is interacting through Hermes. The terminal output is a
small summary; the full JSON snapshot remains on disk for later inspection.

## Useful Checks

The snapshot summary should show:

```text
provider_enabled: true
provider_prefetch: true
cristalina_status_ok: true
```

After a Hermes turn, `latest_event` should point at the latest
`cristalina.runtime_bridge_event.v1` file under:

```text
$HERMES_ROOT/.cristalina-v4/events/
```

If `bridge_log_size` grows with an error, inspect the matching `.bridge.log`
or `.provider.log` file from the full snapshot.

In rollback bridge mode, `plugin_enabled: true` and `background_dispatch: true`
are expected. In provider mode, `plugin_enabled` should normally be false so the
bridge is not capturing the same turn in parallel.

## Local UI

```bash
pnpm farol
```

or:

```bash
node scripts/monitor-cristal-hermes.mjs --serve --port 4347
```

Then open:

```text
http://127.0.0.1:4347
```

The UI refreshes every 10 seconds and combines the live Farol snapshot with the
test board in:

```text
docs/FAROL-TEST-BOARD.json
```

Edit that board as the test fronts evolve. It is operator coordination only:
not Cristalina store truth, not owner authority, and not product memory.

## Custom Roots

```bash
node scripts/monitor-cristal-hermes.mjs \
  --hermes-root /path/to/hermes/home \
  --cristalina-root /path/to/cristalina-v4-runtime \
  --config /path/to/config.json \
  --out-dir /path/to/monitor-output
```
