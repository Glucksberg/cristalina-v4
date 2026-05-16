import {
  loadRatificationRecords,
  loadCanonicalRecords,
  loadCurationPackets,
  loadDiagnostics,
  loadDispositionRecords,
  loadProposals,
  loadWikiClaims,
  loadWikiPages,
  writeCoreRecord,
} from "./store/io.js";
import { applyApprovedCanonicalProposal } from "./canon/engine.js";
import type {
  AuthenticatedPrincipal,
  CanonicalMemoryObject,
  CurationPacket,
  Diagnostic,
  DispositionRecord,
  Proposal,
  RatificationRecord,
  WikiClaim,
  WikiPage,
} from "./types.js";

export type OwnerDecisionAction = "ratify" | "subsume" | "keep_maturing" | "reject" | "move_to_wiki";

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
  allowed_actions: OwnerDecisionAction[];
  question: string;
  evidence_refs: string[];
}

export interface ApplyOwnerDecisionInput {
  rootDir: string;
  proposal_ref: string;
  action: OwnerDecisionAction;
  now: string;
  actor: string;
  authenticated_principal?: AuthenticatedPrincipal | null;
  reason?: string;
  target_canon_ref?: string;
  wiki_page?: string | "auto";
  dry_run?: boolean;
}

export interface ApplyOwnerDecisionResult {
  proposal_ref: string;
  action: OwnerDecisionAction;
  status: "applied" | "dry_run" | "rejected_by_validation" | "already_applied";
  created_refs: string[];
  updated_refs: string[];
  linked_refs: string[];
  warnings: string[];
  records: {
    proposal?: Proposal;
    curation_packet?: CurationPacket;
    ratification?: RatificationRecord;
    disposition?: DispositionRecord;
    canonical_record?: CanonicalMemoryObject;
    wiki_page?: WikiPage;
    wiki_claim?: WikiClaim;
  };
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

function dispositionIncludesProposal(record: DispositionRecord, proposal: Proposal): boolean {
  return (
    record.proposal_refs?.includes(proposal.id) === true ||
    record.input_refs.includes(proposal.id)
  );
}

function hasOwnerDecisionDisposition(proposal: Proposal, dispositions: DispositionRecord[]): boolean {
  return dispositions.some((record) =>
    dispositionIncludesProposal(record, proposal) &&
    typeof record.owner_decision_action === "string"
  );
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

function safeIdPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || "owner_decision";
}

function proposalIdPart(proposal: Proposal): string {
  return safeIdPart(proposal.id.replace(/^prop_/, ""));
}

function proposalStatement(proposal: Proposal): string {
  return stringField(proposal.candidate_payload.statement) ?? proposal.reason;
}

function canonicalTargetRecord(proposal: Proposal, records: CanonicalMemoryObject[]): CanonicalMemoryObject | undefined {
  const target = proposal.target_ref;
  if (!target) return undefined;
  return records.find((record) =>
    record.id === target.id &&
    record.kind === target.kind &&
    record.layer === target.layer
  );
}

function requireProposal(proposal_ref: string, proposals: Proposal[]): Proposal {
  const proposal = proposals.find((record) => record.id === proposal_ref);
  if (!proposal) {
    throw new Error(`Owner decision proposal was not found: ${proposal_ref}`);
  }
  if (proposal.promotion_requirement !== "owner_ratification_required") {
    throw new Error(`Proposal ${proposal_ref} does not require owner ratification`);
  }
  if (proposal.governance_state !== "proposed") {
    throw new Error(`Proposal ${proposal_ref} is ${proposal.governance_state}, expected proposed`);
  }
  return proposal;
}

function pendingCurationPacket(proposal: Proposal, packets: CurationPacket[]): CurationPacket | undefined {
  return matchingCurationPacket(proposal, packets);
}

function decisionDisposition(input: {
  proposal: Proposal;
  packet?: CurationPacket;
  action: OwnerDecisionAction;
  now: string;
  reason?: string;
  target_canon_ref?: string | null;
  wiki_page_ref?: string | null;
  wiki_claim_ref?: string | null;
  ratification_ref?: string | null;
  proposal_status_after?: string | null;
  curation_status_after?: string | null;
}): DispositionRecord {
  const outcome = input.action === "ratify" || input.action === "subsume"
    ? "proposal_for_canon"
    : input.action === "move_to_wiki"
      ? "wiki_update"
      : "queued_review";
  const target_layers = input.action === "ratify" || input.action === "subsume"
    ? ["governance", "canon"] as const
    : input.action === "move_to_wiki"
      ? ["governance", "wiki"] as const
      : ["governance"] as const;
  return {
    id: `disp_owner_decision_${proposalIdPart(input.proposal)}_${input.action}`,
    kind: "disposition_record",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: input.proposal.visibility_state,
    provenance: {
      ...input.proposal.provenance,
      evidence_refs: [...new Set([...(input.proposal.provenance.evidence_refs ?? []), input.proposal.id, ...(input.packet ? [input.packet.id] : [])])],
    },
    input_refs: [...new Set([input.proposal.id, ...(input.packet ? [input.packet.id] : [])])],
    outcomes: [outcome],
    target_layers: [...target_layers],
    ...(outcome === "proposal_for_canon" ? { proposal_refs: [input.proposal.id] } : {}),
    reason_codes: [`owner_decision_${input.action}`],
    owner_decision_action: input.action,
    owner_decision_reason: input.reason ?? null,
    target_canon_ref: input.target_canon_ref ?? null,
    wiki_page_ref: input.wiki_page_ref ?? null,
    wiki_claim_ref: input.wiki_claim_ref ?? null,
    ratification_ref: input.ratification_ref ?? null,
    proposal_status_after: input.proposal_status_after ?? null,
    curation_status_after: input.curation_status_after ?? null,
  };
}

function ratificationId(input: ApplyOwnerDecisionInput, proposal: Proposal): string {
  return `rat_owner_decision_${proposalIdPart(proposal)}_${input.action}`;
}

function approvedRatification(input: ApplyOwnerDecisionInput, proposal: Proposal): RatificationRecord {
  return {
    id: ratificationId(input, proposal),
    kind: "ratification",
    layer: "governance",
    authoritative_home: "governance",
    created_at: input.now,
    updated_at: input.now,
    visibility_state: proposal.visibility_state,
    provenance: {
      ...proposal.provenance,
      evidence_refs: [...new Set([...(proposal.provenance.evidence_refs ?? []), proposal.id])],
    },
    proposal_ref: proposal.id,
    decision: "approved",
    actor: input.actor,
    authenticated_principal: input.authenticated_principal ?? null,
    approved_at: input.now,
  };
}

function rejectedRatification(input: ApplyOwnerDecisionInput, proposal: Proposal): RatificationRecord {
  return {
    ...approvedRatification(input, proposal),
    decision: "rejected",
    approved_at: undefined,
    rejected_at: input.now,
  };
}

function deferredRatification(input: ApplyOwnerDecisionInput, proposal: Proposal): RatificationRecord {
  return {
    ...approvedRatification(input, proposal),
    decision: "deferred",
    approved_at: undefined,
    deferred_at: input.now,
  };
}

function resolveWikiPageId(input: ApplyOwnerDecisionInput, proposal: Proposal): string {
  if (input.wiki_page && input.wiki_page !== "auto") return safeIdPart(input.wiki_page);
  const slot = stringField(proposal.candidate_payload.semantic_slot) ?? proposal.id;
  return `wpg_${safeIdPart(slot)}`;
}

function wikiPathForPageId(pageId: string): string {
  return `wiki/pages/${safeIdPart(pageId.replace(/^wpg_/, ""))}.md`;
}

function wikiRecordsForDecision(input: {
  proposal: Proposal;
  packet?: CurationPacket;
  now: string;
  pageId: string;
  existingPages: WikiPage[];
  existingClaims: WikiClaim[];
}): { page: WikiPage; claim: WikiClaim } {
  const sourceRefs = [...new Set(input.proposal.evidence_refs)];
  const claimId = `wclm_owner_decision_${proposalIdPart(input.proposal)}`;
  const existingPage = input.existingPages.find((page) => page.id === input.pageId);
  const existingClaim = input.existingClaims.find((claim) => claim.id === claimId);
  const claim: WikiClaim = {
    id: claimId,
    kind: "wiki_claim",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: existingClaim?.created_at ?? input.now,
    updated_at: input.now,
    visibility_state: input.proposal.visibility_state,
    provenance: {
      ...input.proposal.provenance,
      evidence_refs: [...new Set([...(input.proposal.provenance.evidence_refs ?? []), input.proposal.id, ...(input.packet ? [input.packet.id] : [])])],
    },
    statement: proposalStatement(input.proposal),
    page_ref: input.pageId,
    claim_status: "editorial",
    source_refs: sourceRefs.length > 0 ? sourceRefs : [input.proposal.id],
    support_refs: input.proposal.evidence_refs,
    support_count: input.proposal.evidence_refs.length,
    last_seen_at: input.now,
    retention_priority: "normal",
  };
  const page: WikiPage = {
    id: input.pageId,
    kind: "wiki_page",
    layer: "wiki",
    authoritative_home: "wiki",
    created_at: existingPage?.created_at ?? input.now,
    updated_at: input.now,
    visibility_state: input.proposal.visibility_state,
    provenance: existingPage?.provenance ?? input.proposal.provenance,
    page_kind: existingPage?.page_kind ?? "topic",
    title: existingPage?.title ?? (stringField(input.proposal.candidate_payload.semantic_slot) ?? input.pageId),
    path: existingPage?.path ?? wikiPathForPageId(input.pageId),
    source_refs: [...new Set([...(existingPage?.source_refs ?? []), ...sourceRefs])],
    canonical_refs: existingPage?.canonical_refs ?? [],
    world_refs: existingPage?.world_refs ?? [],
    wiki_claim_refs: [...new Set([...(existingPage?.wiki_claim_refs ?? []), claim.id])],
    index_summary: existingPage?.index_summary ?? "Owner-routed proposal preserved as wiki context, not canonical memory.",
    retention_priority: existingPage?.retention_priority ?? "normal",
  };
  return { page, claim };
}

function updatedPacket(packet: CurationPacket | undefined, now: string, status: CurationPacket["status"]): CurationPacket | undefined {
  return packet ? { ...packet, updated_at: now, status } : undefined;
}

function alreadyApplied(input: {
  proposal: Proposal;
  action: OwnerDecisionAction;
  ratifications: RatificationRecord[];
  dispositions: DispositionRecord[];
}): boolean {
  if (input.ratifications.some((record) => record.proposal_ref === input.proposal.id && (record.decision === "approved" || record.decision === "rejected"))) {
    return true;
  }
  return input.dispositions.some((record) => dispositionIncludesProposal(record, input.proposal) && record.owner_decision_action === input.action);
}

export async function listOwnerDecisionRequests(input: {
  rootDir: string;
}): Promise<{ owner_decisions: OwnerDecisionRequest[] }> {
  const [proposals, packets, diagnostics, canonicalRecords, dispositions] = await Promise.all([
    loadProposals(input.rootDir),
    loadCurationPackets(input.rootDir),
    loadDiagnostics(input.rootDir),
    loadCanonicalRecords(input.rootDir),
    loadDispositionRecords(input.rootDir),
  ]);

  const owner_decisions = proposals
    .filter((proposal) =>
      proposal.promotion_requirement === "owner_ratification_required" &&
      proposal.governance_state === "proposed"
    )
    .filter((proposal) => !hasOwnerDecisionDisposition(proposal, dispositions))
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

export async function applyOwnerDecision(input: ApplyOwnerDecisionInput): Promise<ApplyOwnerDecisionResult> {
  const [
    proposals,
    packets,
    canonicalRecords,
    ratifications,
    dispositions,
    wikiPages,
    wikiClaims,
  ] = await Promise.all([
    loadProposals(input.rootDir),
    loadCurationPackets(input.rootDir),
    loadCanonicalRecords(input.rootDir),
    loadRatificationRecords(input.rootDir),
    loadDispositionRecords(input.rootDir),
    loadWikiPages(input.rootDir),
    loadWikiClaims(input.rootDir),
  ]);
  const proposal = requireProposal(input.proposal_ref, proposals);
  const packet = pendingCurationPacket(proposal, packets);
  const warnings: string[] = [];
  const created_refs: string[] = [];
  const updated_refs: string[] = [];
  const linked_refs: string[] = [];
  const records: ApplyOwnerDecisionResult["records"] = { proposal };

  if (alreadyApplied({ proposal, action: input.action, ratifications, dispositions })) {
    return {
      proposal_ref: proposal.id,
      action: input.action,
      status: "already_applied",
      created_refs,
      updated_refs,
      linked_refs,
      warnings: [`Proposal ${proposal.id} already has an approved or rejected ratification.`],
      records,
    };
  }

  const semanticSlot = stringField(proposal.candidate_payload.semantic_slot);
  const existingCanonRefs = sameSlotCanonRefs(semanticSlot, canonicalRecords);

  if (input.action === "ratify") {
    const targetRecord = canonicalTargetRecord(proposal, canonicalRecords);
    if (proposal.operation === "create" && existingCanonRefs.length > 0) {
      return {
        proposal_ref: proposal.id,
        action: input.action,
        status: "rejected_by_validation",
        created_refs,
        updated_refs,
        linked_refs: existingCanonRefs,
        warnings: [`Existing canon found for semantic_slot ${semanticSlot ?? "(missing)"}; use subsume instead of ratify.`],
        records,
      };
    }
    if ((proposal.operation === "revise" || proposal.operation === "supersede") && !targetRecord) {
      return {
        proposal_ref: proposal.id,
        action: input.action,
        status: "rejected_by_validation",
        created_refs,
        updated_refs,
        linked_refs: existingCanonRefs,
        warnings: [`${proposal.operation} requires a target_ref matching an existing canonical record.`],
        records,
      };
    }
    const ratification = approvedRatification(input, proposal);
    const canonical = applyApprovedCanonicalProposal({
      proposal,
      ratification_record: ratification,
      existing_record: targetRecord,
      canonical_id: `mem_${proposalIdPart(proposal)}`,
      now: input.now,
    });
    const canonicalRecord = canonical.created_record ?? canonical.updated_records[0];
    const packetUpdate = updatedPacket(packet, input.now, "applied");
    const disposition = decisionDisposition({
      proposal,
      packet,
      action: input.action,
      now: input.now,
      reason: input.reason,
      ratification_ref: ratification.id,
      proposal_status_after: "ratified",
      curation_status_after: packetUpdate?.status ?? null,
    });
    records.ratification = ratification;
    if (canonicalRecord) records.canonical_record = canonicalRecord;
    records.curation_packet = packetUpdate;
    records.disposition = disposition;
    created_refs.push(ratification.id, ...(canonical.created_record ? [canonical.created_record.id] : []), disposition.id);
    updated_refs.push(...canonical.updated_records.map((record) => record.id), ...(packetUpdate ? [packetUpdate.id] : []));
    if (!input.dry_run) {
      await Promise.all([
        writeCoreRecord(input.rootDir, ratification),
        ...(canonical.created_record ? [writeCoreRecord(input.rootDir, canonical.created_record)] : []),
        ...canonical.updated_records.map((record) => writeCoreRecord(input.rootDir, record)),
        ...(packetUpdate ? [writeCoreRecord(input.rootDir, packetUpdate)] : []),
        writeCoreRecord(input.rootDir, disposition),
      ]);
    }
  } else if (input.action === "subsume") {
    if (!input.target_canon_ref) {
      return {
        proposal_ref: proposal.id,
        action: input.action,
        status: "rejected_by_validation",
        created_refs,
        updated_refs,
        linked_refs: existingCanonRefs,
        warnings: ["subsume requires --target-canon."],
        records,
      };
    }
    if (!canonicalRecords.some((record) => record.id === input.target_canon_ref)) {
      return {
        proposal_ref: proposal.id,
        action: input.action,
        status: "rejected_by_validation",
        created_refs,
        updated_refs,
        linked_refs: existingCanonRefs,
        warnings: [`Target canon was not found: ${input.target_canon_ref}`],
        records,
      };
    }
    const packetUpdate = updatedPacket(packet, input.now, "answered");
    const disposition = decisionDisposition({
      proposal,
      packet,
      action: input.action,
      now: input.now,
      reason: input.reason,
      target_canon_ref: input.target_canon_ref,
      curation_status_after: packetUpdate?.status ?? null,
    });
    records.curation_packet = packetUpdate;
    records.disposition = disposition;
    created_refs.push(disposition.id);
    updated_refs.push(...(packetUpdate ? [packetUpdate.id] : []));
    linked_refs.push(input.target_canon_ref);
    if (!input.dry_run) {
      await Promise.all([
        ...(packetUpdate ? [writeCoreRecord(input.rootDir, packetUpdate)] : []),
        writeCoreRecord(input.rootDir, disposition),
      ]);
    }
  } else if (input.action === "keep_maturing") {
    const ratification = deferredRatification(input, proposal);
    const packetUpdate = updatedPacket(packet, input.now, "answered");
    const disposition = decisionDisposition({
      proposal,
      packet,
      action: input.action,
      now: input.now,
      reason: input.reason,
      ratification_ref: ratification.id,
      curation_status_after: packetUpdate?.status ?? null,
    });
    records.ratification = ratification;
    records.curation_packet = packetUpdate;
    records.disposition = disposition;
    created_refs.push(ratification.id, disposition.id);
    updated_refs.push(...(packetUpdate ? [packetUpdate.id] : []));
    if (!input.dry_run) {
      await Promise.all([
        writeCoreRecord(input.rootDir, ratification),
        ...(packetUpdate ? [writeCoreRecord(input.rootDir, packetUpdate)] : []),
        writeCoreRecord(input.rootDir, disposition),
      ]);
    }
  } else if (input.action === "move_to_wiki") {
    const pageId = resolveWikiPageId(input, proposal);
    const wiki = wikiRecordsForDecision({
      proposal,
      packet,
      now: input.now,
      pageId,
      existingPages: wikiPages,
      existingClaims: wikiClaims,
    });
    const packetUpdate = updatedPacket(packet, input.now, "answered");
    const disposition = decisionDisposition({
      proposal,
      packet,
      action: input.action,
      now: input.now,
      reason: input.reason,
      wiki_page_ref: wiki.page.id,
      wiki_claim_ref: wiki.claim.id,
      curation_status_after: packetUpdate?.status ?? null,
    });
    records.wiki_page = wiki.page;
    records.wiki_claim = wiki.claim;
    records.curation_packet = packetUpdate;
    records.disposition = disposition;
    created_refs.push(wiki.claim.id, disposition.id);
    if (!wikiPages.some((page) => page.id === wiki.page.id)) created_refs.push(wiki.page.id);
    else updated_refs.push(wiki.page.id);
    updated_refs.push(...(packetUpdate ? [packetUpdate.id] : []));
    if (!input.dry_run) {
      await Promise.all([
        writeCoreRecord(input.rootDir, wiki.page),
        writeCoreRecord(input.rootDir, wiki.claim),
        ...(packetUpdate ? [writeCoreRecord(input.rootDir, packetUpdate)] : []),
        writeCoreRecord(input.rootDir, disposition),
      ]);
    }
  } else if (input.action === "reject") {
    const ratification = rejectedRatification(input, proposal);
    const rejectedProposal: Proposal = { ...proposal, updated_at: input.now, governance_state: "rejected" };
    const packetUpdate = updatedPacket(packet, input.now, "answered");
    const disposition = decisionDisposition({
      proposal,
      packet,
      action: input.action,
      now: input.now,
      reason: input.reason,
      ratification_ref: ratification.id,
      proposal_status_after: rejectedProposal.governance_state,
      curation_status_after: packetUpdate?.status ?? null,
    });
    records.proposal = rejectedProposal;
    records.ratification = ratification;
    records.curation_packet = packetUpdate;
    records.disposition = disposition;
    created_refs.push(ratification.id, disposition.id);
    updated_refs.push(rejectedProposal.id, ...(packetUpdate ? [packetUpdate.id] : []));
    if (!input.dry_run) {
      await Promise.all([
        writeCoreRecord(input.rootDir, rejectedProposal),
        writeCoreRecord(input.rootDir, ratification),
        ...(packetUpdate ? [writeCoreRecord(input.rootDir, packetUpdate)] : []),
        writeCoreRecord(input.rootDir, disposition),
      ]);
    }
  }

  return {
    proposal_ref: proposal.id,
    action: input.action,
    status: input.dry_run ? "dry_run" : "applied",
    created_refs,
    updated_refs,
    linked_refs,
    warnings,
    records,
  };
}
