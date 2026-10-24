import { createContext, useContext, type ReactNode } from "react";
import type { Save, StoryUser } from "../../../packages/contracts/index";
export type StoryContext = {
  story: { id: string; versionId: string; title: string };
  user: StoryUser;
  save: Save;
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
