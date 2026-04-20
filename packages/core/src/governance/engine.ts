import type {
  AuthenticatedPrincipal,
  CanonicalMemoryObject,
  Diagnostic,
  Proposal,
  RatificationRecord,
  Reference,
} from "../types.js";
import { CANONICAL_CLAIM_KINDS } from "../types.js";
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

function normalizeStatement(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function referenceMatchesRecord(record: CanonicalMemoryObject, reference: Reference): boolean {
  return (
    record.id === reference.id &&
    (reference.kind === undefined || reference.kind === record.kind) &&
    (reference.layer === undefined || reference.layer === record.layer)
  );
}

function findCanonicalTarget(
  records: CanonicalMemoryObject[],
  targetRef: Reference | null | undefined,
): CanonicalMemoryObject | undefined {
  if (!targetRef) return undefined;
  return records.find((record) => referenceMatchesRecord(record, targetRef));
}

function proposalHasExplicitCanonicalTarget(proposal: Proposal): boolean {
  return proposal.target_ref !== null && proposal.target_ref !== undefined;
}

function buildFailureDiagnostic(input: {
  now: string;
  proposal: Proposal;
  diagnostic_id: string;
  failed_gates: GateEvaluation[];
  decision: "rejected" | "deferred";
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
    code: input.decision === "deferred" ? "proposal_deferred" : "proposal_rejected",
    severity: input.decision === "deferred" ? "info" : "warning",
    message:
      input.decision === "deferred"
        ? `Proposal ${input.proposal.id} requires further authority before promotion: ${input.failed_gates.map((gate) => gate.reason_code).join(", ")}`
        : `Proposal ${input.proposal.id} failed governance gates: ${input.failed_gates.map((gate) => gate.gate).join(", ")}`,
    related_refs: [input.proposal.id, ...input.proposal.evidence_refs],
  };
}

function shouldDeferProposal(failed_gates: GateEvaluation[]): boolean {
  return (
    failed_gates.length === 1 &&
    failed_gates[0]?.gate === "policy" &&
    failed_gates[0]?.reason_code === "owner_ratification_required"
  );
}

export function evaluateCanonicalProposal(input: {
  proposal: Proposal;
  existing_canon_records?: CanonicalMemoryObject[];
  blocking_world_conflict_ref?: string | null;
  now: string;
  actor: string;
  authenticated_principal?: AuthenticatedPrincipal;
  ratification_id: string;
  diagnostic_id?: string;
}): GovernanceEvaluationResult {
  const { proposal } = input;
  const payload = proposal.candidate_payload;
  const existingRecords = input.existing_canon_records ?? [];
  const payloadSemanticSlot = typeof payload.semantic_slot === "string" ? payload.semantic_slot : null;
  const payloadKind = typeof payload.kind === "string" ? payload.kind : null;
  const targetRecord = findCanonicalTarget(existingRecords, proposal.target_ref);
  const payloadStatement = typeof payload.statement === "string" ? payload.statement : null;
  const hasExplicitTarget = proposalHasExplicitCanonicalTarget(proposal);
  const isCreateOperation = proposal.operation === "create";
  const isTargetedOperation = proposal.operation === "revise" || proposal.operation === "supersede";
  const hasStructuralShape =
    proposal.target_layer === "canon" &&
            CANONICAL_CLAIM_KINDS.includes(proposal.candidate_kind as CanonicalMemoryObject["kind"]) &&
    payloadKind === proposal.candidate_kind &&
    (
      ((proposal.operation === "create" || proposal.operation === "revise") && typeof payload.statement === "string") ||
      proposal.operation === "supersede"
    );
  const hasLegalTargetContract =
    (isCreateOperation && !hasExplicitTarget) ||
    (
      isTargetedOperation &&
      hasExplicitTarget &&
      targetRecord !== undefined &&
      targetRecord.kind === proposal.candidate_kind &&
      targetRecord.kind === payloadKind
    );

  const gate_results: GateEvaluation[] = PROMOTION_GATES.map((gate) => {
    switch (gate) {
      case "structural":
        return {
          gate,
          passed: hasStructuralShape && hasLegalTargetContract,
          reason_code:
            !hasStructuralShape
              ? "structural_contract"
              : isCreateOperation && hasExplicitTarget
                ? "create_must_not_target_existing_record"
                : isTargetedOperation && !hasExplicitTarget
                  ? "targeted_operations_require_target_ref"
                  : targetRecord === undefined
                    ? "missing_target_record"
                    : targetRecord.kind !== proposal.candidate_kind || targetRecord.kind !== payloadKind
                      ? "target_kind_mismatch"
                      : "structural_contract",
        };
      case "evidence":
        return {
          gate,
          passed: proposal.evidence_refs.length > 0,
          reason_code: "evidence_presence",
        };
      case "conflict":
        if (input.blocking_world_conflict_ref) {
          return {
            gate,
            passed: false,
            reason_code: "active_world_conflict",
          };
        }

        if (proposal.operation === "create") {
          const conflictingActiveRecord = payloadSemanticSlot
            ? existingRecords.find(
                (record) =>
                  record.kind === proposal.candidate_kind &&
                  record.governance_state === "ratified" &&
                  record.semantic_slot === payloadSemanticSlot,
              )
            : undefined;

          const duplicate =
            conflictingActiveRecord &&
            payloadStatement &&
            normalizeStatement(conflictingActiveRecord.statement) === normalizeStatement(payloadStatement)
              ? conflictingActiveRecord
              : undefined;

          return {
            gate,
            passed: conflictingActiveRecord === undefined,
            reason_code:
              duplicate
                ? "duplicate_active_canonical_claim"
                : conflictingActiveRecord
                  ? "conflicting_active_canonical_claim"
                  : "no_duplicate_canonical_claim",
          };
        }

        if (proposal.operation === "revise") {
          const sameStatement =
            targetRecord !== undefined &&
            payloadStatement !== null &&
            normalizeStatement(targetRecord.statement) === normalizeStatement(payloadStatement);
          const sameSemanticSlot =
            targetRecord !== undefined &&
            payloadSemanticSlot !== null &&
            targetRecord.semantic_slot === payloadSemanticSlot;

          return {
            gate,
            passed:
              targetRecord !== undefined &&
              targetRecord.kind === proposal.candidate_kind &&
              targetRecord.governance_state === "ratified" &&
              sameSemanticSlot &&
              !sameStatement,
            reason_code:
              targetRecord === undefined
                ? "missing_target_record"
                : targetRecord.kind !== proposal.candidate_kind
                  ? "revision_kind_mismatch"
                : !sameSemanticSlot
                  ? "revision_semantic_slot_mismatch"
                : sameStatement
                  ? "revision_statement_unchanged"
                  : "target_record_revisable",
          };
        }

        if (proposal.operation === "supersede") {
          return {
            gate,
            passed:
              targetRecord !== undefined &&
              targetRecord.kind === proposal.candidate_kind &&
              targetRecord.governance_state === "ratified",
            reason_code:
              targetRecord === undefined
                ? "missing_target_record"
                : targetRecord.kind !== proposal.candidate_kind
                  ? "supersede_kind_mismatch"
                  : "target_record_supersedable",
          };
        }

        return {
          gate,
          passed: false,
          reason_code: "unsupported_operation",
        };
      case "policy":
        {
          if (proposal.promotion_requirement === "owner_ratification_required") {
            return {
              gate,
              passed: false,
              reason_code: "owner_ratification_required",
            };
          }

          const isPublicSafe = proposal.visibility_state.privacy_scope === "public_safe";
          const targetIsCanon = proposal.target_layer === "canon";
        return {
          gate,
          passed: !isPublicSafe || targetIsCanon,
          reason_code: "policy_baseline",
        };
        }
      case "ratification":
        return {
          gate,
          passed: proposal.governance_state === "proposed",
          reason_code: "ratification_state_ready",
        };
    }
  });

  const accepted = gate_results.every((result) => result.passed);
  const failed_gates = gate_results.filter((gate) => !gate.passed);
  const deferred = !accepted && shouldDeferProposal(failed_gates);
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
    decision: accepted ? "approved" : deferred ? "deferred" : "rejected",
    actor: input.actor,
    authenticated_principal: input.authenticated_principal ?? null,
  };

  const diagnostic =
    !accepted && input.diagnostic_id
      ? buildFailureDiagnostic({
          now: input.now,
          proposal,
          diagnostic_id: input.diagnostic_id,
          failed_gates,
          decision: deferred ? "deferred" : "rejected",
        })
      : undefined;

  return {
    gate_results,
    ratification_record,
    diagnostic,
    accepted,
  };
}
