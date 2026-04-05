import type { GovernanceState, Layer } from "./types.js";

export const LEGAL_LAYER_TRANSITIONS = [
  ["raw", "wiki"],
  ["raw", "runtime"],
  ["raw", "world"],
  ["runtime", "world"],
  ["runtime", "governance"],
  ["world", "governance"],
  ["wiki", "governance"],
  ["governance", "canon"],
  ["canon", "derived"],
  ["world", "derived"],
  ["wiki", "derived"],
  ["runtime", "derived"],
  ["runtime", "wiki"],
  ["world", "wiki"],
  ["wiki", "world"],
  ["canon", "world"],
] as const satisfies ReadonlyArray<readonly [Layer, Layer]>;

export const ILLEGAL_LAYER_TRANSITIONS = [
  ["runtime", "canon"],
  ["raw", "canon"],
  ["derived", "canon"],
  ["derived", "world"],
  ["wiki", "canon"],
] as const satisfies ReadonlyArray<readonly [Layer, Layer]>;

export function isLegalLayerTransition(from: Layer, to: Layer): boolean {
  if (LEGAL_LAYER_TRANSITIONS.some(([left, right]) => left === from && right === to)) return true;
  if (ILLEGAL_LAYER_TRANSITIONS.some(([left, right]) => left === from && right === to)) return false;
  return false;
}

export const LEGAL_GOVERNANCE_TRANSITIONS = [
  ["draft", "proposed"],
  ["draft", "rejected"],
  ["proposed", "ratified"],
  ["proposed", "rejected"],
  ["proposed", "archived"],
  ["ratified", "superseded"],
  ["superseded", "archived"],
] as const satisfies ReadonlyArray<readonly [GovernanceState, GovernanceState]>;

export function isLegalGovernanceTransition(from: GovernanceState, to: GovernanceState): boolean {
  return LEGAL_GOVERNANCE_TRANSITIONS.some(([left, right]) => left === from && right === to);
}

export const PROMOTION_GATES = [
  "structural",
  "evidence",
  "conflict",
  "policy",
  "ratification",
] as const;

export type PromotionGate = typeof PROMOTION_GATES[number];
