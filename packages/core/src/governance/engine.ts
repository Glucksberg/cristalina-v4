import type { CanonicalMemoryObject, Diagnostic, Proposal, RatificationRecord } from "../types.js";
import { MEMORY_OBJECT_KINDS } from "../types.js";
import { PROMOTION_GATES, type PromotionGate } from "../transitions.js";

export interface GateEvaluation {
  gate: PromotionGate;
  passed: boolean;
  reason_code: string;
}

export interface GovernanceEvaluationResult {
  gate_results: GateEvaluation[];
  ratification_record: RatificationRecord;
  diagnostic?: Diagnostic;
  accepted: boolean;
}

const CANONICAL_CLAIM_KINDS = MEMORY_OBJECT_KINDS.filter((kind) => !["entity", "relation", "episode"].includes(kind));

function normalizeStatement(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findCanonicalTarget(records: CanonicalMemoryObject[], targetId: string | null | undefined): CanonicalMemoryObject | undefined {
  if (!targetId) return undefined;
  return records.find((record) => record.id === targetId);
}

function buildFailureDiagnostic(input: {
  now: string;
  proposal: Proposal;
  diagnostic_id: string;
  failed_gates: GateEvaluation[];
}): Diagnostic {
  return {
    id: input.diagnostic_id,
    kind: "diagnostic",
    layer: "audits",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: {
      privacy_scope: input.proposal.visibility_state.privacy_scope,
    },
    provenance: {
      ...input.proposal.provenance,
      evidence_refs: [...(input.proposal.provenance.evidence_refs ?? []), input.proposal.id],
    },
    code: "proposal_rejected",
    severity: "warning",
    message: `Proposal ${input.proposal.id} failed governance gates: ${input.failed_gates.map((gate) => gate.gate).join(", ")}`,
    related_refs: [input.proposal.id, ...input.proposal.evidence_refs],
  };
}

export function evaluateCanonicalProposal(input: {
  proposal: Proposal;
  existing_canon_records?: CanonicalMemoryObject[];
  now: string;
  actor: string;
  ratification_id: string;
  diagnostic_id?: string;
}): GovernanceEvaluationResult {
  const { proposal } = input;
  const payload = proposal.candidate_payload;
  const existingRecords = input.existing_canon_records ?? [];
  const targetRecord = findCanonicalTarget(
    existingRecords,
    proposal.target_ref && typeof proposal.target_ref.id === "string" ? proposal.target_ref.id : null,
  );
  const payloadStatement = typeof payload.statement === "string" ? payload.statement : null;

  const gate_results: GateEvaluation[] = PROMOTION_GATES.map((gate) => {
    switch (gate) {
      case "structural":
        return {
          gate,
          passed:
            proposal.target_layer === "canon" &&
            CANONICAL_CLAIM_KINDS.includes(proposal.candidate_kind as (typeof CANONICAL_CLAIM_KINDS)[number]) &&
            typeof payload.kind === "string" &&
            (
              ((proposal.operation === "create" || proposal.operation === "revise") && typeof payload.statement === "string") ||
              proposal.operation === "supersede"
            ) &&
            (
              proposal.operation === "create" ||
              ((proposal.operation === "revise" || proposal.operation === "supersede") && targetRecord !== undefined)
            ),
          reason_code: "structural_contract",
        };
      case "evidence":
        return {
          gate,
          passed: proposal.evidence_refs.length > 0,
          reason_code: "evidence_presence",
        };
      case "conflict":
        if (proposal.operation === "create") {
          const duplicate = payloadStatement
            ? existingRecords.find(
                (record) =>
                  record.kind === proposal.candidate_kind &&
                  record.governance_state === "ratified" &&
                  normalizeStatement(record.statement) === normalizeStatement(payloadStatement),
              )
            : undefined;

          return {
            gate,
            passed: duplicate === undefined,
            reason_code: duplicate ? "duplicate_active_canonical_claim" : "no_duplicate_canonical_claim",
          };
        }

        if (proposal.operation === "revise") {
          const sameStatement =
            targetRecord !== undefined &&
            payloadStatement !== null &&
            normalizeStatement(targetRecord.statement) === normalizeStatement(payloadStatement);

          return {
            gate,
            passed:
              targetRecord !== undefined &&
              targetRecord.governance_state === "ratified" &&
              !sameStatement,
            reason_code:
              targetRecord === undefined
                ? "missing_target_record"
                : sameStatement
                  ? "revision_statement_unchanged"
                  : "target_record_revisable",
          };
        }

        if (proposal.operation === "supersede") {
          return {
            gate,
            passed: targetRecord !== undefined && targetRecord.governance_state === "ratified",
            reason_code: targetRecord === undefined ? "missing_target_record" : "target_record_supersedable",
          };
        }

        return {
          gate,
          passed: false,
          reason_code: "unsupported_operation",
        };
      case "policy":
        return {
          gate,
          passed: proposal.visibility_state.privacy_scope !== "public_safe" || proposal.target_layer === "canon",
          reason_code: "policy_baseline",
        };
      case "ratification":
        return {
          gate,
          passed: proposal.governance_state === "proposed",
          reason_code: "ratification_state_ready",
        };
    }
  });

  const accepted = gate_results.every((result) => result.passed);
  const ratification_record: RatificationRecord = {
    id: input.ratification_id,
    kind: "ratification",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    visibility_state: {
      privacy_scope: proposal.visibility_state.privacy_scope,
    },
    provenance: {
      ...proposal.provenance,
      evidence_refs: [...(proposal.provenance.evidence_refs ?? []), proposal.id],
    },
    proposal_ref: proposal.id,
    decision: accepted ? "approved" : "rejected",
    actor: input.actor,
  };

  const failed_gates = gate_results.filter((gate) => !gate.passed);
  const diagnostic =
    !accepted && input.diagnostic_id
      ? buildFailureDiagnostic({
          now: input.now,
          proposal,
          diagnostic_id: input.diagnostic_id,
          failed_gates,
        })
      : undefined;

  return {
    gate_results,
    ratification_record,
    diagnostic,
    accepted,
  };
}

export function evaluateCanonCreateProposal(input: {
  proposal: Proposal;
  existing_canon_records?: CanonicalMemoryObject[];
  now: string;
  actor: string;
  ratification_id: string;
  diagnostic_id?: string;
}): GovernanceEvaluationResult {
  return evaluateCanonicalProposal(input);
}
