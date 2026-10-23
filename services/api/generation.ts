import { createHash, randomUUID } from "node:crypto";
import type { DocumentData } from "firebase-admin/firestore";
import {
  generationCommand,
  generationLimits,
  imageCommandProblem,
  type GenerationJob,
  type ImageCommand,
} from "../../packages/contracts/generation";
import { GameError } from "../../packages/contracts/index";
import { uploadLimits } from "../../packages/contracts/media";
import { db, bucket } from "./firebase";
import * as paths from "./paths";
import { assetView } from "./uploads";
import { sniffAsset } from "./video-check";
import type { Features } from "../../packages/contracts/profile";

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function access(features: Features) {
  if (!process.env.OPENAI_API_KEY)
    return "AI generation is not connected yet. You can still upload photos and videos.";
  if (!features.generate)
    return "AI generation is not enabled for this account.";
  return null;
}
const quotaOf = (uid: string) =>
  db.doc(
    `generationQuotas/${digest(uid)}-${Math.floor(Date.now() / 86400000)}`,
  );
// Generation runs inside the submitting request, so a job still unfinished
// after the function's time limit was cut off and needs checking.
const staleAfter = 300000;
function view(id: string, data: DocumentData): GenerationJob {
  return {
    id,
    kind: data.kind,
    prompt: data.prompt,
    ...(data.quality ? { quality: data.quality } : {}),
    ...(data.aspect ? { aspect: data.aspect } : {}),
    createdAt: data.createdAt,
    status:
      ["ready", "failed", "uncertain"].includes(data.status) ||
      Date.now() - data.createdAt <= staleAfter
        ? data.status
        : "uncertain",
    ...(data.message ? { message: data.message } : {}),
    ...(data.asset ? { asset: data.asset } : {}),
  };
}
// A definite refusal from OpenAI (bad request, moderation) is not billed;
// any other failure may have been, so it is reported as uncertain.
class Refused extends Error {}
async function openai(path: "generations" | "edits", body: FormData | object) {
  const form = body instanceof FormData;
  const response = await fetch(`https://api.openai.com/v1/images/${path}`, {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      ...(form ? {} : { "Content-Type": "application/json" }),
    },
    body: form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(240000),
  });
  if (response.status === 400) {
    const error = (await response.json().catch(() => null))?.error;
    throw new Refused(
      error?.code === "moderation_blocked"
        ? "The safety system blocked this prompt or reference. Change it before trying again."
        : "The provider could not generate this image. Review your prompt before trying again.",
    );
  }
  if (!response.ok)
    throw new Error(`Generation provider returned ${response.status}.`);
  const image = (await response.json()).data?.[0]?.b64_json;
  if (typeof image !== "string")
    throw new Error("The provider did not return an image.");
  return Buffer.from(image, "base64");
}
const referenceTypes = ["image/png", "image/jpeg", "image/webp"];
async function reference(uid: string, assetId: string) {
  const asset = (await db.doc(paths.clip(uid, assetId)).get()).data();
  if (
    !asset ||
    asset.status !== "ready" ||
    !referenceTypes.includes(asset.contentType)
  )
    throw new GameError(
      "VALIDATION_FAILED",
      "Choose a ready PNG, JPEG or WebP image from your own asset library.",
    );
  if (asset.bytes > 10 * 1024 * 1024)
    throw new GameError("VALIDATION_FAILED", "Reference image is too large.");
  const [bytes] = await bucket.file(asset.path).download();
  return { assetId, bytes, contentType: asset.contentType as string };
}
// gpt-image-2 takes any size in multiples of 16, so every shape is exact.
const sizes = {
  "16:9": "1536x864",
  "9:16": "864x1536",
  "1:1": "1024x1024",
} as const;
// One model, two tiers: low quality is a quick, cheap draft; high quality
// can also follow reference images (the edit endpoint) for consistent
// characters.
async function input(uid: string, command: ImageCommand) {
  const settings = {
    model: "gpt-image-2",
    prompt: command.prompt,
    size: sizes[command.aspect],
    quality: command.quality === "draft" ? "low" : "high",
    n: 1,
    output_format: "jpeg",
    output_compression: 90,
  };
  const references = await Promise.all(
    (command.referenceIds ?? []).map((assetId) => reference(uid, assetId)),
  );
  if (!references.length)
    return { path: "generations" as const, body: settings };
  const form = new FormData();
  for (const [key, value] of Object.entries(settings))
    form.append(key, String(value));
  for (const image of references)
    form.append(
      "image[]",
      new Blob([new Uint8Array(image.bytes)], { type: image.contentType }),
      `${image.assetId}.${image.contentType.split("/")[1]}`,
    );
  return { path: "edits" as const, body: form };
}
async function saveResult(id: string, ownerUid: string, bytes: Buffer) {
  if (bytes.length > 10 * 1024 * 1024)
    throw new Error("Generated asset exceeds the library limit.");
  const contentType = sniffAsset(bytes.subarray(0, 64));
  if (!contentType?.startsWith("image/"))
    throw new Error("Invalid generated media format.");
  // A deterministic asset ID makes a repeated save safe.
  const assetId = `generated-${id}`;
  const path = paths.clipFile(ownerUid, assetId);
  const record = db.doc(paths.clip(ownerUid, assetId));
  const existing = (await record.get()).data();
  if (existing) return assetView(assetId, existing);
  const token = randomUUID();
  await bucket.file(path).save(bytes, {
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const asset = {
    ownerUid,
    path,
    token,
    status: "ready",
    published: false,
    fileName: `Generated image ${id.slice(0, 8)}.${contentType.split("/")[1]}`,
    contentType,
    bytes: bytes.length,
    durationSeconds: 0,
    createdAt: Date.now(),
  };
  await record.set(asset);
  return assetView(assetId, asset);
}

export async function generation(
  request: Request,
  uid: string,
  segments: string[],
  features: Features,
) {
  if (request.method === "GET" && segments.length === 2) {
    const records = await db
      .collection("generationJobs")
      .where("ownerUid", "==", uid)
      .get();
    const reason = access(features);
    const used = (await quotaOf(uid).get()).data()?.count ?? 0;
    return {
      enabled: !reason,
      reason,
      remaining: Math.max(0, generationLimits.daily - used),
      jobs: records.docs
        .map((d) => view(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50),
    };
  }
  if (request.method === "POST" && segments.length === 2) {
    const reason = access(features);
    if (reason) throw new GameError("FORBIDDEN", reason);
    const raw = await request.text();
    if (raw.length > 4096)
      throw new GameError("VALIDATION_FAILED", "Generation request too large.");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new GameError("VALIDATION_FAILED", "Invalid JSON.");
    }
    const command = generationCommand.parse(body);
    if (command.kind === "video")
      throw new GameError(
        "FORBIDDEN",
        "Video generation is turned off. Upload your own clips instead.",
      );
    const problem = imageCommandProblem(command);
    if (problem) throw new GameError("VALIDATION_FAILED", problem);
    const id = digest(`${uid}:${command.idempotencyKey}`),
      fingerprint = digest(JSON.stringify(command));
    const ref = db.doc(`generationJobs/${id}`);
    const existing = (await ref.get()).data();
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new GameError(
          "IDEMPOTENCY_CONFLICT",
          "This request key was used for another generation.",
        );
      return view(id, existing);
    }
    const prepared = await input(uid, command);
    const owned = await db.collection(paths.clips(uid)).count().get();
    if (owned.data().count >= uploadLimits.maxAssets)
      throw new GameError(
        "VALIDATION_FAILED",
        "Your asset library is full. Generation was not submitted.",
      );
    const quota = quotaOf(uid);
    const data = {
      ownerUid: uid,
      fingerprint,
      kind: command.kind,
      prompt: command.prompt,
      quality: command.quality,
      aspect: command.aspect,
      status: "submitting",
      createdAt: Date.now(),
    };
    const created = await db.runTransaction(async (tx) => {
      const [previous, used] = await Promise.all([tx.get(ref), tx.get(quota)]);
      if (previous.exists) {
        if (previous.data()!.fingerprint !== fingerprint)
          throw new GameError(
            "IDEMPOTENCY_CONFLICT",
            "This request key was used for another generation.",
          );
        return false;
      }
      if ((used.data()?.count ?? 0) >= generationLimits.daily)
        throw new GameError(
          "VALIDATION_FAILED",
          `Daily generation limit reached (${generationLimits.daily} requests). Try again tomorrow.`,
        );
      tx.create(ref, data);
      tx.set(quota, { count: (used.data()?.count ?? 0) + 1 });
      return true;
    });
    if (created) {
      let bytes: Buffer | null = null;
      try {
        bytes = await openai(prepared.path, prepared.body);
      } catch (error) {
        // Never automatically resubmit a possibly billed request.
        await ref.update(
          error instanceof Refused
            ? { status: "failed", message: error.message }
            : {
                status: "uncertain",
                message:
                  "Generation could not be confirmed. Check your OpenAI usage before making another request.",
              },
        );
      }
      if (bytes) {
        try {
          await ref.update({
            status: "ready",
            asset: await saveResult(id, uid, bytes),
          });
        } catch (error) {
          await ref.update({
            status: "failed",
            message: (error as Error).message,
          });
        }
      }
    }
    return view(id, (await ref.get()).data()!);
  }
  // Status of a job that another request is still generating.
  if (request.method === "POST" && segments.length === 3) {
    const job = (await db.doc(`generationJobs/${segments[2]}`).get()).data();
    if (!job || job.ownerUid !== uid)
      throw new GameError("NOT_FOUND", "Generation not found.");
    return view(segments[2], job);
  }
  throw new GameError("NOT_FOUND", "Route not found.");
}
