import assert from "node:assert/strict";
import test from "node:test";

import { assertAdapterRuntimeContextRefs } from "./runtime-context.js";

test("adapter runtime context ref checks reject provenance drift", () => {
  assert.doesNotThrow(() =>
    assertAdapterRuntimeContextRefs({
      adapter: "openclaw",
      operation: "non-canonical intake",
      ids: {
        runtime_instance: "runtime_openclaw_context_001",
        runtime_session: "session_openclaw_context_001",
        conversation_thread: "thread_openclaw_context_001",
      },
      source: {
        runtime_ref: "runtime_openclaw_context_001",
        session_ref: "session_openclaw_context_001",
        thread_ref: "thread_openclaw_context_001",
      },
    }),
  );

  assert.throws(
    () =>
      assertAdapterRuntimeContextRefs({
        adapter: "hermes",
        operation: "non-canonical intake",
        ids: {
          runtime_instance: "runtime_hermes_context_001",
          runtime_session: "session_hermes_context_001",
          conversation_thread: "thread_hermes_context_001",
        },
        source: {
          runtime_ref: "runtime_hermes_context_001",
          session_ref: "session_hermes_context_001",
          thread_ref: "thread_hermes_context_foreign",
        },
      }),
    /Hermes adapter non-canonical intake conversation_thread mismatch/,
  );
});
