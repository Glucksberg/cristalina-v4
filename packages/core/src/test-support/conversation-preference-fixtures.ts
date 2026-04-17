import type { ConversationPreferenceStoreInput } from "../workflow-engine/conversation-preference-store.js";

export interface ConversationPreferenceFlowInputFixtureInput {
  rootDir: string;
  now: string;
  actor: string;
  statement: string;
  validation_scope: string;
  ids: {
    agent_identity: string;
    owner_identity: string;
    runtime_instance: string;
    runtime_session: string;
    conversation_thread: string;
    source: string;
    observation: string;
    episode: string;
    subject_entity: string;
    preference_entity: string;
    preference_relation: string;
    world_claim: string;
    contradiction: string;
    contradiction_resolution: string;
    wiki_page: string;
    wiki_claim: string;
    proposal: string;
    disposition: string;
    ratification: string;
    diagnostic: string;
    canonical: string;
    canon_artifact: string;
    world_artifact: string;
    wiki_artifact: string;
    projection_manifest: string;
  };
  labels: {
    agent: string;
    owner: string;
    session_objective: string;
    session_summary: string;
    thread_summary: string;
  };
  semantic_profile?: {
    subject: string;
    wiki_title: string;
    wiki_path: string;
    preference_topic_label: string;
    proposal_reason: string;
  };
  source: {
    source_ref: string;
    content_ref: string;
    runtime: "openclaw";
    message: string;
    speaker_ref?: string;
    message_refs: string[];
  };
}

export function buildConversationPreferenceFlowInput(
  input: ConversationPreferenceFlowInputFixtureInput,
): ConversationPreferenceStoreInput {
  return {
    rootDir: input.rootDir,
    now: input.now,
    actor: input.actor,
    statement: input.statement,
    identity_context: {
      runtime: "openclaw",
      ids: {
        agent_identity: input.ids.agent_identity,
        owner_identity: input.ids.owner_identity,
        runtime_instance: input.ids.runtime_instance,
        runtime_session: input.ids.runtime_session,
        conversation_thread: input.ids.conversation_thread,
      },
      agent_label: input.labels.agent,
      owner_label: input.labels.owner,
      session_objective: input.labels.session_objective,
      session_summary: input.labels.session_summary,
      message_refs: input.source.message_refs,
      thread_summary: input.labels.thread_summary,
    },
    source: {
      id: input.ids.source,
      source_ref: input.source.source_ref,
      content_ref: input.source.content_ref,
      runtime: input.source.runtime,
      message: input.source.message,
      ...(input.source.speaker_ref ? { speaker_ref: input.source.speaker_ref } : {}),
    },
    ...(input.semantic_profile
      ? {
          semantic_profile: {
            subject_entity_kind: "owner" as const,
            subject_authority_role: "owner" as const,
            subject_label: input.semantic_profile.subject,
            wiki_title: input.semantic_profile.wiki_title,
            wiki_path: input.semantic_profile.wiki_path,
            preference_topic_label: input.semantic_profile.preference_topic_label,
            relation_type: "expressed_preference" as const,
            proposal_reason: input.semantic_profile.proposal_reason,
          },
        }
      : {}),
    ids: {
      observation: input.ids.observation,
      episode: input.ids.episode,
      subject_entity: input.ids.subject_entity,
      preference_entity: input.ids.preference_entity,
      preference_relation: input.ids.preference_relation,
      world_claim: input.ids.world_claim,
      contradiction: input.ids.contradiction,
      contradiction_resolution: input.ids.contradiction_resolution,
      wiki_page: input.ids.wiki_page,
      wiki_claim: input.ids.wiki_claim,
      proposal: input.ids.proposal,
      disposition: input.ids.disposition,
      ratification: input.ids.ratification,
      diagnostic: input.ids.diagnostic,
      canonical: input.ids.canonical,
      canon_artifact: input.ids.canon_artifact,
      world_artifact: input.ids.world_artifact,
      wiki_artifact: input.ids.wiki_artifact,
      projection_manifest: input.ids.projection_manifest,
    },
    validation_scope: input.validation_scope,
  };
}

export function buildDefaultConversationPreferenceFlowInput(rootDir: string): ConversationPreferenceStoreInput {
  return buildConversationPreferenceFlowInput({
    rootDir,
    now: "2026-04-12T00:00:00.000Z",
    actor: "system:test",
    statement: "The user prefers concise answers unless they explicitly ask for depth.",
    validation_scope: "test:conversation-preference",
    ids: {
      agent_identity: "actor_agent_test_001",
      owner_identity: "actor_owner_test_001",
      runtime_instance: "runtime_test_001",
      runtime_session: "session_test_001",
      conversation_thread: "thread_test_001",
      source: "src_test_001",
      observation: "obs_test_001",
      episode: "ep_test_001",
      subject_entity: "ent_subject_test_001",
      preference_entity: "ent_preference_test_001",
      preference_relation: "rel_preference_test_001",
      world_claim: "wcl_test_001",
      contradiction: "contra_test_001",
      contradiction_resolution: "cres_test_001",
      wiki_page: "wpg_test_001",
      wiki_claim: "wclm_test_001",
      proposal: "prop_test_001",
      disposition: "disp_test_001",
      ratification: "rat_test_001",
      diagnostic: "diag_test_001",
      canonical: "mem_test_001",
      canon_artifact: "part_openclaw_canon_test_001",
      world_artifact: "part_openclaw_world_test_001",
      wiki_artifact: "part_openclaw_wiki_test_001",
      projection_manifest: "pmf_openclaw_test_001",
    },
    labels: {
      agent: "Cristalina Test Agent",
      owner: "Test Owner",
      session_objective: "Track stable interaction preferences",
      session_summary: "Session summary",
      thread_summary: "OpenClaw thread summary",
    },
    source: {
      source_ref: "runtime/session-test#turn-001",
      content_ref: "raw/sources/conversation-turn-test-001.json",
      runtime: "openclaw",
      message: "The user says they prefer concise answers unless they explicitly ask for depth.",
      message_refs: ["msg_test_001"],
    },
  });
}
