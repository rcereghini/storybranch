import type { Transaction } from "firebase-admin/firestore";
import {
  GameError,
  type Save,
  type Story,
} from "../../packages/contracts/index";
import type { StoryImportOffer } from "../../packages/contracts/key-imports";
import { db } from "./firebase";
import { edition } from "./story-store";
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
    const exported = source.progression?.keys.find(
      (k) => k.keyId === key.sourceKeyId,
    );
    if (!exported?.exportToStoryIds?.includes(story.id)) throw denied();
  }
  return definitions.map((key) => ({
    keyId: key.keyId,
    label: key.label,
    required: key.required,
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
    story.progression?.keys.flatMap((k) => k.exportToStoryIds ?? []) ?? [],
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
): Promise<Save["keyImportSnapshot"]> {
  const definitions = story.keyImports?.keys ?? [];
  if (!definitions.length) return undefined;
  const root = await tx.get(db.doc(`stories/${story.id}`));
  const creatorUid = root.data()?.creatorUid;
  if (!creatorUid) throw denied();
  await validateKeyImports(tx, story, creatorUid);
  const keys: NonNullable<Save["keyImportSnapshot"]>["keys"] = [];
  for (const key of definitions) {
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
