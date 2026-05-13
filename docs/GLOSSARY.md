# Cristalina v4
## Glossary

**Status:** Active Draft

---

## Terms

### Raw Source

A high-fidelity input artifact such as a transcript, file, import, clip, note, or external capture.

It is evidence, not governed truth.

### Observation

A recorded signal that something happened, was seen, read, heard, inferred, or produced during runtime.

An observation is not automatically a claim or a memory.

### Episode

A grouped temporal chunk of observations that forms a meaningful event arc.

### World Model

The structured temporal representation of entities, relations, episodes, and evolving world claims.

It is machine-optimized structure, not identical to canon.

### World Claim

A structured claim used in the world model that may be operationally useful before it becomes canonical.

### Canonical Memory

Durable governed truth that passed through the memory law of the system.

### Governance

The set of rules, transitions, gates, ratification paths, and policies that determine how information may become durable memory.

### Proposal

A candidate transition into canonical memory or another managed layer.

### Ratification

The act of approving, rejecting, or deferring a proposal through governance.

### Supersession

A governed replacement path where one durable memory object overtakes another without erasing historical lineage.

### Contradiction

A recognized unresolved tension between claims, structures, or memory objects.

### Contradiction Resolution

An explicit governance-handled proposal or application path for a contradiction.

It records how the system intends to preserve or close conflicting world state without erasing the conflict.

### Knowledge Wiki

A persistent editorial synthesis layer containing pages, summaries, comparisons, index structures, and logs.

It is useful and durable, but derived.

### Wiki Claim

A claim stated in a wiki page.

It may be useful without being authoritative.

If it needs to become durable truth, it must enter governance.

### Derived Projection

A runtime-facing compiled artifact produced from upstream layers.

Examples:

- OpenClaw bootstrap files
- Hermes runtime context surfaces
- diagnostics bundles

### Authoritative Home

The single layer that owns the authoritative version of a given claim.

The same claim may be echoed elsewhere, but its authority must have one home.

### Intake Profile

A semantic configuration contract that shapes how a source is normalized into the shared intake flow without changing memory law or layer ownership.

### Semantic Maturation

The governed LLM-assisted step that compiles accumulated runtime observations
into structured memory claim candidates.

It uses the host runtime's configured model harness in product operation. It is
not a separate user-facing API-key requirement and it is not an authority grant.

### Semantic Slot

A stable claim-cluster name used to accumulate support across maturation runs.

Repeated evidence in the same semantic slot may become eligible for wiki,
proposal, review, or canon movement depending on risk, authority role,
confidence, support refs, and governance gates.

### Nightly Memory Cycle

The installed runtime job that runs memory consolidation, semantic maturation,
and deterministic candidate promotion once per day.

For Hermes provider installs, this is currently scheduled as
`cristalina-nightly-memory-cycle` at 03:00 local runtime time.

### Native Hermes Provider

The normal Hermes integration mode where Hermes config contains:

```yaml
memory:
  provider: cristalina
```

The provider reads derived Cristalina recognition context before model calls and
emits completed turns as evidence after responses.

### Bridge

The runtime-neutral event-ingress contract behind `cristalina bridge event`.

In Hermes provider mode, the bridge remains the public evidence intake boundary
used by the provider. It is not the product integration itself and should not be
run in parallel through the old `cristalina-bridge` plugin unless rollback mode
is explicitly selected.

### Farol

The temporary external monitor for the live Hermes/Cristalina test.

Farol is read-only development observability. It is not store truth, owner
authority, product memory, or a hidden steering layer.
