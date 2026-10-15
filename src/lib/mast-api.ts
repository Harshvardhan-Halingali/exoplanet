import type {
  CelestialCoordinates,
  MastObservation,
  MastProduct,
  LightCurveData,
} from "../server/mast-service";

export type { CelestialCoordinates, MastObservation, MastProduct, LightCurveData };

export async function searchArchive(
  mission: "Kepler" | "TESS",
  target: string,
  signal?: AbortSignal
): Promise<{ coordinates: CelestialCoordinates; observations: MastObservation[] }> {
  const res = await fetch("/api/mast/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mission, target }),
    signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Archive search failed with HTTP ${res.status}`);
  }

  return {
    coordinates: data.coordinates,
    observations: data.observations || [],
  };
}

export async function fetchObservationProducts(
  obsid: number | string,
  signal?: AbortSignal
): Promise<MastProduct[]> {
  const res = await fetch(`/api/mast/products?obsid=${encodeURIComponent(obsid)}`, {
    signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to retrieve observation products (HTTP ${res.status})`);
  }

  return data.products || [];
}

export async function fetchLightCurve(
  dataURI: string,
  signal?: AbortSignal
): Promise<LightCurveData> {
  const res = await fetch(`/api/mast/lightcurve?dataURI=${encodeURIComponent(dataURI)}`, {
    signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Failed to load light curve data (HTTP ${res.status})`);
  }

  return data.data;
}
