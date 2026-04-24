import assert from "node:assert/strict";
import test from "node:test";

import * as publicApi from "./index.js";

test("public core entrypoint does not export raw persistence or canon mutation primitives", () => {
  for (const name of [
    "writeCoreRecord",
    "appendAuditChange",
    "appendValidationLog",
    "evaluateCanonicalProposal",
    "applyApprovedCanonicalProposal",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(publicApi, name), false, `${name} must stay off the public adapter API`);
  }
});
