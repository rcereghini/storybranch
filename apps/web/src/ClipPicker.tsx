import { useState } from "react";
import {
  assetIdOf,
  assetRef,
  uploadLimits,
  videoTypes,
  imageTypes,
  type ClipAsset,
  type UploadListing,
} from "../../../packages/contracts/media";
import { sceneMedia } from "../../../fixtures/media";
import { uploadAsset } from "./asset-upload";

type Api = <T>(path: string, body?: unknown) => Promise<T>;
const samples = Object.values(sceneMedia);

export function ClipPicker({
  api,
  value,
  uploads,
  disabled,
  onChange,
  onUploaded,
  kind = "video",
  label = kind === "video" ? "Video clip" : "Page photo",
}: {
  api: Api;
  value: string | undefined;
  uploads: UploadListing | null;
  disabled: boolean;
  onChange: (video: string) => void;
  onUploaded: (asset: ClipAsset) => void;
  kind?: "video" | "image";
  label?: string;
}) {
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const ready =
    uploads?.items.filter(
      (clip) =>
        clip.status === "ready" && clip.contentType.startsWith(`${kind}/`),
    ) ?? [];
  const types = kind === "video" ? videoTypes : imageTypes;
  const missing =
    assetIdOf(value) && !ready.some((clip) => assetRef(clip.id) === value);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const asset = await uploadAsset(api, file, setStatus);
      onUploaded(asset);
      onChange(assetRef(asset.id));
      setStatus(
        `Uploaded ${file.name}. Available in your asset library. Save the draft if you selected it for a page.`,
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
        {label}
        <select
          aria-label={label}
          value={value ?? ""}
          disabled={disabled || uploading}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {kind === "image" ? "No photo" : "Choose a clip"}
          </option>
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
          {kind === "video" && (
            <optgroup label="Sample clips">
              {samples.map((m) => (
                <option key={m.landscape.src} value={m.landscape.src}>
                  {m.landscape.src.split("/").at(-1)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {uploads?.enabled ? (
        <label>
          {kind === "video"
            ? `Upload a clip (MP4 or WebM, up to ${uploadLimits.maxSeconds} seconds)`
            : "Upload a photo (JPEG, PNG or WebP, up to 10 MB)"}
          <input
            type="file"
            aria-label={kind === "video" ? "Upload a clip" : "Upload a photo"}
            accept={types.join(",")}
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
