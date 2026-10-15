/**
 * Satellite Network Resilience Simulation Engine
 * Implements graph data structures and genuine Dijkstra's shortest-path algorithm.
 * All metrics and paths are calculated deterministically from graph state.
 */

export interface NetworkNode {
  id: string;
  name: string;
  code: string;
  type: "source" | "relay" | "destination";
  x: number; // Percentage coordinate (0-100) for network map
  y: number; // Percentage coordinate (0-100)
  status: "online" | "degraded" | "offline";
  orbitalAltitude: string;
  frequencyBand: string;
  description: string;
}

export interface NetworkLink {
  id: string;
  source: string;
  target: string;
  cost: number; // Routing weight / illustrative latency
  status: "active" | "failed" | "degraded";
  label: string;
  failureReason?: string | undefined;
}

export interface DijkstraStep {
  stepIndex: number;
  currentNode: string;
  tentativeDistances: Record<string, number>;
  unvisitedNodes: string[];
  explanation: string;
}

export interface RoutingResult {
  source: string;
  destination: string;
  path: string[]; // Ordered list of node IDs
  linkIds: string[]; // Ordered list of link IDs traversed
  totalCost: number | null;
  status: "OPTIMAL" | "RE-ROUTED" | "NO_ROUTE";
  statusMessage: string;
  dijkstraSteps: DijkstraStep[];
  visitedNodesCount: number;
  evaluatedEdgesCount: number;
  isRecovered: boolean;
  computedAt: string;
}

/**
 * Creates the required reproducible hackathon topology:
 * Earth — SAT-A: cost 2
 * SAT-A — SAT-B: cost 2
 * SAT-B — Mars Station: cost 2
 * Earth — SAT-C: cost 3
 * SAT-C — SAT-B: cost 3
 */
export function getInitialNodes(): NetworkNode[] {
  return [
    {
      id: "Earth",
      name: "Earth Gateway Ground Terminal",
      code: "EARTH-GW",
      type: "source",
      x: 12,
      y: 50,
      status: "online",
      orbitalAltitude: "Surface (Ground Station)",
      frequencyBand: "Optical / X-Band",
      description: "Primary terrestrial uplink station transmitting telemetry and orbital dispatch commands.",
    },
    {
      id: "SAT-A",
      name: "Orbital Relay Alpha",
      code: "SAT-A",
      type: "relay",
      x: 38,
      y: 25,
      status: "online",
      orbitalAltitude: "LEO 780 km",
      frequencyBand: "Ka-Band Inter-Satellite Link",
      description: "High-throughput low-latency primary routing satellite.",
    },
    {
      id: "SAT-B",
      name: "Deep Space Relay Beta",
      code: "SAT-B",
      type: "relay",
      x: 65,
      y: 50,
      status: "online",
      orbitalAltitude: "HEO 35,786 km",
      frequencyBand: "Laser Inter-Orbital Crosslink",
      description: "High-power interplanetary forwarder connecting inner relays to Mars station.",
    },
    {
      id: "SAT-C",
      name: "High-Altitude Relay Gamma",
      code: "SAT-C",
      type: "relay",
      x: 38,
      y: 75,
      status: "online",
      orbitalAltitude: "MEO 20,200 km",
      frequencyBand: "Ku-Band Resilient Crosslink",
      description: "Secondary redundant constellation node for failover rerouting.",
    },
    {
      id: "Mars Station",
      name: "Mars Station Outpost",
      code: "MARS-STN",
      type: "destination",
      x: 88,
      y: 50,
      status: "online",
      orbitalAltitude: "Areostationary Surface Base",
      frequencyBand: "Deep Space Optical Comm (DSOC)",
      description: "Destination research laboratory and automated exploration hub on Mars.",
    },
  ];
}

export function getInitialLinks(): NetworkLink[] {
  return [
    {
      id: "link-earth-sata",
      source: "Earth",
      target: "SAT-A",
      cost: 2,
      status: "active",
      label: "Earth ↔ SAT-A (Cost: 2)",
    },
    {
      id: "link-sata-satb",
      source: "SAT-A",
      target: "SAT-B",
      cost: 2,
      status: "active",
      label: "SAT-A ↔ SAT-B (Cost: 2)",
    },
    {
      id: "link-satb-mars",
      source: "SAT-B",
      target: "Mars Station",
      cost: 2,
      status: "active",
      label: "SAT-B ↔ Mars Station (Cost: 2)",
    },
    {
      id: "link-earth-satc",
      source: "Earth",
      target: "SAT-C",
      cost: 3,
      status: "active",
      label: "Earth ↔ SAT-C (Cost: 3)",
    },
    {
      id: "link-satc-satb",
      source: "SAT-C",
      target: "SAT-B",
      cost: 3,
      status: "active",
      label: "SAT-C ↔ SAT-B (Cost: 3)",
    },
  ];
}

/**
 * Custom Dijkstra's Shortest Path Algorithm
 * Calculates true shortest paths through active, non-failed links.
 */
export function calculateDijkstraRoute(
  nodes: NetworkNode[],
  links: NetworkLink[],
  sourceId = "Earth",
  destinationId = "Mars Station"
): RoutingResult {
  const steps: DijkstraStep[] = [];
  const distances: Record<string, number> = {};
  const previous: Record<string, { node: string; linkId: string } | null> = {};
  const unvisited = new Set<string>();

  // Build adjacency graph for bidirectional communication links
  const adjacency: Record<string, { neighbor: string; cost: number; linkId: string }[]> = {};

  for (const node of nodes) {
    distances[node.id] = Infinity;
    previous[node.id] = null;
    unvisited.add(node.id);
    adjacency[node.id] = [];
  }

  // Only consider active links
  for (const link of links) {
    if (link.status === "active") {
      adjacency[link.source]?.push({ neighbor: link.target, cost: link.cost, linkId: link.id });
      adjacency[link.target]?.push({ neighbor: link.source, cost: link.cost, linkId: link.id });
    }
  }

  distances[sourceId] = 0;

  let stepCount = 0;
  let evaluatedEdgesCount = 0;

  while (unvisited.size > 0) {
    // Find unvisited node with minimum distance
    let currentNode: string | null = null;
    let minDistance = Infinity;

    for (const nodeId of unvisited) {
      const dist = distances[nodeId] ?? Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        currentNode = nodeId;
      }
    }

    // If remaining unvisited nodes are unreachable, stop
    if (!currentNode || minDistance === Infinity) {
      break;
    }

    unvisited.delete(currentNode);

    const currentDist = distances[currentNode] ?? Infinity;

    stepCount++;
    steps.push({
      stepIndex: stepCount,
      currentNode,
      tentativeDistances: { ...distances },
      unvisitedNodes: Array.from(unvisited),
      explanation: `Inspecting node "${currentNode}" with tentative distance ${currentDist}.`,
    });

    // Destination reached
    if (currentNode === destinationId) {
      break;
    }

    // Inspect neighbors
    const neighbors = adjacency[currentNode] || [];
    for (const edge of neighbors) {
      if (unvisited.has(edge.neighbor)) {
        evaluatedEdgesCount++;
        const alt = currentDist + edge.cost;
        const targetDist = distances[edge.neighbor] ?? Infinity;
        if (alt < targetDist) {
          distances[edge.neighbor] = alt;
          previous[edge.neighbor] = { node: currentNode, linkId: edge.linkId };
        }
      }
    }
  }

  // Reconstruct path
  const destinationDist = distances[destinationId] ?? Infinity;
  if (destinationDist === Infinity) {
    return {
      source: sourceId,
      destination: destinationId,
      path: [],
      linkIds: [],
      totalCost: null,
      status: "NO_ROUTE",
      statusMessage: "NO ROUTE AVAILABLE: All communication paths to the destination are severed.",
      dijkstraSteps: steps,
      visitedNodesCount: nodes.length - unvisited.size,
      evaluatedEdgesCount,
      isRecovered: false,
      computedAt: new Date().toISOString(),
    };
  }

  const path: string[] = [];
  const linkIds: string[] = [];
  let curr: string | null = destinationId;

  while (curr !== null && curr !== undefined) {
    path.unshift(curr);
    const prev: { node: string; linkId: string } | null | undefined = previous[curr];
    if (prev) {
      linkIds.unshift(prev.linkId);
      curr = prev.node;
    } else {
      break;
    }
  }

  // Determine if this is baseline or an alternative rerouted path
  const isBaseline = path.join(" → ") === "Earth → SAT-A → SAT-B → Mars Station";
  const isRerouted = path.includes("SAT-C");

  return {
    source: sourceId,
    destination: destinationId,
    path,
    linkIds,
    totalCost: distances[destinationId] ?? null,
    status: isBaseline ? "OPTIMAL" : isRerouted ? "RE-ROUTED" : "OPTIMAL",
    statusMessage: isBaseline
      ? "Optimal primary relay active (Cost: 6)."
      : `Communication recovered: Rerouted via backup node SAT-C (Total Cost: ${distances[destinationId] ?? destinationDist}).`,
    dijkstraSteps: steps,
    visitedNodesCount: nodes.length - unvisited.size,
    evaluatedEdgesCount,
    isRecovered: isRerouted,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Toggles a link's operational status
 */
export function toggleLinkState(
  links: NetworkLink[],
  linkId: string,
  targetStatus?: "active" | "failed"
): NetworkLink[] {
  return links.map((link) => {
    if (link.id === linkId) {
      const nextStatus = targetStatus !== undefined ? targetStatus : link.status === "active" ? "failed" : "active";
      return {
        ...link,
        status: nextStatus,
        failureReason: nextStatus === "failed" ? "Simulated inter-satellite laser link outage" : undefined,
      };
    }
    return link;
  });
}
