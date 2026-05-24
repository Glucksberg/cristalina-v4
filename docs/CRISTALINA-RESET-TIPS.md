# Cristalina Reset Tips

Cristalina installs a small bank of user-facing tips for Hermes session resets.
In Hermes provider mode, the `cristalina-gateway` companion plugin may send one
tip after `/new` or `/reset` when Hermes does not provide inline reset-tip
extension support.

These tips are guidance only. They do not write memory, create owner authority,
promote canon, or bypass governed review.

## Tip Categories

The installed tip bank intentionally covers four user-facing categories.

- `memory_requests`: natural-language prompts a user can say to Cristal.
- `scope_and_lifecycle`: temporary, project-scoped, corrected, or forgotten
  memories.
- `authority_and_provenance`: reminders about canon, wiki, hypotheses, runtime
  evidence, and source tracing.
- `safety`: sensitive data and memory-poisoning containment.

## User-Facing Tips

Reset tips should help the user talk to Cristal more clearly. They should not
discipline the agent, teach internal CLI operation, or expose maintainer-only
procedures in normal chat.

- `store this as my preference: ...`
- `remember this only for this project: ...`
- `this is temporary for this session`
- `correct the previous memory: ...`
- `forget this memory: ...`
- `this is a hypothesis, not canon`
- `what do you remember about this?`
- `is this canon, wiki, hypothesis, or runtime evidence?`
- `why do you remember that?`
- `what should I decide as owner?`
- `do not store this`

These prompts ask the agent to route memory through Cristalina's governed flow.
They do not mean "edit the store directly." Durable owner-scoped memory still
needs authority, provenance, and, when required, review.

## Operator Guidance

Terminal commands such as `cristalina status`,
`cristalina reviews list --owner-decisions`, `cristalina diagnostics list`,
`cristalina projection recognition`, and `cristalina update` are operator
procedures. They belong in runbooks, troubleshooting docs, AGENTS.md, or explicit
operator instructions. They should not be included in the normal `/new` reset tip
rotation unless the runtime is explicitly configured for an operator/admin chat.

## Product Rules

- Tips must be short enough to fit comfortably in a Telegram follow-up message.
- Tips must be useful to the user reading the chat, not just to the agent or
  maintainer.
- Tips must not imply that runtime observations are owner authority.
- Tips must not suggest editing store internals directly.
- Tips should prefer natural actions: say, ask, correct, forget, decide.
- Tips should rotate, so repeated `/new` calls expose different parts of the
  operational surface over time.
