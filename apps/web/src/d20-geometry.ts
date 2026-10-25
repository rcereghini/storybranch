import { IcosahedronGeometry, Matrix4, Quaternion, Vector3 } from "three";

/** Presentation geometry only. Face numbers never select a gameplay outcome. */
export function d20Geometry() {
  const geometry = new IcosahedronGeometry(1, 0);
  const positions = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const faces: { normal: Vector3; up: Vector3; orientation: Quaternion }[] = [];
  geometry.clearGroups();
  for (let face = 0; face < 20; face++) {
    const i = face * 3;
    const a = new Vector3().fromBufferAttribute(positions, i);
    const b = new Vector3().fromBufferAttribute(positions, i + 1);
    const c = new Vector3().fromBufferAttribute(positions, i + 2);
    const center = a.clone().add(b).add(c).divideScalar(3);
    const normal = center.clone().normalize();
    const up = a.clone().sub(center).normalize();
    const right = up.clone().cross(normal).normalize();
    // Inverse face frame brings its normal toward the camera and label upright.
    const orientation = new Quaternion()
      .setFromRotationMatrix(new Matrix4().makeBasis(right, up, normal))
      .invert();
    faces.push({ normal, up, orientation });
    uv.setXY(i, 0.5, 1);
    uv.setXY(i + 1, 0, 0);
    uv.setXY(i + 2, 1, 0);
    geometry.addGroup(i, 3, face);
  }
  // Conventional opposite faces sum to 21.
  const values = new Array<number>(20).fill(0);
  let value = 1;
  for (let i = 0; i < 20; i++) {
    if (values[i]) continue;
    const opposite = faces.findIndex(
      (f) => f.normal.dot(faces[i].normal) < -0.999,
    );
    values[i] = value;
    values[opposite] = 21 - value++;
  }
  return { geometry, faces, values };
}
