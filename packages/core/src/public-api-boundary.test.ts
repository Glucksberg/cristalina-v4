import assert from "node:assert/strict";
import test from "node:test";

import * as internalApi from "./internal.js";
import * as publicApi from "./index.js";

function importPackageSpecifier(specifier: string): Promise<Record<string, unknown>> {
  return import(specifier) as Promise<Record<string, unknown>>;
}

function isPackagePathNotExported(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
  );
}

test("public core entrypoint does not export raw persistence or canon mutation primitives", () => {
  for (const name of [
    "writeCoreRecord",
    "readCoreRecord",
    "initializeStore",
    "loadSourceRecords",
    "loadCanonicalRecords",
    "loadWorldClaims",
    "writeVectorArtifact",
    "writeEmbeddingVector",
    "writeSnapshotManifest",
    "writeSnapshotRecordCopies",
    "appendAuditChange",
    "appendValidationLog",
    "applyApprovedCanonicalCreate",
    "applyApprovedCanonicalRevise",
    "applyApprovedCanonicalSupersede",
    "evaluateCanonicalProposal",
    "applyApprovedCanonicalProposal",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(publicApi, name), false, `${name} must stay off the public adapter API`);
  }
});

test("internal core entrypoint is the explicit home for raw persistence and mutation primitives", () => {
  for (const name of [
    "writeCoreRecord",
    "loadSourceRecords",
    "writeSnapshotManifest",
    "appendAuditChange",
    "evaluateCanonicalProposal",
    "applyApprovedCanonicalProposal",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(internalApi, name), true, `${name} must stay internal-only`);
  }
});

test("public core entrypoint exposes workflow writes instead of raw store writers", () => {
  for (const name of [
    "writeConversationPreferenceFlowToStore",
    "writeOpenClawPreferenceFeedbackFlowToStore",
    "writeStructuredPreferenceSignalFlowToStore",
    "writeNonCanonicalIntakeToStore",
    "runWikiMaintenanceToStore",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(publicApi, name), true, `${name} must remain available through the public workflow API`);
  }
});

test("package export map exposes the public entrypoint but blocks internal and test-only subpaths", async () => {
  const packageApi = await importPackageSpecifier("@cristalina-v4/core");
  assert.equal(Object.prototype.hasOwnProperty.call(packageApi, "writeConversationPreferenceFlowToStore"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(packageApi, "writeCoreRecord"), false);

  for (const specifier of [
    "@cristalina-v4/core/dist/internal.js",
    "@cristalina-v4/core/dist/testing.js",
    "@cristalina-v4/core/dist/test-support/conversation-preference-fixtures.js",
  ]) {
    await assert.rejects(
      () => importPackageSpecifier(specifier),
      isPackagePathNotExported,
      `${specifier} must stay outside the package export map`,
    );
  }
});

test("public validation boundary rejects source records that point outside raw evidence roots", () => {
  const baseSourceRecord = {
    id: "src_public_boundary_001",
    kind: "source_record",
    layer: "raw",
    authoritative_home: "raw",
    created_at: "2026-04-25T00:00:00.000Z",
    visibility_state: {
      privacy_scope: "project_private",
    },
    provenance: {
      source_type: "boundary_test",
      source_ref: "public-api-boundary",
    },
  };

  assert.deepEqual(
    publicApi.validateCoreRecord({
      ...baseSourceRecord,
      content_ref: "raw/sources/public-boundary-001.json",
    }),
    [],
  );

  for (const content_ref of [
    "wiki/index.md",
    "raw/sources/../../canon/preferences/mem.json",
  ]) {
    const issues = publicApi.validateCoreRecord({
      ...baseSourceRecord,
      content_ref,
    });
    assert.ok(
      issues.some((issue) => issue.path === "content_ref"),
      `expected public validation to reject ${content_ref}`,
    );
  }
});
