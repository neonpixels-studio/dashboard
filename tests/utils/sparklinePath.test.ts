import { describe, expect, it } from "vitest";
import {
  buildSparklinePath,
  sparklineEndY,
} from "../../app/utils/sparklinePath";
import type { MetricPoint } from "../../shared/types/dashboard";

function point(value: number): MetricPoint {
  return { capturedAt: "2026-09-01T00:00:00Z", value };
}

describe("buildSparklinePath", () => {
  it("returns an empty path for an empty series", () => {
    expect(buildSparklinePath([], 320, 72)).toBe("");
  });

  it("draws a flat horizontal line for a single point", () => {
    expect(buildSparklinePath([point(100)], 320, 72)).toBe("M0 36 L320 36");
  });

  it("draws a flat line across a perfectly flat series, never dividing by zero", () => {
    const path = buildSparklinePath([point(50), point(50), point(50)], 300, 60);
    expect(path).toBe("M0.00 30.00 L150.00 30.00 L300.00 30.00");
  });

  it("maps the lowest value near the bottom and the highest near the top of the viewBox", () => {
    const path = buildSparklinePath([point(0), point(100)], 100, 100);
    const [firstCommand, secondCommand] = path
      .split(" ")
      .reduce<string[]>((commands, token) => {
        if (token.startsWith("M") || token.startsWith("L")) {
          commands.push(token);
        }
        return commands;
      }, []);

    expect(firstCommand).toBe("M0.00");
    expect(secondCommand).toBe("L100.00");
    // Lower value (0) sits further down the viewBox (larger y) than the
    // higher value (100) — SVG's y axis grows downward.
    const firstY = Number(path.split(" ")[1]);
    const lastY = Number(path.split(" ")[3]);
    expect(firstY).toBeGreaterThan(lastY);
  });

  it("starts with M and uses L for every subsequent point", () => {
    const path = buildSparklinePath([point(10), point(20), point(15)], 320, 72);
    const commands = path.split(" ").filter((token) => /^[ML]/.test(token));
    expect(commands[0]?.startsWith("M")).toBe(true);
    expect(commands.slice(1).every((token) => token.startsWith("L"))).toBe(
      true,
    );
    expect(commands).toHaveLength(3);
  });
});

describe("sparklineEndY", () => {
  it("returns the vertical center for fewer than two points", () => {
    expect(sparklineEndY([], 200)).toBe(100);
    expect(sparklineEndY([point(50)], 200)).toBe(100);
  });

  it("returns the vertical center for a perfectly flat series", () => {
    expect(sparklineEndY([point(10), point(10), point(10)], 200)).toBe(100);
  });

  it("agrees with buildSparklinePath's own last y for a normal series", () => {
    const points = [point(0), point(50), point(100)];
    const path = buildSparklinePath(points, 100, 100);
    const lastY = Number(path.split(" ").at(-1));

    expect(sparklineEndY(points, 100)).toBeCloseTo(lastY, 5);
  });

  it("places a rising series' endpoint above its starting point (smaller y)", () => {
    const points = [point(0), point(100)];
    const endY = sparklineEndY(points, 200);
    // Lower y is higher on screen — the last (highest-value) point should
    // sit above the vertical center, not below it.
    expect(endY).toBeLessThan(100);
  });
});
