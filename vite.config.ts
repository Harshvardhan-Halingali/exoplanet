import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

function mastApiDevPlugin(): Plugin {
  return {
    name: "mast-api-dev-server",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith("/api/mast")) {
          try {
            const { handleMastApiRequest } = await import("./src/server/mast-routes");
            const host = req.headers.host || "localhost:8080";
            const fullUrl = `http://${host}${req.url}`;

            let body: string | undefined;
            if (req.method === "POST") {
              const chunks: Buffer[] = [];
              for await (const chunk of req) {
                chunks.push(chunk as Buffer);
              }
              body = Buffer.concat(chunks).toString("utf-8");
            }

            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers)) {
              if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
            }

            const standardReq = new Request(fullUrl, {
              method: req.method || "GET",
              headers,
              ...(body ? { body } : {}),
            });

            const webRes = await handleMastApiRequest(standardReq);
            res.statusCode = webRes.status;
            webRes.headers.forEach((v, k) => {
              res.setHeader(k, v);
            });
            const resBuffer = await webRes.arrayBuffer();
            res.end(Buffer.from(resBuffer));
            return;
          } catch (err: any) {
            console.error("Vite dev API error:", err);
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [mastApiDevPlugin()],
  },
});
