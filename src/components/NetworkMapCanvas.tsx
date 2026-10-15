import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Radio,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Activity,
  Layers,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type { NetworkNode, NetworkLink, RoutingResult } from "../lib/network-graph";

interface NetworkMapCanvasProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  routing: RoutingResult;
  onToggleLink: (linkId: string) => void;
  onApplyScenario: (scenario: "default" | "fail-trunk" | "no-route" | "reset") => void;
}

export const NetworkMapCanvas: React.FC<NetworkMapCanvasProps> = ({
  nodes,
  links,
  routing,
  onToggleLink,
  onApplyScenario,
}) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredLinkId, setHoveredLinkId] = useState<string | null>(null);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Helper to get node position by ID
  const getNode = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div className="flex flex-col gap-4">
      {/* Top Banner with Route Status */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 backdrop-blur-md transition-all ${
          routing.status === "NO_ROUTE"
            ? "border-red-500/50 bg-red-950/30 text-red-200"
            : routing.isRecovered
            ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
            : "border-cyan/40 bg-cyan/5 text-cyan-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg ${
              routing.status === "NO_ROUTE"
                ? "bg-red-500/20 text-red-400"
                : routing.isRecovered
                ? "bg-amber-500/20 text-amber-300"
                : "bg-cyan/20 text-cyan"
            }`}
          >
            {routing.status === "NO_ROUTE" ? (
              <WifiOff className="h-5 w-5 animate-pulse" />
            ) : routing.isRecovered ? (
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider">
                {routing.status === "NO_ROUTE"
                  ? "CRITICAL LINK SEVERANCE"
                  : routing.isRecovered
                  ? "COMMUNICATION RECOVERED VIA FAILOVER"
                  : "PRIMARY ROUTE ACTIVE"}
              </span>
              <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[10px] text-muted-foreground border border-white/10">
                [SIMULATED MESH]
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs">
              <span className="text-muted-foreground">Current Path:</span>
              {routing.path.length > 0 ? (
                routing.path.map((node, i) => (
                  <React.Fragment key={node}>
                    <span className="font-bold text-foreground">{node}</span>
                    {i < routing.path.length - 1 && (
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </React.Fragment>
                ))
              ) : (
                <span className="font-bold text-red-400">NO ROUTE AVAILABLE</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right">
            <div className="font-mono text-[10px] text-muted-foreground">TOTAL ROUTE COST</div>
            <div className="font-mono text-xl font-bold">
              {routing.totalCost !== null ? (
                <span className={routing.isRecovered ? "text-amber-400" : "text-cyan"}>
                  {routing.totalCost}{" "}
                  <span className="text-xs font-normal text-muted-foreground">ms equiv</span>
                </span>
              ) : (
                <span className="text-red-400">∞</span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onApplyScenario("fail-trunk")}
              title="Test SAT-A to SAT-B failure and Dijkstra rerouting"
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-xs text-amber-300 transition hover:bg-amber-500/20"
            >
              Fail Trunk
            </button>
            <button
              onClick={() => onApplyScenario("no-route")}
              title="Test disconnecting Mars Station to verify No Route behavior"
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 font-mono text-xs text-red-300 transition hover:bg-red-500/20"
            >
              Sever Dest
            </button>
            <button
              onClick={() => onApplyScenario("reset")}
              title="Restore all links to optimal state"
              className="flex items-center gap-1 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 font-mono text-xs text-foreground transition hover:bg-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-glass-border bg-void/80 p-6 shadow-2xl backdrop-blur-xl">
        {/* Subtle coordinate grid lines */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-20">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" className="text-cyan/40" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Constellation lines and links SVG layer */}
        <svg className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="activeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--cyan)" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <linearGradient id="recoveredGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--amber)" />
              <stop offset="100%" stopColor="var(--emerald)" />
            </linearGradient>
          </defs>

          {/* Render all Links */}
          {links.map((link) => {
            const src = getNode(link.source);
            const tgt = getNode(link.target);
            if (!src || !tgt) return null;

            const isTraversed = routing.linkIds.includes(link.id);
            const isFailed = link.status === "failed";
            const isHovered = hoveredLinkId === link.id;

            // Coordinates
            const x1 = `${src.x}%`;
            const y1 = `${src.y}%`;
            const x2 = `${tgt.x}%`;
            const y2 = `${tgt.y}%`;

            return (
              <g
                key={link.id}
                className="cursor-pointer transition-all duration-300"
                onClick={() => onToggleLink(link.id)}
                onMouseEnter={() => setHoveredLinkId(link.id)}
                onMouseLeave={() => setHoveredLinkId(null)}
              >
                {/* Invisible wide stroke for easier hovering and clicking */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="transparent"
                  strokeWidth={24}
                />

                {/* Visible link line */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={
                    isFailed
                      ? "#ef4444"
                      : isTraversed
                      ? routing.isRecovered
                        ? "var(--amber)"
                        : "var(--cyan)"
                      : "rgba(255,255,255,0.18)"
                  }
                  strokeWidth={isTraversed ? 3.5 : isHovered ? 2.5 : 1.5}
                  strokeDasharray={isFailed ? "6 6" : isTraversed ? "none" : "3 3"}
                  className="transition-all duration-300"
                />

                {/* Pulse animation along traversed links */}
                {isTraversed && !isFailed && (
                  <circle r={4} fill={routing.isRecovered ? "var(--amber)" : "var(--cyan)"}>
                    <animateMotion
                      path={`M ${(src.x / 100) * 1000} ${(src.y / 100) * 480} L ${
                        (tgt.x / 100) * 1000
                      } ${(tgt.y / 100) * 480}`}
                      dur="2.4s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* Link Cost Badges in Center of Links */}
        {links.map((link) => {
          const src = getNode(link.source);
          const tgt = getNode(link.target);
          if (!src || !tgt) return null;

          const isTraversed = routing.linkIds.includes(link.id);
          const isFailed = link.status === "failed";
          const midX = (src.x + tgt.x) / 2;
          const midY = (src.y + tgt.y) / 2;

          return (
            <div
              key={`badge-${link.id}`}
              onClick={() => onToggleLink(link.id)}
              className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer select-none rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold shadow-lg transition-all hover:scale-110 ${
                isFailed
                  ? "border border-red-500/60 bg-red-950/90 text-red-400 shadow-red-500/20"
                  : isTraversed
                  ? routing.isRecovered
                    ? "border border-amber-400 bg-amber-950/90 text-amber-300 shadow-amber-500/30 ring-2 ring-amber-400/30"
                    : "border border-cyan bg-cyan/20 text-cyan shadow-cyan/30 ring-2 ring-cyan/30"
                  : "border border-white/20 bg-background/80 text-muted-foreground hover:border-white/50"
              }`}
              style={{ left: `${midX}%`, top: `${midY}%` }}
              title={`Click to ${isFailed ? "restore" : "fail"} this link`}
            >
              {isFailed ? "FAILED (Offline)" : `Cost: ${link.cost}`}
            </div>
          );
        })}

        {/* Node Elements */}
        {nodes.map((node) => {
          const isSource = node.type === "source";
          const isDest = node.type === "destination";
          const isInPath = routing.path.includes(node.id);
          const isSelected = selectedNodeId === node.id;

          return (
            <div
              key={node.id}
              onClick={() => setSelectedNodeId(node.id === selectedNodeId ? null : node.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              {/* Outer Glow Halo for In-Path Nodes */}
              {isInPath && (
                <div
                  className={`absolute -inset-4 animate-pulse rounded-full opacity-40 blur-md ${
                    routing.isRecovered ? "bg-amber-500" : "bg-cyan"
                  }`}
                />
              )}

              {/* Node Core Badge */}
              <div
                className={`relative flex flex-col items-center rounded-2xl border p-3 shadow-xl backdrop-blur-md transition-all hover:scale-105 ${
                  isSelected
                    ? "border-cyan bg-cyan/20 ring-4 ring-cyan/30"
                    : isInPath
                    ? routing.isRecovered
                      ? "border-amber-400/80 bg-amber-950/60"
                      : "border-cyan/80 bg-cyan/15"
                    : "border-white/15 bg-background/80 hover:border-white/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                      isSource
                        ? "bg-blue-500/20 text-blue-400"
                        : isDest
                        ? "bg-red-500/20 text-red-400"
                        : isInPath
                        ? "bg-cyan/20 text-cyan"
                        : "bg-white/10 text-muted-foreground"
                    }`}
                  >
                    {isSource ? (
                      <Globe className="h-4 w-4" />
                    ) : isDest ? (
                      <Radio className="h-4 w-4" />
                    ) : (
                      <Activity className="h-4 w-4" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="font-mono text-xs font-bold leading-none text-foreground">
                      {node.id}
                    </div>
                    <div className="font-mono text-[9px] text-muted-foreground">
                      {node.type.toUpperCase()}
                    </div>
                  </div>
                </div>

                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      node.status === "online" ? "bg-emerald" : "bg-red-500"
                    }`}
                  />
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {node.orbitalAltitude.split(" ")[0]}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Selected Node Inspector Drawer (Bottom Left) */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="glass absolute bottom-4 left-4 z-20 max-w-sm rounded-xl p-4 font-mono text-xs shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-bold text-cyan">{selectedNode.name}</span>
                <button
                  onClick={() => setSelectedNodeId(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>ORBIT:</span>
                  <span className="text-foreground">{selectedNode.orbitalAltitude}</span>
                </div>
                <div className="flex justify-between">
                  <span>FREQUENCY:</span>
                  <span className="text-foreground">{selectedNode.frequencyBand}</span>
                </div>
                <div className="flex justify-between">
                  <span>STATUS:</span>
                  <span className="text-emerald">OPERATIONAL (Simulated)</span>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-foreground/80">
                  {selectedNode.description}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Map Legend (Bottom Right) */}
        <div className="glass pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col gap-1.5 rounded-xl p-3 font-mono text-[10px] text-muted-foreground shadow-lg">
          <div className="font-bold uppercase tracking-wider text-foreground/80">
            SIMULATION LEGEND
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-cyan shadow-[0_0_8px_var(--cyan)]" />
            <span>Active Primary Route (Dijkstra Optimal)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
            <span>Recovered Alternative Route (Failover)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-4 border-b-2 border-dashed border-red-500" />
            <span>Disabled / Severed Communication Link</span>
          </div>
          <div className="mt-1 text-[9px] text-cyan/70">
            Tip: Click any link directly to inject a simulated failure.
          </div>
        </div>
      </div>
    </div>
  );
};
