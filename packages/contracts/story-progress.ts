// Private account history projections, not live branch/access assertions.
export type StoryProgressHistory = {
  items: Array<{ storyId: string; title: string; completions: number }>;
  nextCursor: string | null;
};
export type StoryKeyHistory = {
  items: Array<{
    keyId: string;
    label: string;
    earnedAt: number;
    versionId: string;
    runId: string;
    source: "completion-count" | "achievement";
  }>;
  nextCursor: string | null;
};
