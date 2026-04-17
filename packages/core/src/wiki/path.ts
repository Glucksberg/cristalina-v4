import { isAbsolute, normalize } from "node:path/posix";

const WIKI_PAGE_PREFIX = "wiki/pages/";

export function isStoreRelativeWikiPagePath(path: string): boolean {
  if (path.length === 0 || isAbsolute(path)) {
    return false;
  }

  const normalized = normalize(path);
  return normalized === path && normalized.startsWith(WIKI_PAGE_PREFIX) && normalized.endsWith(".md");
}

export function assertStoreRelativeWikiPagePath(path: string): void {
  if (!isStoreRelativeWikiPagePath(path)) {
    throw new Error(`Wiki page path must stay within wiki/pages and end with .md: ${path}`);
  }
}
