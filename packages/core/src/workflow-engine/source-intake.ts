import type { SourceIntakeKind, SubjectAuthorityRole } from "../types.js";

export interface RegisteredIntakeProfile<
  TStoreInput,
  TNormalizedSource,
  TSemanticProfile,
  TIntakeArtifacts,
  TDispositionRouting,
  TContradictionDetection = unknown,
  TProjectionInputs = unknown,
> {
  profile_id: string;
  intake_kind: SourceIntakeKind;
  runner_contract_version: "registered_intake_profile.v1";
  source_normalization: (input: TStoreInput) => TNormalizedSource;
  semantic_profile: {
    kind: string;
    resolve: (input: TStoreInput) => TSemanticProfile;
    fingerprint: (profile: TSemanticProfile) => string;
  };
  disposition_routing: (input: {
    input: TStoreInput;
    semantic_profile: TSemanticProfile;
  }) => TDispositionRouting;
  proposal_emission: (input: {
    input: TStoreInput;
    source_record: TNormalizedSource;
  }) => TIntakeArtifacts;
  contradiction_detection?: (input: {
    input: TStoreInput;
    source_record: TNormalizedSource;
    intake: TIntakeArtifacts;
  }) => TContradictionDetection;
  projection_recompilation_inputs: (input: {
    input: TStoreInput;
    source_record: TNormalizedSource;
    intake: TIntakeArtifacts;
  }) => TProjectionInputs;
}

export interface PreferenceSignalSemanticProfile {
  observation_prefix?: string;
  episode_summary: string;
  wiki_title: string;
  wiki_path: string;
  subject_ref?: string;
  proposal_reason: string;
  subject_entity_kind: string;
  subject_label: string;
  subject_authority_role: SubjectAuthorityRole;
  preference_topic_label: string;
  relation_type: string;
}

const DEFAULT_PREFERENCE_SIGNAL_PROFILE: Record<SourceIntakeKind, Omit<PreferenceSignalSemanticProfile, "subject_label">> = {
  conversation_preference: {
    episode_summary: "Conversation produced a bounded preference episode.",
    wiki_title: "User Interaction Preferences",
    wiki_path: "wiki/pages/user-interaction-preferences.md",
    proposal_reason: "Conversation indicates a user interaction preference that should become governed memory.",
    subject_entity_kind: "participant",
    subject_authority_role: "participant",
    preference_topic_label: "User Interaction Preferences",
    relation_type: "expressed_preference",
  },
  openclaw_projection_feedback: {
    observation_prefix: "OpenClaw runtime feedback: ",
    episode_summary: "Runtime feedback produced a bounded preference episode.",
    wiki_title: "Runtime Preference Feedback",
    wiki_path: "wiki/pages/runtime-preference-feedback.md",
    proposal_reason: "OpenClaw runtime feedback indicates a user interaction preference that should become governed memory.",
    subject_entity_kind: "participant",
    subject_authority_role: "participant",
    preference_topic_label: "User Interaction Preferences",
    relation_type: "expressed_preference",
  },
  structured_preference_signal: {
    observation_prefix: "Structured preference signal: ",
    episode_summary: "Structured source produced a bounded preference episode.",
    wiki_title: "Structured Preference Signals",
    wiki_path: "wiki/pages/structured-preference-signals.md",
    proposal_reason: "Structured evidence indicates a user interaction preference that should become governed memory.",
    subject_entity_kind: "participant",
    subject_authority_role: "participant",
    preference_topic_label: "Preference Signal",
    relation_type: "expressed_preference",
  },
};

export function resolvePreferenceSignalSemanticProfile(input: {
  kind: SourceIntakeKind;
  overrides?: Partial<PreferenceSignalSemanticProfile>;
}): PreferenceSignalSemanticProfile {
  const defaults = DEFAULT_PREFERENCE_SIGNAL_PROFILE[input.kind];

  return {
    ...defaults,
    subject_label: "Conversation Participant",
    ...input.overrides,
  };
}
