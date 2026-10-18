import { clipStorage } from "./firebase";
import {
  uploadLimits,
  videoTypes,
  imageTypes,
  type ClipAsset,
} from "../../../packages/contracts/media";
type Api = <T>(path: string, body?: unknown) => Promise<T>;
const megabytes = (bytes: number) => (bytes / 1024 / 1024).toFixed(1) + " MB";
function duration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const probe = document.createElement("video");
    const url = URL.createObjectURL(file);
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(
        Number.isFinite(probe.duration)
          ? probe.duration
          : uploadLimits.maxSeconds,
      );
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "This browser cannot play that file. Use an MP4 or WebM video.",
        ),
      );
    };
    probe.src = url;
  });
}

export async function uploadAsset(
  api: Api,
  file: File,
  setStatus: (text: string) => void,
  knownDuration?: number,
): Promise<ClipAsset> {
  const kind = file.type.startsWith("image/") ? "image" : "video";
  const types = kind === "image" ? imageTypes : videoTypes;
  if (!(types as readonly string[]).includes(file.type))
    throw new Error("Choose a supported image or video format.");
  if (file.size > (kind === "image" ? 10 * 1024 * 1024 : uploadLimits.maxBytes))
    throw new Error(
      `That file is ${megabytes(file.size)}. ${kind === "image" ? "Photos can be up to 10 MB" : `Clips can be up to ${megabytes(uploadLimits.maxBytes)}`}.`,
    );
  const seconds =
    kind === "image" ? 0 : (knownDuration ?? (await duration(file)));
  if (seconds > uploadLimits.maxSeconds)
    throw new Error(
      `That clip is ${Math.round(seconds)} seconds. Clips can be up to ${uploadLimits.maxSeconds} seconds.`,
    );
  setStatus("Preparing upload…");
  const { asset, path } = await api<{ asset: ClipAsset; path: string }>(
    "/uploads",
    {
      idempotencyKey: crypto.randomUUID(),
      fileName: file.name.slice(0, 120),
      contentType: file.type,
      bytes: file.size,
      durationSeconds: kind === "image" ? 0 : Math.max(seconds, 0.1),
    },
  );
  const storage = await clipStorage();
  const { ref, uploadBytesResumable } = await import("firebase/storage");
  const task = uploadBytesResumable(ref(storage, path), file, {
    contentType: file.type,
  });
  await new Promise<void>((resolve, reject) =>
    task.on(
      "state_changed",
      (snap) =>
        setStatus(
          `Uploading ${file.name}: ${Math.floor((snap.bytesTransferred / snap.totalBytes) * 100)}%`,
        ),
      () =>
        reject(
          new Error(
            "The upload was interrupted. Check your connection and try again.",
          ),
        ),
      () => resolve(),
    ),
  );
  setStatus("Checking the asset…");
  const done = await api<{ asset: ClipAsset }>(
    `/uploads/${asset.id}/complete`,
    {},
  );

  return done.asset;
}
