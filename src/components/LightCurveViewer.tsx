import React, { useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  Sliders,
  Info,
  Calendar,
  Layers,
  Sparkles,
  AlertCircle,
  Clock,
  Compass,
} from "lucide-react";
import type { TransitAnalysisResult, AnalysisOptions } from "../lib/transit-analysis";

interface LightCurveViewerProps {
  analysis: TransitAnalysisResult | null;
  isLoading?: boolean;
  onUpdateOptions?: (opts: Partial<AnalysisOptions>) => void;
  options?: AnalysisOptions;
}

export const LightCurveViewer: React.FC<LightCurveViewerProps> = ({
  analysis,
  isLoading,
  onUpdateOptions,
  options = { detrendWindow: 21, thresholdSigma: 2.2 },
}) => {
  const [activeTab, setActiveTab] = useState<"timeseries" | "phase" | "periodogram">("timeseries");
  const [showTrend, setShowTrend] = useState(true);

  if (isLoading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-glass-border bg-void/60 p-8 font-mono text-xs">
        <Activity className="h-8 w-8 animate-spin text-cyan mb-4" />
        <span className="text-foreground font-bold">ANALYZING PHOTOMETRIC TIME-SERIES…</span>
        <span className="text-muted-foreground mt-1">Applying sliding-median detrending and Box Least Squares search</span>
      </div>
    );
  }

  if (!analysis || analysis.validPointsCount === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-void/40 p-8 text-center font-mono text-xs">
        <Compass className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <span className="text-foreground font-bold">NO LIGHT CURVE DATA LOADED</span>
        <span className="text-muted-foreground mt-1 max-w-md">
          Search for an astronomical target from NASA MAST (e.g., Kepler-10, Kepler-8, TRAPPIST-1) to retrieve genuine observation data and run custom transit detection.
        </span>
      </div>
    );
  }

  // Pre-sample or format points for smooth rendering
  const timeSeriesData = analysis.detrendedLightCurve.map((pt) => ({
    time: pt.time,
    flux: pt.detrendedFlux,
    norm: pt.normalizedFlux,
    trend: pt.trend,
    isDip: pt.isDip,
  }));

  const phaseData = analysis.phaseFoldedCurve.map((pt) => ({
    phase: pt.phase,
    flux: pt.flux,
  }));

  const periodogramData = analysis.periodogram.map((pt) => ({
    period: pt.period,
    power: pt.power,
    depth: pt.depthPpm,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6 font-mono text-xs">
        <div className="glass rounded-xl p-3 border border-glass-border">
          <div className="text-[10px] text-muted-foreground">TARGET & MISSION</div>
          <div className="text-sm font-bold text-cyan truncate">{analysis.targetName}</div>
          <div className="text-[10px] text-muted-foreground">{analysis.mission} Archive</div>
        </div>

        <div className="glass rounded-xl p-3 border border-glass-border">
          <div className="text-[10px] text-muted-foreground">VALID MEASUREMENTS</div>
          <div className="text-sm font-bold text-foreground">{analysis.validPointsCount.toLocaleString()} pts</div>
          <div className="text-[10px] text-muted-foreground">{analysis.observationSpanDays} Days Span</div>
        </div>

        <div className="glass rounded-xl p-3 border border-glass-border">
          <div className="text-[10px] text-muted-foreground">CANDIDATE PERIOD</div>
          <div className="text-sm font-bold text-foreground">
            {analysis.candidatePeriodDays ? `${analysis.candidatePeriodDays.toFixed(3)} d` : "Undetermined"}
          </div>
          <div className="text-[10px] text-muted-foreground">Confidence: {analysis.periodConfidence}</div>
        </div>

        <div className="glass rounded-xl p-3 border border-glass-border">
          <div className="text-[10px] text-muted-foreground">ESTIMATED DEPTH</div>
          <div className="text-sm font-bold text-amber-400">
            {analysis.candidateTransitDepthPpm ? `${analysis.candidateTransitDepthPpm} ppm` : "N/A"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {analysis.candidateTransitDepthPpm
              ? `${(analysis.candidateTransitDepthPpm / 10000).toFixed(3)}% flux`
              : "Flat baseline"}
          </div>
        </div>

        <div className="glass rounded-xl p-3 border border-glass-border">
          <div className="text-[10px] text-muted-foreground">CANDIDATE DIPS</div>
          <div className="text-sm font-bold text-foreground">{analysis.eventCount} Events</div>
          <div className="text-[10px] text-muted-foreground">Threshold: {analysis.detectionThresholdSigma}σ</div>
        </div>

        <div className="glass rounded-xl p-3 border border-glass-border">
          <div className="text-[10px] text-muted-foreground">NOISE FLOOR (1σ)</div>
          <div className="text-sm font-bold text-foreground">{analysis.noiseFloorPpm} ppm</div>
          <div className="text-[10px] text-muted-foreground">MAD dispersion</div>
        </div>
      </div>

      {/* Analysis Status Alert */}
      <div
        className={`flex items-start gap-3 rounded-xl border p-4 font-mono text-xs backdrop-blur-md ${
          analysis.status === "CANDIDATE_SIGNAL_DETECTED"
            ? "border-emerald/40 bg-emerald/10 text-emerald-200"
            : analysis.status === "DATA_INSUFFICIENT"
            ? "border-red-500/40 bg-red-950/20 text-red-200"
            : "border-cyan/40 bg-cyan/5 text-cyan-200"
        }`}
      >
        <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <div className="font-bold uppercase tracking-wider">
            {analysis.status === "CANDIDATE_SIGNAL_DETECTED"
              ? "CANDIDATE TRANSIT-LIKE SIGNAL IDENTIFIED"
              : analysis.status === "DATA_INSUFFICIENT"
              ? "INSUFFICIENT ARCHIVE DATA"
              : "BASELINE PHOTOMETRY STABLE"}
          </div>
          <div className="mt-1 text-foreground/90 leading-relaxed">{analysis.statusMessage}</div>
        </div>
      </div>

      {/* Chart View Toggle and Sliders */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-glass-border pb-3">
        <div className="flex gap-2">
          {[
            { id: "timeseries", label: "Observed Light Curve" },
            { id: "phase", label: "Phase-Folded Profile" },
            { id: "periodogram", label: "BLS Periodogram" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-full px-4 py-1.5 font-mono text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-cyan text-void shadow-[0_0_15px_var(--cyan)]"
                  : "bg-glass border border-white/10 text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Algorithm controls */}
        {onUpdateOptions && (
          <div className="flex flex-wrap items-center gap-4 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Detrend Window:</span>
              <input
                type="range"
                min={7}
                max={51}
                step={2}
                value={options.detrendWindow || 21}
                onChange={(e) => onUpdateOptions({ detrendWindow: Number(e.target.value) })}
                className="w-24 accent-[var(--cyan)]"
              />
              <span className="w-6 text-cyan font-bold">{options.detrendWindow || 21}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Threshold:</span>
              <input
                type="range"
                min={1.5}
                max={4.0}
                step={0.1}
                value={options.thresholdSigma || 2.2}
                onChange={(e) => onUpdateOptions({ thresholdSigma: Number(e.target.value) })}
                className="w-24 accent-[var(--cyan)]"
              />
              <span className="w-8 text-cyan font-bold">{options.thresholdSigma || 2.2}σ</span>
            </div>
          </div>
        )}
      </div>

      {/* Primary Chart Area */}
      <div className="glass rounded-2xl border border-glass-border p-6 shadow-2xl">
        {activeTab === "timeseries" && (
          <div>
            <div className="mb-4 flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>
                Y: Relative Detrended Flux (Normalized baseline = 1.0) &nbsp;|&nbsp; X: Time [
                {analysis.timeUnit}]
              </span>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan" /> Observed Points
                <span className="h-2 w-2 rounded-full bg-amber-400" /> Candidate Dip
              </div>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    type="number"
                    dataKey="time"
                    name="Time"
                    domain={["auto", "auto"]}
                    tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="flux"
                    name="Flux"
                    domain={["auto", "auto"]}
                    tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace" }}
                  />
                  <Tooltip
                    content={({ payload }) => {
                      const d = payload?.[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="glass rounded-lg p-2 font-mono text-[10px] shadow-xl border border-white/20">
                          <div>Time: {d.time.toFixed(4)} BJD</div>
                          <div>Flux: {d.flux.toFixed(5)}</div>
                          {d.isDip && <div className="text-amber-400 font-bold">CANDIDATE TRANSIT DIP</div>}
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine y={1.0} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
                  <ReferenceLine
                    y={1.0 - analysis.detectionThresholdSigma * analysis.noiseFloorFraction}
                    stroke="rgba(239, 68, 68, 0.5)"
                    strokeDasharray="2 2"
                  />
                  <Scatter
                    name="Normal Cadences"
                    data={timeSeriesData.filter((d) => !d.isDip)}
                    fill="var(--cyan)"
                    opacity={0.7}
                  />
                  <Scatter
                    name="Candidate Dip Cadences"
                    data={timeSeriesData.filter((d) => d.isDip)}
                    fill="var(--amber)"
                    opacity={0.9}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "phase" && (
          <div>
            <div className="mb-4 flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>
                Y: Normalized Flux &nbsp;|&nbsp; X: Orbital Phase [-0.5 to +0.5] (Folded at Period{" "}
                {analysis.candidatePeriodDays ? `${analysis.candidatePeriodDays.toFixed(3)} d` : "N/A"})
              </span>
              <span className="text-cyan">Transit Centered at Phase 0.0</span>
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    type="number"
                    dataKey="phase"
                    name="Phase"
                    domain={[-0.5, 0.5]}
                    tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="flux"
                    name="Flux"
                    domain={["auto", "auto"]}
                    tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace" }}
                  />
                  <Tooltip
                    content={({ payload }) => {
                      const d = payload?.[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="glass rounded-lg p-2 font-mono text-[10px] shadow-xl border border-white/20">
                          <div>Phase: {d.phase.toFixed(3)}</div>
                          <div>Flux: {d.flux.toFixed(5)}</div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine x={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                  <Scatter data={phaseData} fill="var(--cyan)" opacity={0.75} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {activeTab === "periodogram" && (
          <div>
            <div className="mb-4 flex items-center justify-between font-mono text-xs text-muted-foreground">
              <span>
                Y: BLS Power / SDE &nbsp;|&nbsp; X: Trial Period [Days]
              </span>
              {analysis.candidatePeriodDays && (
                <span className="text-amber-400">Peak: {analysis.candidatePeriodDays.toFixed(3)} Days</span>
              )}
            </div>

            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={periodogramData} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis
                    dataKey="period"
                    name="Trial Period (d)"
                    tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace" }}
                  />
                  <YAxis
                    dataKey="power"
                    name="Power"
                    tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 10, fontFamily: "monospace" }}
                  />
                  <Tooltip
                    content={({ payload }) => {
                      const d = payload?.[0]?.payload;
                      if (!d) return null;
                      return (
                        <div className="glass rounded-lg p-2 font-mono text-[10px] shadow-xl border border-white/20">
                          <div>Period: {d.period.toFixed(3)} d</div>
                          <div>SDE Power: {d.power.toFixed(2)}</div>
                          <div>Dip Depth: {d.depth} ppm</div>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="power"
                    stroke="var(--cyan)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Candidate Dip Events Table */}
      {analysis.dipEvents.length > 0 && (
        <div className="glass rounded-2xl border border-glass-border p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <h3 className="font-mono text-sm font-bold text-foreground">
              DETECTED CANDIDATE DIP EVENTS ({analysis.dipEvents.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground">
                  <th className="pb-2">EVENT ID</th>
                  <th className="pb-2">CENTRAL EPOCH (T₀)</th>
                  <th className="pb-2">TRANSIT DEPTH</th>
                  <th className="pb-2">DURATION</th>
                  <th className="pb-2">IN-TRANSIT CADENCES</th>
                  <th className="pb-2">SNR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-foreground">
                {analysis.dipEvents.map((evt) => (
                  <tr key={evt.id} className="hover:bg-white/5 transition">
                    <td className="py-2.5 font-bold text-cyan">{evt.id}</td>
                    <td className="py-2.5">{evt.t0.toFixed(4)} BJD</td>
                    <td className="py-2.5 text-amber-300 font-bold">
                      {evt.depthPpm.toLocaleString()} ppm ({evt.depthPercent}%)
                    </td>
                    <td className="py-2.5">{evt.durationHours} hrs</td>
                    <td className="py-2.5">{evt.inTransitPoints} pts</td>
                    <td className="py-2.5 text-emerald">{evt.snr}σ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scientific Transparency & Rigor Card */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="glass rounded-xl border border-glass-border p-5 font-mono text-xs">
          <div className="mb-3 flex items-center gap-2 text-cyan font-bold">
            <Info className="h-4 w-4" /> METHOD & MODEL ASSUMPTIONS
          </div>
          <p className="text-muted-foreground leading-relaxed text-[11px] mb-3">
            {analysis.methodDescription}
          </p>
          <ul className="space-y-1.5 text-[10px] text-foreground/80 list-disc list-inside">
            {analysis.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>

        <div className="glass rounded-xl border border-amber-500/30 bg-amber-950/10 p-5 font-mono text-xs">
          <div className="mb-3 flex items-center gap-2 text-amber-300 font-bold">
            <AlertCircle className="h-4 w-4" /> SCIENTIFIC LIMITATIONS & HONESTY
          </div>
          <ul className="space-y-2 text-[10px] text-amber-200/90 list-disc list-inside leading-relaxed">
            {analysis.scientificLimitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
