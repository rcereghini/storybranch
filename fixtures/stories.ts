import type { Choice, Story } from "../packages/contracts/index";
import { validateStory } from "../packages/domain/index";
const direct = (
  id: string,
  label: string,
  targetStoryNodeId: string,
  extra: Partial<Choice> = {},
): Choice => ({
  id,
  label,
  unavailableDisplay: "locked",
  costs: [],
  outcome: { kind: "direct", route: { targetStoryNodeId, effects: [] } },
  ...extra,
});
const node = (
  id: string,
  title: string,
  transcript: string,
  choices: Choice[],
  extra: Partial<Story["storyNodes"][string]> = {},
): Story["storyNodes"][string] => ({
  id,
  title,
  transcript,
  kind: "scene",
  storyNodeType: choices.length ? "video-options" : "video",
  video: `/media/glass-harbor-${id}-mock-v1-landscape.mp4`,
  entryEffects: [],
  choices,
  ...extra,
});
export const glassHarbor = validateStory({
  id: "glass-harbor",
  versionId: "story-nodes-v1",
  rulesetVersion: "prototype-1",
  title: "The Glass Harbor",
  entryStoryNodeId: "dock",
  storyNodes: {
    dock: node(
      "dock",
      "A signal in the fog",
      "The last ferry leaves you beneath a broken beacon. Somewhere in Glass Harbor, a stolen signal is calling your name. A courier waits beside the customs house.",
      [
        direct("courier", "Speak to the courier", "courier"),
        direct("market", "Slip into the night market", "market"),
        direct("pass", "Show your harbor pass", "success", {
          hint: "Requires a Glass Harbor pass",
          availableWhen: {
            kind: "key",
            keyId: "glass-harbor:harbor-pass",
            present: true,
          },
        }),
      ],
    ),
    courier: node(
      "courier",
      "A favor, remembered",
      "“If anyone asks, you never saw me.” The courier presses a glass pass into your palm. A single brass token pays your passage. You can return here, but the favor is given only once.",
      [
        direct("market", "Follow the lanterns to market", "market"),
        direct("dock", "Return to the docks", "dock"),
      ],
      {
        entryEffects: [
          {
            id: "courier-pass",
            kind: "key",
            keyId: "glass-harbor:harbor-pass",
            present: true,
          },
          {
            id: "courier-token",
            kind: "item",
            itemId: "glass-harbor:token",
            delta: 1,
          },
        ],
      },
    ),
    market: node(
      "market",
      "The lantern market",
      "Violet lanterns sway over the canal. A bell rings: the harbor watch has found your trail. Beyond the stalls, a rooftop path leads to the lighthouse. Two strangers offer detours of their own.",
      [
        direct("escape", "Run across the rooftops", "success", {
          hint: "Agility 8 check · failure leads to the watch",
          outcome: {
            kind: "check",
            condition: { kind: "stat", stat: "agility", op: "gte", value: 8 },
            success: { targetStoryNodeId: "success", effects: [] },
            failure: { targetStoryNodeId: "guard", effects: [] },
          },
        }),
        direct("pass", "Take the customs gate", "success", {
          hint: "Requires a Glass Harbor pass",
          availableWhen: {
            kind: "key",
            keyId: "glass-harbor:harbor-pass",
            present: true,
          },
        }),
        direct("dock", "Circle back to the docks", "dock"),
      ],
      { checkpoint: true, branchLocation: "harbor-market" },
    ),
    guard: node(
      "guard",
      "Caught in the searchlight",
      "The gap is wider than it looked. You land in the watch courtyard, surrounded. There is still time to surrender the signal, or refuse. This encounter uses authored choices; combat arrives in a later milestone.",
      [
        direct("yield", "Surrender the signal", "failure"),
        direct("bargain", "Offer the courier’s brass token", "success", {
          hint: "Costs 1 brass token",
          costs: [{ itemId: "glass-harbor:token", quantity: 1 }],
          availableWhen: {
            kind: "item",
            itemId: "glass-harbor:token",
            op: "gte",
            quantity: 1,
          },
        }),
      ],
    ),
    success: node(
      "success",
      "The light returns",
      "At dawn, the lighthouse speaks again. Across the water, a thousand windows answer. You kept the signal alive. Glass Harbor will remember.",
      [],
      {
        kind: "ending",
        entryEffects: [
          {
            id: "harbor-light",
            kind: "milestone",
            milestoneId: "glass-harbor:light-restored",
          },
        ],
      },
    ),
    failure: node(
      "failure",
      "A quieter harbor",
      "You hand over the signal. The watch lets you leave, but the lighthouse remains dark. Some stories end with a door left open. Another journey may find another way.",
      [],
      { kind: "ending" },
    ),
  },
});
function side(id: string, title: string, text: string): Story {
  return validateStory({
    id,
    versionId: "story-nodes-v1",
    rulesetVersion: "prototype-1",
    title,
    entryStoryNodeId: "arrival",
    storyNodes: {
      arrival: node(
        "arrival",
        title,
        text,
        [direct("help", "Follow the whisper", "ending")],
        {
          video: `/media/${id}-arrival-mock-v1-landscape.mp4`,
          entryEffects: [
            {
              id: "side-token",
              kind: "key",
              keyId: `${id}:secret`,
              present: true,
            },
          ],
        },
      ),
      ending: node(
        "ending",
        "A small light",
        "You leave a little of the darkness behind. Your main adventure waits exactly where you left it.",
        [],
        { kind: "ending", video: `/media/${id}-ending-mock-v1-landscape.mp4` },
      ),
    },
  });
}
export const stories = [
  glassHarbor,
  side(
    "bell-diver",
    "The Bell Diver",
    "Mara, a canal diver, asks you to recover a bell that rings only underwater.",
  ),
  side(
    "paper-moon",
    "Paper Moon",
    "Ivo folds a map into a paper moon. Tonight, its shadow points to a lost letter.",
  ),
];
export const branches = [
  {
    id: "bell-diver",
    storyId: "bell-diver",
    versionId: "story-nodes-v1",
    locationId: "harbor-market",
    sourceVersionId: "story-nodes-v1",
    title: "The Bell Diver",
    author: "Mara Vale",
  },
  {
    id: "paper-moon",
    storyId: "paper-moon",
    versionId: "story-nodes-v1",
    locationId: "harbor-market",
    sourceVersionId: "story-nodes-v1",
    title: "Paper Moon",
    author: "Ivo North",
  },
];
export const catalogue = {
  id: "glass-harbor",
  title: "The Glass Harbor",
  versionId: "story-nodes-v1",
  creator: "Storybranch Studio",
  genre: "Mystery",
  duration: "5–10 min",
  rating: "Teen · mild peril",
  description: "A city of secrets. One stolen signal. Your way out.",
};
