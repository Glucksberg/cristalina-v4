import { isAbsolute, normalize, relative, resolve, sep } from "node:path";

const DERIVED_ROOT = "derived";

export function stripProjectionArtifactFragment(path: string): string {
  const [basePath] = path.split("#", 1);
  return basePath ?? path;
}

export function isStoreRelativeProjectionArtifactPath(path: string): boolean {
  const basePath = stripProjectionArtifactFragment(path).trim();
  if (basePath.length === 0 || isAbsolute(basePath)) {
    return false;
  }

  const normalizedBasePath = normalize(basePath);
  if (
    normalizedBasePath === "" ||
    normalizedBasePath === "." ||
    normalizedBasePath === ".." ||
    normalizedBasePath.startsWith(`..${sep}`)
  ) {
    return false;
  }

  const relativeFromDerived = relative(DERIVED_ROOT, normalizedBasePath);
  if (
    relativeFromDerived === "" ||
    relativeFromDerived === "." ||
    relativeFromDerived === ".." ||
    relativeFromDerived.startsWith(`..${sep}`) ||
    isAbsolute(relativeFromDerived)
  ) {
    return false;
  }

  return true;
}

export function resolveProjectionArtifactPath(rootDir: string, path: string): string {
  if (!isStoreRelativeProjectionArtifactPath(path)) {
    throw new Error(`Projection artifact path must stay within derived storage: ${path}`);
  }

  const rootPath = resolve(rootDir);
  const targetPath = resolve(rootPath, normalize(stripProjectionArtifactFragment(path).trim()));
  const relativeFromRoot = relative(rootPath, targetPath);

  if (
    relativeFromRoot === "" ||
    relativeFromRoot === "." ||
    relativeFromRoot === ".." ||
    relativeFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(relativeFromRoot)
  ) {
    throw new Error(`Projection artifact path must stay within store root: ${path}`);
  }

  return targetPath;
}
