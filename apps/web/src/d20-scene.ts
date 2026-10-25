import {
  AmbientLight,
  CanvasTexture,
  Color,
  DirectionalLight,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { d20Geometry } from "./d20-geometry";

export type DicePresentation = {
  rolling: boolean;
  value?: number;
  animate: boolean;
};

export function createD20(host: HTMLElement, failed: () => void) {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  const { geometry, faces, values } = d20Geometry();
  const textures: CanvasTexture[] = [];
  const colors = getComputedStyle(host);
  const ink = colors.getPropertyValue("--on-primary").trim();
  const body = colors.getPropertyValue("--primary").trim();
  const materials = values.map((value) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d")!;
    context.fillStyle = body;
    context.fillRect(0, 0, 256, 256);
    context.strokeStyle = ink;
    context.globalAlpha = 0.35;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(128, 18);
    context.lineTo(242, 244);
    context.lineTo(14, 244);
    context.closePath();
    context.stroke();
    context.globalAlpha = 1;
    context.fillStyle = ink;
    context.font = "bold 72px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(value), 128, 164);
    if (value === 6 || value === 9) context.fillRect(112, 204, 32, 3);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    textures.push(texture);
    return new MeshStandardMaterial({
      map: texture,
      roughness: 0.48,
      metalness: 0.15,
    });
  });
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 220 / 180, 0.1, 20);
  camera.position.z = 5;
  const mesh = new Mesh(geometry, materials);
  const edgeGeometry = new EdgesGeometry(geometry);
  const edgeMaterial = new LineBasicMaterial({
    color: new Color(ink),
    transparent: true,
    opacity: 0.45,
  });
  mesh.add(new LineSegments(edgeGeometry, edgeMaterial));
  scene.add(mesh, new AmbientLight(0xffffff, 2));
  const light = new DirectionalLight(0xffffff, 3);
  light.position.set(-3, 4, 5);
  scene.add(light);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(220, 180);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  let state: DicePresentation = { rolling: false, animate: false };
  let frame = 0;
  let disposed = false;
  let started = 0;
  let from = new Quaternion();
  const target = () => faces[values.indexOf(state.value ?? 20)].orientation;
  const draw = () => {
    renderer.render(scene, camera);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
  };
  const tick = (now: number) => {
    if (disposed || document.hidden) return;
    const elapsed = now - started;
    if (state.rolling && elapsed < 8000) {
      mesh.rotation.set(elapsed * 0.004, elapsed * 0.006, elapsed * 0.002);
      mesh.position.y = Math.sin(elapsed * 0.012) * 0.09;
    } else if (state.value && state.animate) {
      const t = Math.min(elapsed / 650, 1);
      mesh.quaternion.slerpQuaternions(from, target(), 1 - Math.pow(1 - t, 3));
      mesh.position.y *= 1 - t;
      if (t === 1) {
        draw();
        frame = 0;
        return;
      }
    } else {
      frame = 0;
      return;
    }
    draw();
    frame = requestAnimationFrame(tick);
  };
  const update = (next: DicePresentation) => {
    stop();
    state = next;
    started = performance.now();
    from.copy(mesh.quaternion);
    if (document.hidden || !state.animate || (!state.rolling && !state.value)) {
      mesh.quaternion.copy(target());
      mesh.position.y = 0;
      draw();
    } else frame = requestAnimationFrame(tick);
  };
  const visibility = () => {
    stop();
    mesh.quaternion.copy(target());
    mesh.position.y = 0;
    if (!document.hidden) draw();
  };
  const lost = (event: Event) => {
    event.preventDefault();
    stop();
    failed();
  };
  document.addEventListener("visibilitychange", visibility);
  renderer.domElement.addEventListener("webglcontextlost", lost);
  update(state);
  return {
    update,
    dispose() {
      disposed = true;
      stop();
      document.removeEventListener("visibilitychange", visibility);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      geometry.dispose();
      edgeGeometry.dispose();
      edgeMaterial.dispose();
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
