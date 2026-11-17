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
import { AuthError, createSession, deleteSession, loginUser, publicUser, registerUser, saveUser, userForToken } from "./auth.js";
import { validateProfile } from "./needs.js";
import { loadEnv } from "./env.js";
import { pickMicros } from "./micros.js";

loadEnv();

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(root, "public");
const pages = new Set(["/", "/onboarding", "/login", "/register", "/home", "/analyze", "/plan", "/more", "/chat", "/profile"]);
const staticFiles = new Set(["/styles.css", "/app.js", "/i18n.js"]);
const agentSessions = new Map();
const PORT = Number(process.env.PORT || 8787);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);

function send(response, status, body, type = "application/json; charset=utf-8", extra = {}) {
  response.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", ...extra });
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

function cookiesOf(request) {
  const out = {};
  for (const part of String(request.headers.cookie || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function sessionCookie(token, request) {
  const secure = request.socket?.encrypted || request.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
  return `meal_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=1209600${secure}`;
}

function clearCookie() {
  return "meal_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

function currentUser(request) {
  return userForToken(cookiesOf(request).meal_session);
}

async function handle(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (request.method === "GET" && (pages.has(url.pathname) || url.pathname === "/index.html")) {
    send(response, 200, readFileSync(path.join(publicDir, "index.html")), contentType("index.html"));
    return;
  }
  if (request.method === "GET" && staticFiles.has(url.pathname)) {
    send(response, 200, readFileSync(path.join(publicDir, url.pathname.slice(1))), contentType(url.pathname));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/meta") {
    send(response, 200, JSON.stringify({ disclaimer: DISCLAIMER, limits: LIMITS, tools: toolCatalog(), llm: llmStatus(), recognition: recognitionStatus() }));
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/me") {
    const user = currentUser(request);
    send(response, user ? 200 : 401, JSON.stringify(user ? { user: publicUser(user) } : { error: "unauthorized" }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/register") {
    const payload = JSON.parse(await readBody(request) || "{}");
    try {
      const user = await registerUser(payload);
      const token = createSession(user.id);
      send(response, 201, JSON.stringify({ user: publicUser(user) }), "application/json; charset=utf-8", { "Set-Cookie": sessionCookie(token, request) });
    } catch (error) {
      const code = error instanceof AuthError ? error.code : "request-failed";
      send(response, code === "email-taken" ? 409 : 400, JSON.stringify({ error: code, errors: error.errors || [] }));
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/login") {
    const payload = JSON.parse(await readBody(request) || "{}");
    try {
      const user = await loginUser(payload);
      const token = createSession(user.id);
      send(response, 200, JSON.stringify({ user: publicUser(user) }), "application/json; charset=utf-8", { "Set-Cookie": sessionCookie(token, request) });
    } catch (error) {
      send(response, 401, JSON.stringify({ error: error instanceof AuthError ? error.code : "bad-login" }));
    }
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/logout") {
    deleteSession(cookiesOf(request).meal_session);
    send(response, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8", { "Set-Cookie": clearCookie() });
    return;
  }
  if (request.method === "PATCH" && url.pathname === "/api/profile") {
    const user = currentUser(request);
    if (!user) { send(response, 401, JSON.stringify({ error: "unauthorized" })); return; }
    const payload = JSON.parse(await readBody(request) || "{}");
    const check = validateProfile(payload.profile || {});
    if (!check.ok || check.profile.trainingDays == null) {
      const errors = [...(check.errors || [])];
      if (check.ok && check.profile.trainingDays == null) errors.push("missing:trainingDays");
      send(response, 400, JSON.stringify({ error: "invalid-profile", errors }));
      return;
    }
    user.profile = check.profile;
    user.avoid = Array.isArray(payload.avoid) ? payload.avoid.map(String).slice(0, 12) : user.avoid;
    user.updatedAt = new Date().toISOString();
    user.reminderDismissedAt = null;
    saveUser(user);
    const memory = agentSessions.get(user.id);
    if (memory) {
      memory.needs = null;
      memory.plan = null;
      memory.checks = null;
    }
    send(response, 200, JSON.stringify({ user: publicUser(user) }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/reminder") {
    const user = currentUser(request);
    if (!user) { send(response, 401, JSON.stringify({ error: "unauthorized" })); return; }
    user.reminderDismissedAt = new Date().toISOString();
    saveUser(user);
    send(response, 200, JSON.stringify({ user: publicUser(user) }));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/chat") {
    const user = currentUser(request);
    if (!user) { send(response, 401, JSON.stringify({ error: "unauthorized" })); return; }
    const payload = JSON.parse(await readBody(request) || "{}");
    let memory = agentSessions.get(user.id);
    if (!memory) {
      memory = createMemory();
      memory.meals = Array.isArray(user.meals) ? user.meals : [];
    }
    const brain = payload.brain === "deterministic" || process.env.MEAL_AGENT_DISABLE_LOCAL_LLM === "1" ? deterministicBrain() : autoBrain();
    if (payload.visionOverride) {
      const override = payload.visionOverride;
      const num = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
      };
      const base = memory.pending?.kind === "vision" ? memory.pending : {
        kind: "vision",
        source: "xai-vision",
        sourceId: "ai:vision:manual",
        method: "user-edited",
        notes: "",
        slot: "lunch",
      };
      const micros = pickMicros(override.micros || {}, num);
      const sodiumMg = num(override.nutrients?.sodiumMg) ?? micros.sodiumMg;
      memory.pending = {
        ...base,
        kind: "vision",
        name: String(override.name || base.name || "Meal").slice(0, 120),
        nameEn: String(override.nameEn || override.name || base.nameEn || "").slice(0, 120),
        estimatedGrams: num(override.grams) ?? base.estimatedGrams ?? 100,
        nutrients: {
          energyKcal: num(override.nutrients?.energyKcal) ?? 0,
          proteinG: num(override.nutrients?.proteinG) ?? 0,
          carbohydrateG: num(override.nutrients?.carbohydrateG) ?? 0,
          fatG: num(override.nutrients?.fatG) ?? 0,
          sodiumMg,
        },
        micros: { ...micros, sodiumMg },
        items: Array.isArray(override.items) ? override.items : (base.items || []),
        editedByUser: true,
      };
    }
    const result = await runTurn({
      memory,
      message: String(payload.message || ""),
      image: payload.image?.base64 ? payload.image : null,
      location: payload.location || null,
      avoid: user.avoid || [],
      profile: user.profile,
      lang: payload.lang === "en" ? "en" : "zh",
      brain,
    });
    user.meals = (result.memory.meals || []).slice(-30);
    saveUser(user);
    agentSessions.set(user.id, result.memory);
    send(response, 200, JSON.stringify({ ...result, memory: result.memory, user: publicUser(user) }));
    return;
  }
  send(response, 404, JSON.stringify({ error: "not-found" }));
}

function onRequest(request, response) {
  handle(request, response).catch((error) => {
    const status = error.message === "body-too-large" ? 413 : error instanceof SyntaxError ? 400 : 500;
    send(response, status, JSON.stringify({ error: status === 400 ? "bad-json" : "request-failed" }));
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

export function start(port = PORT, httpsPort = HTTPS_PORT) {
  const httpServer = createHttp(onRequest);
  httpServer.listen(port, "0.0.0.0");
  const httpsServer = createHttps(ensureCertificate(), onRequest);
  httpsServer.listen(httpsPort, "0.0.0.0");
  preloadLocalModel();
  preloadRecognizer();
  console.log(`meal-agent http://127.0.0.1:${port}  (register, then /home)`);
  console.log(`phone camera https://127.0.0.1:${httpsPort}`);
  console.log("Cloudflare Quick Tunnel must target http://127.0.0.1:8787, not 8443.");
  for (const address of lanAddresses()) console.log(`same Wi-Fi: https://${address}:${httpsPort}`);
  return { httpServer, httpsServer };
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) start();

export { onRequest };
