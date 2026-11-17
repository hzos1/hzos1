import { createServer as createHttp } from "node:http";
import { createServer as createHttps } from "node:https";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemory } from "./memory.js";
import { runTurn, deterministicBrain, autoBrain, DISCLAIMER } from "./agent.js";
import { toolCatalog, LIMITS } from "./harness.js";
import { llmStatus, preloadLocalModel } from "./llm.js";
import { preloadRecognizer, recognitionStatus } from "./recognize.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const pages = new Set(["/", "/onboarding", "/home", "/analyze", "/plan", "/places", "/more", "/chat", "/profile"]);
const sessions = new Map();
const PORT = Number(process.env.PORT || 8787);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 6_000_000) {
        reject(new Error("body-too-large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function contentType(file) {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

async function handle(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (request.method === "GET" && (pages.has(url.pathname) || url.pathname === "/index.html")) {
    send(response, 200, readFileSync(path.join(publicDir, "index.html")), contentType("index.html"));
    return;
  }
  if (request.method === "GET" && ["/styles.css", "/app.js"].includes(url.pathname)) {
    send(response, 200, readFileSync(path.join(publicDir, url.pathname.slice(1))), contentType(url.pathname));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/meta") {
    send(response, 200, JSON.stringify({ disclaimer: DISCLAIMER, limits: LIMITS, tools: toolCatalog(), llm: llmStatus(), recognition: recognitionStatus() }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/chat") {
    const payload = JSON.parse(await readBody(request) || "{}");
    const sessionId = String(payload.sessionId || crypto.randomUUID());
    const memory = sessions.get(sessionId) || createMemory();
    const brain = payload.brain === "deterministic" || process.env.MEAL_AGENT_DISABLE_LOCAL_LLM === "1" ? deterministicBrain() : autoBrain();
    const result = await runTurn({
      memory,
      message: String(payload.message || ""),
      image: payload.image?.base64 ? payload.image : null,
      location: payload.location || null,
      avoid: Array.isArray(payload.avoid) ? payload.avoid : memory.avoid,
      profile: payload.profile || null,
      brain,
    });
    sessions.set(sessionId, result.memory);
    send(response, 200, JSON.stringify({ sessionId, ...result, memory: result.memory }));
    return;
  }
  send(response, 404, JSON.stringify({ error: "not-found" }));
}

function onRequest(request, response) {
  handle(request, response).catch((error) => {
    send(response, error.message === "body-too-large" ? 413 : 500, JSON.stringify({ error: "request-failed" }));
  });
}

function lanAddresses() {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

function ensureCertificate() {
  const dir = path.join(root, "certs");
  const cert = path.join(dir, "cert.pem");
  const key = path.join(dir, "key.pem");
  if (!existsSync(cert) || !existsSync(key)) {
    mkdirSync(dir, { recursive: true });
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${key}" -out "${cert}" -days 365 -nodes -subj "/CN=meal-agent.local"`, { stdio: "ignore" });
  }
  return { cert: readFileSync(cert), key: readFileSync(key) };
}

const httpServer = createHttp(onRequest);
httpServer.listen(PORT, "0.0.0.0");
const httpsServer = createHttps(ensureCertificate(), onRequest);
httpsServer.listen(HTTPS_PORT, "0.0.0.0");
preloadLocalModel();
preloadRecognizer();

const addresses = lanAddresses();
console.log(`meal-agent http://127.0.0.1:${PORT}  (onboarding, then /home)`);
console.log(`phone camera https://127.0.0.1:${HTTPS_PORT}`);
for (const address of addresses) console.log(`same Wi-Fi: https://${address}:${HTTPS_PORT}`);
