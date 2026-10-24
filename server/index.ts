import express from "express";
import { resolve } from "node:path";
import { demoData } from "./data.js";
import { connectors } from "./connectors.js";
const app = express();
app.get("/api/health", (_req, res) => res.json({ status: "ok", mode: "demo" }));
app.get("/api/dashboard", (_req, res) => res.json(demoData()));
app.get("/api/connectors", (_req, res) => res.json(connectors));
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
app.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
  console.log("LicitaBot API pronta (modo demonstrativo)"),
);
