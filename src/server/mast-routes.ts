import {
  searchTargetObservations,
  getObservationProducts,
  downloadLightCurve,
  resolveTargetName,
} from "./mast-service";

export async function handleMastApiRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (pathname === "/api/mast/search" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const mission = (body.mission === "TESS" ? "TESS" : "Kepler") as "Kepler" | "TESS";
      const target = String(body.target || "").trim();

      if (!target) {
        return new Response(
          JSON.stringify({ success: false, error: "Please enter a valid astronomical target identifier (e.g., Kepler-10, TRAPPIST-1)." }),
          { status: 400, headers: corsHeaders }
        );
      }

      const result = await searchTargetObservations(mission, target);
      return new Response(
        JSON.stringify({
          success: true,
          mission,
          target,
          coordinates: result.coordinates,
          observations: result.observations,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (pathname === "/api/mast/products" && req.method === "GET") {
      const obsid = url.searchParams.get("obsid");
      if (!obsid) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing required query parameter: obsid" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const products = await getObservationProducts(obsid);
      return new Response(
        JSON.stringify({
          success: true,
          obsid,
          products,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (pathname === "/api/mast/lightcurve" && (req.method === "GET" || req.method === "POST")) {
      let dataURI = url.searchParams.get("dataURI");
      if (!dataURI && req.method === "POST") {
        const body = await req.json().catch(() => ({}));
        dataURI = body.dataURI;
      }

      if (!dataURI) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing required parameter: dataURI" }),
          { status: 400, headers: corsHeaders }
        );
      }

      const lightcurve = await downloadLightCurve(dataURI);
      return new Response(
        JSON.stringify({
          success: true,
          data: lightcurve,
          timestamp: new Date().toISOString(),
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (pathname === "/api/mast/resolve" && req.method === "GET") {
      const target = url.searchParams.get("target") || "";
      const coords = await resolveTargetName(target);
      return new Response(
        JSON.stringify({ success: true, coordinates: coords }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: `Unknown endpoint: ${pathname}` }),
      { status: 404, headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("[MAST API Error]", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || "An unexpected error occurred while communicating with NASA MAST services.",
      }),
      { status: 400, headers: corsHeaders }
    );
  }
}
