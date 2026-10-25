import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { d20Geometry } from "../apps/web/src/d20-geometry";

describe("d20 presentation", () => {
  it("shows every saved value upright, facing the viewer, with opposite faces totaling 21", () => {
    const { geometry, faces, values } = d20Geometry();
    try {
      expect([...values].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 20 }, (_, i) => i + 1),
      );
      for (let i = 0; i < 20; i++) {
        const face = faces[i];
        expect(
          face.normal
            .clone()
            .applyQuaternion(face.orientation)
            .distanceTo(new Vector3(0, 0, 1)),
        ).toBeLessThan(0.00001);
        expect(
          face.up
            .clone()
            .applyQuaternion(face.orientation)
            .distanceTo(new Vector3(0, 1, 0)),
        ).toBeLessThan(0.00001);
        const opposite = faces.findIndex(
          (f) => f.normal.dot(face.normal) < -0.999,
        );
        expect(values[i] + values[opposite]).toBe(21);
      }
    } finally {
      geometry.dispose();
    }
  });
});
