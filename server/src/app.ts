
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFound } from "./middleware/not-found.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin:
      env.NODE_ENV === "production"
        ? false
        : env.CLIENT_URL.split(",").map((value) => value.trim()),
    methods: ["GET"],
  }),
);

app.use(express.json({ limit: "16kb" }));

// API routes must be registered before frontend routes.
app.use("/api", apiRouter);

// Resolve the frontend build relative to this compiled server file.
// In production, server/src/app.js is inside server/dist/src/.
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(
  currentDirectory,
  "../../../client/dist",
);

const clientIndexPath = path.join(clientDistPath, "index.html");

if (env.NODE_ENV === "production" && existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath));

  // Support React Router routes while keeping unknown API paths as API 404s.
  app.get("/{*path}", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/api") {
      next();
      return;
    }

    res.sendFile(clientIndexPath, (error) => {
      if (error) next(error);
    });
  });
}

// Return 404 for unknown routes, then handle errors.
app.use(notFound);
app.use(errorHandler);
