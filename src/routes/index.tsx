import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Orbit,
  Radio,
  Globe,
  Activity,
  Sliders,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  WifiOff,
  Database,
  Compass,
  History,
  Settings as SettingsIcon,
  Search,
  ExternalLink,
  Layers,
  ArrowRight,
  Sparkles,
  Download,
  Trash2,
  Menu,
  X,
  FileText,
  Clock,
  Shield,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import {
  getInitialNodes,
  getInitialLinks,
  calculateDijkstraRoute,
  toggleLinkState,
  type NetworkNode,
  type NetworkLink,
  type RoutingResult,
} from "@/lib/network-graph";
import {
  searchArchive,
  fetchObservationProducts,
  fetchLightCurve,
  type CelestialCoordinates,
  type MastObservation,
  type MastProduct,
} from "@/lib/mast-api";
import {
  analyzeLightCurve,
  type TransitAnalysisResult,
  type AnalysisOptions,
} from "@/lib/transit-analysis";
import {
  createEvent,
  INITIAL_EVENTS,
  type LoggedEvent,
  type EventCategory,
} from "@/lib/event-store";
import { NetworkMapCanvas } from "@/components/NetworkMapCanvas";
import { LightCurveViewer } from "@/components/LightCurveViewer";
import { ArchiveSearchPanel } from "@/components/ArchiveSearchPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ORBITAL RESCUE // Mission Control — Exoplanet Archive + Satellite Mesh Resilience" },
      {
        name: "description",
        content:
          "Mission control dashboard combining real astronomical observations from NASA's public MAST archive with simulated satellite network resilience using Dijkstra routing.",
      },
    ],
  }),
  component: OrbitalRescueDashboard,
});

type SidebarTab =
  | "overview"
  | "network"
  | "satellites"
  | "recovery"
  | "exoplanet"
  | "observations"
  | "events"
  | "settings";

function OrbitalRescueDashboard() {
  // Navigation
  const [activeTab, setActiveTab] = useState<SidebarTab>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Network Resilience Simulation State
  const [nodes, setNodes] = useState<NetworkNode[]>(getInitialNodes);
  const [links, setLinks] = useState<NetworkLink[]>(getInitialLinks);
  const [routing, setRouting] = useState<RoutingResult>(() =>
    calculateDijkstraRoute(getInitialNodes(), getInitialLinks())
  );

  // NASA MAST Archive State
  const [targetName, setTargetName] = useState("Kepler-10");
  const [activeMission, setActiveMission] = useState<"Kepler" | "TESS">("Kepler");
  const [coordinates, setCoordinates] = useState<CelestialCoordinates | null>(null);
  const [observations, setObservations] = useState<MastObservation[]>([]);
  const [selectedObs, setSelectedObs] = useState<MastObservation | null>(null);
  const [products, setProducts] = useState<MastProduct[]>([]);
  const [rawLightCurve, setRawLightCurve] = useState<any | null>(null);
  const [lastArchiveFetchTime, setLastArchiveFetchTime] = useState<string | null>(null);

  // Transit Analysis State
  const [analysisOptions, setAnalysisOptions] = useState<AnalysisOptions>({
    detrendWindow: 21,
    thresholdSigma: 2.2,
    minPeriodDays: 0.5,
    maxPeriodDays: 10.0,
  });
  const [analysisResult, setAnalysisResult] = useState<TransitAnalysisResult | null>(null);

  // Loaders and Errors
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Event Log
  const [events, setEvents] = useState<LoggedEvent[]>(INITIAL_EVENTS);
  const [eventCategoryFilter, setEventCategoryFilter] = useState<"all" | EventCategory>("all");

  const addLog = (
    category: EventCategory,
    severity: "info" | "success" | "warning" | "error",
    title: string,
    message: string,
    details?: Record<string, unknown>
  ) => {
    const evt = createEvent(category, severity, title, message, details);
    setEvents((prev) => [evt, ...prev]);
  };

  // Recalculate route whenever links or nodes change
  const updateNetworkLinks = (updatedLinks: NetworkLink[]) => {
    setLinks(updatedLinks);
    const newRouting = calculateDijkstraRoute(nodes, updatedLinks);
    setRouting(newRouting);

    if (newRouting.status === "NO_ROUTE") {
      addLog(
        "simulation",
        "error",
        "No Route Available",
        "Dijkstra recomputation confirmed complete network severance to destination station. Zero viable paths.",
        { activeLinksCount: updatedLinks.filter((l) => l.status === "active").length }
      );
      toast.error("NO ROUTE AVAILABLE", {
        description: "All communication paths to the destination are severed.",
      });
    } else if (newRouting.isRecovered) {
      addLog(
        "simulation",
        "warning",
        "Communication Recovered",
        `Rerouted via backup node SAT-C. New total cost: ${newRouting.totalCost}. Path: ${newRouting.path.join(" → ")}`,
        { totalCost: newRouting.totalCost, path: newRouting.path }
      );
      toast.success("COMMUNICATION RECOVERED", {
        description: `Dijkstra recalculated route via backup node SAT-C (Cost: ${newRouting.totalCost}).`,
      });
    } else {
      addLog(
        "simulation",
        "info",
        "Route Recomputed",
        `Shortest path updated: ${newRouting.path.join(" → ")} (Cost: ${newRouting.totalCost})`
      );
    }
  };

  const handleToggleLink = (linkId: string) => {
    const targetLink = links.find((l) => l.id === linkId);
    const isCurrentlyActive = targetLink?.status === "active";
    const updated = toggleLinkState(links, linkId);

    addLog(
      "simulation",
      isCurrentlyActive ? "warning" : "info",
      isCurrentlyActive ? "Link Severed" : "Link Restored",
      `Simulated edge ${targetLink?.label || linkId} set to ${isCurrentlyActive ? "FAILED" : "ACTIVE"}.`
    );

    updateNetworkLinks(updated);
  };

  const handleApplyScenario = (scenario: "default" | "fail-trunk" | "no-route" | "reset") => {
    if (scenario === "default" || scenario === "reset") {
      const resetLinks = getInitialLinks();
      setLinks(resetLinks);
      const r = calculateDijkstraRoute(nodes, resetLinks);
      setRouting(r);
      addLog(
        "simulation",
        "success",
        "Simulation Reset",
        "Network mesh topology restored to initial configuration. Baseline cost: 6."
      );
      toast.success("Simulation Reset", { description: "Default 5-node topology restored." });
    } else if (scenario === "fail-trunk") {
      // Disable SAT-A - SAT-B link (Test E)
      const updated = toggleLinkState(links, "link-sata-satb", "failed");
      addLog(
        "simulation",
        "warning",
        "Link Failure Injected",
        "Primary trunk SAT-A ↔ SAT-B disabled. Triggering automated Dijkstra shortest-path reroute."
      );
      updateNetworkLinks(updated);
    } else if (scenario === "no-route") {
      // Disable both incoming links to Mars Station (Test F)
      let updated = toggleLinkState(links, "link-satb-mars", "failed");
      addLog(
        "simulation",
        "error",
        "Destination Severed",
        "Injected catastrophic link failure on SAT-B ↔ Mars Station. Mars Station is now fully isolated."
      );
      updateNetworkLinks(updated);
    }
  };

  // Archive Query Action (TEST A and B)
  const handleArchiveSearch = async (mission: "Kepler" | "TESS", target: string) => {
    setIsArchiveLoading(true);
    setArchiveError(null);
    setActiveMission(mission);
    setTargetName(target);

    addLog(
      "archive",
      "info",
      "Archive Search Started",
      `Initiating query to NASA MAST services for mission [${mission}], target: "${target}".`
    );

    try {
      const res = await searchArchive(mission, target);
      setCoordinates(res.coordinates);
      setObservations(res.observations);
      setLastArchiveFetchTime(new Date().toLocaleTimeString());

      addLog(
        "archive",
        "success",
        "Target Resolved & Observations Retrieved",
        `Resolved ${res.coordinates.canonicalName} (RA: ${res.coordinates.ra.toFixed(4)}°, Dec: ${res.coordinates.dec.toFixed(4)}°). Retrieved ${res.observations.length} observation datasets from MAST archive.`,
        { count: res.observations.length }
      );
      toast.success("Archive Query Complete", {
        description: `Found ${res.observations.length} genuine observations for ${res.coordinates.canonicalName}.`,
      });

      // Auto-load the first time-series observation if available
      const firstTs = res.observations.find((o) => o.dataproduct_type === "timeseries") || res.observations[0];
      if (firstTs) {
        handleLoadObservation(firstTs);
      }
    } catch (err: any) {
      setCoordinates(null);
      setObservations([]);
      setSelectedObs(null);
      setRawLightCurve(null);
      setAnalysisResult(null);
      setArchiveError(err.message);

      addLog(
        "archive",
        "error",
        "Archive Search Failed",
        `Query failed for "${target}": ${err.message}`
      );
      toast.error("Archive Error", { description: err.message });
    } finally {
      setIsArchiveLoading(false);
    }
  };

  // Load Light Curve from Selected Observation
  const handleLoadObservation = async (obs: MastObservation) => {
    setIsArchiveLoading(true);
    setSelectedObs(obs);
    setArchiveError(null);

    addLog(
      "archive",
      "info",
      "Loading Observation Products",
      `Querying data products for obsid ${obs.obsid} (${obs.obs_id}) from MAST.`
    );

    try {
      const prods = await fetchObservationProducts(obs.obsid);
      setProducts(prods);

      // Find science lightcurve product (_llc.fits or lc.fits)
      const lcProd =
        prods.find(
          (p) =>
            p.productFilename.includes("_llc.fits") ||
            p.productFilename.includes("_slc.fits") ||
            p.productFilename.includes("lc.fits")
        ) || prods[0];

      if (lcProd && lcProd.dataURI) {
        addLog(
          "archive",
          "info",
          "Downloading FITS Product",
          `Retrieving genuine photometric FITS file: ${lcProd.productFilename} (${(lcProd.size / 1024).toFixed(1)} KB)`
        );

        const lcData = await fetchLightCurve(lcProd.dataURI);
        setRawLightCurve(lcData);

        addLog(
          "archive",
          "success",
          "Observation Data Loaded",
          `Successfully parsed ${lcData.pointCount} genuine time-series photometric cadences from ${lcProd.productFilename}.`
        );

        // Run transit analysis on loaded data
        runTransitAnalysis(lcData);
      } else {
        throw new Error("No usable science lightcurve FITS product found for this observation.");
      }
    } catch (err: any) {
      setArchiveError(err.message);
      addLog("archive", "error", "Product Load Failed", err.message);
      toast.error("Failed to Load Product", { description: err.message });
    } finally {
      setIsArchiveLoading(false);
    }
  };

  // Run Custom Transit Analysis
  const runTransitAnalysis = (lcData?: any) => {
    const dataToAnalyze = lcData || rawLightCurve;
    if (!dataToAnalyze || !dataToAnalyze.points || dataToAnalyze.points.length === 0) {
      toast.error("No measurement points available to analyze.");
      return;
    }

    setIsAnalysisLoading(true);
    addLog(
      "archive",
      "info",
      "Transit Analysis Started",
      `Running custom Box Least Squares & moving median detrending on ${dataToAnalyze.points.length} measurements for ${dataToAnalyze.targetName}.`
    );

    try {
      const result = analyzeLightCurve(dataToAnalyze.points, {
        ...analysisOptions,
        targetName: dataToAnalyze.targetName,
        mission: dataToAnalyze.mission,
        obsId: dataToAnalyze.obsId,
        timeUnit: dataToAnalyze.timeUnit,
        fluxUnit: dataToAnalyze.fluxUnit,
      });

      setAnalysisResult(result);

      addLog(
        "archive",
        result.status === "CANDIDATE_SIGNAL_DETECTED" ? "success" : "info",
        "Transit Analysis Completed",
        result.statusMessage,
        {
          period: result.candidatePeriodDays,
          depthPpm: result.candidateTransitDepthPpm,
          dipsFound: result.eventCount,
        }
      );
    } catch (err: any) {
      addLog("archive", "error", "Transit Analysis Failed", err.message);
      toast.error("Analysis Failed", { description: err.message });
    } finally {
      setIsAnalysisLoading(false);
    }
  };

  // Initial load on mount: automatically query Kepler-10 (Test A)
  useEffect(() => {
    handleArchiveSearch("Kepler", "Kepler-10");
  }, []);

  const activeLinksCount = links.filter((l) => l.status === "active").length;
  const filteredEvents =
    eventCategoryFilter === "all"
      ? events
      : events.filter((e) => e.category === eventCategoryFilter);

  return (
    <div className="relative min-h-screen bg-void text-foreground font-display selection:bg-cyan selection:text-void flex flex-col">
      {/* Background Starfield Canvas */}
      <canvas
        id="starfield-bg"
        className="pointer-events-none fixed inset-0 z-0 h-full w-full opacity-40"
      />

      {/* TOP HEADER */}
      <header className="sticky top-0 z-50 border-b border-glass-border bg-void/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Logo and Emblem */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan/10 border border-cyan/40 shadow-[0_0_15px_oklch(0.82_0.14_220/0.3)]">
              <Orbit className="h-5 w-5 text-cyan animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold tracking-[0.2em] text-foreground">
                  ORBITAL RESCUE
                </span>
                <span className="rounded bg-white/10 px-1.5 py-0.2 font-mono text-[9px] text-cyan border border-cyan/30">
                  V4.2
                </span>
              </div>
              <div className="font-mono text-[10px] text-muted-foreground hidden sm:block">
                ASTRONOMICAL ARCHIVE + SATELLITE MESH RESILIENCE
              </div>
            </div>
          </div>

          {/* Indicators & Clock */}
          <div className="flex items-center gap-4 sm:gap-6 font-mono text-xs">
            {/* Mission & Archive Link Status */}
            <div className="hidden lg:flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute h-full w-full animate-ping rounded-full bg-emerald opacity-75" />
                  <span className="h-2 w-2 rounded-full bg-emerald" />
                </span>
                <span className="text-emerald font-bold text-[11px]">ARCHIVE LINK OPERATIONAL</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                MAST API (STScI) &bull; MESH (SIMULATED)
              </div>
            </div>

            {/* Last retrieval timestamp */}
            {lastArchiveFetchTime && (
              <div className="hidden md:flex flex-col items-end border-l border-white/10 pl-4">
                <span className="text-[10px] text-muted-foreground">LAST ARCHIVE FETCH</span>
                <span className="text-foreground font-bold">{lastArchiveFetchTime} UTC</span>
              </div>
            )}

            {/* Refresh Action */}
            <button
              onClick={() => handleArchiveSearch(activeMission, targetName)}
              disabled={isArchiveLoading}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-foreground transition hover:bg-white/10 disabled:opacity-50"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${isArchiveLoading ? "animate-spin text-cyan" : ""}`} />
              <span className="hidden sm:inline">Refresh Archive</span>
            </button>
          </div>
        </div>
      </header>

      {/* BODY LAYOUT: SIDEBAR + MAIN CONTENT */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 px-4 sm:px-6 py-6 gap-6">
        {/* SIDEBAR NAVIGATION */}
        <aside
          className={`glass fixed inset-y-0 left-0 z-40 w-64 transform p-4 transition-transform duration-300 md:static md:translate-x-0 md:rounded-2xl md:p-3 border-glass-border flex flex-col justify-between ${
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="space-y-6">
            <div className="px-3 py-2 font-mono text-[10px] tracking-widest text-muted-foreground uppercase border-b border-white/10">
              MISSION MODULES
            </div>

            <nav className="space-y-1 font-mono text-xs">
              {[
                { id: "overview", label: "Overview", icon: Compass },
                { id: "network", label: "Network Map", icon: Radio },
                { id: "satellites", label: "Satellite Directory", icon: Globe },
                { id: "recovery", label: "Failure & Recovery", icon: AlertTriangle },
                { id: "exoplanet", label: "Exoplanet Detection", icon: Orbit },
                { id: "observations", label: "Observation Data", icon: Database },
                { id: "events", label: "Event History", icon: History },
                { id: "settings", label: "Settings", icon: SettingsIcon },
              ].map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id as SidebarTab);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-all ${
                      isActive
                        ? "bg-cyan/15 text-cyan border border-cyan/30 shadow-[0_0_12px_oklch(0.82_0.14_220/0.15)] font-bold"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? "text-cyan" : "text-muted-foreground"}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Status Pill */}
          <div className="rounded-xl border border-white/10 bg-void/80 p-3 font-mono text-[10px] space-y-1.5 text-muted-foreground">
            <div className="flex justify-between items-center">
              <span>TARGET:</span>
              <span className="font-bold text-cyan truncate max-w-[100px]">{targetName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>ACTIVE LINKS:</span>
              <span className="font-bold text-foreground">{activeLinksCount} / 5</span>
            </div>
            <div className="flex justify-between items-center">
              <span>ROUTE COST:</span>
              <span className={routing.isRecovered ? "text-amber-400 font-bold" : "text-cyan font-bold"}>
                {routing.totalCost ?? "∞"}
              </span>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-x-hidden min-w-0">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="flex flex-col gap-6">
              {/* Hero Status Banner & Quick Actions */}
              <div className="glass rounded-2xl border border-glass-border p-6 shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-cyan/5 blur-3xl pointer-events-none" />

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-cyan uppercase tracking-wider">
                        MISSION CONTROL OVERVIEW
                      </span>
                      <span className="rounded bg-white/10 px-2 py-0.5 font-mono text-[9px] text-muted-foreground">
                        LIVE STATE
                      </span>
                    </div>
                    <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                      Orbital Communications & Exoplanet Analysis
                    </h1>
                    <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                      Coordinated mission interface combining genuine Mikulski Archive for Space Telescopes (MAST) exoplanet observations with Dijkstra-driven satellite communication resilience.
                    </p>
                  </div>

                  {/* Top Status Badge */}
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-void/60 px-4 py-2 font-mono text-xs">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute h-full w-full animate-ping rounded-full bg-emerald opacity-75" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald" />
                    </span>
                    <div>
                      <div className="font-bold text-foreground">SYSTEM READY</div>
                      <div className="text-[10px] text-muted-foreground">Deterministic Routing</div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions Bar */}
                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4 font-mono text-xs">
                  <span className="text-muted-foreground text-[11px]">Quick Operations:</span>
                  <button
                    onClick={() => handleArchiveSearch(activeMission, targetName)}
                    disabled={isArchiveLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-cyan/40 bg-cyan/10 px-3 py-1.5 text-cyan hover:bg-cyan/20 transition"
                  >
                    <Search className="h-3.5 w-3.5" /> Fetch Observations
                  </button>
                  <button
                    onClick={() => runTransitAnalysis()}
                    disabled={!rawLightCurve || isAnalysisLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald/40 bg-emerald/10 px-3 py-1.5 text-emerald hover:bg-emerald/20 transition disabled:opacity-40"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Analyze Light Curve
                  </button>
                  <button
                    onClick={() => handleApplyScenario("fail-trunk")}
                    className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-amber-300 hover:bg-amber-500/20 transition"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Simulate Link Failure
                  </button>
                  <button
                    onClick={() => handleApplyScenario("reset")}
                    className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-foreground hover:bg-white/10 transition"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore Network
                  </button>
                  <button
                    onClick={() => handleApplyScenario("reset")}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-muted-foreground hover:text-foreground transition"
                  >
                    Reset Simulation
                  </button>
                </div>
              </div>

              {/* Status Grid Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
                {/* Simulated Nodes */}
                <div className="glass rounded-xl border border-glass-border p-4">
                  <div className="flex justify-between items-center text-muted-foreground text-[10px]">
                    <span>SIMULATED NODES</span>
                    <Globe className="h-4 w-4 text-cyan" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">
                    {nodes.length}{" "}
                    <span className="text-xs font-normal text-muted-foreground">Configured</span>
                  </div>
                  <div className="mt-1 text-[11px] text-emerald">Earth, 3 Relays, Mars Base</div>
                </div>

                {/* Active Links */}
                <div className="glass rounded-xl border border-glass-border p-4">
                  <div className="flex justify-between items-center text-muted-foreground text-[10px]">
                    <span>SIMULATED LINKS</span>
                    <Radio className="h-4 w-4 text-cyan" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-foreground">
                    {activeLinksCount}{" "}
                    <span className="text-xs font-normal text-muted-foreground">/ {links.length} Active</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {links.length - activeLinksCount} Offline / Disabled
                  </div>
                </div>

                {/* Shortest Route Cost */}
                <div className="glass rounded-xl border border-glass-border p-4">
                  <div className="flex justify-between items-center text-muted-foreground text-[10px]">
                    <span>CURRENT ROUTE COST</span>
                    <Activity className="h-4 w-4 text-cyan" />
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {routing.totalCost !== null ? (
                      <span className={routing.isRecovered ? "text-amber-400" : "text-cyan"}>
                        {routing.totalCost}{" "}
                        <span className="text-xs font-normal text-muted-foreground">Cost Units</span>
                      </span>
                    ) : (
                      <span className="text-red-400">SEVERED (∞)</span>
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground truncate">
                    {routing.status === "NO_ROUTE"
                      ? "NO ROUTE AVAILABLE"
                      : routing.path.join(" → ")}
                  </div>
                </div>

                {/* Exoplanet Archive Target */}
                <div className="glass rounded-xl border border-glass-border p-4">
                  <div className="flex justify-between items-center text-muted-foreground text-[10px]">
                    <span>ARCHIVE TARGET</span>
                    <Orbit className="h-4 w-4 text-cyan" />
                  </div>
                  <div className="mt-2 text-2xl font-bold text-cyan truncate">{targetName}</div>
                  <div className="mt-1 text-[11px] text-emerald">
                    {analysisResult ? `${analysisResult.validPointsCount} Obs Cadences` : "Loading Archive…"}
                  </div>
                </div>
              </div>

              {/* Network Resilience Map Preview */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-mono text-sm font-bold text-foreground">
                    <Radio className="h-4 w-4 text-cyan" /> SATELLITE NETWORK RESILIENCE MESH
                  </div>
                  <button
                    onClick={() => setActiveTab("network")}
                    className="flex items-center gap-1 font-mono text-xs text-cyan hover:underline"
                  >
                    Full Interactive Screen <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                <NetworkMapCanvas
                  nodes={nodes}
                  links={links}
                  routing={routing}
                  onToggleLink={handleToggleLink}
                  onApplyScenario={handleApplyScenario}
                />
              </div>

              {/* Transit Analysis Summary Card */}
              {analysisResult && (
                <div className="glass rounded-2xl border border-glass-border p-6 shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-cyan" />
                      <h2 className="font-mono text-sm font-bold text-foreground">
                        EXOPLANET TRANSIT ANALYSIS SUMMARY: {analysisResult.targetName}
                      </h2>
                    </div>
                    <button
                      onClick={() => setActiveTab("exoplanet")}
                      className="flex items-center gap-1 font-mono text-xs text-cyan hover:underline"
                    >
                      Open Full Analysis Suite <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                  <LightCurveViewer
                    analysis={analysisResult}
                    isLoading={isAnalysisLoading}
                    onUpdateOptions={(newOpts) => {
                      setAnalysisOptions((prev) => ({ ...prev, ...newOpts }));
                      runTransitAnalysis();
                    }}
                    options={analysisOptions}
                  />
                </div>
              )}

              {/* Recent Events Log Table on Overview */}
              <div className="glass rounded-2xl border border-glass-border p-6 shadow-xl font-mono text-xs">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-cyan" />
                    <h3 className="font-bold text-foreground">RECENT MISSION LOG</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab("events")}
                    className="text-cyan text-xs hover:underline flex items-center gap-1"
                  >
                    View All {events.length} Events <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground text-[10px]">
                        <th className="pb-2">TIME</th>
                        <th className="pb-2">SUBSYSTEM</th>
                        <th className="pb-2">EVENT</th>
                        <th className="pb-2">DETAILS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-foreground">
                      {events.slice(0, 5).map((evt) => (
                        <tr key={evt.id} className="hover:bg-white/5 transition">
                          <td className="py-2 text-muted-foreground">{evt.displayTime}</td>
                          <td className="py-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] uppercase ${
                                evt.category === "archive"
                                  ? "bg-cyan/15 text-cyan border border-cyan/30"
                                  : "bg-amber-400/15 text-amber-300 border border-amber-400/30"
                              }`}
                            >
                              {evt.category}
                            </span>
                          </td>
                          <td className="py-2 font-bold text-foreground">{evt.title}</td>
                          <td className="py-2 text-muted-foreground truncate max-w-md">
                            {evt.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: NETWORK MAP */}
          {activeTab === "network" && (
            <div className="flex flex-col gap-6">
              <div className="glass rounded-2xl border border-glass-border p-6">
                <div className="flex items-center justify-between mb-2">
                  <h1 className="text-xl font-bold text-foreground">Interactive Satellite Network Map</h1>
                  <span className="font-mono text-xs text-cyan border border-cyan/30 bg-cyan/10 px-2.5 py-0.5 rounded-full">
                    DIJKSTRA GRAPH TOPOLOGY
                  </span>
                </div>
                <p className="text-xs text-muted-foreground font-mono leading-relaxed">
                  Explore graph nodes (Earth Gateway, Satellites A/B/C, and Mars Station). Communication links are weighted edges. Click any link to simulate a failure and observe immediate shortest path recomputation.
                </p>
              </div>

              <NetworkMapCanvas
                nodes={nodes}
                links={links}
                routing={routing}
                onToggleLink={handleToggleLink}
                onApplyScenario={handleApplyScenario}
              />
            </div>
          )}

          {/* TAB 3: SATELLITE DIRECTORY */}
          {activeTab === "satellites" && (
            <div className="flex flex-col gap-6 font-mono text-xs">
              <div className="glass rounded-2xl border border-glass-border p-6">
                <h1 className="text-xl font-bold text-foreground mb-1">Satellite Constellation Directory</h1>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Configured orbital nodes participating in the communication mesh. Real-time topology simulation.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {nodes.map((node) => {
                  const connectedLinks = links.filter(
                    (l) => l.source === node.id || l.target === node.id
                  );
                  const activeConnected = connectedLinks.filter((l) => l.status === "active").length;

                  return (
                    <div
                      key={node.id}
                      className="glass rounded-2xl border border-glass-border p-5 flex flex-col justify-between shadow-lg"
                    >
                      <div>
                        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald" />
                            <span className="font-bold text-cyan text-sm">{node.name}</span>
                          </div>
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-foreground">
                            {node.code}
                          </span>
                        </div>

                        <div className="space-y-2 text-[11px] text-muted-foreground">
                          <div className="flex justify-between">
                            <span>ROLE / TYPE:</span>
                            <span className="text-foreground font-bold">{node.type.toUpperCase()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>ORBITAL ALTITUDE:</span>
                            <span className="text-foreground">{node.orbitalAltitude}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>FREQUENCY BAND:</span>
                            <span className="text-foreground">{node.frequencyBand}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>ACTIVE LINKS:</span>
                            <span className="text-emerald font-bold">
                              {activeConnected} / {connectedLinks.length} Active
                            </span>
                          </div>
                          <p className="mt-3 text-[10px] text-foreground/80 leading-relaxed border-t border-white/5 pt-2">
                            {node.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center text-[10px]">
                        <span className="text-muted-foreground">STATUS:</span>
                        <span className="rounded bg-emerald/20 text-emerald border border-emerald/30 px-2 py-0.5 font-bold">
                          ONLINE (Simulated)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: FAILURE & RECOVERY (TEST D, E, F, G) */}
          {activeTab === "recovery" && (
            <div className="flex flex-col gap-6 font-mono text-xs">
              <div className="glass rounded-2xl border border-glass-border p-6">
                <div className="flex items-center justify-between mb-2">
                  <h1 className="text-xl font-bold text-foreground">
                    Network Resilience & Dijkstra Recovery Workbench
                  </h1>
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-amber-300">
                    TEST SCENARIOS BENCHMARK
                  </span>
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Reproducible test execution for the required hackathon topology:
                  Earth ↔ SAT-A (2), SAT-A ↔ SAT-B (2), SAT-B ↔ Mars (2), Earth ↔ SAT-C (3), SAT-C ↔ SAT-B (3).
                </p>
              </div>

              {/* Scenario Runner Controls */}
              <div className="grid gap-4 md:grid-cols-3">
                {/* Scenario 1: Default baseline */}
                <div className="glass rounded-2xl border border-glass-border p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-cyan font-bold mb-2">
                      <CheckCircle2 className="h-4 w-4" /> TEST D: BASELINE OPTIMAL
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                      All communication links operational. Dijkstra calculates shortest path through SAT-A and SAT-B.
                    </p>
                    <div className="bg-void/60 rounded-xl p-3 space-y-1 text-[11px]">
                      <div className="text-muted-foreground">EXPECTED ROUTE:</div>
                      <div className="text-foreground font-bold">Earth → SAT-A → SAT-B → Mars Station</div>
                      <div className="text-cyan font-bold">TOTAL COST: 6</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleApplyScenario("default")}
                    className="mt-4 w-full rounded-xl bg-white/10 hover:bg-white/20 py-2 font-bold text-foreground transition"
                  >
                    Run Baseline Test
                  </button>
                </div>

                {/* Scenario 2: Fail SAT-A to SAT-B */}
                <div className="glass rounded-2xl border border-amber-500/30 bg-amber-950/10 p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-amber-400 font-bold mb-2">
                      <AlertTriangle className="h-4 w-4" /> TEST E: TRUNK FAILURE & RECOVERY
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                      Disables link SAT-A ↔ SAT-B. Algorithm automatically recalculates route through backup SAT-C.
                    </p>
                    <div className="bg-void/60 rounded-xl p-3 space-y-1 text-[11px]">
                      <div className="text-muted-foreground">EXPECTED ROUTE:</div>
                      <div className="text-foreground font-bold">Earth → SAT-C → SAT-B → Mars Station</div>
                      <div className="text-amber-400 font-bold">TOTAL COST: 8</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleApplyScenario("fail-trunk")}
                    className="mt-4 w-full rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 py-2 font-bold transition border border-amber-500/40"
                  >
                    Run Trunk Failure Test
                  </button>
                </div>

                {/* Scenario 3: No route available */}
                <div className="glass rounded-2xl border border-red-500/30 bg-red-950/10 p-5 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-red-400 font-bold mb-2">
                      <WifiOff className="h-4 w-4" /> TEST F: COMPLETE ISOLATION
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                      Disables link SAT-B ↔ Mars Station. Destination is unreachable. Application must report NO ROUTE.
                    </p>
                    <div className="bg-void/60 rounded-xl p-3 space-y-1 text-[11px]">
                      <div className="text-muted-foreground">EXPECTED STATUS:</div>
                      <div className="text-red-400 font-bold">NO ROUTE AVAILABLE</div>
                      <div className="text-muted-foreground">TOTAL COST: NULL (∞)</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleApplyScenario("no-route")}
                    className="mt-4 w-full rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 py-2 font-bold transition border border-red-500/40"
                  >
                    Run Severance Test
                  </button>
                </div>
              </div>

              {/* Current Calculated Results Table */}
              <div className="glass rounded-2xl border border-glass-border p-6">
                <h3 className="font-bold text-foreground text-sm mb-4">
                  DIJKSTRA SHORTEST-PATH EXECUTION RESULT
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[11px]">
                  <div>
                    <div className="text-muted-foreground">STATUS:</div>
                    <div
                      className={`font-bold ${
                        routing.status === "NO_ROUTE"
                          ? "text-red-400"
                          : routing.isRecovered
                          ? "text-amber-400"
                          : "text-emerald"
                      }`}
                    >
                      {routing.status}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">TOTAL COST:</div>
                    <div className="font-bold text-foreground">
                      {routing.totalCost !== null ? `${routing.totalCost} Units` : "No Valid Path"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">RECOVERY TRIGGERED:</div>
                    <div className="font-bold text-foreground">
                      {routing.isRecovered ? "YES (Failover Engaged)" : "NO (Primary Optimal)"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">EVALUATED EDGES:</div>
                    <div className="font-bold text-foreground">{routing.evaluatedEdgesCount} Edges</div>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-void/60 rounded-xl text-xs text-foreground/90 leading-relaxed border border-white/5">
                  {routing.statusMessage}
                </div>
              </div>

              {/* Step-by-step Dijkstra Trace Table */}
              <div className="glass rounded-2xl border border-glass-border p-6">
                <h3 className="font-bold text-foreground text-sm mb-4">
                  DIJKSTRA STEP-BY-STEP ALGORITHM TRACE
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground text-[10px]">
                        <th className="pb-2">STEP</th>
                        <th className="pb-2">CURRENT NODE</th>
                        <th className="pb-2">TENTATIVE DISTANCE VECTOR</th>
                        <th className="pb-2">EXPLANATION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-foreground">
                      {routing.dijkstraSteps.map((step) => (
                        <tr key={step.stepIndex} className="hover:bg-white/5 transition">
                          <td className="py-2.5 font-bold text-cyan">{step.stepIndex}</td>
                          <td className="py-2.5 font-bold">{step.currentNode}</td>
                          <td className="py-2.5 text-muted-foreground">
                            {Object.entries(step.tentativeDistances)
                              .map(([k, v]) => `${k}:${v === Infinity ? "∞" : v}`)
                              .join(" | ")}
                          </td>
                          <td className="py-2.5 text-foreground/80">{step.explanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: EXOPLANET DETECTION */}
          {activeTab === "exoplanet" && (
            <div className="flex flex-col gap-6">
              <ArchiveSearchPanel
                onSearch={handleArchiveSearch}
                onLoadObservation={handleLoadObservation}
                isLoading={isArchiveLoading}
                coordinates={coordinates}
                observations={observations}
                selectedObsId={selectedObs?.obs_id || null}
                error={archiveError}
              />

              {analysisResult && (
                <LightCurveViewer
                  analysis={analysisResult}
                  isLoading={isAnalysisLoading}
                  onUpdateOptions={(newOpts) => {
                    setAnalysisOptions((prev) => ({ ...prev, ...newOpts }));
                    runTransitAnalysis();
                  }}
                  options={analysisOptions}
                />
              )}
            </div>
          )}

          {/* TAB 6: OBSERVATION DATA TABLE */}
          {activeTab === "observations" && (
            <div className="flex flex-col gap-6 font-mono text-xs">
              <div className="glass rounded-2xl border border-glass-border p-6">
                <div className="flex items-center justify-between mb-2">
                  <h1 className="text-xl font-bold text-foreground">Observation Raw Measurements</h1>
                  {rawLightCurve && (
                    <span className="text-cyan font-bold">
                      {rawLightCurve.pointCount} Measurements Loaded
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Direct inspection of historical observation cadences retrieved from MAST. Preserves genuine time, flux, and detrended values.
                </p>
              </div>

              {rawLightCurve ? (
                <div className="glass rounded-2xl border border-glass-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <span className="font-bold text-cyan">{rawLightCurve.productFilename}</span>
                      <span className="text-muted-foreground ml-3">
                        Provenance: {rawLightCurve.provenance}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto max-h-[500px]">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-void/90 backdrop-blur-md">
                        <tr className="border-b border-white/10 text-muted-foreground text-[10px]">
                          <th className="pb-2">INDEX</th>
                          <th className="pb-2">TIME ({rawLightCurve.timeUnit})</th>
                          <th className="pb-2">OBSERVED FLUX ({rawLightCurve.fluxUnit})</th>
                          <th className="pb-2">NORMALIZED FLUX</th>
                          <th className="pb-2">STATUS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-foreground">
                        {rawLightCurve.points.slice(0, 100).map((pt: any, i: number) => {
                          const detrendedPt = analysisResult?.detrendedLightCurve[i];
                          return (
                            <tr key={i} className="hover:bg-white/5 transition">
                              <td className="py-2 text-muted-foreground">{i + 1}</td>
                              <td className="py-2">{pt.time.toFixed(5)}</td>
                              <td className="py-2">{pt.flux.toFixed(2)}</td>
                              <td className="py-2">
                                {detrendedPt ? detrendedPt.normalizedFlux.toFixed(5) : "—"}
                              </td>
                              <td className="py-2">
                                {detrendedPt?.isDip ? (
                                  <span className="rounded bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 text-[9px]">
                                    Dip Cadence
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-[10px]">Normal</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 text-[10px] text-muted-foreground">
                    Displaying first 100 of {rawLightCurve.points.length} measurements.
                  </div>
                </div>
              ) : (
                <div className="glass rounded-2xl border border-glass-border p-12 text-center text-muted-foreground">
                  No observation file loaded. Query a target in Exoplanet Detection tab first.
                </div>
              )}
            </div>
          )}

          {/* TAB 7: EVENT HISTORY */}
          {activeTab === "events" && (
            <div className="flex flex-col gap-6 font-mono text-xs">
              <div className="glass rounded-2xl border border-glass-border p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-xl font-bold text-foreground">Mission Operations Event Log</h1>
                  <p className="text-muted-foreground text-xs mt-1">
                    Synchronized timestamped audit log of archive interactions and simulation events.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Category Filter */}
                  <div className="flex rounded-xl border border-white/10 bg-void/60 p-1">
                    {(["all", "archive", "simulation", "system"] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setEventCategoryFilter(cat)}
                        className={`rounded-lg px-3 py-1 text-[11px] font-bold uppercase transition ${
                          eventCategoryFilter === cat
                            ? "bg-cyan text-void"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Clear button */}
                  <button
                    onClick={() => {
                      setEvents([]);
                      toast("Event log cleared");
                    }}
                    className="flex items-center gap-1 text-muted-foreground hover:text-red-400 p-2"
                    title="Clear Event Log"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="glass rounded-2xl border border-glass-border p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-white/10 text-muted-foreground text-[10px]">
                        <th className="pb-2">TIMESTAMP</th>
                        <th className="pb-2">CATEGORY</th>
                        <th className="pb-2">SEVERITY</th>
                        <th className="pb-2">EVENT TITLE</th>
                        <th className="pb-2">DESCRIPTION</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-foreground">
                      {filteredEvents.map((evt) => (
                        <tr key={evt.id} className="hover:bg-white/5 transition">
                          <td className="py-2.5 text-muted-foreground">{evt.displayTime}</td>
                          <td className="py-2.5 uppercase font-bold text-cyan">{evt.category}</td>
                          <td className="py-2.5">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] uppercase font-bold ${
                                evt.severity === "error"
                                  ? "bg-red-500/20 text-red-400"
                                  : evt.severity === "warning"
                                  ? "bg-amber-500/20 text-amber-300"
                                  : evt.severity === "success"
                                  ? "bg-emerald/20 text-emerald"
                                  : "bg-white/10 text-muted-foreground"
                              }`}
                            >
                              {evt.severity}
                            </span>
                          </td>
                          <td className="py-2.5 font-bold text-foreground">{evt.title}</td>
                          <td className="py-2.5 text-foreground/80 leading-relaxed max-w-xl">
                            {evt.message}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: SETTINGS */}
          {activeTab === "settings" && (
            <div className="flex flex-col gap-6 font-mono text-xs">
              <div className="glass rounded-2xl border border-glass-border p-6">
                <h1 className="text-xl font-bold text-foreground mb-1">Mission Control Settings</h1>
                <p className="text-muted-foreground text-xs">
                  Configuration for NASA MAST archive services and Dijkstra routing parameters.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="glass rounded-2xl border border-glass-border p-6 space-y-4">
                  <h3 className="font-bold text-cyan text-sm border-b border-white/10 pb-2">
                    NASA ARCHIVE ENDPOINT CONFIGURATION
                  </h3>
                  <div className="space-y-2">
                    <label className="block text-muted-foreground text-[10px]">
                      PRIMARY MASHUP ENDPOINT
                    </label>
                    <input
                      type="text"
                      disabled
                      value="https://mast.stsci.edu/api/v0/invoke"
                      className="w-full rounded-xl border border-white/10 bg-void/60 px-3 py-2 text-foreground font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-muted-foreground text-[10px]">
                      DATA PRODUCT DOWNLOAD SERVICE
                    </label>
                    <input
                      type="text"
                      disabled
                      value="https://mast.stsci.edu/api/v0.1/Download/file"
                      className="w-full rounded-xl border border-white/10 bg-void/60 px-3 py-2 text-foreground font-mono text-xs"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-muted-foreground text-[10px]">
                      NAME RESOLVER AUTHORITY
                    </label>
                    <input
                      type="text"
                      disabled
                      value="SIMBAD / NED Astronomical Databases"
                      className="w-full rounded-xl border border-white/10 bg-void/60 px-3 py-2 text-foreground font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="glass rounded-2xl border border-glass-border p-6 space-y-4">
                  <h3 className="font-bold text-cyan text-sm border-b border-white/10 pb-2">
                    ROUTING & RESILIENCE PREFERENCES
                  </h3>
                  <div className="space-y-2">
                    <label className="block text-muted-foreground text-[10px]">
                      ALGORITHM IMPLEMENTATION
                    </label>
                    <div className="rounded-xl border border-white/10 bg-void/60 px-3 py-2 text-emerald font-bold">
                      Dijkstra Shortest Path (Priority Queue Graph Traversal)
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-muted-foreground text-[10px]">
                      GRAPH TOPOLOGY MODEL
                    </label>
                    <div className="rounded-xl border border-white/10 bg-void/60 px-3 py-2 text-foreground">
                      Deterministic 5-Node Space/Ground Mesh (Earth, 3 Relays, Mars)
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-muted-foreground text-[10px]">
                      FAILOVER TRIGGER MODE
                    </label>
                    <div className="rounded-xl border border-white/10 bg-void/60 px-3 py-2 text-foreground">
                      Automatic Recomputation on Link State Toggle
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* FOOTER TICKER */}
      <footer className="glass border-t border-glass-border py-2 px-6 font-mono text-[10px] tracking-widest text-cyan/70 flex flex-wrap items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-2 w-2 rounded-full bg-emerald" />
          <span>ORBITAL RESCUE // MISSION READY</span>
          <span>&bull;</span>
          <span>MAST CAOM v2.0 LINK ACTIVE</span>
        </div>
        <div className="text-muted-foreground">
          GENUINE ASTRONOMICAL OBSERVATIONS + DETERMINISTIC GRAPH RESILIENCE SIMULATION
        </div>
      </footer>
    </div>
  );
}
