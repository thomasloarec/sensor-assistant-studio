import { describe, expect, test } from "bun:test";
import { Children, isValidElement } from "react";
import { readFileSync } from "node:fs";
import { sensorById, overallEnvelope } from "@/lib/standex/sensor-catalog";
import { bodyKind, oneFlatProfile } from "@/lib/standex/section-profile";
import { cableConstruction } from "@/lib/leadmagnet/product-presentation";
import { SensorCable } from "@/components/standex/workshop/scene";
import { buildStepFile } from "../scripts/generate-step-envelopes";

function cableParts(id: string) {
  const cable = SensorCable({ model: sensorById(id) });
  if (!cable) throw new Error("Expected cable");
  const [jacket, wires] = cable.props.children;
  const lines = Children.toArray(wires).flatMap((wire) => {
    if (!isValidElement<{ children: unknown }>(wire)) throw new Error("Expected wire group");
    return Children.toArray(wire.props.children).map((line) => {
      if (!isValidElement<{ color: string; points: number[][] }>(line)) throw new Error("Expected line");
      return line.props;
    });
  });
  return { jacket, lines };
}

describe("MK14 / MK18 targeted geometry", () => {
  test("MK14 is a circular 25.5 mm by 4 mm black body", () => {
    const model = sensorById("MK14");
    expect(overallEnvelope(model)).toEqual([25.5, 4, 4]);
    expect(bodyKind(model)).toBe("cylinder");
    expect(model.section).toBeUndefined();
    expect(model.color).toBe("#171717");
  });
  test("MK14 has no common sleeve, two blue insulators and two bare ends at unchanged lengths", () => {
    expect(cableConstruction(sensorById("MK14"))).toBe("wires");
    const { jacket, lines } = cableParts("MK14");
    expect(jacket).toBeNull();
    expect(lines).toHaveLength(4);
    for (const i of [0, 2]) {
      const insulation = lines[i], metal = lines[i + 1];
      expect(insulation.color).toBe("#1674d1");
      expect(metal.color).toBe("#b4bcc4");
      expect(insulation.points[0][0]).toBe(-12.75);
      expect(insulation.points[1][0]).toBe(-22.75);
      expect(metal.points[0]).toEqual(insulation.points[1]);
      expect(metal.points[1][0]).toBe(-24.75);
    }
    expect(lines[0].points[0][2]).not.toBe(lines[2].points[0][2]);
  });
  test("MK18 has exactly one chord on a radius 2.5 circle, not an ellipse or two flats", () => {
    const model = sensorById("MK18");
    expect(model.body).toEqual([17, 5, 4.6]);
    expect(bodyKind(model)).toBe("one_flat");
    const profile = oneFlatProfile(5, 4.6);
    // The centred envelope shifts the circle centre by +0.2 mm.
    for (const [x, y] of profile) expect(Math.hypot(x - 0.2, y)).toBeCloseTo(2.5, 10);
    expect(profile[0][0]).toBeCloseTo(2.3, 10);
    expect(profile.at(-1)?.[0]).toBeCloseTo(2.3, 10);
    expect(profile.filter(([x]) => Math.abs(x - 2.3) < 1e-9)).toHaveLength(2);
    expect(profile.filter(([x]) => Math.abs(x + 2.3) < 1e-9)).toHaveLength(1);
  });
  test("MK18 wires retain their existing unjacketed grey insulation and metal ends", () => {
    const { jacket, lines } = cableParts("MK18");
    expect(jacket).toBeNull();
    expect(lines.map((line) => line.color)).toEqual(["#60727d", "#b4bcc4", "#60727d", "#b4bcc4"]);
    expect(lines[0].points[0][0]).toBe(-8.5);
    expect(lines[0].points[1][0]).toBe(-18.5);
  });
  test("MK20 dimensions, profiles and wires remain unchanged", () => {
    for (const [id, body] of [["MK20_1", [10, 3, 2.7]], ["MK20_2", [7.5, 2.7, 2.5]]] as const) {
      const model = sensorById(id);
      expect(model.body).toEqual(body);
      expect(bodyKind(model)).toBe("one_flat");
      expect(cableParts(id).jacket).toBeNull();
      expect(cableParts(id).lines[0].color).toBe("#60727d");
    }
  });
  test("other jacketed sensor cables are not recoloured or stripped", () => {
    for (const id of ["MK03", "MK04", "MK21", "MK11-M5"]) {
      expect(cableConstruction(sensorById(id))).toBe("jacket");
      expect(cableParts(id).jacket).not.toBeNull();
      expect(cableParts(id).lines[0].color).toBe("#60727d");
    }
    expect(cableConstruction(sensorById("MK27"))).toBe("metal");
  });
  test("MK18 STEP uses the same one-flat circle; MK14 and MK20 outputs stay reproducible", () => {
    for (const id of ["MK14", "MK18", "MK20_1", "MK20_2"]) {
      const text = readFileSync(`public/step/${id}.step`, "utf8");
      expect(buildStepFile(sensorById(id))).toBe(text);
      if (id !== "MK18") continue;
      const points = [...text.matchAll(/CARTESIAN_POINT\('',\(([^)]+)\)\)/g)].map((m) => m[1].split(",").map(Number));
      for (const [x, y, z] of points) {
        expect(Math.abs(x)).toBe(8.5);
        expect(Math.hypot(y, z + 0.2)).toBeCloseTo(2.5, 5);
      }
      expect(Math.max(...points.map((p) => p[2])) - Math.min(...points.map((p) => p[2]))).toBeCloseTo(4.6, 6);
    }
  });
});