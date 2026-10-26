import { GameError } from "./index";

// The only domain vocabulary exception: persisted pre-rename records and old
// clients must remain readable. Keep legacy names at this boundary, not in rules.
export const legacyStoryFields = {
  pages: "storyNodes",
  page: "storyNode",
  pageId: "storyNodeId",
  entryPageId: "entryStoryNodeId",
  targetPageId: "targetStoryNodeId",
  pageType: "storyNodeType",
  sourcePage: "sourceStoryNode",
  pagePositions: "storyNodePositions",
  pageTitle: "storyNodeTitle",
} as const;
const reverse = Object.fromEntries(
  Object.entries(legacyStoryFields).map(([a, b]) => [b, a]),
);
// Fields whose keys are author or player IDs, so an ID such as "pageId" is kept.
// Every ID-keyed map in the contracts must be listed (see story-naming tests).
export const storyDictionaries: ReadonlySet<string> = new Set([
  "pages",
  "storyNodes",
  "pagePositions",
  "storyNodePositions",
  "clips",
  "items",
  "scores",
  "stats",
  "statsSnapshot",
  "values", // S32 input names are authored identifiers, not contract fields.
]);

function convert(
  value: unknown,
  names: Record<string, string>,
  dictionary = false,
): unknown {
  if (Array.isArray(value)) return value.map((item) => convert(item, names));
  if (!value || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      const target =
        !dictionary && Object.hasOwn(names, key) ? names[key] : key;
      if (target !== key && Object.hasOwn(record, target))
        throw new GameError(
          "VALIDATION_FAILED",
          "Conflicting StoryNode field names.",
        );
      return [
        target,
        convert(item, names, !dictionary && storyDictionaries.has(key)),
      ];
    }),
  );
}

export const readStoryData = <T = unknown>(value: unknown): T =>
  convert(value, legacyStoryFields) as T;
export const legacyStoryData = (value: unknown): unknown =>
  convert(value, reverse);
export const legacyStoryStorage = {
  nodes: "pages",
  library: "pageLibrary",
  libraryReceiptScope: "page",
  fixtureEdition: "pages-v1",
} as const;

export const storyContractHeader = "X-Story-Contract";
export const storyContractVersion = "story-nodes-v1";

export function storyApiPath(path: string): string {
  return path
    .replace(/^\/api\/pages(?=\/|$)/, "/api/story-nodes")
    .replace(/^\/api\/shared-pages(?=\/|$)/, "/api/shared-story-nodes");
}

// Keep old command fingerprints stable across renamed request keys/routes.
export function legacyCommand(value: {
  segments: string[];
  command: unknown;
}): unknown {
  const segments = [...value.segments];
  if (segments[1] === "story-nodes") segments[1] = "pages";
  return { segments, command: legacyStoryData(value.command) };
}

export const storyPreviewPath = (path: string): string =>
  path.replace(/^\/p(?=\/)/, "/story-nodes");
