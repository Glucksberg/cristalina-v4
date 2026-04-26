import type { RuntimeKind } from "../types.js";

export type AdapterRuntimeKind = Exclude<RuntimeKind, "generic">;

export interface AdapterRuntimeContextRefs {
  runtime_instance?: string;
  runtime_session?: string;
  conversation_thread?: string;
}

export interface AdapterRuntimeSourceRefs {
  runtime_ref?: string | null;
  session_ref?: string | null;
  thread_ref?: string | null;
}

export interface AdapterRuntimeContextRefCheckInput {
  adapter: AdapterRuntimeKind;
  operation: string;
  ids: AdapterRuntimeContextRefs;
  source: AdapterRuntimeSourceRefs;
}

function adapterLabel(adapter: AdapterRuntimeKind): string {
  if (adapter === "openclaw") {
    return "OpenClaw";
  }
  if (adapter === "hermes") {
    return "Hermes";
  }

  return adapter;
}

function assertMatchingRuntimeRef(input: {
  adapter: AdapterRuntimeKind;
  operation: string;
  label: keyof AdapterRuntimeContextRefs;
  id?: string;
  source_ref?: string | null;
}): void {
  if (!input.id || !input.source_ref || input.id === input.source_ref) {
    return;
  }

  throw new Error(
    `${adapterLabel(input.adapter)} adapter ${input.operation} ${input.label} mismatch: ids.${input.label}=${input.id} does not match source ref ${input.source_ref}`,
  );
}

export function assertAdapterRuntimeContextRefs(input: AdapterRuntimeContextRefCheckInput): void {
  assertMatchingRuntimeRef({
    adapter: input.adapter,
    operation: input.operation,
    label: "runtime_instance",
    id: input.ids.runtime_instance,
    source_ref: input.source.runtime_ref,
  });
  assertMatchingRuntimeRef({
    adapter: input.adapter,
    operation: input.operation,
    label: "runtime_session",
    id: input.ids.runtime_session,
    source_ref: input.source.session_ref,
  });
  assertMatchingRuntimeRef({
    adapter: input.adapter,
    operation: input.operation,
    label: "conversation_thread",
    id: input.ids.conversation_thread,
    source_ref: input.source.thread_ref,
  });
}
