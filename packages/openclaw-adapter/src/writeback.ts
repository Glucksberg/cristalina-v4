import {
  expireQueuedConversationPreferenceProposalToStore,
  ratifyQueuedConversationPreferenceProposalToStore,
  rejectQueuedConversationPreferenceProposalToStore,
  writeConversationPreferenceFlowToStore,
  writePreferenceFeedbackFlowToStore,
  type AuthenticatedPrincipal,
  type ConversationPreferenceQueuedExpirationInput,
  type ConversationPreferenceQueuedRatificationInput,
  type ConversationPreferenceQueuedRejectionInput,
  type ConversationPreferenceStoreInput,
  type ConversationPreferenceStoreResult,
} from "../../core/dist/index.js";

export type OpenClawAuthenticatedPrincipal = AuthenticatedPrincipal;

export interface OpenClawConversationPreferenceWriteInput
  extends Omit<ConversationPreferenceStoreInput, "intake_kind" | "source" | "authenticated_principal"> {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
  source: Omit<ConversationPreferenceStoreInput["source"], "runtime">;
}

export interface OpenClawProjectionFeedbackWriteInput
  extends Omit<ConversationPreferenceStoreInput, "intake_kind" | "source" | "authenticated_principal"> {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
  source: Omit<ConversationPreferenceStoreInput["source"], "runtime">;
}

export interface OpenClawQueuedRatificationInput
  extends Omit<ConversationPreferenceQueuedRatificationInput, "authenticated_principal"> {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
}

export interface OpenClawQueuedRejectionInput
  extends Omit<ConversationPreferenceQueuedRejectionInput, "authenticated_principal"> {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
}

export interface OpenClawQueuedExpirationInput
  extends Omit<ConversationPreferenceQueuedExpirationInput, "authenticated_principal"> {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
}

function requireAuthenticatedPrincipal(principal: OpenClawAuthenticatedPrincipal | undefined): OpenClawAuthenticatedPrincipal {
  if (!principal) {
    throw new Error("OpenClaw adapter writeback requires an authenticated_principal");
  }

  return principal;
}

export async function writeOpenClawConversationPreferenceToStore(
  input: OpenClawConversationPreferenceWriteInput,
): Promise<ConversationPreferenceStoreResult> {
  const authenticated_principal = requireAuthenticatedPrincipal(input.authenticated_principal);
  return writeConversationPreferenceFlowToStore({
    ...input,
    authenticated_principal,
    source: {
      ...input.source,
      runtime: "openclaw",
    },
  });
}

export async function writeOpenClawProjectionFeedbackToStore(
  input: OpenClawProjectionFeedbackWriteInput,
): Promise<ConversationPreferenceStoreResult> {
  const authenticated_principal = requireAuthenticatedPrincipal(input.authenticated_principal);
  return writePreferenceFeedbackFlowToStore({
    ...input,
    authenticated_principal,
    source: {
      ...input.source,
      runtime: "openclaw",
    },
  });
}

export async function ratifyOpenClawQueuedConversationPreference(
  input: OpenClawQueuedRatificationInput,
): Promise<ConversationPreferenceStoreResult> {
  return ratifyQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
  });
}

export async function rejectOpenClawQueuedConversationPreference(
  input: OpenClawQueuedRejectionInput,
): Promise<ConversationPreferenceStoreResult> {
  return rejectQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
  });
}

export async function expireOpenClawQueuedConversationPreference(
  input: OpenClawQueuedExpirationInput,
): Promise<ConversationPreferenceStoreResult> {
  return expireQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
  });
}
