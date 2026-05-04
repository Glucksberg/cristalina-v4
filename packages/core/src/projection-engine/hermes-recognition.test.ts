import assert from "node:assert/strict";
import test from "node:test";

import {
  compileHermesRecognitionProjection,
  formatHermesRecognitionContext,
  HERMES_RECOGNITION_PROJECTION_PROFILE,
} from "./hermes-recognition.js";
import type { ActorIdentity, CanonicalMemoryObject, Entity, WikiPage, WorldClaim } from "../types.js";

const now = "2026-05-03T12:00:00.000Z";

function provenance(source_ref: string) {
  return {
    source_type: "test_fixture",
    source_ref,
    evidence_refs: [source_ref],
  };
}

test("Hermes recognition projection compiles recognition, hydration, and archive descent context", () => {
  const actor: ActorIdentity = {
    id: "actor_cristal_001",
    kind: "actor_identity",
    layer: "canon",
    authoritative_home: "canon",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("tests/hermes-recognition/actor"),
    actor_kind: "agent",
    label: "Cristal",
    status: "active",
    aliases: ["Cristalina Hermes agent"],
  };
  const entity: Entity = {
    id: "ent_fluck_001",
    kind: "entity",
    layer: "world",
    authoritative_home: "world",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("tests/hermes-recognition/entity"),
    entity_kind: "agent_lineage",
    label: "Fluck",
    status: "active",
  };
  const canon: CanonicalMemoryObject = {
    id: "mem_memory_goal_001",
    kind: "goal",
    layer: "canon",
    authoritative_home: "canon",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "owner_private" },
    provenance: {
      ...provenance("tests/hermes-recognition/canon"),
      actor_ref: "actor_owner_001",
    },
    statement: "Cristal should improve her own memory through X research.",
    semantic_slot: "cristal.memory.goal",
    epistemic_state: "confirmed",
    temporal_state: { temporal_status: "active" },
    governance_state: "ratified",
    owner_identity_ref: "actor_owner_001",
  };
  const suppressedCanon: CanonicalMemoryObject = {
    ...canon,
    id: "mem_other_owner_001",
    statement: "Another owner has a private memory.",
    provenance: {
      ...provenance("tests/hermes-recognition/suppressed"),
      actor_ref: "actor_owner_other",
    },
    owner_identity_ref: "actor_owner_other",
  };
  const world: WorldClaim = {
    id: "wcl_memory_pattern_001",
    kind: "fact",
    layer: "world",
    authoritative_home: "world",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("tests/hermes-recognition/world"),
    statement: "Recognition should happen before archive descent.",
    semantic_slot: "memory.pattern",
    temporal_state: { temporal_status: "active" },
    epistemic_state: "observed",
    support_refs: ["src_memory_pattern_001"],
  };
  const wiki: WikiPage = {
    id: "wpg_agent_memory_research_001",
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "shareable" },
    provenance: provenance("tests/hermes-recognition/wiki"),
    page_kind: "research_question",
    title: "Agent Memory Research",
    path: "wiki/pages/agent-memory-research.md",
    source_refs: ["src_memory_pattern_001"],
    canonical_refs: [canon.id],
    world_refs: [world.id],
    index_summary: "Research page tracking memory provider patterns.",
  };

  const result = compileHermesRecognitionProjection({
    now,
    visibility_state: { privacy_scope: "shareable" },
    read_context: {
      adapter: "hermes",
      audience: "memory_provider",
      actor_identity_ref: "actor_cristal_001",
      owner_identity_ref: "actor_owner_001",
    },
    ids: {
      json_artifact: "part_hermes_recognition_json_test_001",
      context_artifact: "part_hermes_recognition_context_test_001",
      manifest: "pmf_hermes_recognition_test_001",
    },
    actor_identities: [actor],
    entities: [entity],
    canonical_records: [canon, suppressedCanon],
    world_claims: [world],
    wiki_pages: [wiki],
  });

  assert.equal(result.snapshot.projection_profile, HERMES_RECOGNITION_PROJECTION_PROFILE);
  assert.ok(result.snapshot.recognition_index.some((entry) => entry.target_ref === "ent_fluck_001"));
  assert.ok(result.snapshot.hydration_cards.some((card) => card.target_ref === "mem_memory_goal_001"));
  assert.ok(result.snapshot.suppressed_records.some((record) => record.id === "mem_other_owner_001"));
  assert.equal(result.manifest.projection_profile, HERMES_RECOGNITION_PROJECTION_PROFILE);
  assert.deepEqual(result.manifest.artifact_refs, [
    "part_hermes_recognition_json_test_001",
    "part_hermes_recognition_context_test_001",
  ]);

  const context = formatHermesRecognitionContext(result.snapshot, "Fluck memory");
  assert.match(context, /## Cristalina Memory/);
  assert.match(context, /Fluck/);
  assert.match(context, /Archive Descent/);
  assert.doesNotMatch(context, /Another owner/);
});
