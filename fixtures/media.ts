import { mediaSchema } from "../packages/contracts/media";
export const harborMedia = mediaSchema.parse({
  landscape: {
    src: "/media/harbor-landscape-audio-v1.mp4",
    poster: "/media/harbor.svg",
    type: "video/mp4",
  },
  portrait: {
    src: "/media/harbor-portrait-audio-v1.mp4",
    poster: "/media/harbor-portrait-v1.svg",
    type: "video/mp4",
  },
  socialClip: {
    src: "/media/harbor-social-audio-v1.mp4",
    poster: "/media/harbor-portrait-v1.svg",
    type: "video/mp4",
  },
  captions: "/media/harbor-audio-v1.vtt",
});
export function resolveFixtureMedia(source: string) {
  return source === "/media/harbor.webm" ? harborMedia : undefined;
}

