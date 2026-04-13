import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProjectionReadDecision,
  filterProjectionRecords,
  partitionProjectionClaimsForRuntime,
} from "./projection.js";

test("projection read gate suppresses runtime-private records from a foreign thread context", () => {
  const record = {
    id: "wcl_runtime_private_other",
    kind: "preference",
    visibility_state: {
      privacy_scope: "runtime_private" as const,
    },
    provenance: {
      source_type: "conversation",
      source_ref: "runtime/other#turn-001",
      runtime_ref: "runtime_other",
      session_ref: "session_other",
      thread_ref: "thread_other",
    },
  };

  const decision = evaluateProjectionReadDecision(record, {
    adapter: "openclaw",
    audience: "runtime",
    runtime_instance_ref: "runtime_current",
    runtime_session_ref: "session_current",
    conversation_thread_ref: "thread_current",
  });

  assert.equal(decision.include, false);
  assert.equal(decision.reason_code, "runtime_instance_mismatch");
});

test("projection read gate keeps runtime-private records when projection context matches", () => {
  const record = {
    id: "wcl_runtime_private_current",
    kind: "preference",
    visibility_state: {
      privacy_scope: "runtime_private" as const,
    },
    provenance: {
      source_type: "conversation",
      source_ref: "runtime/current#turn-001",
      runtime_ref: "runtime_current",
      session_ref: "session_current",
      thread_ref: "thread_current",
    },
  };

  const result = filterProjectionRecords([record], {
    adapter: "openclaw",
    audience: "runtime",
    runtime_instance_ref: "runtime_current",
    runtime_session_ref: "session_current",
    conversation_thread_ref: "thread_current",
  });

  assert.deepEqual(result.included.map((entry) => entry.id), ["wcl_runtime_private_current"]);
  assert.deepEqual(result.suppressed, []);
});

test("runtime claim partition moves disputed or historical claims out of the active set", () => {
  const result = partitionProjectionClaimsForRuntime(
    [
      {
        id: "wcl_active",
        kind: "preference",
        visibility_state: {
          privacy_scope: "owner_private",
        },
        provenance: {
          source_type: "conversation",
          source_ref: "runtime/current#turn-001",
        },
        epistemic_state: "confirmed",
        temporal_state: {
          temporal_status: "active",
        },
      },
      {
        id: "wcl_trace",
        kind: "preference",
        visibility_state: {
          privacy_scope: "owner_private",
        },
        provenance: {
          source_type: "conversation",
          source_ref: "runtime/current#turn-002",
        },
        epistemic_state: "disputed",
        temporal_state: {
          temporal_status: "historical",
        },
      },
    ],
    {
      adapter: "openclaw",
      audience: "runtime",
    },
  );

  assert.deepEqual(result.active.map((entry) => entry.id), ["wcl_active"]);
  assert.deepEqual(result.trace.map((entry) => entry.id), ["wcl_trace"]);
});
