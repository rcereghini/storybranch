import { FieldPath, type Transaction } from "firebase-admin/firestore";
import {
  GameError,
  type Save,
  type Story,
  type SourceRunSelection,
} from "../../packages/contracts/index";
import type {
  StoryImportOffer,
  StorySourceRuns,
} from "../../packages/contracts/key-imports";
import { readStoryData } from "../../packages/contracts/legacy-story-format";
import { db } from "./firebase";
import { edition } from "./story-store";
import { sideStory } from "./side-story";
import { assertStoryEntry } from "./invitations";

const denied = () =>
  new GameError(
    "FORBIDDEN",
    "This Story's key import permission is unavailable. Contact its creator.",
  );

// Both sides explicitly permit the check. An edition pins narrative permission;
// no account grants are read during publication or the pre-consent offer.
export async function validateKeyImports(
  tx: Transaction,
  story: Story,
  creatorUid: string,
) {
  const definitions = story.keyImports?.keys ?? [];
  const sources = new Map<string, Story>();
  for (const key of definitions) {
    const sourceRoot = await tx.get(db.doc(`stories/${key.sourceStoryId}`));
    if (sourceRoot.data()?.creatorUid !== creatorUid) throw denied();
    const identity = `${key.sourceStoryId}/${key.sourceVersionId}`;
    let source = sources.get(identity);
    if (!source) {
      source = (await edition(tx, key.sourceStoryId, key.sourceVersionId))
        .story;
      sources.set(identity, source);
    }
    const exported = (
      key.selection === "completed-run"
        ? source.runKeyExports
        : source.progression
    )?.keys.find((k) => k.keyId === key.sourceKeyId);
    if (!exported?.exportToStoryIds?.includes(story.id)) throw denied();
  }
  return definitions.map((key) => ({
    keyId: key.keyId,
    label: key.label,
    required: key.required,
    ...(key.selection === "completed-run"
      ? {
          selection: "completed-run" as const,
          sourceStoryId: key.sourceStoryId,
          sourceVersionId: key.sourceVersionId,
        }
      : {}),
    sourceTitle: sources.get(`${key.sourceStoryId}/${key.sourceVersionId}`)!
      .title,
  }));
}

export async function validateKeyExports(
  tx: Transaction,
  story: Story,
  creatorUid: string,
) {
  const destinations = new Set(
    [
      ...(story.progression?.keys ?? []),
      ...(story.runKeyExports?.keys ?? []),
    ].flatMap((k) => k.exportToStoryIds ?? []),
  );
  for (const destination of destinations) {
    if (
      destination === story.id ||
      (await tx.get(db.doc(`stories/${destination}`))).data()?.creatorUid !==
        creatorUid
    )
      throw new GameError(
        "VALIDATION_FAILED",
        "Export destinations must be other saved Stories you own.",
      );
  }
}

export async function resolveKeyImports(
  tx: Transaction,
  uid: string,
  story: Story,
  consent: boolean,
  now: number,
  selections: SourceRunSelection[] = [],
): Promise<Save["keyImportSnapshot"]> {
  const definitions = story.keyImports?.keys ?? [];
  for (const selected of selections)
    if (
      !definitions.some(
        (k) =>
          k.selection === "completed-run" &&
          k.sourceStoryId === selected.sourceStoryId &&
          k.sourceVersionId === selected.sourceVersionId,
      )
    )
      throw new GameError(
        "VALIDATION_FAILED",
        "A selected source journey was not declared by this Story.",
      );
  if (!definitions.length) return undefined;
  const root = await tx.get(db.doc(`stories/${story.id}`));
  const creatorUid = root.data()?.creatorUid;
  if (!creatorUid) throw denied();
  await validateKeyImports(tx, story, creatorUid);
  const keys: NonNullable<Save["keyImportSnapshot"]>["keys"] = [];
  for (const key of definitions) {
    if (key.selection === "completed-run") {
      const selected = consent
        ? selections.find(
            (s) =>
              s.sourceStoryId === key.sourceStoryId &&
              s.sourceVersionId === key.sourceVersionId,
          )
        : undefined;
      let source: Save | undefined;
      if (selected) {
        const record = await tx.get(
          db.doc(`users/${uid}/playthroughs/${selected.runId}`),
        );
        source = record.exists ? readStoryData<Save>(record.data()) : undefined;
        if (
          !eligibleSource(
            source,
            uid,
            key.sourceStoryId,
            key.sourceVersionId,
          ) ||
          source!.id !== selected.runId
        )
          throw new GameError(
            "FORBIDDEN",
            "That completed source journey is unavailable. Choose another journey.",
          );
      }
      if (!source && key.required)
        throw new GameError(
          "FORBIDDEN",
          `Choose a completed source journey for ${key.label}.`,
        );
      keys.push({
        keyId: key.keyId,
        present: source?.keys.includes(key.sourceKeyId) ?? false,
        sourceStoryId: key.sourceStoryId,
        sourceVersionId: key.sourceVersionId,
        sourceKeyId: key.sourceKeyId,
        ...(source
          ? {
              sourceRun: {
                runId: source.id,
                revision: source.revision,
                completedAt: source.completion!.at,
                storyNodeId: source.completion!.storyNodeId,
              },
            }
          : {}),
      });
      continue;
    }
    const grant = consent
      ? (
          await tx.get(
            db.doc(
              `users/${uid}/storyProgress/${key.sourceStoryId}/keys/${key.sourceKeyId}`,
            ),
          )
        ).data()
      : undefined;
    if (key.required && !grant)
      throw new GameError(
        "FORBIDDEN",
        `Starting this Story requires approval and the earned key: ${key.label}.`,
      );
    keys.push({
      keyId: key.keyId,
      present: !!grant,
      sourceStoryId: key.sourceStoryId,
      sourceVersionId: key.sourceVersionId,
      sourceKeyId: key.sourceKeyId,
      ...(grant
        ? {
            grant: {
              runId: grant.runId,
              versionId: grant.versionId,
              at: grant.at,
            },
          }
        : {}),
    });
  }
  return { version: 1, consented: consent, at: now, keys };
}

function eligibleSource(
  source: Save | undefined,
  uid: string,
  storyId: string,
  versionId: string,
): source is Save {
  return (
    !!source &&
    source.playerUid === uid &&
    source.storyId === storyId &&
    source.versionId === versionId &&
    source.status === "completed" &&
    !!source.completion &&
    source.completion.version === 1 &&
    source.completion.revision === source.revision &&
    source.completion.storyNodeId === source.storyNodeId
  );
}

export async function storySourceRuns(
  uid: string,
  storyId: string,
  versionId: string,
  keyId: string,
  cursor: string | null,
): Promise<StorySourceRuns> {
  return db.runTransaction(async (tx) => {
    const listing = await tx.get(db.doc(`catalogue/${storyId}`));
    if (!listing.exists || listing.data()?.hidden === true) throw denied();
    await assertStoryEntry(tx, uid, storyId);
    const { story } = await edition(tx, storyId, versionId);
    return sourceRunsForStory(tx, uid, story, keyId, cursor);
  });
}

export async function storyImportOffer(
  uid: string,
  storyId: string,
): Promise<StoryImportOffer> {
  return db.runTransaction(async (tx) => {
    const listing = await tx.get(db.doc(`catalogue/${storyId}`));
    if (!listing.exists || listing.data()?.hidden === true)
      throw new GameError(
        "FORBIDDEN",
        "This Story is unavailable for a new journey.",
      );
    await assertStoryEntry(tx, uid, storyId);
    const root = await tx.get(db.doc(`stories/${storyId}`));
    const { story } = await edition(
      tx,
      storyId,
      root.data()!.publishedVersionId,
    );
    return {
      storyId,
      versionId: story.versionId,
      title: story.title,
      keys: await validateKeyImports(tx, story, root.data()!.creatorUid),
    };
  });
}

async function sourceRunsForStory(
  tx: Transaction,
  uid: string,
  story: Story,
  keyId: string,
  cursor: string | null,
): Promise<StorySourceRuns> {
  const root = await tx.get(db.doc(`stories/${story.id}`));
  await validateKeyImports(tx, story, root.data()!.creatorUid);
  const key = story.keyImports?.keys.find(
    (k) => k.keyId === keyId && k.selection === "completed-run",
  );
  if (!key)
    throw new GameError(
      "VALIDATION_FAILED",
      "No completed-run import is declared for that key.",
    );
  const { story: sourceStory } = await edition(
    tx,
    key.sourceStoryId,
    key.sourceVersionId,
  );
  let query = db
    .collection(`users/${uid}/playthroughs`)
    .where("storyId", "==", key.sourceStoryId)
    .orderBy(FieldPath.documentId())
    .limit(20);
  if (cursor) query = query.startAfter(cursor);
  const records = await tx.get(query);
  const items = records.docs.flatMap((record) => {
    const source = readStoryData<Save>(record.data());
    if (
      !eligibleSource(source, uid, key.sourceStoryId, key.sourceVersionId) ||
      source.id !== record.id
    )
      return [];
    const ending = sourceStory.storyNodes[source.storyNodeId];
    if (ending?.kind !== "ending") return [];
    return [
      {
        runId: source.id,
        completedAt: source.completion!.at,
        endingTitle: ending.title,
      },
    ];
  });
  return {
    items,
    nextCursor: records.size === 20 ? records.docs.at(-1)!.id : null,
  };
}

export async function sideStoryImports(
  uid: string,
  parentId: string,
  branchId: string,
  expectedRevision: number,
  versionId?: string,
  keyId?: string,
  cursor: string | null = null,
  storyId?: string,
) {
  return db.runTransaction(async (tx) => {
    const record = await tx.get(
      db.doc(`users/${uid}/playthroughs/${parentId}`),
    );
    if (!record.exists)
      throw new GameError("NOT_FOUND", "Adventure not found.");
    const parent = readStoryData<Save>(record.data());
    const { story } = await edition(tx, parent.storyId, parent.versionId);
    const child = await sideStory(
      tx,
      uid,
      parent,
      story,
      branchId,
      expectedRevision,
      versionId,
      storyId,
    );
    if (keyId) return sourceRunsForStory(tx, uid, child, keyId, cursor);
    const root = await tx.get(db.doc(`stories/${child.id}`));
    return {
      storyId: child.id,
      versionId: child.versionId,
      title: child.title,
      keys: await validateKeyImports(tx, child, root.data()!.creatorUid),
    } satisfies StoryImportOffer;
  });
}
