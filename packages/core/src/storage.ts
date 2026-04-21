import type { Layer } from "./types.js";

export const STORAGE_LAYOUT = {
  manifest: "manifest.yaml",
  raw: {
    root: "raw",
    sources: "raw/sources",
    attachments: "raw/attachments",
    imports: "raw/imports",
  },
  runtime: {
    root: "runtime",
    observations: "runtime/observations",
    instances: "runtime/instances",
    sessions: "runtime/sessions",
    threads: "runtime/threads",
    blocks: "runtime/blocks",
    workingMemory: "runtime/working-memory",
  },
  world: {
    root: "world",
    entities: "world/entities",
    relations: "world/relations",
    episodes: "world/episodes",
    claims: "world/claims",
    contradictions: "world/contradictions",
    ontology: "world/ontology",
  },
  canon: {
    root: "canon",
    facts: "canon/facts",
    beliefs: "canon/beliefs",
    preferences: "canon/preferences",
    constraints: "canon/constraints",
    goals: "canon/goals",
    procedures: "canon/procedures",
    values: "canon/values",
    identityTraits: "canon/identity-traits",
    identity: "canon/identity",
  },
  wiki: {
    root: "wiki",
    pages: "wiki/pages",
    claims: "wiki/claims",
    runs: "wiki/runs",
    index: "wiki/index.md",
    log: "wiki/log.md",
  },
  governance: {
    root: "governance",
    proposals: "governance/proposals",
    dispositions: "governance/dispositions",
    contradictionResolutions: "governance/contradiction-resolutions",
    curation: "governance/curation",
    ratifications: "governance/ratifications",
    policy: "governance/policy",
    policySnapshots: "governance/policy-snapshots",
  },
  derived: {
    root: "derived",
    openclaw: "derived/openclaw",
    hermes: "derived/hermes",
    manifests: "derived/manifests",
  },
  audits: {
    root: "audits",
    changes: "audits/changes.log",
    validation: "audits/validation.log",
    diagnostics: "audits/diagnostics",
    snapshots: "audits/snapshots",
  },
} as const;

export const LAYER_ROOTS: Record<Layer, string> = {
  raw: STORAGE_LAYOUT.raw.root,
  runtime: STORAGE_LAYOUT.runtime.root,
  world: STORAGE_LAYOUT.world.root,
  canon: STORAGE_LAYOUT.canon.root,
  wiki: STORAGE_LAYOUT.wiki.root,
  governance: STORAGE_LAYOUT.governance.root,
  derived: STORAGE_LAYOUT.derived.root,
  audits: STORAGE_LAYOUT.audits.root,
};

export function layerRoot(layer: Layer): string {
  return LAYER_ROOTS[layer];
}
