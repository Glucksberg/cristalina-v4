import type { CanonicalMemoryObject, Proposal, RatificationRecord, TemporalState } from "../types.js";

function payloadTemporalState(payload: Record<string, unknown>, now: string): TemporalState {
  const temporal = payload.temporal_state;
  if (
    typeof temporal === "object" &&
    temporal !== null &&
    "temporal_status" in temporal &&
    typeof temporal.temporal_status === "string"
  ) {
    return temporal as TemporalState;
  }

  return {
    temporal_status: "active",
    valid_from: now,
    valid_to: null,
  };
}

function closeTemporalState(record: CanonicalMemoryObject, now: string): TemporalState {
  return {
    temporal_status: "historical",
    valid_from: record.temporal_state?.valid_from ?? record.created_at,
    valid_to: now,
    temporal_confidence: record.temporal_state?.temporal_confidence ?? null,
  };
}

export function applyApprovedCanonicalCreate(input: {
  proposal: Proposal;
  ratification_record: RatificationRecord;
  canonical_id: string;
  now: string;
}): CanonicalMemoryObject {
  if (input.proposal.target_layer !== "canon") {
    throw new Error(`Proposal ${input.proposal.id} does not target canon`);
  }

  if (input.proposal.operation !== "create") {
    throw new Error(`Proposal ${input.proposal.id} is not a create operation`);
  }

  if (input.ratification_record.decision !== "approved") {
    throw new Error(`Ratification ${input.ratification_record.id} is not approved`);
  }

  const statement = input.proposal.candidate_payload.statement;
  if (typeof statement !== "string" || statement.length === 0) {
    throw new Error(`Proposal ${input.proposal.id} is missing candidate_payload.statement`);
  }

  return {
    id: input.canonical_id,
    kind: input.proposal.candidate_kind as CanonicalMemoryObject["kind"],
    layer: "canon",
    authoritative_home: "canon",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: {
      ...input.proposal.visibility_state,
    },
    provenance: {
      ...input.proposal.provenance,
      evidence_refs: [...new Set([...(input.proposal.provenance.evidence_refs ?? []), input.proposal.id, input.ratification_record.id])],
    },
    statement,
    epistemic_state:
      input.proposal.candidate_payload.epistemic_state === "observed" ||
      input.proposal.candidate_payload.epistemic_state === "inferred" ||
      input.proposal.candidate_payload.epistemic_state === "hypothesized" ||
      input.proposal.candidate_payload.epistemic_state === "confirmed" ||
      input.proposal.candidate_payload.epistemic_state === "disputed"
        ? input.proposal.candidate_payload.epistemic_state
        : "confirmed",
    governance_state: "ratified",
    temporal_state: payloadTemporalState(input.proposal.candidate_payload, input.now),
    upstream_refs: [input.proposal.id, input.ratification_record.id],
    supersedes_ref: null,
    superseded_by_ref: null,
  };
}

export function applyApprovedCanonicalRevise(input: {
  proposal: Proposal;
  ratification_record: RatificationRecord;
  existing_record: CanonicalMemoryObject;
  canonical_id: string;
  now: string;
}): {
  revised_record: CanonicalMemoryObject;
  superseded_record: CanonicalMemoryObject;
} {
  if (input.proposal.operation !== "revise") {
    throw new Error(`Proposal ${input.proposal.id} is not a revise operation`);
  }

  const revised_record = applyApprovedCanonicalCreate({
    proposal: {
      ...input.proposal,
      operation: "create",
      candidate_kind: input.existing_record.kind,
      candidate_payload: {
        ...input.proposal.candidate_payload,
        kind: input.existing_record.kind,
      },
    },
    ratification_record: input.ratification_record,
    canonical_id: input.canonical_id,
    now: input.now,
  });

  revised_record.supersedes_ref = input.existing_record.id;
  revised_record.upstream_refs = [...new Set([...(revised_record.upstream_refs ?? []), input.existing_record.id])];

  const superseded_record: CanonicalMemoryObject = {
    ...input.existing_record,
    updated_at: input.now,
    governance_state: "superseded",
    temporal_state: closeTemporalState(input.existing_record, input.now),
    superseded_by_ref: revised_record.id,
    upstream_refs: [...new Set([...(input.existing_record.upstream_refs ?? []), input.proposal.id, input.ratification_record.id, revised_record.id])],
  };

  return {
    revised_record,
    superseded_record,
  };
}

export function applyApprovedCanonicalSupersede(input: {
  proposal: Proposal;
  ratification_record: RatificationRecord;
  existing_record: CanonicalMemoryObject;
  now: string;
}): CanonicalMemoryObject {
  if (input.proposal.operation !== "supersede") {
    throw new Error(`Proposal ${input.proposal.id} is not a supersede operation`);
  }

  return {
    ...input.existing_record,
    updated_at: input.now,
    governance_state: "superseded",
    temporal_state: closeTemporalState(input.existing_record, input.now),
    superseded_by_ref: null,
    upstream_refs: [...new Set([...(input.existing_record.upstream_refs ?? []), input.proposal.id, input.ratification_record.id])],
  };
}

export function applyApprovedCanonicalProposal(input: {
  proposal: Proposal;
  ratification_record: RatificationRecord;
  existing_record?: CanonicalMemoryObject;
  canonical_id: string;
  now: string;
}): {
  created_record?: CanonicalMemoryObject;
  updated_records: CanonicalMemoryObject[];
} {
  switch (input.proposal.operation) {
    case "create":
      return {
        created_record: applyApprovedCanonicalCreate(input),
        updated_records: [],
      };
    case "revise":
      if (!input.existing_record) {
        throw new Error(`Proposal ${input.proposal.id} requires an existing record for revise`);
      }
      {
        const result = applyApprovedCanonicalRevise({
          proposal: input.proposal,
          ratification_record: input.ratification_record,
          existing_record: input.existing_record,
          canonical_id: input.canonical_id,
          now: input.now,
        });
        return {
          created_record: result.revised_record,
          updated_records: [result.superseded_record],
        };
      }
    case "supersede":
      if (!input.existing_record) {
        throw new Error(`Proposal ${input.proposal.id} requires an existing record for supersede`);
      }
      return {
        updated_records: [
          applyApprovedCanonicalSupersede({
            proposal: input.proposal,
            ratification_record: input.ratification_record,
            existing_record: input.existing_record,
            now: input.now,
          }),
        ],
      };
    default:
      throw new Error(`Unsupported canonical proposal operation: ${input.proposal.operation}`);
  }
}
