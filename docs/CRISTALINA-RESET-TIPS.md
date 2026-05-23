# Cristalina Reset Tips

Cristalina installs a small bank of operator-facing tips for Hermes session resets.
In Hermes provider mode, the `cristalina-gateway` companion plugin may send one
tip after `/new` or `/reset` when Hermes does not provide inline reset-tip
extension support.

These tips are guidance only. They do not write memory, create owner authority,
promote canon, or bypass governed review.

## Tip Categories

The installed tip bank intentionally covers five categories.

- `terminal_operations`: concrete CLI commands for operators.
- `agent_memory_requests`: natural-language prompts a user can say to Cristal.
- `governance_boundaries`: reminders about evidence, owner authority, canon,
  wiki, proposals, and hypotheses.
- `safety`: sensitive data and memory-poisoning containment.
- `retrieval_and_archive_descent`: when to inspect recognition, projection, or
  deeper archive evidence.

## Terminal Operations

Cristalina should keep the surface small. The tips should point users to a few
commands that matter operationally:

- `cristalina status`: store health, projections, diagnostics, review queue
  state, and nightly cycle status.
- `cristalina reviews list --owner-decisions`: owner decision history and
  curation/review state.
- `cristalina projection recognition --query "<topic>" --format context`:
  inspect what Cristalina would hydrate for a topic.
- `cristalina diagnostics list`: operational failures and warnings.
- `cristalina update`: pull upstream, rebuild, and reapply registered runtime
  installs from the Cristalina checkout.

These are terminal commands. They should not be silently rebranded as Telegram
slash commands unless Hermes explicitly exposes them there.

## Natural-Language Requests

Some user intents are better expressed as spoken requests to Cristal rather than
new terminal commands:

- `store this as my preference: ...`
- `remember this only for this project: ...`
- `this is temporary for this session`
- `correct the previous memory: ...`
- `revoke/forget this memory: ...`
- `this is a hypothesis, not canon`

These prompts ask the agent to route memory through Cristalina's governed flow.
They do not mean "edit the store directly." Durable owner-scoped memory still
needs authority, provenance, and, when required, review.

## Product Rules

- Tips must be short enough to fit comfortably in a Telegram follow-up message.
- Tips must distinguish terminal commands from natural-language requests.
- Tips must not imply that runtime observations are owner authority.
- Tips must not suggest editing store internals directly.
- Tips should prefer actionable verbs: run, ask, inspect, correct, revoke.
- Tips should rotate, so repeated `/new` calls expose different parts of the
  operational surface over time.
