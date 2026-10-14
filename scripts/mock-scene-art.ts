import type { sceneVariants } from "../fixtures/scene-variants";

export function mockSceneSvg(
  scene: (typeof sceneVariants)[number],
  portrait: boolean,
) {
  const symbols: Record<string, string> = {
    beacon:
      '<path d="M-65 135 L-40-65 H40 L65 135Z"/><rect x="-60" y="-100" width="120" height="45"/><path d="M-75-110 L0-160 L75-110Z"/>',
    pass: '<rect x="-135" y="-85" width="270" height="170" rx="16"/><circle cx="-65" cy="-10" r="30" fill="#142626"/><path d="M-10-35 H100 M-10 0 H100 M-100 55 H100" stroke="#142626" stroke-width="12"/>',
    lantern:
      '<path d="M-170-130 Q0-55 170-130" fill="none" stroke="currentColor" stroke-width="7"/><rect x="-150" y="-100" width="65" height="100" rx="22"/><rect x="-32" y="-70" width="65" height="130" rx="22"/><rect x="90" y="-100" width="65" height="100" rx="22"/><path d="M0 60 V110 M-118 0 V45 M122 0 V45" stroke="currentColor" stroke-width="7"/>',
    searchlight:
      '<path d="M-30 20 L180-155 L200 130Z" opacity=".3"/><circle cx="-45" cy="15" r="55"/><path d="M-55 65 L-85 150 H-5 L-30 65Z"/>',
    sun: '<circle r="90"/><path d="M0-165 V-120 M0 120 V165 M-165 0 H-120 M120 0 H165 M-115-115 L-85-85 M85 85 L115 115 M115-115 L85-85 M-85 85 L-115 115" stroke="currentColor" stroke-width="12"/>',
    dark: '<path d="M-65 135 L-40-65 H40 L65 135Z" opacity=".5"/><path d="M-90-120 L100 90 M100-120 L-90 90" stroke="currentColor" stroke-width="12"/>',
    bell: '<path d="M-100 70 Q-65 35-65-45 Q-65-120 0-120 Q65-120 65-45 Q65 35 100 70Z"/><circle cy="100" r="20"/><circle cy="-138" r="14"/>',
    moon: '<path d="M70-130 A140 140 0 1 0 100 120 A125 125 0 0 1 70-130Z"/><path d="M110-70 L130-35 L170-30 L140 0 L150 40 L110 20 L80 40 L85 0 L55-30 L95-35Z"/>',
    letter:
      '<rect x="-145" y="-90" width="290" height="180" rx="8"/><path d="M-140-80 L0 20 L140-80 M-140 85 L-45 0 M140 85 L45 0" fill="none" stroke="#352536" stroke-width="9"/>',
  };
  const w = portrait ? 1080 : 960,
    h = portrait ? 1920 : 540;
  const scale = portrait ? 1.8 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${scene.sky}"/><stop offset="1" stop-color="#080e19"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#sky)"/>
  ${Array.from({ length: 18 }, (_, i) => `<rect x="${(i * w) / 18}" y="${h * 0.68 - (i % 4) * h * 0.035}" width="${w / 20}" height="${h * 0.35}" fill="${scene.color}" opacity=".12"/>`).join("")}
  <g transform="translate(${w / 2} ${h * 0.42}) scale(${scale})" fill="${scene.color}" color="${scene.color}">${symbols[scene.symbol]}</g>
  <text x="${w / 2}" y="${h * 0.13}" text-anchor="middle" fill="${scene.color}" font-family="monospace" font-size="${portrait ? 28 : 15}" letter-spacing="4">STORYBRANCH / MOCK SCENE</text>
  <text x="${w / 2}" y="${h * 0.76}" text-anchor="middle" fill="#f4eee4" font-family="monospace" font-size="${portrait ? 43 : 30}">${scene.label}</text>
  <text x="${w / 2}" y="${h * 0.83}" text-anchor="middle" fill="#bcc5cc" font-family="monospace" font-size="${portrait ? 23 : 14}">ANIMATED PLACEHOLDER / ORIGINAL AUDIO</text></svg>`;
}
