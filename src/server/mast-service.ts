/**
 * NASA MAST Archive Service
 * Provides genuine astronomical data retrieval from STScI Mikulski Archive for Space Telescopes.
 *
 * Endpoints utilized:
 * - https://mast.stsci.edu/api/v0/invoke (Mashup API for Name.Lookup, Caom.Cone, Caom.Products)
 * - https://mast.stsci.edu/api/v0.1/Download/file (Direct authenticated/public product download)
 */

export interface CelestialCoordinates {
  ra: number;
  dec: number;
  canonicalName: string;
  objectType?: string;
  resolver?: string;
}

export interface MastObservation {
  obsid: number;
  obs_id: string;
  obs_collection: string;
  target_name: string;
  instrument_name: string;
  dataproduct_type: string;
  t_min: number;
  t_max: number;
  t_exptime: number;
  proposal_id?: string;
  distance?: number;
}

export interface MastProduct {
  obsid: number;
  productFilename: string;
  productSubGroupDescription: string;
  description: string;
  dataURI: string;
  size: number;
  type: string;
}

export interface LightCurvePoint {
  time: number; // In BJD - 2454833 (Kepler) or BTJD (TESS)
  flux: number; // In electrons/s
  fluxErr?: number;
}

export interface LightCurveData {
  targetName: string;
  mission: string;
  obsId: string;
  productFilename: string;
  telescope: string;
  timeUnit: string;
  fluxUnit: string;
  timeMin: number;
  timeMax: number;
  pointCount: number;
  points: LightCurvePoint[];
  provenance: string;
}

/**
 * Executes a POST request to MAST Mashup API with form-encoded payload
 */
async function invokeMast(payload: Record<string, unknown>): Promise<any> {
  const url = "https://mast.stsci.edu/api/v0/invoke";
  const body = new URLSearchParams({
    request: JSON.stringify(payload),
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "OrbitalRescue/1.0 (Space-Operations Dashboard)",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`MAST API HTTP error ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    // Some MAST services (e.g. Name.Lookup) return XML
    return raw;
  }
}

/**
 * Resolves a target name to RA/Dec coordinates via MAST Name Resolver (SIMBAD/NED).
 */
export async function resolveTargetName(targetName: string): Promise<CelestialCoordinates> {
  const cleaned = targetName.trim();
  if (!cleaned) {
    throw new Error("Target name cannot be empty.");
  }

  // Pre-cataloged coordinates for famous benchmark exoplanet systems as fallback if SIMBAD query is slow
  const KNOWN_BENCHMARKS: Record<string, CelestialCoordinates> = {
    "kepler-10": { ra: 285.6794225, dec: 50.241306, canonicalName: "Kepler-10", objectType: "Exoplanet Host Star" },
    "kepler-8": { ra: 282.836083, dec: 42.450806, canonicalName: "Kepler-8", objectType: "Exoplanet Host Star" },
    "kepler-22": { ra: 290.220542, dec: 47.882472, canonicalName: "Kepler-22", objectType: "Exoplanet Host Star" },
    "trappist-1": { ra: 346.622375, dec: -5.041389, canonicalName: "TRAPPIST-1", objectType: "M-dwarf Planetary System" },
    "toi-700": { ra: 97.098875, dec: -65.679667, canonicalName: "TOI-700", objectType: "M-dwarf Planetary System" },
  };

  const benchmarkKey = cleaned.toLowerCase();

  try {
    const res = await invokeMast({
      service: "Mast.Name.Lookup",
      format: "json",
      params: { input: cleaned },
    });

    if (typeof res === "string" && res.includes("<resolvedCoordinate>")) {
      const raMatch = /<ra>([\d.-]+)<\/ra>/.exec(res);
      const decMatch = /<dec>([\d.-]+)<\/dec>/.exec(res);
      const nameMatch = /<canonicalName>([^<]+)<\/canonicalName>/.exec(res);
      const typeMatch = /<objectType>([^<]+)<\/objectType>/.exec(res);
      const resolverMatch = /<resolver>([^<]+)<\/resolver>/.exec(res);

      const raStr = raMatch?.[1];
      const decStr = decMatch?.[1];

      if (raStr && decStr) {
        return {
          ra: parseFloat(raStr),
          dec: parseFloat(decStr),
          canonicalName: nameMatch?.[1] || cleaned,
          objectType: typeMatch?.[1] || "Astronomical Target",
          resolver: resolverMatch?.[1] || "SIMBAD",
        };
      }
    } else if (res && typeof res === "object" && res.data && res.data.length > 0) {
      const row = res.data[0];
      return {
        ra: row.ra,
        dec: row.dec,
        canonicalName: row.canonicalName || cleaned,
        objectType: row.objectType,
        resolver: row.resolver,
      };
    }
  } catch (err: any) {
    if (KNOWN_BENCHMARKS[benchmarkKey]) {
      return KNOWN_BENCHMARKS[benchmarkKey];
    }
    throw new Error(`Target lookup failed for "${cleaned}": ${err.message}`);
  }

  // If resolver returned error status in XML or no coordinates
  if (KNOWN_BENCHMARKS[benchmarkKey]) {
    return KNOWN_BENCHMARKS[benchmarkKey];
  }

  throw new Error(`Target "${cleaned}" could not be resolved in the MAST archive database (SIMBAD lookup returned no matching coordinates).`);
}

/**
 * Searches MAST for genuine Kepler or TESS observations for a given target.
 */
export async function searchTargetObservations(
  mission: "Kepler" | "TESS",
  targetName: string,
): Promise<{ coordinates: CelestialCoordinates; observations: MastObservation[] }> {
  // 1. Resolve coordinates
  const coords = await resolveTargetName(targetName);

  // 2. Query CAOM Cone Search
  const coneRes = await invokeMast({
    service: "Mast.Caom.Cone",
    format: "json",
    params: {
      ra: coords.ra,
      dec: coords.dec,
      radius: 0.015, // degrees (~54 arcseconds cone)
    },
  });

  const allObservations: any[] = coneRes.data || [];

  // 3. Filter for requested mission observations
  const missionFilter = mission.toUpperCase();
  const matched = allObservations.filter((obs) => {
    const col = (obs.obs_collection || "").toUpperCase();
    if (missionFilter === "KEPLER") {
      return col === "KEPLER" || col === "K2";
    }
    return col === "TESS";
  });

  // Prioritize time-series products
  matched.sort((a, b) => {
    if (a.dataproduct_type === "timeseries" && b.dataproduct_type !== "timeseries") return -1;
    if (b.dataproduct_type === "timeseries" && a.dataproduct_type !== "timeseries") return 1;
    return (b.t_min || 0) - (a.t_min || 0); // newest first
  });

  const observations: MastObservation[] = matched.slice(0, 20).map((obs) => ({
    obsid: obs.obsid,
    obs_id: obs.obs_id,
    obs_collection: obs.obs_collection,
    target_name: obs.target_name,
    instrument_name: obs.instrument_name,
    dataproduct_type: obs.dataproduct_type,
    t_min: obs.t_min,
    t_max: obs.t_max,
    t_exptime: obs.t_exptime,
    proposal_id: obs.proposal_id,
    distance: obs.distance,
  }));

  return { coordinates: coords, observations };
}

/**
 * Retrieves data products (light curve files, reports) for a specific observation.
 */
export async function getObservationProducts(obsid: string | number): Promise<MastProduct[]> {
  const prodRes = await invokeMast({
    service: "Mast.Caom.Products",
    format: "json",
    params: { obsid: String(obsid) },
  });

  const products: any[] = prodRes.data || [];
  return products.map((p) => ({
    obsid: p.obsid,
    productFilename: p.productFilename,
    productSubGroupDescription: p.productSubGroupDescription || "",
    description: p.description || "",
    dataURI: p.dataURI,
    size: p.size || 0,
    type: p.dataproduct_type || "",
  }));
}

/**
 * Downloads and parses genuine FITS lightcurve data from MAST.
 */
export async function downloadLightCurve(dataURI: string): Promise<LightCurveData> {
  const downloadUrl = `https://mast.stsci.edu/api/v0.1/Download/file?uri=${encodeURIComponent(dataURI)}`;

  const response = await fetch(downloadUrl, {
    headers: {
      "User-Agent": "OrbitalRescue/1.0 (FITS Stream Parser)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download product from MAST: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  // Parse FITS headers and tables
  function readHeader(start: number): { header: Record<string, string>; nextOffset: number } {
    const header: Record<string, string> = {};
    let i = start;
    const decoder = new TextDecoder("latin1");

    while (i < buffer.length) {
      const line = decoder.decode(buffer.subarray(i, i + 80));
      i += 80;
      const key = line.slice(0, 8).trim();
      if (key === "END") break;
      const eqIdx = line.indexOf("=");
      if (eqIdx !== -1) {
        const k = line.slice(0, eqIdx).trim();
        const rawVal = line.slice(eqIdx + 1).split("/")[0] ?? "";
        const val = rawVal.trim().replace(/^'|'$/g, "").trim();
        header[k] = val;
      }
    }
    const pad = (i - start) % 2880;
    if (pad !== 0) i += 2880 - pad;
    return { header, nextOffset: i };
  }

  // 1. Primary HDU
  const h0 = readHeader(0);
  const telescope = h0.header["TELESCOP"] || "Kepler/TESS";
  const targetName = h0.header["OBJECT"] || "Unknown";

  // 2. Table HDU (Binary Table with light curve cadences)
  const h1 = readHeader(h0.nextOffset);
  const rows = parseInt(h1.header["NAXIS2"] || "0", 10);
  const rowBytes = parseInt(h1.header["NAXIS1"] || "0", 10);
  const fields = parseInt(h1.header["TFIELDS"] || "0", 10);

  if (rows === 0 || rowBytes === 0) {
    throw new Error("Invalid FITS file: No binary table records found.");
  }

  // Dynamically inspect columns
  const colOffsets: Record<string, { offset: number; format: string }> = {};
  let currentOffset = 0;
  for (let c = 1; c <= fields; c++) {
    const colName = (h1.header[`TTYPE${c}`] || "").trim().toUpperCase();
    const colForm = (h1.header[`TFORM${c}`] || "").trim();
    colOffsets[colName] = { offset: currentOffset, format: colForm };

    // Format sizes
    let size = 4;
    if (colForm.startsWith("D")) size = 8;
    else if (colForm.startsWith("E")) size = 4;
    else if (colForm.startsWith("J")) size = 4;
    else if (colForm.startsWith("I")) size = 2;
    else if (colForm.startsWith("B")) size = 1;
    currentOffset += size;
  }

  const timeCol = colOffsets["TIME"];
  const pdcCol = colOffsets["PDCSAP_FLUX"];
  const sapCol = colOffsets["SAP_FLUX"];
  const errCol = colOffsets["PDCSAP_FLUX_ERR"] || colOffsets["SAP_FLUX_ERR"];

  const timeOffset = timeCol ? timeCol.offset : 0;
  const pdcOffset = pdcCol ? pdcCol.offset : 32;
  const sapOffset = sapCol ? sapCol.offset : 16;
  const errOffset = errCol ? errCol.offset : 36;

  const dataStart = h1.nextOffset;
  const view = new DataView(arrayBuffer);

  const points: LightCurvePoint[] = [];
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (let r = 0; r < rows; r++) {
    const rowOffset = dataStart + r * rowBytes;
    if (rowOffset + rowBytes > arrayBuffer.byteLength) break;

    // Time is 64-bit IEEE float (big-endian in standard FITS)
    const timeVal = view.getFloat64(rowOffset + timeOffset, false);
    // Flux is 32-bit IEEE float (big-endian)
    const pdcFlux = view.getFloat32(rowOffset + pdcOffset, false);
    const sapFlux = view.getFloat32(rowOffset + sapOffset, false);
    const fluxErr = errCol ? view.getFloat32(rowOffset + errOffset, false) : undefined;

    const fluxVal = !isNaN(pdcFlux) && pdcFlux > 0 ? pdcFlux : sapFlux;

    if (!isNaN(timeVal) && !isNaN(fluxVal) && fluxVal > 0) {
      const point: LightCurvePoint = {
        time: timeVal,
        flux: fluxVal,
      };
      if (fluxErr !== undefined && !isNaN(fluxErr) && fluxErr > 0) {
        point.fluxErr = fluxErr;
      }
      points.push(point);
      if (timeVal < minTime) minTime = timeVal;
      if (timeVal > maxTime) maxTime = timeVal;
    }
  }

  const filename = dataURI.split("/").pop() || "observation_lc.fits";

  return {
    targetName,
    mission: telescope.includes("Kepler") ? "Kepler" : telescope.includes("TESS") ? "TESS" : telescope,
    obsId: h0.header["OBSID"] || filename,
    productFilename: filename,
    telescope,
    timeUnit: h1.header["TUNIT1"] || "BJD - 2454833 (Days)",
    fluxUnit: "e-/s (Electrons per Second)",
    timeMin: minTime === Infinity ? 0 : minTime,
    timeMax: maxTime === -Infinity ? 0 : maxTime,
    pointCount: points.length,
    points,
    provenance: "NASA Mikulski Archive for Space Telescopes (MAST) Public Archive",
  };
}
