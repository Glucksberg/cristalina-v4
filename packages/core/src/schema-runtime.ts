import { readFileSync } from "node:fs";

type JsonPrimitive = string | number | boolean | null;

export interface JsonSchema {
  $id?: string;
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  not?: JsonSchema;
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  type?: string | string[];
  const?: JsonPrimitive;
  enum?: JsonPrimitive[];
  pattern?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minProperties?: number;
  maxProperties?: number;
  properties?: Record<string, JsonSchema>;
  propertyNames?: JsonSchema;
  required?: string[];
  dependentRequired?: Record<string, string[]>;
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
  minItems?: number;
  uniqueItems?: boolean;
  additionalProperties?: boolean | JsonSchema;
  contains?: JsonSchema;
}

export interface SchemaValidationIssue {
  path: string;
  message: string;
}

export const OBJECT_ENVELOPE_SCHEMA_ID = "https://cristalina-v4.local/schemas/object-envelope.schema.json";
export const MEMORY_OBJECT_SCHEMA_ID = "https://cristalina-v4.local/schemas/memory-object.schema.json";
export const TEMPORAL_WORLD_RECORD_SCHEMA_ID = "https://cristalina-v4.local/schemas/temporal-world-record.schema.json";
export const CONTRADICTION_RESOLUTION_SCHEMA_ID = "https://cristalina-v4.local/schemas/contradiction-resolution.schema.json";
export const DISPOSITION_RECORD_SCHEMA_ID = "https://cristalina-v4.local/schemas/disposition-record.schema.json";
export const RUNTIME_IDENTITY_SCHEMA_ID = "https://cristalina-v4.local/schemas/runtime-identity.schema.json";
export const SOURCE_INTAKE_PROFILE_SCHEMA_ID = "https://cristalina-v4.local/schemas/source-intake-profile.schema.json";
export const STORE_MANIFEST_SCHEMA_ID = "https://cristalina-v4.local/schemas/store-manifest.schema.json";

const SCHEMA_PATHS = [
  "../../../schemas/object-envelope.schema.json",
  "../../../schemas/memory-object.schema.json",
  "../../../schemas/temporal-world-record.schema.json",
  "../../../schemas/contradiction-resolution.schema.json",
  "../../../schemas/disposition-record.schema.json",
  "../../../schemas/runtime-identity.schema.json",
  "../../../schemas/source-intake-profile.schema.json",
  "../../../schemas/store-manifest.schema.json",
] as const;

function loadSchema(relativePath: string): JsonSchema {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return JSON.parse(source) as JsonSchema;
}

const SCHEMA_REGISTRY = new Map<string, JsonSchema>(
  SCHEMA_PATHS.map((path) => {
    const schema = loadSchema(path);
    if (!schema.$id) {
      throw new Error(`Schema at ${path} is missing $id`);
    }
    return [schema.$id, schema];
  }),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTypeMatch(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case "array":
      return Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "null":
      return value === null;
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "object":
      return isRecord(value) && !Array.isArray(value);
    case "string":
      return typeof value === "string";
    default:
      return true;
  }
}

function resolveRef(schema: JsonSchema, ref: string, registry: Map<string, JsonSchema>): JsonSchema | undefined {
  if (ref.startsWith("#/$defs/")) {
    const defKey = ref.slice("#/$defs/".length);
    return schema.$defs?.[defKey];
  }

  return registry.get(ref);
}

function validateNode(
  value: unknown,
  schema: JsonSchema,
  path: string,
  registry: Map<string, JsonSchema>,
): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];

  if (schema.$ref) {
    const referenced = resolveRef(schema, schema.$ref, registry);
    if (!referenced) {
      return [{ path, message: `unresolved schema ref: ${schema.$ref}` }];
    }
    issues.push(...validateNode(value, referenced, path, registry));
  }

  if (schema.allOf) {
    for (const branch of schema.allOf) {
      issues.push(...validateNode(value, branch, path, registry));
    }
  }

  if (schema.oneOf) {
    const matchingBranches = schema.oneOf.filter((branch) => validateNode(value, branch, path, registry).length === 0);
    if (matchingBranches.length !== 1) {
      issues.push({ path, message: "expected value to match exactly one schema variant" });
    }
  }

  if (schema.anyOf) {
    const anyMatch = schema.anyOf.some((branch) => validateNode(value, branch, path, registry).length === 0);
    if (!anyMatch) {
      issues.push({ path, message: "expected value to match at least one schema variant" });
    }
  }

  if (schema.not && validateNode(value, schema.not, path, registry).length === 0) {
    issues.push({ path, message: "value matched forbidden schema" });
  }

  if (schema.type) {
    const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowedTypes.some((expectedType) => isTypeMatch(value, expectedType))) {
      issues.push({ path, message: `expected type ${allowedTypes.join(" or ")}` });
      return issues;
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    issues.push({ path, message: `expected constant ${JSON.stringify(schema.const)}` });
  }

  if (schema.enum && !schema.enum.includes(value as JsonPrimitive)) {
    issues.push({ path, message: `expected one of: ${schema.enum.join(", ")}` });
  }

  if (schema.pattern && typeof value === "string" && !new RegExp(schema.pattern).test(value)) {
    issues.push({ path, message: `expected string matching ${schema.pattern}` });
  }

  if (schema.format === "date-time" && typeof value === "string" && Number.isNaN(Date.parse(value))) {
    issues.push({ path, message: "expected date-time string" });
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push({ path, message: `expected minimum length ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      issues.push({ path, message: `expected maximum length ${schema.maxLength}` });
    }
  }

  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push({ path, message: `expected minimum ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push({ path, message: `expected maximum ${schema.maximum}` });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push({ path, message: `expected at least ${schema.minItems} item(s)` });
    }

    if (schema.uniqueItems) {
      const seen = new Set<string>();
      for (const entry of value) {
        const marker = JSON.stringify(entry);
        if (seen.has(marker)) {
          issues.push({ path, message: "expected unique array items" });
          break;
        }
        seen.add(marker);
      }
    }

    if (schema.items) {
      value.forEach((entry, index) => {
        issues.push(...validateNode(entry, schema.items as JsonSchema, `${path}[${index}]`, registry));
      });
    }

    if (schema.prefixItems) {
      schema.prefixItems.forEach((entrySchema, index) => {
        if (index < value.length) {
          issues.push(...validateNode(value[index], entrySchema, `${path}[${index}]`, registry));
        }
      });
    }

    if (schema.contains) {
      const matchesContains = value.some((entry, index) => validateNode(entry, schema.contains as JsonSchema, `${path}[${index}]`, registry).length === 0);
      if (!matchesContains) {
        issues.push({ path, message: "expected array to contain a matching item" });
      }
    }
  }

  if (isRecord(value)) {
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      issues.push({ path, message: `expected minimum properties ${schema.minProperties}` });
    }
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) {
      issues.push({ path, message: `expected maximum properties ${schema.maxProperties}` });
    }

    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!(key in value)) {
        issues.push({ path: path === "$" ? key : `${path}.${key}`, message: "missing required property" });
      }
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value) {
        issues.push(...validateNode(value[key], propertySchema, path === "$" ? key : `${path}.${key}`, registry));
      }
    }

    if (schema.propertyNames) {
      for (const key of Object.keys(value)) {
        issues.push(...validateNode(key, schema.propertyNames, path === "$" ? key : `${path}.${key}`, registry));
      }
    }

    for (const [key, requirements] of Object.entries(schema.dependentRequired ?? {})) {
      if (key in value) {
        for (const requiredKey of requirements) {
          if (!(requiredKey in value)) {
            issues.push({
              path: path === "$" ? requiredKey : `${path}.${requiredKey}`,
              message: `required because ${key} is present`,
            });
          }
        }
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          issues.push({ path: path === "$" ? key : `${path}.${key}`, message: "unexpected property" });
        }
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) {
          issues.push(
            ...validateNode(
              value[key],
              schema.additionalProperties,
              path === "$" ? key : `${path}.${key}`,
              registry,
            ),
          );
        }
      }
    }
  }

  if (schema.if) {
    const ifIssues = validateNode(value, schema.if, path, registry);
    if (ifIssues.length === 0 && schema.then) {
      issues.push(...validateNode(value, schema.then, path, registry));
    }
    if (ifIssues.length > 0 && schema.else) {
      issues.push(...validateNode(value, schema.else, path, registry));
    }
  }

  return issues;
}

export function validateAgainstSchema(value: unknown, schemaId: string): SchemaValidationIssue[] {
  const schema = SCHEMA_REGISTRY.get(schemaId);
  if (!schema) {
    return [{ path: "$", message: `schema not registered: ${schemaId}` }];
  }

  return validateNode(value, schema, "$", SCHEMA_REGISTRY);
}

export function validateValueAgainstJsonSchema(
  value: unknown,
  schema: JsonSchema,
  extraRegistry?: Map<string, JsonSchema>,
): SchemaValidationIssue[] {
  const registry = extraRegistry ?? new Map<string, JsonSchema>();
  if (schema.$id) {
    registry.set(schema.$id, schema);
  }
  return validateNode(value, schema, "$", registry);
}
