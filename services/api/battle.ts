import { createHash, randomInt } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import {
  GameError,
  id,
  choiceCommandSchema,
} from "../../packages/contracts/index";
import {
  battleStateSchema,
  battleHealthSchema,
} from "../../packages/contracts/battle";
import {
  battleCommandSchema,
  battleContractHeader,
  battleContractVersion,
  type BattleSave,
} from "../../packages/contracts/battle-player";
import {
  stagedBattleStorySchema,
  type StagedBattleStory,
} from "../../packages/contracts/battle-graph";
import {
  advanceBattle,
  advanceBattleChoice,
} from "../../packages/domain/battle-player";
import { validateBattleState } from "../../packages/domain/battle";
import {
  playerRun,
  renderStoryNode,
  playerItemChanges,
} from "../../packages/domain/player";
import { db } from "./firebase";
import * as paths from "./paths";
import { prepareAchievement } from "./achievements";
import { prepareStoryProgress } from "./story-progress";
import { liveAccountKeys } from "./account-keys";
import { projectStoredPlayerData } from "./player-view";

async function loadEdition(tx: Transaction, save: BattleSave) {
  const ref = db.doc(`stories/${save.storyId}/versions/${save.versionId}`),
    manifest = await tx.get(ref);
  if (
    !manifest.exists ||
    manifest.data()!.ready !== true ||
    manifest.data()!.battleContract !== battleContractVersion
  )
    throw new GameError(
      "VALIDATION_FAILED",
      "This edition does not support battle commands.",
    );
  const nodes = await tx.get(ref.collection("storyNodes"));
  const {
    ready: _,
    battleContract: __,
    clips: ___,
    manifestHash: ____,
    ...data
  } = manifest.data()!;
  const story = stagedBattleStorySchema.parse({
    ...data,
    storyNodes: Object.fromEntries(nodes.docs.map((n) => [n.id, n.data()])),
  });
  if (story.id !== save.storyId || story.versionId !== save.versionId)
    throw new Error("Stored edition identity mismatch.");
  return story;
}
function view(
  story: StagedBattleStory,
  save: BattleSave,
  accountKeys: readonly string[],
) {
  return projectStoredPlayerData(() => {
    const node = story.storyNodes[save.storyNodeId];
    if (!node) throw Error("Missing current StoryNode.");
    const common = {
      save: playerRun(save),
      story: { id: story.id, versionId: story.versionId, title: story.title },
    };
    if (node.storyNodeType !== "battle")
      return {
        ...common,
        storyNode: renderStoryNode(
          node,
          save,
          accountKeys,
          story.itemCatalogue,
        ),
      };
    const state = battleStateSchema.parse(save.battle);
    if (
      !Number.isSafeInteger(save.revision) ||
      save.revision < state.identity.entryRevision + state.turns
    )
      throw Error("Invalid battle revision.");
    validateBattleState(
      node.battle,
      state,
      battleHealthSchema.parse(save.health),
      {
        ...state.identity,
        runId: save.id,
        storyId: save.storyId,
        versionId: save.versionId,
        storyNodeId: save.storyNodeId,
      },
    );
    return {
      ...common,
      battle: {
        battleId: state.battleId,
        title: node.title,
        transcript: node.transcript,
        phase: state.phase,
        turns: state.turns,
        maxTurns: node.battle.maxTurns,
        initiative: state.initiative,
        playerHealth: save.health,
        playerMaxHealth: 100,
        enemy: {
          name: node.battle.enemy.name,
          health: state.enemyHealth,
          maxHealth: node.battle.enemy.maxHealth,
        },
        actions:
          state.phase === "active"
            ? ["attack", "guard", "escape"]
            : ["continue"],
        ...(state.phase === "result-pending" ? { result: state.result } : {}),
      },
    };
  });
}
export async function battleRoutes(
  request: Request,
  uid: string,
  runId: string,
  choice = false,
) {
  id.parse(runId);
  if (request.headers.get(battleContractHeader) !== battleContractVersion)
    throw new GameError(
      "VALIDATION_FAILED",
      "Update the player before using battles.",
    );
  const action = request.method === "POST";
  if (!action && request.method !== "GET")
    throw new GameError("NOT_FOUND", "Route not found.");
  const raw = action ? await request.text() : "";
  if (raw.length > 4096)
    throw new GameError("VALIDATION_FAILED", "Command too large.");
  let parsed: unknown;
  if (action) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
    }
  }
  const command = action
    ? (choice ? choiceCommandSchema : battleCommandSchema).parse(parsed)
    : undefined;
  const digest = command
    ? createHash("sha256")
        .update(
          JSON.stringify({
            runId,
            ...(choice ? { kind: "choice" } : {}),
            command,
          }),
        )
        .digest("hex")
    : "";
  const now = Date.now();
  const rolls = new Map<number, number>();
  return db.runTransaction(async (tx) => {
    const ref = db.doc(paths.save(uid, runId)),
      snapshot = await tx.get(ref);
    if (!snapshot.exists)
      throw new GameError("NOT_FOUND", "Adventure not found.");
    const current = snapshot.data() as BattleSave;
    if (current.playerUid !== uid || current.id !== runId)
      throw new GameError("NOT_FOUND", "Adventure not found.");
    const story = await loadEdition(tx, current);
    if (!command) {
      const keys = await liveAccountKeys(tx, uid, story);
      return { player: view(story, current, keys) };
    }
    const receipt = db.doc(
      paths.receipt(
        uid,
        choice ? "battle-choice" : "battle",
        command.idempotencyKey,
      ),
    );
    const prior = await tx.get(receipt);
    if (prior.exists) {
      if (prior.data()!.requestHash !== digest)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "Command key was already used for a different request.",
        );
      return prior.data()!.response;
    }
    const keys = await liveAccountKeys(tx, uid, story);
    const moved = choice
      ? advanceBattleChoice(
          story,
          current,
          command,
          now,
          (sides) => {
            if (!rolls.has(sides)) rolls.set(sides, randomInt(1, sides + 1));
            return rolls.get(sides)!;
          },
          keys,
        )
      : advanceBattle(story, current, command, now);
    const achievement = await prepareAchievement(tx, uid, moved.save);
    const progress = await prepareStoryProgress(
      tx,
      uid,
      story,
      moved.save,
      achievement.approved,
    );
    // Persist exactly the JSON response: optional projection fields may be undefined.
    const response = JSON.parse(
      JSON.stringify({ player: view(story, moved.save, keys) }),
    );
    achievement.write();
    progress();
    tx.set(ref, moved.save);
    tx.create(
      db.doc(
        `${paths.events(uid, runId)}/${String(moved.save.revision).padStart(8, "0")}`,
      ),
      {
        ...moved.event,
        itemChanges: playerItemChanges(story, current.items, moved.save.items),
        commandId: command.idempotencyKey,
        ...(moved.save.completion?.revision === moved.save.revision
          ? { completion: moved.save.completion }
          : {}),
      },
    );
    tx.create(receipt, {
      actor: uid,
      requestHash: digest,
      response,
      at: now,
      ...paths.receiptExpiry(now),
    });
    return response;
  });
}

// Dispatch hint only. The command transaction re-reads ownership and edition.
export async function isBattleRun(uid: string, runId: string) {
  id.parse(runId);
  const save = await db.doc(paths.save(uid, runId)).get();
  if (
    !save.exists ||
    save.data()!.playerUid !== uid ||
    save.data()!.id !== runId
  )
    return false;
  const manifest = await db
    .doc(
      "stories/" + save.data()!.storyId + "/versions/" + save.data()!.versionId,
    )
    .get();
  return !!manifest.data()?.battleContract;
}
