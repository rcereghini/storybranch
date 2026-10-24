import { writeFile } from "node:fs/promises";
import { launchBrowser } from "./browser";
import { sceneVariants, sceneAssetId } from "../fixtures/scene-variants";
import { mockSceneSvg } from "./mock-scene-art";
const browser = await launchBrowser();
try {
  const tab = await browser.newPage();
  await tab.goto("http://127.0.0.1:5173");
  await tab.evaluate("globalThis.__name = (fn) => fn");
  await tab.evaluate(() => {
    const button = document.createElement("button");
    button.textContent = "Enable fixture audio";
    button.onclick = () => {
      const audio = new AudioContext();
      (window as unknown as { fixtureAudio: AudioContext }).fixtureAudio =
        audio;
      void audio.resume();
    };
    document.body.replaceChildren(button);
  });
  await tab.getByRole("button", { name: "Enable fixture audio" }).click();
  for (const scene of sceneVariants)
    for (const variant of ["landscape", "portrait"]) {
      const portrait = variant !== "landscape";
      const svg = mockSceneSvg(scene, portrait);
      await writeFile(
        `apps/web/public/media/${sceneAssetId(scene)}-${variant}.svg`,
        svg,
      );
      const bytes = await tab.evaluate(
        async ({ svg, portrait, tone }) => {
          const audio = (window as unknown as { fixtureAudio: AudioContext })
            .fixtureAudio;
          const destination = audio.createMediaStreamDestination();
          // Quiet harbor-like wash plus three distinct bell notes. Original synthesis,
          // deliberately audible for manual playback checks, with no voice or licensed music.
          const noise = audio.createBuffer(
            1,
            audio.sampleRate * 6.3,
            audio.sampleRate,
          );
          const samples = noise.getChannelData(0);
          let seed = 42;
          for (let i = 0; i < samples.length; i++) {
            seed = (1664525 * seed + 1013904223) >>> 0;
            samples[i] = ((seed / 4294967296) * 2 - 1) * 0.12;
          }
          const wash = audio.createBufferSource();
          wash.buffer = noise;
          const filter = audio.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = 900;
          wash.connect(filter).connect(destination);
          const now = audio.currentTime;
          wash.start(now);
          for (const [offset, frequency] of [
            [0.15, tone],
            [2.1, tone * 1.25],
            [4.1, tone * 1.5],
          ]) {
            const bell = audio.createOscillator();
            const gain = audio.createGain();
            bell.type = "sine";
            bell.frequency.value = frequency;
            gain.gain.setValueAtTime(0, now + offset);
            gain.gain.linearRampToValueAtTime(0.18, now + offset + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 1.5);
            bell.connect(gain).connect(destination);
            bell.start(now + offset);
            bell.stop(now + offset + 1.6);
          }
          const canvas = document.createElement("canvas");
          canvas.width = portrait ? 1080 : 960;
          canvas.height = portrait ? 1920 : 540;
          const ctx = canvas.getContext("2d")!;
          const img = new Image();
          img.src = "data:image/svg+xml;base64," + btoa(svg);
          await img.decode();
          const stream = canvas.captureStream(24);
          stream.addTrack(destination.stream.getAudioTracks()[0]);
          const type = "video/mp4;codecs=avc1.42001f,mp4a.40.2";
          if (!MediaRecorder.isTypeSupported(type))
            throw new Error("H.264/AAC recording unavailable");
          const recorder = new MediaRecorder(stream, {
            mimeType: type,
            videoBitsPerSecond: portrait ? 2500000 : 1200000,
            audioBitsPerSecond: 128000,
          });
          const chunks: Blob[] = [];
          const done = new Promise<Blob>((resolve) => {
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = () => resolve(new Blob(chunks));
          });
          recorder.start();
          const begin = performance.now();
          await new Promise<void>((resolve) => {
            function frame() {
              const t = (performance.now() - begin) / 1000;
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              ctx.fillStyle = `rgba(205,235,217,${0.015 + 0.01 * Math.sin(t)})`;
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              // Moving rings make playback distinguishable from the static poster.
              ctx.strokeStyle = "#ffffff66";
              ctx.lineWidth = portrait ? 4 : 2;
              for (let ring = 0; ring < 3; ring++) {
                const radius =
                  (((t * 45 + ring * 70) % 220) * canvas.width) / 960;
                ctx.beginPath();
                ctx.arc(
                  canvas.width / 2,
                  canvas.height * 0.42,
                  radius,
                  0,
                  Math.PI * 2,
                );
                ctx.stroke();
              }
              ctx.fillStyle = "#ffffffaa";
              ctx.fillRect(
                0,
                canvas.height - 10,
                canvas.width * Math.min(t / 6, 1),
                10,
              );
              if (t < 6) requestAnimationFrame(frame);
              else resolve();
            }
            frame();
          });
          recorder.stop();
          const result = Array.from(
            new Uint8Array(await (await done).arrayBuffer()),
          );
          stream.getTracks().forEach((track) => track.stop());
          wash.disconnect();
          filter.disconnect();
          return result;
        },
        { svg, portrait, tone: scene.tone },
      );
      const path = `apps/web/public/media/${sceneAssetId(scene)}-${variant}.mp4`;
      await writeFile(path, Buffer.from(bytes));
      console.log(`${path}: ${bytes.length} bytes`);
    }
} finally {
  await browser.close();
}
