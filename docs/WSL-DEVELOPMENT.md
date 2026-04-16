# WSL Development Checklist

Cristalina v4 should be installed and built from a single OS environment at a time.

For this repository, the stable recommendation is: use WSL only and keep the working tree inside the Linux filesystem, not under `/mnt/c`.

## Migration Checklist

1. Finish or push any current Windows-side work before switching environments.
2. In WSL, clone the repository into a Linux path such as `~/dev/cristalina-v4`.
3. Install the toolchain in WSL and verify it there:
   - `node -v`
   - `pnpm -v`
4. If you reuse an existing checkout, delete all `node_modules` directories before reinstalling.
5. Run `pnpm install` from the repository root inside WSL.
6. Run `pnpm test` inside WSL before resuming feature work.
7. Keep all future installs, builds, and test runs in WSL for this checkout.

## Recovery If Windows And WSL Were Mixed

If `tsc`, package binaries, or symlinked packages start failing after the repo was opened from both Windows and WSL:

1. Stop using the Windows checkout.
2. In WSL, remove dependency directories and lock-derived install artifacts for the checkout you will keep.
3. Reinstall with `pnpm install`.
4. Re-run `pnpm test`.

## Operating Rule

Do not share `node_modules` between Windows and WSL. Mixed shims and symlinks are the main cause of the `tsc` breakage seen in this repo.
