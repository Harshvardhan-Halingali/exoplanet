import type { LightCurvePoint } from "../server/mast-service";

export interface DipEvent {
  id: string;
  t0: number; // Central epoch in BJD
  depthFraction: number; // e.g. 0.0015
  depthPpm: number; // e.g. 1500 ppm
  depthPercent: number; // e.g. 0.15%
  durationHours: number; // Duration of transit in hours
  durationDays: number;
  inTransitPoints: number;
  snr: number;
}

export interface PhasePoint {
  phase: number; // -0.5 to 0.5
  flux: number;
  time: number;
}

export interface PeriodogramPoint {
  period: number; // Days
  power: number; // Normalized power or SDE
  depthPpm: number;
}

export interface TransitAnalysisResult {
  targetName: string;
  mission: string;
  obsId: string;
  totalRawPoints: number;
  validPointsCount: number;
  observationSpanDays: number;
  timeUnit: string;
  fluxUnit: string;

  // Detrending metrics
  medianFlux: number;
  noiseFloorPpm: number; // 1-sigma scatter in ppm
  noiseFloorFraction: number;

  // Analysis options used
  detrendWindowSize: number;
  detectionThresholdSigma: number;

  // Detected events
  dipEvents: DipEvent[];
  eventCount: number;

  // Period search (BLS)
  candidatePeriodDays: number | null;
  candidateEpochBjd: number | null;
  candidateTransitDepthPpm: number | null;
  candidateDurationHours: number | null;
  candidateSnr: number | null;
  periodConfidence: "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT";

  // Data for charts
  detrendedLightCurve: {
    time: number;
    rawFlux: number;
    normalizedFlux: number;
    trend: number;
    detrendedFlux: number;
    isDip: boolean;
  }[];
  phaseFoldedCurve: PhasePoint[];
  periodogram: PeriodogramPoint[];

  // Scientific metadata and transparency
  status: "CANDIDATE_SIGNAL_DETECTED" | "NO_SIGNIFICANT_DIPS" | "DATA_INSUFFICIENT";
  statusMessage: string;
  methodDescription: string;
  assumptions: string[];
  scientificLimitations: string[];
}

export interface AnalysisOptions {
  detrendWindow?: number; // Cadences for running median (default: 21)
  thresholdSigma?: number; // Dip detection threshold in sigma (default: 2.2)
  minPeriodDays?: number; // Minimum period to test in days (default: 0.5)
  maxPeriodDays?: number; // Maximum period to test in days (default: 10.0)
  targetName?: string;
  mission?: string;
  obsId?: string;
  timeUnit?: string;
  fluxUnit?: string;
}

/**
 * Custom Exoplanet Transit Analysis Pipeline
 * Operates purely on actual observation measurements without black-box ML.
 */
export function analyzeLightCurve(
  rawPoints: LightCurvePoint[],
  options: AnalysisOptions = {}
): TransitAnalysisResult {
  const {
    detrendWindow = 21,
    thresholdSigma = 2.2,
    minPeriodDays = 0.5,
    maxPeriodDays = 10.0,
    targetName = "Target",
    mission = "Kepler",
    obsId = "OBS",
    timeUnit = "BJD - 2454833 (Days)",
    fluxUnit = "e-/s",
  } = options;

  // 1. Validation and Sorting
  const validPoints = rawPoints
    .filter(
      (p) =>
        typeof p.time === "number" &&
        !isNaN(p.time) &&
        isFinite(p.time) &&
        typeof p.flux === "number" &&
        !isNaN(p.flux) &&
        isFinite(p.flux) &&
        p.flux > 0
    )
    .sort((a, b) => a.time - b.time);

  if (validPoints.length < 30) {
    return createInsufficientResult(
      rawPoints.length,
      validPoints.length,
      targetName,
      mission,
      obsId,
      timeUnit,
      fluxUnit,
      "Insufficient observation points (minimum 30 valid measurements required for statistical transit analysis)."
    );
  }

  const times = validPoints.map((p) => p.time);
  const fluxes = validPoints.map((p) => p.flux);
  const firstTime = times[0] ?? 0;
  const lastTime = times[times.length - 1] ?? firstTime;
  const timeSpan = lastTime - firstTime;

  // 2. Baseline Median Normalization
  const sortedFluxes = [...fluxes].sort((a, b) => a - b);
  const medianFlux = sortedFluxes[Math.floor(sortedFluxes.length / 2)] ?? 1;
  const normFlux = fluxes.map((f) => f / medianFlux);

  // 3. Moving Median Detrending (flatten stellar variability and instrumental drifts)
  const halfWindow = Math.max(2, Math.floor(detrendWindow / 2));
  const trend: number[] = [];

  for (let i = 0; i < normFlux.length; i++) {
    const low = Math.max(0, i - halfWindow);
    const high = Math.min(normFlux.length, i + halfWindow + 1);
    const windowSlice = normFlux.slice(low, high).sort((a, b) => a - b);
    trend.push(windowSlice[Math.floor(windowSlice.length / 2)] ?? 1);
  }

  const detrended = normFlux.map((nf, i) => nf / (trend[i] ?? 1));

  // 4. Robust Standard Deviation (Noise Floor) via Median Absolute Deviation (MAD)
  const sortedDetrended = [...detrended].sort((a, b) => a - b);
  const medianDetrended = sortedDetrended[Math.floor(sortedDetrended.length / 2)] ?? 1;
  const absoluteDeviations = detrended
    .map((d) => Math.abs(d - medianDetrended))
    .sort((a, b) => a - b);
  const mad = absoluteDeviations[Math.floor(absoluteDeviations.length / 2)] ?? 0.0001;
  // 1.4826 converts MAD to standard deviation for normal distribution
  const stdDev = Math.max(0.00001, mad * 1.4826);
  const noiseFloorPpm = stdDev * 1_000_000;

  // 5. Threshold Dip Detection
  const dipThreshold = 1.0 - thresholdSigma * stdDev;
  const dipEvents: DipEvent[] = [];
  let inDip = false;
  let currentDipIndices: number[] = [];

  for (let i = 0; i < detrended.length; i++) {
    const dVal = detrended[i] ?? 1;
    if (dVal < dipThreshold) {
      currentDipIndices.push(i);
      inDip = true;
    } else {
      if (inDip) {
        if (currentDipIndices.length >= 1) {
          // Identify minimum flux cadence within dip
          const firstDipIdx = currentDipIndices[0];
          if (firstDipIdx !== undefined) {
            let minIdx = firstDipIdx;
            let minVal = detrended[minIdx] ?? 1;
            for (const idx of currentDipIndices) {
              const currentVal = detrended[idx] ?? 1;
              if (currentVal < minVal) {
                minVal = currentVal;
                minIdx = idx;
              }
            }

            const depthFrac = 1.0 - minVal;
            const lastDipIdx = currentDipIndices[currentDipIndices.length - 1] ?? firstDipIdx;
            const tStart = times[firstDipIdx] ?? 0;
            const tEnd = times[lastDipIdx] ?? tStart;
            const durDays = Math.max(0.01, tEnd - tStart);
            const durHours = durDays * 24;
            const snr = depthFrac / (stdDev / Math.sqrt(currentDipIndices.length));

            dipEvents.push({
              id: `dip-${dipEvents.length + 1}`,
              t0: times[minIdx] ?? tStart,
              depthFraction: depthFrac,
              depthPpm: Math.round(depthFrac * 1_000_000),
              depthPercent: +(depthFrac * 100).toFixed(4),
              durationHours: +durHours.toFixed(2),
              durationDays: +durDays.toFixed(4),
              inTransitPoints: currentDipIndices.length,
              snr: +snr.toFixed(1),
            });
          }
        }
        currentDipIndices = [];
        inDip = false;
      }
    }
  }

  // Handle trailing dip
  if (inDip && currentDipIndices.length >= 1) {
    const firstDipIdx = currentDipIndices[0];
    if (firstDipIdx !== undefined) {
      let minIdx = firstDipIdx;
      let minVal = detrended[minIdx] ?? 1;
      for (const idx of currentDipIndices) {
        const currentVal = detrended[idx] ?? 1;
        if (currentVal < minVal) {
          minVal = currentVal;
          minIdx = idx;
        }
      }
      const depthFrac = 1.0 - minVal;
      const lastDipIdx = currentDipIndices[currentDipIndices.length - 1] ?? firstDipIdx;
      const tStart = times[firstDipIdx] ?? 0;
      const tEnd = times[lastDipIdx] ?? tStart;
      const durDays = Math.max(0.01, tEnd - tStart);
      dipEvents.push({
        id: `dip-${dipEvents.length + 1}`,
        t0: times[minIdx] ?? tStart,
        depthFraction: depthFrac,
        depthPpm: Math.round(depthFrac * 1_000_000),
        depthPercent: +(depthFrac * 100).toFixed(4),
        durationHours: +(durDays * 24).toFixed(2),
        durationDays: +durDays.toFixed(4),
        inTransitPoints: currentDipIndices.length,
        snr: +(depthFrac / (stdDev / Math.sqrt(currentDipIndices.length))).toFixed(1),
      });
    }
  }

  // 6. Box Least Squares (BLS) Periodogram Search
  const periodogram: PeriodogramPoint[] = [];
  const maxSearchPeriod = Math.min(maxPeriodDays, Math.max(minPeriodDays * 2, timeSpan / 1.5));
  const trialSteps = 60;
  const periodStep = (maxSearchPeriod - minPeriodDays) / trialSteps;

  let bestPeriod: number | null = null;
  let bestEpoch: number | null = null;
  let bestDepthPpm = 0;
  let bestPower = 0;
  let bestDurationHours = 2.0;

  for (let s = 0; s < trialSteps; s++) {
    const P = minPeriodDays + s * periodStep;
    const bins = 20;
    const binCounts = new Array(bins).fill(0);
    const binSums = new Array(bins).fill(0);

    for (let i = 0; i < times.length; i++) {
      const t = times[i] ?? 0;
      const phase = (((t - firstTime) % P) + P) % P;
      const binIdx = Math.floor((phase / P) * bins) % bins;
      binCounts[binIdx] = (binCounts[binIdx] ?? 0) + 1;
      binSums[binIdx] = (binSums[binIdx] ?? 0) + (detrended[i] ?? 1);
    }

    let maxDipInBins = 0;
    let dipBin = 0;
    for (let b = 0; b < bins; b++) {
      const count = binCounts[b] ?? 0;
      if (count >= 2) {
        const sum = binSums[b] ?? 0;
        const avg = sum / count;
        const dip = 1.0 - avg;
        if (dip > maxDipInBins) {
          maxDipInBins = dip;
          dipBin = b;
        }
      }
    }

    // Power metric: dip depth scaled by sampling coverage
    const power = maxDipInBins > 0 ? (maxDipInBins / stdDev) * Math.sqrt(times.length / bins) : 0;
    const depthPpm = Math.max(0, Math.round(maxDipInBins * 1_000_000));

    periodogram.push({
      period: +P.toFixed(3),
      power: +power.toFixed(2),
      depthPpm,
    });

    if (power > bestPower && maxDipInBins > stdDev * 0.5) {
      bestPower = power;
      bestPeriod = P;
      bestDepthPpm = depthPpm;
      bestEpoch = firstTime + (dipBin / bins) * P;
      bestDurationHours = (P / bins) * 24;
    }
  }

  // Fallback to inter-dip interval period estimation if discrete dips were found
  if (dipEvents.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < dipEvents.length; i++) {
      const curr = dipEvents[i];
      const prev = dipEvents[i - 1];
      if (curr && prev) {
        intervals.push(curr.t0 - prev.t0);
      }
    }
    const sortedIntervals = intervals.sort((a, b) => a - b);
    const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
    const firstDip = dipEvents[0];
    if (medianInterval !== undefined && firstDip && medianInterval >= minPeriodDays && medianInterval <= maxPeriodDays) {
      bestPeriod = +medianInterval.toFixed(4);
      bestEpoch = firstDip.t0;
      bestDepthPpm = Math.round(
        dipEvents.reduce((acc, d) => acc + d.depthPpm, 0) / dipEvents.length
      );
    }
  }

  // 7. Phase Folding
  const primaryPeriod = bestPeriod || (timeSpan > 1 ? timeSpan / 2 : 1.0);
  const primaryEpoch = bestEpoch ?? firstTime;
  const phaseFoldedCurve: PhasePoint[] = validPoints.map((p, i) => {
    let ph = (((p.time - primaryEpoch) % primaryPeriod) + primaryPeriod) % primaryPeriod;
    ph = ph / primaryPeriod;
    // Shift phase to [-0.5, 0.5] so transit dip is centered at 0.0
    if (ph > 0.5) ph -= 1.0;
    return {
      phase: +ph.toFixed(4),
      flux: +(detrended[i] ?? 1).toFixed(5),
      time: +p.time.toFixed(4),
    };
  }).sort((a, b) => a.phase - b.phase);

  // 8. Determine Status and Confidence
  const dipSet = new Set(currentDipIndices);
  const detrendedLightCurve = validPoints.map((p, i) => {
    const dFlux = detrended[i] ?? 1;
    return {
      time: +p.time.toFixed(4),
      rawFlux: +p.flux.toFixed(2),
      normalizedFlux: +(normFlux[i] ?? 1).toFixed(5),
      trend: +(trend[i] ?? 1).toFixed(5),
      detrendedFlux: +dFlux.toFixed(5),
      isDip: dFlux < dipThreshold,
    };
  });

  let status: "CANDIDATE_SIGNAL_DETECTED" | "NO_SIGNIFICANT_DIPS" | "DATA_INSUFFICIENT" = "NO_SIGNIFICANT_DIPS";
  let statusMessage = "";
  let confidence: "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT" = "LOW";

  if (dipEvents.length >= 2 && bestPeriod) {
    status = "CANDIDATE_SIGNAL_DETECTED";
    confidence = dipEvents.length >= 3 ? "HIGH" : "MODERATE";
    statusMessage = `Detected ${dipEvents.length} distinct transit-like dip events with consistent recurrence at an estimated candidate period of ${bestPeriod.toFixed(3)} days (mean depth: ${bestDepthPpm} ppm / ${((bestDepthPpm / 10000)).toFixed(3)}%).`;
  } else if (dipEvents.length === 1 && dipEvents[0]) {
    const singleDip = dipEvents[0];
    status = "CANDIDATE_SIGNAL_DETECTED";
    confidence = "LOW";
    statusMessage = `Single candidate transit-like event observed at epoch ${singleDip.t0.toFixed(4)} BJD with depth ${singleDip.depthPpm} ppm. Period cannot be uniquely constrained from a single event without additional epochs.`;
  } else if (bestPower > 4.0 && bestDepthPpm > noiseFloorPpm * 0.8) {
    status = "CANDIDATE_SIGNAL_DETECTED";
    confidence = "LOW";
    statusMessage = `Periodic phase-coherent flux dip detected via Box Least Squares (BLS) periodogram at candidate period ${bestPeriod?.toFixed(3)} days (depth ~${bestDepthPpm} ppm), though individual points remain near the single-cadence noise floor (${Math.round(noiseFloorPpm)} ppm).`;
  } else {
    status = "NO_SIGNIFICANT_DIPS";
    confidence = "INSUFFICIENT";
    statusMessage = `No statistically significant flux decreases detected exceeding the ${thresholdSigma}σ detection threshold in this observation window (1-sigma noise floor: ${Math.round(noiseFloorPpm)} ppm). Target light curve is consistent with flat stellar baseline.`;
  }

  return {
    targetName,
    mission,
    obsId,
    totalRawPoints: rawPoints.length,
    validPointsCount: validPoints.length,
    observationSpanDays: +timeSpan.toFixed(2),
    timeUnit,
    fluxUnit,
    medianFlux: +medianFlux.toFixed(2),
    noiseFloorPpm: Math.round(noiseFloorPpm),
    noiseFloorFraction: +stdDev.toFixed(6),
    detrendWindowSize: detrendWindow,
    detectionThresholdSigma: thresholdSigma,
    dipEvents,
    eventCount: dipEvents.length,
    candidatePeriodDays: bestPeriod ? +bestPeriod.toFixed(4) : null,
    candidateEpochBjd: bestEpoch ? +bestEpoch.toFixed(4) : null,
    candidateTransitDepthPpm: bestDepthPpm > 0 ? bestDepthPpm : null,
    candidateDurationHours: bestPeriod ? +bestDurationHours.toFixed(2) : null,
    candidateSnr: bestPower > 0 ? +bestPower.toFixed(1) : null,
    periodConfidence: confidence,
    detrendedLightCurve,
    phaseFoldedCurve,
    periodogram,
    status,
    statusMessage,
    methodDescription:
      "Custom non-parametric Box Least Squares (BLS) and sliding-median outlier rejection pipeline. Normalizes by sample median, removes long-term instrumental drift via moving median filter, computes robust noise floor using Median Absolute Deviation (MAD), and scans trial orbital periods by phase folding.",
    assumptions: [
      "Transit dips exhibit periodic, box-shaped or U-shaped flux attenuation.",
      "Stellar variability on timescales longer than the filter window is smooth and decoupled from transits.",
      "Noise follows an approximately stationary distribution after median detrending.",
      "Circular planetary orbit (e ≈ 0) assumed for initial phase epoch estimations.",
    ],
    scientificLimitations: [
      "A flux dip alone represents a 'candidate transit signal' and DOES NOT constitute confirmation of an exoplanet.",
      "Instrumental systematics (spacecraft pointing jitter, thermal settling, pixel sensitivity drift) can mimic transit dips.",
      "Stellar phenomena (starspots, pulsations, flaring activity) and astrophysical false positives (grazing eclipsing binary stars, background blended stars) produce similar light-curve signatures.",
      "Robust confirmation requires independent multi-quarter observation vetting, centroid motion analysis, and radial velocity mass measurement.",
    ],
  };
}

function createInsufficientResult(
  rawCount: number,
  validCount: number,
  targetName: string,
  mission: string,
  obsId: string,
  timeUnit: string,
  fluxUnit: string,
  reason: string
): TransitAnalysisResult {
  return {
    targetName,
    mission,
    obsId,
    totalRawPoints: rawCount,
    validPointsCount: validCount,
    observationSpanDays: 0,
    timeUnit,
    fluxUnit,
    medianFlux: 0,
    noiseFloorPpm: 0,
    noiseFloorFraction: 0,
    detrendWindowSize: 21,
    detectionThresholdSigma: 2.2,
    dipEvents: [],
    eventCount: 0,
    candidatePeriodDays: null,
    candidateEpochBjd: null,
    candidateTransitDepthPpm: null,
    candidateDurationHours: null,
    candidateSnr: null,
    periodConfidence: "INSUFFICIENT",
    detrendedLightCurve: [],
    phaseFoldedCurve: [],
    periodogram: [],
    status: "DATA_INSUFFICIENT",
    statusMessage: reason,
    methodDescription: "Transparent Box Least Squares (BLS) and sliding-median detrending.",
    assumptions: ["Requires sufficient valid photometric points."],
    scientificLimitations: ["Data points are inadequate to compute statistically meaningful transit fits."],
  };
}
