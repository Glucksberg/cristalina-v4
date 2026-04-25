import {
  applyQueuedConversationPreferenceManualContradictionReviewToStore,
  expireQueuedConversationPreferenceProposalToStore,
  expireQueuedConversationPreferenceManualContradictionReviewToStore,
  listConversationPreferenceManualContradictionReviewQueue,
  listConversationPreferenceOwnerRatificationQueue,
  ratifyQueuedConversationPreferenceProposalToStore,
  rejectQueuedConversationPreferenceProposalToStore,
  writeConversationPreferenceFlowToStore,
  writePreferenceFeedbackFlowToStore,
  type AuthenticatedPrincipal,
  type ConversationPreferenceManualContradictionReviewQueueEntry,
  type ConversationPreferenceOwnerRatificationQueueEntry,
  type ConversationPreferenceQueuedExpirationInput,
  type ConversationPreferenceQueuedManualContradictionExpirationInput,
  type ConversationPreferenceQueuedManualContradictionReviewInput,
  type ConversationPreferenceQueuedRatificationInput,
  type ConversationPreferenceQueuedRejectionInput,
  type ConversationPreferenceResolutionStoreResult,
  type ConversationPreferenceStoreInput,
  type ConversationPreferenceStoreResult,
} from "@cristalina-v4/core";

const HERMES_RUNTIME = "hermes";

export type HermesAuthenticatedPrincipal = AuthenticatedPrincipal;
export type HermesConversationPreferenceOwnerRatificationQueueEntry =
  ConversationPreferenceOwnerRatificationQueueEntry;
export type HermesConversationPreferenceManualContradictionReviewQueueEntry =
  ConversationPreferenceManualContradictionReviewQueueEntry;

export interface HermesConversationPreferenceWriteInput
  extends Omit<ConversationPreferenceStoreInput, "intake_kind" | "source" | "authenticated_principal"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
  source: Omit<ConversationPreferenceStoreInput["source"], "runtime">;
}

export interface HermesProjectionFeedbackWriteInput
  extends Omit<ConversationPreferenceStoreInput, "intake_kind" | "source" | "authenticated_principal"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
  source: Omit<ConversationPreferenceStoreInput["source"], "runtime">;
}

export interface HermesQueuedRatificationInput
  extends Omit<ConversationPreferenceQueuedRatificationInput, "authenticated_principal" | "expected_runtime"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
}

export interface HermesQueuedRejectionInput
  extends Omit<ConversationPreferenceQueuedRejectionInput, "authenticated_principal" | "expected_runtime"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
}

export interface HermesQueuedExpirationInput
  extends Omit<ConversationPreferenceQueuedExpirationInput, "authenticated_principal" | "expected_runtime"> {
  authenticated_principal: HermesAuthenticatedPrincipal;
}

export interface HermesQueuedManualContradictionReviewInput
  extends Omit<
    ConversationPreferenceQueuedManualContradictionReviewInput,
    "authenticated_principal" | "expected_runtime"
  > {
  authenticated_principal: HermesAuthenticatedPrincipal;
}

export interface HermesQueuedManualContradictionExpirationInput
  extends Omit<
    ConversationPreferenceQueuedManualContradictionExpirationInput,
    "authenticated_principal" | "expected_runtime"
  > {
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
      runtime: HERMES_RUNTIME,
    },
  });
}

export async function writeHermesProjectionFeedbackToStore(
  input: HermesProjectionFeedbackWriteInput,
): Promise<ConversationPreferenceStoreResult> {
  const authenticated_principal = requireAuthenticatedPrincipal(input.authenticated_principal);
  return writePreferenceFeedbackFlowToStore({
    ...input,
    authenticated_principal,
    source: {
      ...input.source,
      runtime: HERMES_RUNTIME,
    },
  });
}

export async function listHermesConversationPreferenceOwnerRatificationQueue(
  rootDir: string,
): Promise<HermesConversationPreferenceOwnerRatificationQueueEntry[]> {
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  return queue.filter((entry) => entry.runtime === HERMES_RUNTIME);
}

export async function listHermesConversationPreferenceManualContradictionReviewQueue(
  rootDir: string,
): Promise<HermesConversationPreferenceManualContradictionReviewQueueEntry[]> {
  const queue = await listConversationPreferenceManualContradictionReviewQueue(rootDir);
  return queue.filter((entry) => entry.runtime === HERMES_RUNTIME);
}

export async function ratifyHermesQueuedConversationPreference(
  input: HermesQueuedRatificationInput,
): Promise<ConversationPreferenceStoreResult> {
  return ratifyQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: HERMES_RUNTIME,
  });
}

export async function rejectHermesQueuedConversationPreference(
  input: HermesQueuedRejectionInput,
): Promise<ConversationPreferenceStoreResult> {
  return rejectQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: HERMES_RUNTIME,
  });
}

export async function expireHermesQueuedConversationPreference(
  input: HermesQueuedExpirationInput,
): Promise<ConversationPreferenceStoreResult> {
  return expireQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: HERMES_RUNTIME,
  });
}

export async function applyHermesQueuedConversationPreferenceManualContradictionReview(
  input: HermesQueuedManualContradictionReviewInput,
): Promise<ConversationPreferenceResolutionStoreResult> {
  return applyQueuedConversationPreferenceManualContradictionReviewToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: HERMES_RUNTIME,
  });
}

export async function expireHermesQueuedConversationPreferenceManualContradictionReview(
  input: HermesQueuedManualContradictionExpirationInput,
): Promise<ConversationPreferenceResolutionStoreResult> {
  return expireQueuedConversationPreferenceManualContradictionReviewToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: HERMES_RUNTIME,
  });
}
