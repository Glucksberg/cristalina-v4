#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildConversationPreferenceFlowInput,
} from "../packages/core/dist/test-support/conversation-preference-fixtures.js";
import {
  listOpenClawConversationPreferenceOwnerRatificationQueue,
  loadLatestOpenClawProjectionRuntimeView,
  ratifyOpenClawQueuedConversationPreference,
  writeOpenClawConversationPreferenceToStore,
} from "../packages/openclaw-adapter/dist/index.js";
import {
  listHermesConversationPreferenceOwnerRatificationQueue,
  loadLatestHermesProjectionRuntimeView,
  writeHermesConversationPreferenceToStore,
} from "../packages/hermes-adapter/dist/index.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SMOKE_ROOT = join(REPO_ROOT, "examples", "dual-runtime-smoke");
const STORE_ROOT = join(SMOKE_ROOT, ".cristalina-v4");
const OWNER_REF = "actor_owner_dual_runtime_smoke_001";
const AGENT_REF = "actor_agent_dual_runtime_smoke_001";

function toAdapterInput(input) {
  const storeInput = buildConversationPreferenceFlowInput(input);
  const {
    authenticated_principal: _authenticatedPrincipal,
    intake_kind: _intakeKind,
    source: storeSource,
    ...rest
  } = storeInput;
  const { runtime: _runtime, ...source } = storeSource;

  return {
    ...rest,
    authenticated_principal: input.authenticated_principal,
    source,
  };
}

function buildRuntimePreferenceInput(runtime, suffix, principal, statement, sourceMessage, semanticProfileOverrides = {}) {
  const runtimeLabel = runtime === "openclaw" ? "OpenClaw" : "Hermes";
  return toAdapterInput({
    rootDir: STORE_ROOT,
    now: runtime === "openclaw" ? "2026-04-28T10:00:00.000Z" : "2026-04-28T10:15:00.000Z",
    actor: principal.actor_ref,
    authenticated_principal: principal,
    statement,
    validation_scope: `smoke:dual-runtime:${runtime}:${suffix}`,
    ids: {
      agent_identity: AGENT_REF,
      owner_identity: OWNER_REF,
      runtime_instance: `runtime_${runtime}_dual_runtime_smoke_${suffix}`,
      runtime_session: `session_${runtime}_dual_runtime_smoke_${suffix}`,
      conversation_thread: `thread_${runtime}_dual_runtime_smoke_${suffix}`,
      source: `src_${runtime}_dual_runtime_smoke_${suffix}`,
      observation: `obs_${runtime}_dual_runtime_smoke_${suffix}`,
      episode: `ep_${runtime}_dual_runtime_smoke_${suffix}`,
      subject_entity: `ent_subject_${runtime}_dual_runtime_smoke_${suffix}`,
      preference_entity: `ent_preference_${runtime}_dual_runtime_smoke_${suffix}`,
      preference_relation: `rel_preference_${runtime}_dual_runtime_smoke_${suffix}`,
      world_claim: `wcl_${runtime}_dual_runtime_smoke_${suffix}`,
      contradiction: `contra_${runtime}_dual_runtime_smoke_${suffix}`,
      contradiction_resolution: `cres_${runtime}_dual_runtime_smoke_${suffix}`,
      wiki_page: `wpg_${runtime}_dual_runtime_smoke_${suffix}`,
      wiki_claim: `wclm_${runtime}_dual_runtime_smoke_${suffix}`,
      proposal: `prop_${runtime}_dual_runtime_smoke_${suffix}`,
      disposition: `disp_${runtime}_dual_runtime_smoke_${suffix}`,
      ratification: `rat_${runtime}_dual_runtime_smoke_${suffix}`,
      diagnostic: `diag_${runtime}_dual_runtime_smoke_${suffix}`,
      canonical: `mem_${runtime}_dual_runtime_smoke_${suffix}`,
      canon_artifact: `part_${runtime}_dual_runtime_smoke_canon_${suffix}`,
      world_artifact: `part_${runtime}_dual_runtime_smoke_world_${suffix}`,
      wiki_artifact: `part_${runtime}_dual_runtime_smoke_wiki_${suffix}`,
      projection_manifest: `pmf_${runtime}_dual_runtime_smoke_${suffix}`,
    },
    labels: {
      agent: "Cristalina Dual Runtime Smoke Agent",
      owner: "Cristalina Dual Runtime Smoke Owner",
      session_objective: `${runtimeLabel} smoke session writes through Cristalina`,
      session_summary: `${runtimeLabel} smoke session`,
      thread_summary: `${runtimeLabel} smoke thread`,
    },
    semantic_profile: {
      subject: "Cristalina Dual Runtime Smoke Owner",
      wiki_title: "Owner Interaction Preferences",
      wiki_path: "wiki/pages/owner-interaction-preferences.md",
      preference_topic_label: "Owner Interaction Preferences",
      proposal_reason: "Smoke runtime reported an owner preference.",
      ...semanticProfileOverrides,
    },
    source: {
      source_ref: `runtime/${runtime}-dual-runtime-smoke#${suffix}`,
      content_ref: `raw/sources/${runtime}-dual-runtime-smoke-${suffix}.json`,
      runtime,
      message: sourceMessage,
      speaker_ref: principal.actor_ref,
      message_refs: [`msg_${runtime}_dual_runtime_smoke_${suffix}`],
    },
  });
}

async function readLineCount(path) {
  const source = await readFile(path, "utf8");
  return source.trim() ? source.trim().split("\n").length : 0;
}

await rm(STORE_ROOT, { recursive: true, force: true });
await mkdir(SMOKE_ROOT, { recursive: true });

const openClawParticipant = {
  kind: "participant",
  actor_ref: "actor_participant_openclaw_dual_runtime_smoke_001",
};
const ownerPrincipal = {
  kind: "owner",
  actor_ref: OWNER_REF,
};
const hermesOwner = ownerPrincipal;

const openClawWrite = await writeOpenClawConversationPreferenceToStore(
  buildRuntimePreferenceInput(
    "openclaw",
    "001",
    openClawParticipant,
    "The owner prefers concise operational summaries before implementation starts.",
    "A collaborator says the owner prefers concise operational summaries before implementation starts.",
  ),
);

const openClawQueueBefore = await listOpenClawConversationPreferenceOwnerRatificationQueue(STORE_ROOT);
assert.equal(openClawQueueBefore.length, 1);
assert.equal(openClawQueueBefore[0].runtime, "openclaw");

const openClawRatification = await ratifyOpenClawQueuedConversationPreference({
  rootDir: STORE_ROOT,
  queue_id: openClawWrite.records.owner_ratification_queue.id,
  now: "2026-04-28T10:05:00.000Z",
  actor: OWNER_REF,
  authenticated_principal: ownerPrincipal,
  validation_scope: "smoke:dual-runtime:openclaw:owner-ratification",
});
assert.equal(openClawRatification.records.owner_ratification_queue.status, "applied");

const hermesWrite = await writeHermesConversationPreferenceToStore(
  buildRuntimePreferenceInput(
    "hermes",
    "001",
    hermesOwner,
    "The owner prefers runtime bridge changes to preserve explicit authenticated authority.",
    "The owner says runtime bridge changes must preserve explicit authenticated authority.",
    {
      wiki_title: "Runtime Bridge Preferences",
      wiki_path: "wiki/pages/runtime-bridge-preferences.md",
      preference_topic_label: "Runtime Bridge Preferences",
    },
  ),
);
assert.equal(hermesWrite.records.ratification_record.decision, "approved");

const openClawProjection = await loadLatestOpenClawProjectionRuntimeView(STORE_ROOT, {
  consistency_requirement: "allow_mixed_state",
});
const hermesProjection = await loadLatestHermesProjectionRuntimeView(STORE_ROOT, {
  consistency_requirement: "allow_mixed_state",
});

assert.ok(openClawProjection);
assert.ok(hermesProjection);
assert.equal(openClawProjection.manifest.adapter, "openclaw");
assert.equal(hermesProjection.manifest.adapter, "hermes");
assert.equal(openClawProjection.manifest.owner_identity_ref, OWNER_REF);
assert.equal(hermesProjection.manifest.owner_identity_ref, OWNER_REF);

const openClawQueueAfter = await listOpenClawConversationPreferenceOwnerRatificationQueue(STORE_ROOT);
const hermesQueue = await listHermesConversationPreferenceOwnerRatificationQueue(STORE_ROOT);
assert.equal(openClawQueueAfter.length, 0);
assert.equal(hermesQueue.length, 0);

const auditChangeCount = await readLineCount(join(STORE_ROOT, "audits", "changes.log"));
const validationLogCount = await readLineCount(join(STORE_ROOT, "audits", "validation.log"));
assert.ok(auditChangeCount > 0);
assert.ok(validationLogCount > 0);

const summary = {
  store_root: STORE_ROOT,
  owner_identity_ref: OWNER_REF,
  agent_identity_ref: AGENT_REF,
  openclaw: {
    runtime_instance_ref: "runtime_openclaw_dual_runtime_smoke_001",
    runtime_session_ref: "session_openclaw_dual_runtime_smoke_001",
    conversation_thread_ref: "thread_openclaw_dual_runtime_smoke_001",
    projection_manifest_ref: openClawProjection.manifest.id,
    pending_owner_reviews_before_action: 1,
    pending_owner_reviews_after_action: openClawQueueAfter.length,
  },
  hermes: {
    runtime_instance_ref: "runtime_hermes_dual_runtime_smoke_001",
    runtime_session_ref: "session_hermes_dual_runtime_smoke_001",
    conversation_thread_ref: "thread_hermes_dual_runtime_smoke_001",
    projection_manifest_ref: hermesProjection.manifest.id,
    pending_owner_reviews_after_write: hermesQueue.length,
  },
  audit_change_count: auditChangeCount,
  validation_log_count: validationLogCount,
};

await writeFile(join(STORE_ROOT, "smoke-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify(summary, null, 2));
