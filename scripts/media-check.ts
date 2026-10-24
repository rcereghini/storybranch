import assert from "node:assert/strict";
import { launchBrowser } from "./browser";
import { harborMedia, sceneMedia } from "../fixtures/media";
const browser = await launchBrowser();
try {
  const tab = await browser.newPage();
  await tab.goto("http://127.0.0.1:5173");
  await tab.evaluate("globalThis.__name = (fn) => fn");
  for (const asset of [
    harborMedia.landscape,
    harborMedia.portrait!,
    harborMedia.socialClip!,
    ...Object.values(sceneMedia).flatMap((media) => [
      media.landscape,
      media.portrait!,
    ]),
  ]) {
    const result = await tab.evaluate(async (src) => {
      const context = new AudioContext();
      const response = await fetch(src);
      if (!response.ok) throw new Error(`Missing media ${src}`);
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      const samples = audio.getChannelData(0);
      let sum = 0,
        peak = 0;
      for (const sample of samples) {
        sum += sample * sample;
        peak = Math.max(peak, Math.abs(sample));
      }
      const result = {
        duration: audio.duration,
        channels: audio.numberOfChannels,
        rms: Math.sqrt(sum / samples.length),
        peak,
      };
      await context.close();
      return result;
    }, asset.src);
    assert(result.duration >= 5 && result.duration < 8);
    assert(result.rms > 0.01, "Audio must be audibly non-silent");
    assert(
      result.peak > 0.1 && result.peak < 0.95,
      "Audio should be audible without clipping",
    );
    console.log(asset.src, result);
  }
  console.log(
    "Media PASS: all shipped MP4s decode non-silent audio with headroom.",
  );
} finally {
  await browser.close();
}
