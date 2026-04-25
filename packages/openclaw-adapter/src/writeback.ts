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

const OPENCLAW_RUNTIME = "openclaw";

export type OpenClawAuthenticatedPrincipal = AuthenticatedPrincipal;
export type OpenClawConversationPreferenceOwnerRatificationQueueEntry =
  ConversationPreferenceOwnerRatificationQueueEntry;
export type OpenClawConversationPreferenceManualContradictionReviewQueueEntry =
  ConversationPreferenceManualContradictionReviewQueueEntry;

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
  extends Omit<ConversationPreferenceQueuedRatificationInput, "authenticated_principal" | "expected_runtime"> {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
}

export interface OpenClawQueuedRejectionInput
  extends Omit<ConversationPreferenceQueuedRejectionInput, "authenticated_principal" | "expected_runtime"> {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
}

export interface OpenClawQueuedExpirationInput
  extends Omit<ConversationPreferenceQueuedExpirationInput, "authenticated_principal" | "expected_runtime"> {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
}

export interface OpenClawQueuedManualContradictionReviewInput
  extends Omit<
    ConversationPreferenceQueuedManualContradictionReviewInput,
    "authenticated_principal" | "expected_runtime"
  > {
  authenticated_principal: OpenClawAuthenticatedPrincipal;
}

export interface OpenClawQueuedManualContradictionExpirationInput
  extends Omit<
    ConversationPreferenceQueuedManualContradictionExpirationInput,
    "authenticated_principal" | "expected_runtime"
  > {
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
      runtime: OPENCLAW_RUNTIME,
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
      runtime: OPENCLAW_RUNTIME,
    },
  });
}

export async function listOpenClawConversationPreferenceOwnerRatificationQueue(
  rootDir: string,
): Promise<OpenClawConversationPreferenceOwnerRatificationQueueEntry[]> {
  const queue = await listConversationPreferenceOwnerRatificationQueue(rootDir);
  return queue.filter((entry) => entry.runtime === OPENCLAW_RUNTIME);
}

export async function listOpenClawConversationPreferenceManualContradictionReviewQueue(
  rootDir: string,
): Promise<OpenClawConversationPreferenceManualContradictionReviewQueueEntry[]> {
  const queue = await listConversationPreferenceManualContradictionReviewQueue(rootDir);
  return queue.filter((entry) => entry.runtime === OPENCLAW_RUNTIME);
}

export async function ratifyOpenClawQueuedConversationPreference(
  input: OpenClawQueuedRatificationInput,
): Promise<ConversationPreferenceStoreResult> {
  return ratifyQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: OPENCLAW_RUNTIME,
  });
}

export async function rejectOpenClawQueuedConversationPreference(
  input: OpenClawQueuedRejectionInput,
): Promise<ConversationPreferenceStoreResult> {
  return rejectQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: OPENCLAW_RUNTIME,
  });
}

export async function expireOpenClawQueuedConversationPreference(
  input: OpenClawQueuedExpirationInput,
): Promise<ConversationPreferenceStoreResult> {
  return expireQueuedConversationPreferenceProposalToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: OPENCLAW_RUNTIME,
  });
}

export async function applyOpenClawQueuedConversationPreferenceManualContradictionReview(
  input: OpenClawQueuedManualContradictionReviewInput,
): Promise<ConversationPreferenceResolutionStoreResult> {
  return applyQueuedConversationPreferenceManualContradictionReviewToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: OPENCLAW_RUNTIME,
  });
}

export async function expireOpenClawQueuedConversationPreferenceManualContradictionReview(
  input: OpenClawQueuedManualContradictionExpirationInput,
): Promise<ConversationPreferenceResolutionStoreResult> {
  return expireQueuedConversationPreferenceManualContradictionReviewToStore({
    ...input,
    authenticated_principal: requireAuthenticatedPrincipal(input.authenticated_principal),
    expected_runtime: OPENCLAW_RUNTIME,
  });
}
