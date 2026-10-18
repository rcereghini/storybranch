export type VideoEdit = {
  start: number;
  end: number;
  aspect: "original" | "16:9" | "9:16" | "1:1";
  x: number;
  y: number;
  mute: boolean;
};
export function cropRect(
  width: number,
  height: number,
  edit: Pick<VideoEdit, "aspect" | "x" | "y">,
) {
  const ratio =
    edit.aspect === "original"
      ? width / height
      : edit.aspect === "16:9"
        ? 16 / 9
        : edit.aspect === "9:16"
          ? 9 / 16
          : 1;
  const w = Math.min(width, height * ratio),
    h = Math.min(height, width / ratio);
  return {
    x: ((width - w) * edit.x) / 100,
    y: ((height - h) * edit.y) / 100,
    w,
    h,
  };
}
function event(element: HTMLVideoElement, name: string, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener(name, done);
      element.removeEventListener("error", fail);
      signal.removeEventListener("abort", fail);
    };
    const done = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(
        new Error(
          signal.aborted ? "Export cancelled." : "Video could not be read.",
        ),
      );
    };
    const timer = setTimeout(fail, 20000);
    element.addEventListener(name, done, { once: true });
    element.addEventListener("error", fail, { once: true });
    signal.addEventListener("abort", fail, { once: true });
    if (signal.aborted) fail();
  });
}
// Browser export avoids a paid transcoding service. It runs in real time.
export async function exportVideo(
  sources: { src: string; edit: VideoEdit }[],
  signal: AbortSignal,
  progress: (value: string) => void,
) {
  const mime = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ].find(
    (t) =>
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t),
  );
  if (!mime)
    throw new Error(
      "Video export needs a browser with WebM recording support, such as Chrome or Edge.",
    );
  if (
    !sources.length ||
    sources.some(
      (s) =>
        !Number.isFinite(s.edit.start) ||
        !Number.isFinite(s.edit.end) ||
        s.edit.end - s.edit.start < 0.1 ||
        s.edit.start < 0,
    ) ||
    sources.reduce((n, s) => n + s.edit.end - s.edit.start, 0) > 60
  )
    throw new Error(
      "Choose a valid clip range, totaling no more than 60 seconds.",
    );
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.playsInline = true;
  video.preload = "auto";
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d")!;
  let stream: MediaStream | undefined,
    recorder: MediaRecorder | undefined,
    audio: AudioContext | undefined;
  let recordingError: Error | undefined;
  const chunks: Blob[] = [];
  try {
    audio = new AudioContext();
    await audio.resume();
    const node = audio.createMediaElementSource(video),
      gain = audio.createGain(),
      destination = audio.createMediaStreamDestination();
    node.connect(gain);
    gain.connect(destination);
    for (let index = 0; index < sources.length; index++) {
      const { src, edit } = sources[index];
      const loaded = event(video, "loadeddata", signal);
      video.src = src;
      video.load();
      await loaded;
      if (Number.isFinite(video.duration) && edit.end > video.duration + 0.1)
        throw new Error("Trim end exceeds the video length.");
      if (edit.start > 0) {
        const seek = event(video, "seeked", signal);
        video.currentTime = edit.start;
        await seek;
      }
      const crop = cropRect(video.videoWidth, video.videoHeight, edit);
      if (!index) {
        const scale = Math.min(1, 1280 / Math.max(crop.w, crop.h));
        canvas.width = Math.max(2, Math.floor((crop.w * scale) / 2) * 2);
        canvas.height = Math.max(2, Math.floor((crop.h * scale) / 2) * 2);
        ctx.drawImage(
          video,
          crop.x,
          crop.y,
          crop.w,
          crop.h,
          0,
          0,
          canvas.width,
          canvas.height,
        );
        stream = canvas.captureStream(30);
        destination.stream.getAudioTracks().forEach((t) => stream!.addTrack(t));
        recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: 4000000,
        });
        recorder.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        recorder.onerror = () => {
          recordingError = new Error("Video recording failed.");
        };
        recorder.start(250);
      }
      gain.gain.value = edit.mute ? 0 : 1;
      await video.play();
      await new Promise<void>((resolve, reject) => {
        const began = performance.now();
        const timer = setInterval(() => {
          if (
            signal.aborted ||
            document.hidden ||
            recordingError ||
            performance.now() - began > (edit.end - edit.start + 20) * 1000
          ) {
            clearInterval(timer);
            reject(
              recordingError ??
                new Error(
                  signal.aborted
                    ? "Export cancelled."
                    : "Keep this tab visible during export, then try again.",
                ),
            );
            return;
          }
          ctx.drawImage(
            video,
            crop.x,
            crop.y,
            crop.w,
            crop.h,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          progress(
            `Exporting clip ${index + 1} of ${sources.length}: ${Math.min(100, Math.round(((video.currentTime - edit.start) / (edit.end - edit.start)) * 100))}%`,
          );
          if (video.currentTime >= edit.end || video.ended) {
            clearInterval(timer);
            video.pause();
            resolve();
          }
        }, 1000 / 30);
      });
    }
    await new Promise<void>((resolve) => {
      recorder!.onstop = () => resolve();
      recorder!.stop();
    });
    return new File(chunks, "edited-video.webm", { type: "video/webm" });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach((t) => t.stop());
    await audio?.close();
  }
}
