// Public share links name a story or an ending, never a private playthrough.
export const storyLink = (storyId: string) =>
  new URL(`/s/${storyId}`, location.origin).href;
export const endingLink = (storyId: string, storyNodeId: string) =>
  new URL(`/s/${storyId}/ending/${storyNodeId}`, location.origin).href;

export async function copyLink(url: string, what = "Link") {
  try {
    await navigator.clipboard.writeText(url);
    return `${what} copied.`;
  } catch {
    return `Copy this ${what.toLowerCase()}: ${url}`;
  }
}

// The native share sheet where one exists (phones, some desktops); otherwise
// the link is copied. A cancelled sheet is not an error.
export async function shareLink(
  data: { title: string; text: string; url: string },
  what = "Link",
) {
  if (!navigator.share) return copyLink(data.url, what);
  try {
    await navigator.share(data);
    return "Shared.";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "";
    return copyLink(data.url, what);
  }
}

// Shares the teaser video itself where the browser can share files.
export async function shareClip(src: string, title: string, url: string) {
  try {
    const blob = await (await fetch(src)).blob();
    const file = new File(
      [blob],
      `${title.toLowerCase().replace(/\W+/g, "-")}-teaser.mp4`,
      {
        type: "video/mp4",
      },
    );
    if (!navigator.canShare?.({ files: [file] })) return null;
    await navigator.share({ files: [file], title, text: url });
    return "Shared.";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "";
    return null;
  }
}
export const canShareFiles = () =>
  typeof navigator.canShare === "function" &&
  navigator.canShare({
    files: [new File([""], "probe.mp4", { type: "video/mp4" })],
  });
