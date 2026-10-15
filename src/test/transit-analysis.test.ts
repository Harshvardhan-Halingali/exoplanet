import { describe, expect, it } from "vitest";
import { analyzeLightCurve } from "../lib/transit-analysis";

describe("Exoplanet Transit Analysis Pipeline (TEST C)", () => {
  it("Validates measurements, handles missing values, and identifies periodic transit dips", () => {
    // Generate synthetic light curve: period = 3.0 days, depth = 2000 ppm
    const period = 3.0;
    const rawPoints = [];

    // Include some invalid points to verify validation
    rawPoints.push({ time: NaN, flux: 100000 });
    rawPoints.push({ time: 1.0, flux: NaN });
    rawPoints.push({ time: 2.0, flux: -500 }); // negative flux

    for (let t = 0; t <= 12; t += 0.05) {
      let flux = 50000;
      const phase = (t % period) / period;
      if (phase < 0.04) {
        flux -= 100; // 2000 ppm dip
      }
      // slight white noise
      flux += (Math.random() - 0.5) * 5;
      rawPoints.push({ time: t, flux });
    }

    const result = analyzeLightCurve(rawPoints, {
      targetName: "Benchmark-System-1",
      minPeriodDays: 1.0,
      maxPeriodDays: 5.0,
      thresholdSigma: 2.0,
    });

    // 1. Data validation check
    expect(result.validPointsCount).toBeGreaterThan(200);
    expect(result.validPointsCount).toBeLessThan(rawPoints.length);

    // 2. Detection check
    expect(result.status).toBe("CANDIDATE_SIGNAL_DETECTED");
    expect(result.eventCount).toBeGreaterThanOrEqual(3);

    // 3. Periodicity check
    expect(result.candidatePeriodDays).toBeDefined();
    expect(result.candidatePeriodDays).toBeCloseTo(3.0, 0.5);

    // 4. Depth check (expected ~2000 ppm)
    expect(result.candidateTransitDepthPpm).toBeGreaterThan(1000);
    expect(result.candidateTransitDepthPpm).toBeLessThan(3000);

    // 5. Scientific transparency check
    expect(result.methodDescription).toContain("Box Least Squares");
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(result.scientificLimitations.length).toBeGreaterThan(0);
    expect(result.phaseFoldedCurve.length).toBe(result.validPointsCount);
  });

  it("Correctly handles insufficient data and explains why", () => {
    const fewPoints = [
      { time: 1.0, flux: 100 },
      { time: 2.0, flux: 100 },
    ];

    const result = analyzeLightCurve(fewPoints, { targetName: "Sparse-Target" });

    expect(result.status).toBe("DATA_INSUFFICIENT");
    expect(result.validPointsCount).toBe(2);
    expect(result.statusMessage).toContain("Insufficient observation points");
    expect(result.candidatePeriodDays).toBeNull();
  });
});
