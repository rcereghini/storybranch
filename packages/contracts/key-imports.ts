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
  }>;
};
