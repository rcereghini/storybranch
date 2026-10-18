// Compares video models on fal with the same story scenes (docs/19-copilot.md,
// "Model test"). Spends fal credits, so it runs in two steps you start
// deliberately:
//   pnpm exec tsx scripts/model-test.ts stills   courier reference + 3 scene stills
//   pnpm exec tsx scripts/model-test.ts videos   each still through each video model
// Results, timings and costs land in test-results/model-test/ (index.html).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const KEY = process.env.FAL_KEY;
if (!KEY) throw new Error("FAL_KEY is not set.");
const OUT = "test-results/model-test";

const STYLE =
  "Cinematic still from a moody animated feature film. Rain-slicked harbor city at night, teal and violet light, soft fog, painterly detail, 16:9 widescreen composition. No text, no watermark.";
const COURIER =
  "The courier: a wiry woman in her thirties with a cropped silver undercut, a long weathered navy oilskin coat with brass buttons, a leather satchel across her chest, fingerless gloves, a small scar through her left eyebrow, wary green eyes.";
const scenes = [
  {
    id: "dock",
    title: "A signal in the fog",
    still: `${STYLE} The last ferry pulls away from a stone dock beneath a broken lighthouse beacon. ${COURIER} She waits half in shadow beside an old customs house, watching the viewer.`,
    motion:
      "The ferry drifts away into the fog as the broken beacon flickers. The courier turns her head toward the camera and steps out of the shadow. Slow push-in.",
  },
  {
    id: "courier",
    title: "A favor, remembered",
    still: `${STYLE} Close-up under the customs house awning. ${COURIER} She presses a small glowing glass pass into the viewer's open palm, glancing over her shoulder.`,
    motion:
      "The courier presses the glass pass into the open hand, closes the fingers over it, glances over her shoulder, then steps back into the rain.",
  },
  {
    id: "market",
    title: "The lantern market",
    still: `${STYLE} A crowded night market along a canal, violet paper lanterns swaying overhead, stalls of glassware and spices, a rooftop path leading toward a distant lighthouse.`,
    motion:
      "Violet lanterns sway over the canal as shoppers pass between the stalls. A distant bell rings and heads turn. Slow drift toward the rooftops.",
  },
];
// Prices read from fal's pricing API on 2026-10-18 (USD).
const models = [
  {
    id: "kling-v3-pro",
    label: "Kling 3.0 Pro",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    seconds: 5,
    perSecond: 0.14,
    input: (image: string, prompt: string) => ({
      start_image_url: image,
      prompt,
      duration: "5",
      generate_audio: false,
    }),
  },
  {
    id: "veo31-fast",
    label: "Veo 3.1 Fast",
    endpoint: "fal-ai/veo3.1/fast/image-to-video",
    seconds: 6,
    perSecond: 0.15,
    input: (image: string, prompt: string) => ({
      image_url: image,
      prompt,
      duration: "6s",
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: false,
    }),
  },
  {
    id: "seedance-2",
    label: "Seedance 2.0",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    seconds: 5,
    // Billed per token; about this per second at 720p.
    perSecond: 0.3,
    input: (image: string, prompt: string) => ({
      image_url: image,
      prompt,
      duration: "5",
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: false,
    }),
  },
];

type Result = {
  scene: string;
  model: string;
  url?: string;
  file?: string;
  seconds?: number;
  cost: number;
  error?: string;
};

async function fal(endpoint: string, input: unknown) {
  const headers = {
    Authorization: `Key ${KEY}`,
    "Content-Type": "application/json",
  };
  const started = Date.now();
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  if (!submit.ok)
    throw new Error(`${endpoint}: ${submit.status} ${await submit.text()}`);
  const { status_url, response_url } = await submit.json();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const status = await (await fetch(status_url, { headers })).json();
    if (status.status === "COMPLETED") break;
    if (Date.now() - started > 15 * 60000)
      throw new Error(`${endpoint}: timed out`);
  }
  const response = await fetch(response_url, { headers });
  if (!response.ok)
    throw new Error(`${endpoint}: ${response.status} ${await response.text()}`);
  return { data: await response.json(), seconds: (Date.now() - started) / 1000 };
}

async function save(url: string, name: string) {
  const bytes = Buffer.from(await (await fetch(url)).arrayBuffer());
  await writeFile(`${OUT}/${name}`, bytes);
  return name;
}

async function stills() {
  await mkdir(OUT, { recursive: true });
  const reference = await fal("fal-ai/nano-banana-pro", {
    prompt: `Character reference sheet on a plain dark background: front view and three-quarter view of the same person, full body. ${COURIER} Painterly animated-film style.`,
    aspect_ratio: "16:9",
    output_format: "png",
  });
  const referenceUrl = reference.data.images[0].url;
  const results: Record<string, string> = { reference: referenceUrl };
  await save(referenceUrl, "reference.png");
  for (const scene of scenes) {
    const still = await fal("fal-ai/nano-banana-pro/edit", {
      prompt: `${scene.still} Keep the courier exactly as in the reference image.`,
      image_urls: [referenceUrl],
      aspect_ratio: "16:9",
      output_format: "png",
    });
    results[scene.id] = still.data.images[0].url;
    await save(results[scene.id], `${scene.id}.png`);
    console.log(`still ${scene.id} (${still.seconds.toFixed(0)}s)`);
  }
  await writeFile(`${OUT}/stills.json`, JSON.stringify(results, null, 2));
  console.log(`Stills done: 4 images, about $${(4 * 0.15).toFixed(2)}.`);
}

async function videos() {
  const stillUrls = JSON.parse(await readFile(`${OUT}/stills.json`, "utf8"));
  const runs = scenes.flatMap((scene) =>
    models.map((model) => ({ scene, model })),
  );
  // All jobs run in parallel; each failure is recorded, not fatal.
  const results: Result[] = await Promise.all(
    runs.map(async ({ scene, model }) => {
      try {
        const { data, seconds } = await fal(
          model.endpoint,
          model.input(stillUrls[scene.id], scene.motion),
        );
        const file = await save(data.video.url, `${scene.id}-${model.id}.mp4`);
        console.log(`video ${scene.id} ${model.id} (${seconds.toFixed(0)}s)`);
        return {
          scene: scene.id,
          model: model.id,
          url: data.video.url,
          file,
          seconds,
          cost: model.seconds * model.perSecond,
        };
      } catch (error) {
        console.log(`FAILED ${scene.id} ${model.id}: ${(error as Error).message}`);
        return { scene: scene.id, model: model.id, cost: 0, error: (error as Error).message };
      }
    }),
  );
  await writeFile(`${OUT}/videos.json`, JSON.stringify(results, null, 2));
  const total = results.reduce((sum, r) => sum + r.cost, 0);
  const cell = (r: Result | undefined) =>
    r?.file
      ? `<video src="${r.file}" controls loop muted playsinline></video><small>${r.seconds!.toFixed(0)}s to generate · ~$${r.cost.toFixed(2)}</small>`
      : `<p class="err">${r?.error ?? "missing"}</p>`;
  const html = `<!doctype html><meta charset="utf-8"><title>Model test</title>
<style>body{font:14px system-ui;background:#111;color:#eee;margin:24px}table{border-collapse:collapse}td,th{padding:8px;vertical-align:top;text-align:left}video,img{width:360px;border-radius:8px;display:block}small{color:#999}.err{color:#f88;width:360px}</style>
<h1>Glass Harbor model test</h1><p>Same start still for every model, 720p, no audio. Estimated total ~$${total.toFixed(2)} plus $0.60 for stills.</p>
<table><tr><th>Scene / start still</th>${models.map((m) => `<th>${m.label}</th>`).join("")}</tr>
${scenes
  .map(
    (s) =>
      `<tr><td><b>${s.title}</b><img src="${s.id}.png"></td>${models
        .map((m) => `<td>${cell(results.find((r) => r.scene === s.id && r.model === m.id))}</td>`)
        .join("")}</tr>`,
  )
  .join("\n")}</table><h2>Courier reference</h2><img src="reference.png">`;
  await writeFile(`${OUT}/index.html`, html);
  console.log(`Videos done: ~$${total.toFixed(2)}. Open ${OUT}/index.html`);
}

const step = process.argv[2];
if (step === "stills") await stills();
else if (step === "videos") await videos();
else console.log("Usage: model-test.ts stills | videos");
