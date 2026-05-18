import assert from "node:assert/strict";
import test from "node:test";

import {
  compileHermesRecognitionProjection,
  formatHermesRecognitionContext,
  HERMES_RECOGNITION_PROJECTION_PROFILE,
} from "./hermes-recognition.js";
import type { ActorIdentity, CanonicalMemoryObject, Entity, Episode, Observation, WikiPage, WorldClaim } from "../types.js";

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
  const observation: Observation = {
    id: "obs_hermes_turn_001",
    kind: "observation",
    layer: "runtime",
    authoritative_home: "runtime",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "owner_private" },
    provenance: {
      ...provenance("tests/hermes-recognition/observation"),
      actor_ref: "actor_owner_001",
    },
    summary: JSON.stringify({
      message: "Cristal noticed the native memory provider is active during the Hermes test.",
    }),
    epistemic_state: "observed",
    observed_at: now,
    runtime_instance_ref: "runtime_hermes_local_001",
    runtime_session_ref: "session_hermes_test_001",
    conversation_thread_ref: "thread_hermes_test_001",
  };
  const newerSafiraRuntimeNoise: Observation[] = Array.from({ length: 10 }, (_, index) => ({
    ...observation,
    id: `obs_safira_runtime_noise_${index + 1}`,
    created_at: `2026-05-03T12:${String(index + 1).padStart(2, "0")}:00.000Z`,
    updated_at: `2026-05-03T12:${String(index + 1).padStart(2, "0")}:00.000Z`,
    provenance: {
      ...provenance(`tests/hermes-recognition/runtime-noise-${index + 1}`),
      actor_ref: "actor_owner_001",
    },
    summary: JSON.stringify({
      message: `Runtime mention ${index + 1}: Safira, Postgres, and SQLite were discussed during the memory test.`,
    }),
  }));
  const episode: Episode = {
    id: "epi_safira_fixture_001",
    kind: "episode",
    layer: "world",
    authoritative_home: "world",
    created_at: now,
    updated_at: now,
    visibility_state: { privacy_scope: "owner_private" },
    provenance: {
      ...provenance("tests/hermes-recognition/episode"),
      actor_ref: "actor_owner_001",
    },
    summary: "Safira was a fictional memory-test project: Postgres was corrected to SQLite local; use only as test evidence.",
    observation_refs: [observation.id],
    temporal_state: { temporal_status: "active", valid_from: now, valid_to: null },
    semantic_slot: "agent_memory.governance.fictional_examples_runtime_only",
    episode_type: "fictional_example_episode",
    entity_refs: [{ id: "ent_safira_001", kind: "entity", layer: "world" }],
    scope_tags: ["memory_test", "non_operational", "not_user_project_fact"],
    purpose: "Test fictional example correction and supersession without operationalizing the fixture.",
    lifecycle_state: "retained_as_test_evidence",
    claims: [
      { statement: "Projeto Safira uses Postgres.", status: "superseded", authority: "runtime_observed", scope: "fictional_test_only" },
      { statement: "Projeto Safira uses SQLite local.", status: "current_within_test", authority: "user_correction_observed", scope: "fictional_test_only" },
    ],
    supersession: {
      from: "Projeto Safira uses Postgres.",
      to: "Projeto Safira uses SQLite local.",
      relation: "correction",
      reason: "explicit_user_correction",
    },
    usage_policy: {
      allowed: ["explain the memory test", "diagnose correction handling"],
      forbidden: ["treat Safira as a real Markus project", "use as an operational project stack"],
    },
    linked_governance_slots: ["agent_memory.governance.fictional_examples_runtime_only"],
    projection_hint: "Safira was a fictional memory-test project: Postgres was corrected to SQLite local; use only as test evidence.",
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
      runtime_instance_ref: "runtime_hermes_local_001",
      runtime_session_ref: "session_hermes_test_001",
      conversation_thread_ref: "thread_hermes_test_001",
    },
    ids: {
      json_artifact: "part_hermes_recognition_json_test_001",
      context_artifact: "part_hermes_recognition_context_test_001",
      manifest: "pmf_hermes_recognition_test_001",
    },
    actor_identities: [actor],
    entities: [entity],
    runtime_observations: [observation, ...newerSafiraRuntimeNoise],
    canonical_records: [canon, suppressedCanon, suppressedCanon],
    world_claims: [world],
    episodes: [episode],
    wiki_pages: [wiki],
  });

  assert.equal(result.snapshot.projection_profile, HERMES_RECOGNITION_PROJECTION_PROFILE);
  assert.ok(result.snapshot.recognition_index.some((entry) => entry.target_ref === "ent_fluck_001"));
  assert.ok(result.snapshot.recognition_index.some((entry) => entry.target_ref === "obs_hermes_turn_001"));
  assert.ok(result.snapshot.hydration_cards.some((card) => card.target_ref === "mem_memory_goal_001"));
  assert.ok(result.snapshot.recognition_index.some((entry) => entry.target_ref === "mem_memory_goal_001" && entry.semantic_slot === "cristal.memory.goal"));
  assert.ok(result.snapshot.recognition_index.some((entry) => entry.target_ref === "wcl_memory_pattern_001" && entry.semantic_slot === "memory.pattern"));
  assert.ok(result.snapshot.recognition_index.some((entry) => entry.target_ref === "epi_safira_fixture_001" && entry.authority_label === "world/episode/fictional_example_episode"));
  assert.ok(result.snapshot.recognition_index.some((entry) => entry.target_ref === "epi_safira_fixture_001" && entry.semantic_slot === "agent_memory.governance.fictional_examples_runtime_only"));
  assert.ok(result.snapshot.hydration_cards.some((card) => card.target_ref === "wcl_memory_pattern_001" && card.semantic_slot === "memory.pattern"));
  assert.ok(result.snapshot.suppressed_records.some((record) => record.id === "mem_other_owner_001"));
  assert.equal(result.snapshot.suppressed_records.filter((record) => record.id === "mem_other_owner_001").length, 1);
  assert.deepEqual(result.manifest.suppressed_refs, ["mem_other_owner_001"]);
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

  const nativeProviderContext = formatHermesRecognitionContext(result.snapshot, "native provider active");
  assert.match(nativeProviderContext, /native memory provider is active/);

  const memoryGoalContext = formatHermesRecognitionContext(result.snapshot, "cristal.memory.goal");
  assert.match(memoryGoalContext, /semantic_slot=cristal\.memory\.goal/);

  const semanticSlotContext = formatHermesRecognitionContext(result.snapshot, "memory.pattern");
  assert.match(semanticSlotContext, /Recognition should happen before archive descent/);
  assert.match(semanticSlotContext, /semantic_slot=memory\.pattern/);

  const episodeContext = formatHermesRecognitionContext(result.snapshot, "Safira SQLite correction");
  assert.match(episodeContext, /Safira was a fictional memory-test project/);
  assert.match(episodeContext, /Postgres was corrected to SQLite local/);
  assert.match(episodeContext, /world\/episode\/fictional_example_episode/);
  assert.match(episodeContext, /semantic_slot=agent_memory\.governance\.fictional_examples_runtime_only/);
  assert.ok(episodeContext.indexOf("epi_safira_fixture_001") < episodeContext.indexOf("obs_safira_runtime_noise_10"));
});
