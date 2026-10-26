import { choiceSchema, type Choice } from "../../../packages/contracts/index";

export function itemRoutes(choice: Choice) {
  const o = choice.outcome;
  if (o.kind === "direct") return [{ label: "Selected route", route: o.route }];
  if (o.kind === "reveal")
    return o.results.map((r) => ({
      label: `Result ${r.scoreId}`,
      route: r.route,
    }));
  return [
    { label: "Pass", route: o.success },
    { label: "Fail", route: o.failure },
  ];
}

export function validateBranchItems(choice: Choice, storyId: string): Choice {
  const parsed = choiceSchema.parse(choice);
  const ids = [
    ...parsed.costs.map((c) => c.itemId),
    ...itemRoutes(parsed).flatMap((r) =>
      r.route.effects.flatMap((e) => (e.kind === "item" ? [e.itemId] : [])),
    ),
  ];
  if (ids.some((id) => !id.startsWith(storyId + ":")))
    throw new Error("Items must belong to this Story's namespace.");
  return parsed;
}
