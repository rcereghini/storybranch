import { useState } from "react";
import {
  assetIdOf,
  assetRef,
  uploadLimits,
  videoTypes,
  type ClipAsset,
  type UploadListing,
} from "../../../packages/contracts/media";
import { sceneMedia } from "../../../fixtures/media";
import { clipStorage } from "./firebase";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
const samples = Object.values(sceneMedia);
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

// Reads the clip length in the browser. Recorded WebM files often report no
// duration; those are allowed and recorded at the limit.
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

export function ClipPicker({
  api,
  value,
  uploads,
  disabled,
  onChange,
  onUploaded,
}: {
  api: Api;
  value: string | undefined;
  uploads: UploadListing | null;
  disabled: boolean;
  onChange: (video: string) => void;
  onUploaded: (asset: ClipAsset) => void;
}) {
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const ready = uploads?.items.filter((clip) => clip.status === "ready") ?? [];
  const missing =
    assetIdOf(value) && !ready.some((clip) => assetRef(clip.id) === value);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      if (!(videoTypes as readonly string[]).includes(file.type))
        throw new Error("Choose an MP4 or WebM video.");
      if (file.size > uploadLimits.maxBytes)
        throw new Error(
          `That file is ${megabytes(file.size)}. Clips can be up to ${megabytes(uploadLimits.maxBytes)}.`,
        );
      const seconds = await duration(file);
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
          durationSeconds: Math.max(seconds, 0.1),
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
      setStatus("Checking the video…");
      const done = await api<{ asset: ClipAsset }>(
        `/uploads/${asset.id}/complete`,
        {},
      );
      onUploaded(done.asset);
      onChange(assetRef(done.asset.id));
      setStatus(
        `Uploaded ${file.name}. Save your draft to keep it on this page.`,
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="clip-picker">
      <label>
        Video clip
        <select
          aria-label="Video clip"
          value={value}
          disabled={disabled || uploading}
          onChange={(e) => onChange(e.target.value)}
        >
          {missing && <option value={value}>Unavailable clip</option>}
          {ready.length > 0 && (
            <optgroup label="Your clips">
              {ready.map((clip) => (
                <option key={clip.id} value={assetRef(clip.id)}>
                  {clip.fileName}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Sample clips">
            {samples.map((m) => (
              <option key={m.landscape.src} value={m.landscape.src}>
                {m.landscape.src.split("/").at(-1)}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      {uploads?.enabled ? (
        <label>
          Upload a clip (MP4 or WebM, up to {uploadLimits.maxSeconds} seconds)
          <input
            type="file"
            aria-label="Upload a clip"
            accept={videoTypes.join(",")}
            disabled={disabled || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
        </label>
      ) : (
        uploads?.reason && <p className="muted">{uploads.reason}</p>
      )}
      {/* Reserved line so upload progress never shifts the editor. */}
      <p className="muted clip-status" role="status">
        {status}
      </p>
    </div>
  );
}
