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
  assert.equal(decision.reason_code, "runtime_private_runtime_instance_mismatch");
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

test("projection read gate suppresses runtime-private records when the thread binding is more specific than the projection context", () => {
  const record = {
    id: "wcl_runtime_private_thread_scoped",
    kind: "preference",
    visibility_state: {
      privacy_scope: "runtime_private" as const,
    },
    provenance: {
      source_type: "conversation",
      source_ref: "runtime/current#turn-002",
      runtime_ref: "runtime_current",
      session_ref: "session_current",
      thread_ref: "thread_current",
    },
  };

  const decision = evaluateProjectionReadDecision(record, {
    adapter: "openclaw",
    audience: "runtime",
    runtime_instance_ref: "runtime_current",
    runtime_session_ref: "session_current",
  });

  assert.equal(decision.include, false);
  assert.equal(decision.reason_code, "runtime_private_conversation_thread_mismatch");
});

test("projection read gate suppresses owner-private records without identity bindings", () => {
  const record = {
    id: "wcl_owner_private_global",
    kind: "preference",
    visibility_state: {
      privacy_scope: "owner_private" as const,
    },
    provenance: {
      source_type: "conversation",
      source_ref: "runtime/current#turn-003",
    },
  };

  const decision = evaluateProjectionReadDecision(record, {
    adapter: "openclaw",
    audience: "runtime",
  });

  assert.equal(decision.include, false);
  assert.equal(decision.reason_code, "owner_private_missing_identity_binding");
});

test("projection read gate keeps owner-private identity-bound records when the identity context matches", () => {
  const record = {
    id: "actor_owner_current",
    kind: "actor_identity",
    visibility_state: {
      privacy_scope: "owner_private" as const,
    },
    provenance: {
      source_type: "runtime_identity",
      source_ref: "runtime/current#turn-003",
      actor_ref: "actor_owner_current",
    },
  };

  const decision = evaluateProjectionReadDecision(record, {
    adapter: "openclaw",
    audience: "runtime",
    owner_identity_ref: "actor_owner_current",
  });

  assert.equal(decision.include, true);
  assert.equal(decision.reason_code, "owner_private_identity_match");
});

test("projection read gate suppresses owner-private records when the projection context is broader than the record binding", () => {
  const record = {
    id: "wcl_owner_private_thread_scoped",
    kind: "preference",
    visibility_state: {
      privacy_scope: "owner_private" as const,
    },
    provenance: {
      source_type: "conversation",
      source_ref: "runtime/current#turn-004",
      runtime_ref: "runtime_current",
      session_ref: "session_current",
      thread_ref: "thread_current",
    },
  };

  const decision = evaluateProjectionReadDecision(record, {
    adapter: "openclaw",
    audience: "runtime",
    runtime_instance_ref: "runtime_current",
    runtime_session_ref: "session_current",
  });

  assert.equal(decision.include, false);
  assert.equal(decision.reason_code, "owner_private_conversation_thread_mismatch");
});

test("projection read gate keeps owner-private scoped records when the projection context matches", () => {
  const record = {
    id: "wcl_owner_private_current",
    kind: "preference",
    visibility_state: {
      privacy_scope: "owner_private" as const,
    },
    provenance: {
      source_type: "conversation",
      source_ref: "runtime/current#turn-005",
      runtime_ref: "runtime_current",
      session_ref: "session_current",
      thread_ref: "thread_current",
    },
  };

  const decision = evaluateProjectionReadDecision(record, {
    adapter: "openclaw",
    audience: "runtime",
    runtime_instance_ref: "runtime_current",
    runtime_session_ref: "session_current",
    conversation_thread_ref: "thread_current",
  });

  assert.equal(decision.include, true);
  assert.equal(decision.reason_code, "owner_private_context_match");
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
      {
        id: "wcl_bounded",
        kind: "preference",
        visibility_state: {
          privacy_scope: "owner_private",
        },
        provenance: {
          source_type: "conversation",
          source_ref: "runtime/current#turn-003",
        },
        epistemic_state: "confirmed",
        temporal_state: {
          temporal_status: "bounded",
        },
      },
    ],
    {
      adapter: "openclaw",
      audience: "runtime",
    },
  );

  assert.deepEqual(result.active.map((entry) => entry.id), ["wcl_active"]);
  assert.deepEqual(result.trace.map((entry) => entry.id), ["wcl_trace", "wcl_bounded"]);
});
