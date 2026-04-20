import {
  expireQueuedConversationPreferenceProposalToStore,
  ratifyQueuedConversationPreferenceProposalToStore,
  rejectQueuedConversationPreferenceProposalToStore,
  writeConversationPreferenceFlowToStore,
  type AuthenticatedPrincipal,
  type ConversationPreferenceQueuedExpirationInput,
  type ConversationPreferenceQueuedRatificationInput,
  type ConversationPreferenceQueuedRejectionInput,
  type ConversationPreferenceStoreInput,
  type ConversationPreferenceStoreResult,
} from "../../core/dist/index.js";

export type HermesAuthenticatedPrincipal = AuthenticatedPrincipal;

export interface HermesConversationPreferenceWriteInput
  extends Omit<ConversationPreferenceStoreInput, "intake_kind" | "source" | "authenticated_principal"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
  source: Omit<ConversationPreferenceStoreInput["source"], "runtime">;
}

export interface HermesQueuedRatificationInput
  extends Omit<ConversationPreferenceQueuedRatificationInput, "authenticated_principal"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
}

export interface HermesQueuedRejectionInput
  extends Omit<ConversationPreferenceQueuedRejectionInput, "authenticated_principal"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
}

export interface HermesQueuedExpirationInput
  extends Omit<ConversationPreferenceQueuedExpirationInput, "authenticated_principal"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
}

function requireAuthenticatedPrincipal(principal: HermesAuthenticatedPrincipal | undefined): HermesAuthenticatedPrincipal {
  if (!principal) {
    throw new Error("Hermes adapter writeback requires an authenticated_principal");
  }

  return principal;
}

export async function writeHermesConversationPreferenceToStore(
  input: HermesConversationPreferenceWriteInput,
): Promise<ConversationPreferenceStoreResult> {
  const authenticated_principal = requireAuthenticatedPrincipal(input.authenticated_principal);
  return writeConversationPreferenceFlowToStore({
    ...input,
    authenticated_principal,
    source: {
      ...input.source,
      runtime: "hermes",
    },
  });
}

export async function ratifyHermesQueuedConversationPreference(
  input: HermesQueuedRatificationInput,
): Promise<ConversationPreferenceStoreResult> {
  return ratifyQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
  });
}

export async function rejectHermesQueuedConversationPreference(
  input: HermesQueuedRejectionInput,
): Promise<ConversationPreferenceStoreResult> {
  return rejectQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
  });
}

export async function expireHermesQueuedConversationPreference(
  input: HermesQueuedExpirationInput,
): Promise<ConversationPreferenceStoreResult> {
  return expireQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
  });
}
