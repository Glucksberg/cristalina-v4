import assert from "node:assert/strict";
import test from "node:test";

import {
  isLegalGovernanceTransition,
  isLegalProposalStageTransition,
} from "./transitions.js";

test("proposal stage transitions do not promote proposals into ratified state", () => {
  assert.equal(isLegalProposalStageTransition("draft", "proposed"), true);
  assert.equal(isLegalProposalStageTransition("proposed", "archived"), true);
  assert.equal(isLegalGovernanceTransition("proposed", "ratified"), false);
  assert.equal(isLegalGovernanceTransition("ratified", "superseded"), true);
});
