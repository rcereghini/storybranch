import { mediaSchema } from "../packages/contracts/media";
import { sceneVariants, sceneAssetId } from "./scene-variants";
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
export const sceneMedia = Object.fromEntries(
  sceneVariants.map((scene) => {
    const id = sceneAssetId(scene);
    return [
      `${scene.story}/pages-v1/${scene.node}`,
      mediaSchema.parse({
        landscape: {
          src: `/media/${id}-landscape.mp4`,
          poster: `/media/${id}-landscape.svg`,
          type: "video/mp4",
        },
        portrait: {
          src: `/media/${id}-portrait.mp4`,
          poster: `/media/${id}-portrait.svg`,
          type: "video/mp4",
        },
        captions: harborMedia.captions,
        socialClip: harborMedia.socialClip,
      }),
    ];
  }),
);
export function resolveFixtureMedia(source: string) {
  return Object.values(sceneMedia).find(
    (media) => media.landscape.src === source,
  );
}
