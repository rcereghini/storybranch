import { chromium, type Page as BrowserTab } from "playwright";
export async function startPlayback(tab: BrowserTab) {
  try {
    await tab.waitForFunction(() => {
      const v = document.querySelector("video");
      return (
        (v && !v.paused && v.currentTime > 0) ||
        document.querySelector(".scene-start") ||
        v?.error ||
        document.querySelector(".scene-player .notice")
      );
    });
    if (await tab.locator(".scene-player .notice").isVisible())
      throw new Error("The player reported a media load failure.");
    if (await tab.locator(".scene-start").isVisible())
      await tab.locator(".scene-start").click();
    await tab.waitForFunction(() => {
      const v = document.querySelector("video");
      return (
        (v && ((!v.paused && v.currentTime > 0) || v.error)) ||
        document.querySelector(".scene-player .notice")
      );
    });
    if (
      await tab
        .locator("video")
        .evaluate((v: HTMLVideoElement) => !!v.error || v.paused)
    )
      throw new Error("Video could not start.");
  } catch (cause) {
    const diagnostics = await tab
      .evaluate(() => {
        const v = document.querySelector("video");
        return {
          path: location.pathname,
          source: v?.currentSrc || v?.querySelector("source")?.src,
          error: v?.error
            ? { code: v.error.code, message: v.error.message }
            : null,
          readyState: v?.readyState,
          networkState: v?.networkState,
          paused: v?.paused,
          currentTime: v?.currentTime,
          h264: v?.canPlayType('video/mp4; codecs="avc1.42E01E"'),
          aac: v?.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
          notice: document.querySelector(".scene-player .notice")?.textContent,
        };
      })
      .catch(() => ({ unavailable: true }));
    throw new Error(`Playback failed: ${JSON.stringify(diagnostics)}`, {
      cause,
    });
  }
}
export function launchBrowser(args: string[] = []) {
  return chromium.launch({
    // Match media codec support between local development and Linux CI.
    channel: "chrome",
    headless: true,
    args,
  });
}
