import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const rules = [
  ["google-refresh-token", /\b1\/\/[A-Za-z0-9_-]{30,}/],
  ["google-access-token", /\bya29\.[A-Za-z0-9_-]{30,}/],
  ["google-client-secret", /\bGOCSPX-[A-Za-z0-9_-]{20,}/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["github-token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/],
  ["aws-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["resend-key", /\bre_[A-Za-z0-9_]{24,}\b/],
  ["meta-token", /\bEAA[A-Za-z0-9]{80,}\b/],
];
let findings = 0;
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (text.includes("\0")) continue;
  for (const [name, pattern] of rules)
    if (pattern.test(text)) {
      console.error(`${file}: possível ${name} (valor omitido)`);
      findings++;
    }
  for (const match of text.matchAll(/postgres(?:ql)?:\/\/[^\s'"`<>]+/g)) {
    try {
      const url = new URL(match[0]);
      if (!url.password) continue;
      const example =
        url.username === "USER" &&
        url.password === "PASSWORD" &&
        url.hostname.toLowerCase() === "host";
      const ci =
        url.password === "fixture-ci-only" &&
        url.hostname === "localhost" &&
        url.pathname === "/licitabot_test";
      if (!example && !ci) {
        console.error(
          `${file}: possível credencial PostgreSQL (valor omitido)`,
        );
        findings++;
      }
    } catch {}
  }
}
if (findings) {
  console.error("Revisar possíveis segredos antes do commit.");
  process.exit(1);
}
console.log(
  "Nenhum padrão de segredo detectado nos arquivos versionáveis (checagem heurística).",
);
