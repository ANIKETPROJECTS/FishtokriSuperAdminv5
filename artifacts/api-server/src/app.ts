import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// In production, serve the React frontend from the built dist folder.
// The path is resolved relative to the process working directory (cwd in ecosystem.config.cjs).
if (process.env["NODE_ENV"] === "production") {
  const frontendDist = path.resolve(process.cwd(), "artifacts/fishtokri-admin/dist");
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // All non-API routes fall through to React's index.html for client-side routing.
    // Express 5 requires explicit wildcard syntax — "/*" is invalid, use a catch-all middleware instead.
    app.use((_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
    logger.info({ frontendDist }, "Serving frontend static files");
  } else {
    logger.warn({ frontendDist }, "Frontend dist folder not found — run: npm --prefix artifacts/fishtokri-admin run build");
  }
}

export default app;
