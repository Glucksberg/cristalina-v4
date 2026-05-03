# Cristal Hermes Test Monitor

This is the operator-side observation loop for the first Hermes/Cristalina live
tests.

The monitor is intentionally read-only with respect to Cristalina memory. It
observes:

- Hermes bridge plugin files and enablement
- Hermes-emitted runtime bridge event files
- bridge background logs per event
- Cristalina status, projections, diagnostics, review queue, and store shape

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
plugin_enabled: true
background_dispatch: true
cristalina_status_ok: true
```

After a Hermes turn, `latest_event` should point at the latest
`cristalina.runtime_bridge_event.v1` file under:

```text
$HERMES_ROOT/.cristalina-v4/events/
```

If `bridge_log_size` grows with an error, inspect the matching `.bridge.log`
file from the full snapshot.

## Custom Roots

```bash
node scripts/monitor-cristal-hermes.mjs \
  --hermes-root /path/to/hermes/home \
  --cristalina-root /path/to/cristalina-v4-runtime \
  --config /path/to/config.json \
  --out-dir /path/to/monitor-output
```
