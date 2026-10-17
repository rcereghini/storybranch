// Checks a file's leading bytes rather than trusting its declared type.
export function sniffAsset(head: Uint8Array) {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => head[i] === v))
    return "image/png";
  const text = String.fromCharCode(...head);
  if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP")
    return "image/webp";
  return sniffVideo(head);
}
export function sniffVideo(
  head: Uint8Array,
): "video/mp4" | "video/webm" | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...head.subarray(from, to));
  // ISO base media (MP4): a leading box whose type is "ftyp".
  if (head.length >= 12 && ascii(4, 8) === "ftyp") return "video/mp4";
  // Matroska/WebM: the EBML magic number.
  if (
    head.length >= 4 &&
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3
  )
    return "video/webm";
  return null;
}

export function downloadUrl(
  storageHost: string | undefined,
  bucket: string,
  path: string,
  token: string,
) {
  const origin = storageHost
    ? `http://${storageHost}`
    : "https://firebasestorage.googleapis.com";
  return `${origin}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
