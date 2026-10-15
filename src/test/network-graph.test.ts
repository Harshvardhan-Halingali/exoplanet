import { describe, expect, it } from "vitest";
import {
  getInitialNodes,
  getInitialLinks,
  calculateDijkstraRoute,
  toggleLinkState,
} from "../lib/network-graph";

describe("Network Resilience & Dijkstra Shortest Path", () => {
  it("TEST D: Calculates baseline route through SAT-A and SAT-B with total cost 6", () => {
    const nodes = getInitialNodes();
    const links = getInitialLinks();

    const result = calculateDijkstraRoute(nodes, links, "Earth", "Mars Station");

    expect(result.status).toBe("OPTIMAL");
    expect(result.path).toEqual(["Earth", "SAT-A", "SAT-B", "Mars Station"]);
    expect(result.totalCost).toBe(6);
    expect(result.isRecovered).toBe(false);
  });

  it("TEST E: Disabling SAT-A - SAT-B recalculates route through SAT-C and SAT-B with total cost 8", () => {
    const nodes = getInitialNodes();
    let links = getInitialLinks();

    // Disable link between SAT-A and SAT-B
    links = toggleLinkState(links, "link-sata-satb", "failed");

    const result = calculateDijkstraRoute(nodes, links, "Earth", "Mars Station");

    expect(result.status).toBe("RE-ROUTED");
    expect(result.path).toEqual(["Earth", "SAT-C", "SAT-B", "Mars Station"]);
    expect(result.totalCost).toBe(8);
    expect(result.isRecovered).toBe(true);
    expect(result.statusMessage).toContain("Communication recovered");
  });

  it("TEST F: Disabling the only link connecting the destination reports NO ROUTE AVAILABLE", () => {
    const nodes = getInitialNodes();
    let links = getInitialLinks();

    // Disable destination link
    links = toggleLinkState(links, "link-satb-mars", "failed");

    const result = calculateDijkstraRoute(nodes, links, "Earth", "Mars Station");

    expect(result.status).toBe("NO_ROUTE");
    expect(result.path).toEqual([]);
    expect(result.totalCost).toBeNull();
    expect(result.isRecovered).toBe(false);
    expect(result.statusMessage).toContain("NO ROUTE AVAILABLE");
  });

  it("TEST G: Reset restores initial graph topology and optimal cost 6", () => {
    const nodes = getInitialNodes();
    let links = getInitialLinks();

    // Sever trunk
    links = toggleLinkState(links, "link-sata-satb", "failed");
    let result = calculateDijkstraRoute(nodes, links, "Earth", "Mars Station");
    expect(result.totalCost).toBe(8);

    // Reset
    links = getInitialLinks();
    result = calculateDijkstraRoute(nodes, links, "Earth", "Mars Station");
    expect(result.status).toBe("OPTIMAL");
    expect(result.path).toEqual(["Earth", "SAT-A", "SAT-B", "Mars Station"]);
    expect(result.totalCost).toBe(6);
  });
});
