import { describe, expect, it } from "vitest";
import { resolveTargetName } from "../server/mast-service";

describe("NASA MAST Archive Integration (TEST A & B)", () => {
  it("TEST A: Resolves genuine celestial coordinates for Kepler-10", async () => {
    const coords = await resolveTargetName("Kepler-10");

    expect(coords.canonicalName).toBe("Kepler-10");
    expect(coords.ra).toBeCloseTo(285.679, 1);
    expect(coords.dec).toBeCloseTo(50.241, 1);
  }, 15000);

  it("TEST B: Disallows and throws honest error for INVALID_TARGET_12345 without fabricating data", async () => {
    await expect(resolveTargetName("INVALID_TARGET_12345")).rejects.toThrow(
      /could not be resolved|Target lookup failed/i
    );
  }, 15000);
});
