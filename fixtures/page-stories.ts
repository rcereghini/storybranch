import type { Choice, StoryPage } from "../packages/contracts/index";
import { validateStory } from "../packages/domain/index";
const next = (
  targetPageId: string,
  label = "Continue",
  extra: Partial<Choice> = {},
): Choice => ({
  id: targetPageId,
  label,
  costs: [],
  unavailableDisplay: "locked",
  outcome: { kind: "direct", route: { targetPageId, effects: [] } },
  ...extra,
});
const page = (
  id: string,
  pageType: StoryPage["pageType"],
  title: string,
  transcript: string,
  choices: Choice[],
  extra: Partial<StoryPage> = {},
): StoryPage => ({
  id,
  pageType,
  title,
  transcript,
  kind: choices.length ? "scene" : "ending",
  entryEffects: [],
  choices,
  ...extra,
});
const film = "/media/glass-harbor-market-mock-v1-landscape.mp4";
export const pageStories = [
  validateStory({
    id: "clockwork-door",
    versionId: "pages-v1",
    rulesetVersion: "prototype-1",
    title: "The Clockwork Door",
    entryPageId: "letter",
    pages: {
      letter: page(
        "letter",
        "text",
        "A letter at midnight",
        "Your aunt left you a clockwork key and a warning: never open the door before the thirteenth chime.",
        [next("hall")],
        {
          entryEffects: [
            {
              id: "inherit-key",
              kind: "key",
              keyId: "clockwork-door:key",
              present: true,
            },
          ],
        },
      ),
      hall: page(
        "hall",
        "text-options",
        "The thirteenth chime",
        "The key warms in your hand. You can open the door, study the mechanism, or leave it sealed.",
        [
          next("room", "Use the clockwork key", {
            availableWhen: {
              kind: "key",
              keyId: "clockwork-door:key",
              present: true,
            },
          }),
          next("study", "Study the mechanism", {
            availableWhen: {
              kind: "stat",
              stat: "intellect",
              op: "gte",
              value: 5,
            },
          }),
          next("sealed", "Walk away"),
        ],
      ),
      study: page(
        "study",
        "text",
        "A familiar signature",
        "The gears spell your name. This machine was built for you.",
        [next("room")],
      ),
      room: page(
        "room",
        "video",
        "The city beyond the door",
        "A city of violet lanterns waits on the other side. Watch, then continue.",
        [next("home")],
        { video: film },
      ),
      home: page(
        "home",
        "text",
        "A new beginning",
        "You step through. The key becomes a compass. This is where your next story begins.",
        [],
      ),
      sealed: page(
        "sealed",
        "text",
        "Some doors can wait",
        "You pocket the key and return home. The choice is yours to keep.",
        [],
      ),
    },
  }),
  validateStory({
    id: "storm-signal",
    versionId: "pages-v1",
    rulesetVersion: "prototype-1",
    title: "The Storm Signal",
    entryPageId: "approach",
    pages: {
      approach: page(
        "approach",
        "video-options",
        "The last transmission",
        "A storm has silenced the relay. Climb the mast or take the sheltered path.",
        [next("roll", "Climb the mast"), next("shelter", "Take shelter")],
        { video: "/media/glass-harbor-guard-mock-v1-landscape.mp4" },
      ),
      roll: page(
        "roll",
        "dice",
        "Hold fast",
        "Roll a d20. A result of 10 or higher restores the signal. A lower roll sends you to shelter.",
        [
          {
            id: "roll",
            label: "Roll d20",
            costs: [],
            unavailableDisplay: "locked",
            outcome: {
              kind: "dice",
              sides: 20,
              target: 10,
              success: {
                targetPageId: "signal",
                effects: [
                  {
                    id: "signal-key",
                    kind: "key",
                    keyId: "storm-signal:restored",
                    present: true,
                  },
                ],
              },
              failure: { targetPageId: "shelter", effects: [] },
            },
          },
        ],
      ),
      signal: page(
        "signal",
        "text-options",
        "A voice through the storm",
        "Your roll restored the relay. Its signal can now guide the fleet.",
        [
          next("rescued", "Guide the fleet", {
            availableWhen: {
              kind: "key",
              keyId: "storm-signal:restored",
              present: true,
            },
          }),
          next("shelter", "Leave the relay transmitting"),
        ],
      ),
      rescued: page(
        "rescued",
        "video",
        "Lights on the horizon",
        "Every ship answers. The fleet has found its way home.",
        [],
        { video: "/media/glass-harbor-success-mock-v1-landscape.mp4" },
      ),
      shelter: page(
        "shelter",
        "text",
        "Safe until morning",
        "The keeper welcomes you inside. The storm wins tonight; you live to try another day.",
        [],
      ),
    },
  }),
];
export const pageCatalogue = pageStories.map((story) => ({
  id: story.id,
  title: story.title,
  versionId: story.versionId,
  creator: "Storybranch Studio",
  genre: "Mixed-page prototype",
  duration: "2–3 min",
  rating: "Everyone · mild peril",
  description:
    story.id === "clockwork-door"
      ? "Text, keys, stat conditions and a window into another world."
      : "Video choices, a server-rolled d20 and branching outcomes.",
}));
