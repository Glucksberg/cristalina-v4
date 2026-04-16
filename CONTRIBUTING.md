# Contributing to Cristalina v4

Thanks for your interest. Cristalina v4 is a governed memory kernel for AI agents, built contracts-first. This document explains how the project is organized, how to contribute effectively, and what the bar is for changes.

## TL;DR

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first.
- Open an issue before large changes — alignment is cheaper than rework.
- The build order is **docs → types → schemas → fixtures → kernel → adapters**, and the project is currently in the kernel implementation phase.
- Every change should make the kernel *more lawful*, not just *more impressive*.
- Licensed under MIT. By contributing, you agree your contributions are released under MIT.

## Where contributions are most welcome right now

**High-value areas:**
- Contradiction handling and resolution flows ([docs/WORLD-CONTRADICTION-FLOW-001.md](docs/WORLD-CONTRADICTION-FLOW-001.md))
- Eval harness scaffolding ([docs/EVALS.md](docs/EVALS.md))
- Real adapter implementations: `@cristalina-v4/openclaw-adapter`, `@cristalina-v4/hermes-adapter`
- Hardening of the core (atomicity, concurrency, recovery — see [docs/HARDENING-PLAN.md](docs/HARDENING-PLAN.md))
- Negative tests for illegal layer transitions and malformed proposals
- Documentation clarity, especially the glossary and decision log

**Areas to avoid for now:**
- New surface area before the kernel is hardened (retrieval orchestrator, runtime self module separation)
- Adapter UX features that bypass governance — see the anti-drift rule below

## Development setup

```bash
# Requires Node >= 20 and pnpm >= 10
git clone https://github.com/Glucksberg/cristalina-v4.git
cd cristalina-v4
pnpm install

pnpm typecheck       # Strict TypeScript across all packages
pnpm test            # Runs core unit tests
pnpm build           # Builds all packages

# Run an executable end-to-end fixture
pnpm fixture:mvp-flow-001
pnpm fixture:mvp-flow-002
pnpm fixture:mvp-flow-003
```

The fixture commands materialize a real `.cristalina-v4/` store under `examples/`. Inspect the output to understand how the layers fit together.

### Recommended environment

- **WSL or Linux** preferred. The project does fine on macOS too. Windows-native works but is not the primary path. See [docs/WSL-DEVELOPMENT.md](docs/WSL-DEVELOPMENT.md).
- Single OS environment per checkout — don't mix Windows and WSL on the same working tree.

## How the project is organized

```
docs/        Architecture, contracts, flows, hardening plans
schemas/     Stable JSON schemas for objects and adapters
notes/       Working notes (lower precision than docs/)
packages/
  core/      The governed memory kernel — the only implementation today
  openclaw-adapter/   Planned
  hermes-adapter/     Planned
examples/    Output of fixture runs (gitignored payloads, kept for reference)
```

The build flows in one direction: **docs → types → schemas → fixtures → kernel → adapters**.

A change that adds adapter behavior without first updating the contracts in `docs/` and the types in `packages/core/src/types.ts` is going in the wrong direction. The project will refuse such changes — not as policy, but because the contracts are the source of truth, and changes that bypass them produce drift the kernel can't reconcile.

## The Bar for Changes

**Notes** may be rough.
**Docs** must be precise.
**Code** is added only when the relevant contracts are clear enough.

Concretely, a good PR:

1. Has a clear motivation tied to a contract or invariant (link the doc).
2. Updates the relevant `docs/*.md` if it shifts semantics.
3. Includes types in `packages/core/src/types.ts` and validation in `validation.ts` for any new object kind or field.
4. Adds an executable fixture or test that proves the new behavior end-to-end.
5. Does not weaken any of: layer separation, contract convergence, legality of transitions, provenance, runtime validation.

A change that makes the system more impressive at the surface but weaker in any of those dimensions is mis-layered and will be sent back.

## Pull request process

1. **Open an issue first** for non-trivial changes. We'll align on scope and approach before you build it.
2. **Branch** from `main` with a descriptive name: `harden-store-atomic-writes`, `add-contradiction-resolution-test`, etc.
3. **Keep PRs focused.** One logical change per PR. If a PR has both a hardening fix and a new feature, split it.
4. **Run** `pnpm typecheck && pnpm test && pnpm build` before pushing.
5. **Describe** in the PR body: what changed, why, what doc/contract it relates to, how you verified it.
6. **Link** to the relevant doc(s) in `docs/` if the change touches semantics.

## Commit messages

Follow the existing style — imperative, present tense, focused on intent:

> ✓ `Harden store recovery and document WSL workflow`
> ✓ `Promote conversation preference flow into the core`
> ✓ `Fix conversation flow reuse and repair semantics`

Avoid:

> ✗ `Updated some files`
> ✗ `WIP`
> ✗ `Final fix v3 (real)`

## Reporting issues

Use [GitHub Issues](https://github.com/Glucksberg/cristalina-v4/issues). A useful issue includes:

- What you tried
- What happened (logs, file paths, error messages)
- What you expected
- The Node and pnpm versions
- A minimal reproduction if you can build one (a fixture that triggers it is ideal)

Security issues: please report privately by email rather than opening a public issue.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
