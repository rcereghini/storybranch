import type { PlayerRun } from "../../../packages/contracts/player";
import { createContext, useContext, type ReactNode } from "react";
import type { StoryUser } from "../../../packages/contracts/index";
export type StoryContext = {
  story: { id: string; versionId: string; title: string };
  user: StoryUser;
  save: PlayerRun;
};
const Context = createContext<StoryContext | null>(null);
export function Story({
  children,
  ...context
}: StoryContext & { children: ReactNode }) {
  return <Context.Provider value={context}>{children}</Context.Provider>;
}
export function useStory() {
  const context = useContext(Context);
  if (!context) throw new Error("StoryNode must belong to a Story");
  return context;
}

export function useStoryContext() {
  return useStory().story;
}
export function usePlayerContext() {
  return useStory().save;
}
export function useUserContext() {
  return useStory().user;
}
