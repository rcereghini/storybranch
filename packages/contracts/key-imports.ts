// Start-screen projection only. It contains declarations, never player grants.
export type StoryImportOffer = {
  storyId: string;
  versionId: string;
  title: string;
  keys: Array<{
    keyId: string;
    label: string;
    sourceTitle: string;
    required: boolean;
    selection?: "ever-earned" | "completed-run";
    sourceStoryId?: string;
    sourceVersionId?: string;
  }>;
};
export type StorySourceRuns = {
  items: Array<{ runId: string; completedAt: number; endingTitle: string }>;
  nextCursor: string | null;
};
