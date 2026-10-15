import React, { useState } from "react";
import {
  Search,
  Database,
  Radio,
  FileText,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Loader2,
  Calendar,
  Compass,
  ArrowRight,
} from "lucide-react";
import type { CelestialCoordinates, MastObservation, MastProduct } from "../lib/mast-api";

interface ArchiveSearchPanelProps {
  onSearch: (mission: "Kepler" | "TESS", target: string) => Promise<void>;
  onLoadObservation: (obs: MastObservation) => Promise<void>;
  isLoading: boolean;
  coordinates: CelestialCoordinates | null;
  observations: MastObservation[];
  selectedObsId: string | null;
  error: string | null;
}

export const ArchiveSearchPanel: React.FC<ArchiveSearchPanelProps> = ({
  onSearch,
  onLoadObservation,
  isLoading,
  coordinates,
  observations,
  selectedObsId,
  error,
}) => {
  const [mission, setMission] = useState<"Kepler" | "TESS">("Kepler");
  const [target, setTarget] = useState("Kepler-10");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (target.trim()) {
      onSearch(mission, target.trim());
    }
  };

  const setQuickTarget = (m: "Kepler" | "TESS", t: string) => {
    setMission(m);
    setTarget(t);
    onSearch(m, t);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search Input Box */}
      <div className="glass rounded-2xl border border-glass-border p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cyan" />
            <h2 className="font-mono text-sm font-bold tracking-wider text-foreground">
              NASA MAST PUBLIC ARCHIVE INTERFACE
            </h2>
          </div>
          <span className="rounded-full border border-cyan/30 bg-cyan/10 px-2.5 py-0.5 font-mono text-[10px] text-cyan">
            GENUINE ASTRONOMICAL DATA
          </span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-[160px_1fr_auto]">
            {/* Mission Selector */}
            <div className="flex rounded-xl border border-white/10 bg-void/60 p-1">
              <button
                type="button"
                onClick={() => setMission("Kepler")}
                className={`flex-1 rounded-lg py-2 font-mono text-xs font-bold transition ${
                  mission === "Kepler"
                    ? "bg-cyan text-void shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Kepler
              </button>
              <button
                type="button"
                onClick={() => setMission("TESS")}
                className={`flex-1 rounded-lg py-2 font-mono text-xs font-bold transition ${
                  mission === "TESS"
                    ? "bg-cyan text-void shadow-md"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                TESS
              </button>
            </div>

            {/* Target input */}
            <div className="relative">
              <input
                type="text"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Target identifier (e.g., Kepler-10, TRAPPIST-1, TOI-700)…"
                className="w-full rounded-xl border border-white/10 bg-void/60 px-4 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan"
              />
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading || !target.trim()}
              className="flex items-center justify-center gap-2 rounded-xl bg-foreground px-6 py-2.5 font-mono text-xs font-bold text-void transition hover:bg-white/90 disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Querying…
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" /> Query MAST
                </>
              )}
            </button>
          </div>

          {/* Quick presets for hackathon testing */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span>Quick Benchmarks:</span>
            <button
              type="button"
              onClick={() => setQuickTarget("Kepler", "Kepler-10")}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-foreground hover:border-cyan hover:text-cyan transition"
            >
              Kepler-10 (Historic)
            </button>
            <button
              type="button"
              onClick={() => setQuickTarget("Kepler", "Kepler-8")}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-foreground hover:border-cyan hover:text-cyan transition"
            >
              Kepler-8 (Deep Transit)
            </button>
            <button
              type="button"
              onClick={() => setQuickTarget("Kepler", "TRAPPIST-1")}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-foreground hover:border-cyan hover:text-cyan transition"
            >
              TRAPPIST-1
            </button>
            <button
              type="button"
              onClick={() => setQuickTarget("TESS", "TOI-700")}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-foreground hover:border-cyan hover:text-cyan transition"
            >
              TOI-700 (TESS)
            </button>
            <button
              type="button"
              onClick={() => setQuickTarget("Kepler", "INVALID_TARGET_12345")}
              className="rounded-lg border border-red-500/30 bg-red-950/20 px-2.5 py-1 text-red-300 hover:border-red-500 transition"
              title="Test error response for non-existent target"
            >
              INVALID_TARGET_12345 (Test Error)
            </button>
          </div>
        </form>

        {/* Real Error Display */}
        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-500/40 bg-red-950/20 p-4 font-mono text-xs text-red-200">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-400 mt-0.5" />
            <div>
              <div className="font-bold uppercase tracking-wider text-red-400">ARCHIVE QUERY REJECTED / NOT FOUND</div>
              <p className="mt-1 leading-relaxed">{error}</p>
              <div className="mt-2 text-[10px] text-red-300/80">
                Notice: Historical archives do not fake telemetry. If a target is unrecognized by SIMBAD or has no mission data, a legitimate HTTP error is returned.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Target Metadata Card (when resolved) */}
      {coordinates && (
        <div className="glass rounded-xl border border-glass-border p-4 font-mono text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-cyan" />
              <span className="font-bold text-foreground">ASTRONOMICAL TARGET RESOLUTION</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Resolver: {coordinates.resolver || "SIMBAD"}</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-4 text-[11px]">
            <div>
              <div className="text-muted-foreground text-[10px]">CANONICAL NAME</div>
              <div className="font-bold text-cyan">{coordinates.canonicalName}</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px]">RIGHT ASCENSION (RA)</div>
              <div className="text-foreground">{coordinates.ra.toFixed(6)}°</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px]">DECLINATION (DEC)</div>
              <div className="text-foreground">{coordinates.dec.toFixed(6)}°</div>
            </div>
            <div>
              <div className="text-muted-foreground text-[10px]">OBJECT CLASSIFICATION</div>
              <div className="text-foreground">{coordinates.objectType || "Stellar Source"}</div>
            </div>
          </div>
        </div>
      )}

      {/* Observations Table */}
      {observations.length > 0 && (
        <div className="glass rounded-2xl border border-glass-border p-6 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-cyan" />
              <h3 className="font-mono text-sm font-bold text-foreground">
                RETRIEVED OBSERVATION DATASETS ({observations.length})
              </h3>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              Select an observation to load light curve measurements
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/10 text-muted-foreground text-[10px]">
                  <th className="pb-2">OBSERVATION ID</th>
                  <th className="pb-2">COLLECTION</th>
                  <th className="pb-2">PRODUCT TYPE</th>
                  <th className="pb-2">INSTRUMENT</th>
                  <th className="pb-2">START (BJD)</th>
                  <th className="pb-2">EXPOSURE (S)</th>
                  <th className="pb-2 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-foreground text-[11px]">
                {observations.map((obs) => {
                  const isSelected = selectedObsId === obs.obs_id;
                  const isTimeSeries = obs.dataproduct_type === "timeseries";

                  return (
                    <tr
                      key={obs.obs_id}
                      className={`transition ${isSelected ? "bg-cyan/10" : "hover:bg-white/5"}`}
                    >
                      <td className="py-2.5 font-bold text-cyan truncate max-w-[200px]" title={obs.obs_id}>
                        {obs.obs_id}
                      </td>
                      <td className="py-2.5">{obs.obs_collection}</td>
                      <td className="py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] ${
                            isTimeSeries
                              ? "bg-emerald/20 text-emerald border border-emerald/30"
                              : "bg-white/10 text-muted-foreground"
                          }`}
                        >
                          {obs.dataproduct_type}
                        </span>
                      </td>
                      <td className="py-2.5">{obs.instrument_name || "CCD"}</td>
                      <td className="py-2.5">{obs.t_min ? obs.t_min.toFixed(2) : "N/A"}</td>
                      <td className="py-2.5">{obs.t_exptime ? Math.round(obs.t_exptime) : "N/A"}</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => onLoadObservation(obs)}
                          disabled={isLoading}
                          className={`rounded-lg px-3 py-1 font-mono text-xs transition ${
                            isSelected
                              ? "bg-cyan text-void font-bold shadow-md"
                              : "border border-white/20 hover:border-cyan hover:text-cyan"
                          }`}
                        >
                          {isSelected ? "Active Light Curve" : "Load & Analyze"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
