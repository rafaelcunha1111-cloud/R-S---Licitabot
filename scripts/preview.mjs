import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const build = spawnSync(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "build",
    "--outDir",
    "dist-preview",
    "--base",
    "./",
  ],
  { stdio: "inherit", env: { ...process.env, VITE_STATIC_PREVIEW: "true" } },
);
if (build.status !== 0) process.exit(build.status || 1);
let html = readFileSync("dist-preview/index.html", "utf8");
html = html.replace(
  /<script[^>]*src="([^"]+)"[^>]*><\/script>/,
  (_, path) =>
    '<script type="module">' +
    readFileSync(resolve("dist-preview", path), "utf8").replace(
      /<\/script/gi,
      "<\\/script",
    ) +
    "</script>",
);
html = html.replace(
  /<link[^>]*href="([^"]+\.css)"[^>]*>/,
  (_, path) =>
    "<style>" +
    readFileSync(resolve("dist-preview", path), "utf8") +
    "</style>",
);
writeFileSync("dist-preview/licitabot-preview.html", html);
console.log("Prévia autônoma gerada: dist-preview/licitabot-preview.html");
