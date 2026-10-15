export type EventCategory = "archive" | "simulation" | "system";
export type EventSeverity = "info" | "success" | "warning" | "error";

export interface LoggedEvent {
  id: string;
  timestamp: string; // ISO string
  displayTime: string; // HH:mm:ss
  category: EventCategory;
  severity: EventSeverity;
  title: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}

export function createEvent(
  category: EventCategory,
  severity: EventSeverity,
  title: string,
  message: string,
  details?: Record<string, unknown>
): LoggedEvent {
  const now = new Date();
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    timestamp: now.toISOString(),
    displayTime: now.toTimeString().split(" ")[0] ?? "",
    category,
    severity,
    title,
    message,
    details,
  };
}

export const INITIAL_EVENTS: LoggedEvent[] = [
  createEvent(
    "system",
    "info",
    "Mission Control Initialized",
    "ORBITAL RESCUE interface online. NASA MAST public CAOM v2 archive client connected. Dijkstra mesh simulation loaded."
  ),
  createEvent(
    "simulation",
    "success",
    "Mesh Topology Online",
    "Deterministic 5-node space-ground network initialized. Primary shortest path verified (Cost: 6)."
  ),
];
