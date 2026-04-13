import type { ValidationIssue } from "./validation.js";

export interface EvalResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface IntegrityEvalInput {
  observationIssues: ValidationIssue[];
  worldIssues: ValidationIssue[];
  wikiIssues: ValidationIssue[];
  canonIssues: ValidationIssue[];
  projectionMarkdown: string;
}

export function runCoreIntegrityEvals(input: IntegrityEvalInput): EvalResult[] {
  return [
    {
      name: "layer_distinction",
      passed: input.observationIssues.length === 0 && input.worldIssues.length === 0 && input.wikiIssues.length === 0 && input.canonIssues.length === 0,
      detail: "Observation, world, wiki, and canon records remain individually valid.",
    },
    {
      name: "temporal_integrity",
      passed: !input.projectionMarkdown.includes("(confirmed; unresolved)"),
      detail: "Projection should not flatten temporal state into an unresolved canonical blob.",
    },
    {
      name: "wiki_authority_discipline",
      passed: !input.projectionMarkdown.includes("[wiki-claim:") || !input.projectionMarkdown.includes("(ratified)"),
      detail: "Wiki claims should remain editorial/candidate and never impersonate canon.",
    },
    {
      name: "projection_fidelity",
      passed: input.projectionMarkdown.includes("## Runtime") && input.projectionMarkdown.includes("## World Claims"),
      detail: "Projection should render runtime and world structure explicitly.",
    },
  ];
}
