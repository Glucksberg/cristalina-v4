import {
  loadCanonicalRecords,
  loadCurationPackets,
  loadDiagnostics,
  loadProposals,
} from "./store/io.js";
import type { CanonicalMemoryObject, CurationPacket, Diagnostic, Proposal } from "./types.js";

export interface OwnerDecisionRequest {
  proposal_ref: string;
  claim_ref: string;
  semantic_slot: string | null;
  statement: string | null;
  candidate_kind: string;
  proposal_status: Proposal["governance_state"];
  promotion_requirement: Proposal["promotion_requirement"] | null;
  epistemic_state: string | null;
  temporal_status: string | null;
  diagnostic_ref: string | null;
  diagnostic_code: string | null;
  curation_ref: string | null;
  curation_status: CurationPacket["status"] | null;
  existing_canon_refs: string[];
  allowed_actions: Array<"ratify" | "keep_maturing" | "subsume" | "reject" | "move_to_wiki">;
  question: string;
  evidence_refs: string[];
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function temporalStatus(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  return stringField((value as { temporal_status?: unknown }).temporal_status);
}

function claimRef(proposal: Proposal): string {
  return stringField(proposal.provenance.source_ref) ?? proposal.id;
}

function matchingDiagnostic(proposal: Proposal, diagnostics: Diagnostic[]): Diagnostic | undefined {
  return diagnostics
    .filter((diagnostic) =>
      diagnostic.code === "proposal_deferred" &&
      diagnostic.related_refs.includes(proposal.id) &&
      diagnostic.message.includes("owner_ratification_required")
    )
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
}

function matchingCurationPacket(proposal: Proposal, packets: CurationPacket[]): CurationPacket | undefined {
  return packets
    .filter((packet) => packet.proposal_refs.includes(proposal.id))
    .sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
}

function sameSlotCanonRefs(semanticSlot: string | null, records: CanonicalMemoryObject[]): string[] {
  if (!semanticSlot) return [];
  return records
    .filter((record) => record.semantic_slot === semanticSlot)
    .map((record) => record.id)
    .sort();
}

function ownerQuestion(input: {
  statement: string | null;
  existingCanonRefs: string[];
}): string {
  const subject = input.statement ? `esta proposta: "${input.statement}"` : "esta proposta";
  if (input.existingCanonRefs.length > 0) {
    return `O owner quer subsumir ${subject} no canon existente, ratificar separadamente, mover para wiki, manter maturando ou rejeitar?`;
  }
  return `O owner quer ratificar ${subject} como canon, mover para wiki, manter maturando ou rejeitar?`;
}

export async function listOwnerDecisionRequests(input: {
  rootDir: string;
}): Promise<{ owner_decisions: OwnerDecisionRequest[] }> {
  const [proposals, packets, diagnostics, canonicalRecords] = await Promise.all([
    loadProposals(input.rootDir),
    loadCurationPackets(input.rootDir),
    loadDiagnostics(input.rootDir),
    loadCanonicalRecords(input.rootDir),
  ]);

  const owner_decisions = proposals
    .filter((proposal) =>
      proposal.promotion_requirement === "owner_ratification_required" &&
      proposal.governance_state === "proposed"
    )
    .map((proposal) => {
      const diagnostic = matchingDiagnostic(proposal, diagnostics);
      const packet = matchingCurationPacket(proposal, packets);
      const semanticSlot = stringField(proposal.candidate_payload.semantic_slot);
      const statement = stringField(proposal.candidate_payload.statement);
      const existingCanonRefs = sameSlotCanonRefs(semanticSlot, canonicalRecords);
      return {
        proposal_ref: proposal.id,
        claim_ref: claimRef(proposal),
        semantic_slot: semanticSlot,
        statement,
        candidate_kind: proposal.candidate_kind,
        proposal_status: proposal.governance_state,
        promotion_requirement: proposal.promotion_requirement ?? null,
        epistemic_state: stringField(proposal.candidate_payload.epistemic_state),
        temporal_status: temporalStatus(proposal.candidate_payload.temporal_state),
        diagnostic_ref: diagnostic?.id ?? null,
        diagnostic_code: diagnostic?.code ?? null,
        curation_ref: packet?.id ?? null,
        curation_status: packet?.status ?? null,
        existing_canon_refs: existingCanonRefs,
        allowed_actions: ["ratify", "keep_maturing", "subsume", "reject", "move_to_wiki"],
        question: ownerQuestion({ statement, existingCanonRefs }),
        evidence_refs: proposal.evidence_refs,
      } satisfies OwnerDecisionRequest;
    })
    .filter((request) => request.curation_status === null || request.curation_status === "pending")
    .sort((left, right) => left.semantic_slot?.localeCompare(right.semantic_slot ?? "") ?? 0);

  return { owner_decisions };
}
