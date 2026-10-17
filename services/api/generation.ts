import { createHash, randomUUID } from "node:crypto";
import type { DocumentData } from "firebase-admin/firestore";
import {
  generationCommand,
  type GenerationJob,
  type GenerationCommand,
} from "../../packages/contracts/generation";
import { GameError } from "../../packages/contracts/index";
import { uploadLimits } from "../../packages/contracts/media";
import { db, bucket } from "./firebase";
import { assetView } from "./uploads";
import { sniffAsset } from "./video-check";

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function access(uid: string) {
  if (!process.env.FAL_KEY)
    return "AI generation is not connected yet. You can upload frames and edit videos now.";
  if (
    !(process.env.STORYBRANCH_GENERATOR_UIDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .includes(uid)
  )
    return "AI generation is not enabled for this account.";
  return null;
}
function view(id: string, data: DocumentData): GenerationJob {
  return {
    id,
    kind: data.kind,
    prompt: data.prompt,
    createdAt: data.createdAt,
    status:
      data.status === "submitting" && Date.now() - data.createdAt > 60000
        ? "uncertain"
        : data.status,
    ...(data.message ? { message: data.message } : {}),
    ...(data.asset ? { asset: data.asset } : {}),
  };
}
async function fal(url: string, body?: unknown) {
  if (new URL(url).origin !== "https://queue.fal.run")
    throw new Error("Invalid provider endpoint.");
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    redirect: "error",
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new Error(`Generation provider returned ${response.status}.`);
  return response.json();
}
async function reference(uid: string, assetId: string) {
  const asset = (await db.doc(`assets/${assetId}`).get()).data();
  if (
    !asset ||
    asset.ownerUid !== uid ||
    asset.status !== "ready" ||
    !asset.contentType.startsWith("image/")
  )
    throw new GameError(
      "VALIDATION_FAILED",
      "Choose a ready image from your own asset library.",
    );
  if (asset.bytes > 10 * 1024 * 1024)
    throw new GameError("VALIDATION_FAILED", "Reference image is too large.");
  const [bytes] = await bucket.file(asset.path).download();
  return `data:${asset.contentType};base64,${bytes.toString("base64")}`;
}
async function input(uid: string, command: GenerationCommand) {
  if (command.kind === "video")
    return {
      model: "fal-ai/wan-flf2v",
      input: {
        prompt: command.prompt,
        start_image_url: await reference(uid, command.firstId),
        end_image_url: await reference(uid, command.lastId),
        resolution: "480p",
        num_frames: 81,
        frames_per_second: 16,
        enable_safety_checker: true,
      },
    };
  return command.referenceId
    ? {
        model: "fal-ai/flux/dev/image-to-image",
        input: {
          prompt: command.prompt,
          image_url: await reference(uid, command.referenceId),
          strength: 0.65,
          num_images: 1,
          output_format: "jpeg",
          enable_safety_checker: true,
        },
      }
    : {
        model: "fal-ai/flux/schnell",
        input: {
          prompt: command.prompt,
          image_size: { width: 1024, height: 576 },
          num_images: 1,
          output_format: "jpeg",
          enable_safety_checker: true,
        },
      };
}
async function importResult(id: string, job: DocumentData, result: any) {
  const source =
    job.kind === "video" ? result.video?.url : result.images?.[0]?.url;
  if (result.has_nsfw_concepts?.some(Boolean) || !source)
    throw new Error("The provider did not return an eligible asset.");
  const url = new URL(source);
  if (
    url.protocol !== "https:" ||
    !(url.hostname === "fal.media" || url.hostname.endsWith(".fal.media"))
  )
    throw new Error("Unexpected generation media host.");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok || !response.body)
    throw new Error("Generated media could not be downloaded.");
  const max = job.kind === "video" ? uploadLimits.maxBytes : 10 * 1024 * 1024;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > max)
        throw new Error("Generated asset exceeds the library limit.");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  const contentType = sniffAsset(bytes.subarray(0, 64));
  if (
    !contentType ||
    !contentType.startsWith(job.kind === "video" ? "video/" : "image/")
  )
    throw new Error("Invalid generated media format.");
  const path = `uploads/${job.ownerUid}/generated-${id}`;
  // A deterministic asset ID makes repeated completion checks safe.
  const assetId = `generated-${id}`;
  const existing = (await db.doc(`assets/${assetId}`).get()).data();
  if (existing) return assetView(assetId, existing);
  const token = randomUUID();
  await bucket
    .file(path)
    .save(bytes, {
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
  const asset = {
    ownerUid: job.ownerUid,
    path,
    token,
    status: "ready",
    published: false,
    fileName: `Generated ${job.kind} ${id.slice(0, 8)}.${contentType.split("/")[1]}`,
    contentType,
    bytes: size,
    durationSeconds: job.kind === "video" ? 81 / 16 : 0,
    createdAt: Date.now(),
  };
  await db.doc(`assets/${assetId}`).set(asset);
  return assetView(assetId, asset);
}

export async function generation(
  request: Request,
  uid: string,
  segments: string[],
) {
  if (request.method === "GET" && segments.length === 2) {
    const records = await db
      .collection("generationJobs")
      .where("ownerUid", "==", uid)
      .get();
    const reason = access(uid);
    return {
      enabled: !reason,
      reason,
      jobs: records.docs
        .map((d) => view(d.id, d.data()))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50),
    };
  }
  if (request.method === "POST" && segments.length === 2) {
    const reason = access(uid);
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
    const owned = await db
      .collection("assets")
      .where("ownerUid", "==", uid)
      .count()
      .get();
    if (owned.data().count >= uploadLimits.maxAssets)
      throw new GameError(
        "VALIDATION_FAILED",
        "Your asset library is full. Generation was not submitted.",
      );
    const day = Math.floor(Date.now() / 86400000);
    const quota = db.doc(`generationQuotas/${digest(uid)}-${day}`);
    const data = {
      ownerUid: uid,
      fingerprint,
      kind: command.kind,
      prompt: command.prompt,
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
      if ((used.data()?.count ?? 0) >= 20)
        throw new GameError(
          "VALIDATION_FAILED",
          "Daily generation limit reached (20 requests). Try again tomorrow.",
        );
      tx.create(ref, data);
      tx.set(quota, { count: (used.data()?.count ?? 0) + 1 });
      return true;
    });
    if (created) {
      try {
        const result = await fal(
          `https://queue.fal.run/${prepared.model}`,
          prepared.input,
        );
        if (!result.request_id || !result.status_url || !result.response_url)
          throw new Error("Missing provider receipt.");
        await ref.update({
          status: "queued",
          requestId: result.request_id,
          statusUrl: result.status_url,
          responseUrl: result.response_url,
        });
      } catch {
        // Never automatically resubmit a possibly billed request.
        await ref.update({
          status: "uncertain",
          message:
            "Submission could not be confirmed. Check the fal dashboard before making another request.",
        });
      }
    }
    return view(id, (await ref.get()).data()!);
  }
  if (request.method === "POST" && segments.length === 3) {
    const ref = db.doc(`generationJobs/${segments[2]}`),
      job = (await ref.get()).data();
    if (!job || job.ownerUid !== uid)
      throw new GameError("NOT_FOUND", "Generation not found.");
    if (job.status !== "queued") return view(segments[2], job);
    const status = await fal(job.statusUrl);
    if (status.status !== "COMPLETED") return view(segments[2], job);
    if (status.error) {
      await ref.update({
        status: "failed",
        message:
          "The provider could not generate this asset. Review your prompt before trying again.",
      });
    } else {
      // Serialize media import across concurrent polling requests using a lease.
      const lease = randomUUID();
      const acquired = await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data()!;
        if (
          current.status !== "queued" ||
          (current.leaseUntil ?? 0) > Date.now()
        )
          return false;
        tx.update(ref, { lease, leaseUntil: Date.now() + 120000 });
        return true;
      });
      if (acquired) {
        try {
          const asset = await importResult(
            segments[2],
            job,
            await fal(job.responseUrl),
          );
          await ref.update({ status: "ready", asset, leaseUntil: 0 });
        } catch (error) {
          await ref.update({ leaseUntil: 0 });
          throw new GameError("UNAVAILABLE", (error as Error).message);
        }
      }
    }
    return view(segments[2], (await ref.get()).data()!);
  }
  throw new GameError("NOT_FOUND", "Route not found.");
}
