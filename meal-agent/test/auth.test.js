import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.MEAL_AGENT_DATA_DIR = mkdtempSync(path.join(tmpdir(), "meal-auth-"));
process.env.MEAL_AGENT_DISABLE_LOCAL_LLM = "1";
delete process.env.XAI_API_KEY;

const { onRequest } = await import("../src/server.js");

const profile = { weightKg: 70, heightCm: 175, age: 30, sex: "male", activity: "moderate", goal: "lose", targetWeightKg: 68, trainingDays: 3 };

function listen() {
  const server = createServer(onRequest);
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function call(server, method, pathname, { body, cookie } = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, method, path: pathname, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) } }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({ status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null });
      });
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function cookieFrom(response) {
  const raw = response.headers["set-cookie"]?.[0] || "";
  assert.match(raw, /HttpOnly/i);
  assert.match(raw, /meal_session=/);
  return raw.split(";")[0];
}

test("registration stores a hash, login restores the profile, and chat uses that profile", async () => {
  const server = await listen();
  const created = await call(server, "POST", "/api/register", { body: { email: "Student@Example.com", password: "correct-horse", profile, avoid: ["pork"], disclaimerAck: true } });
  assert.equal(created.status, 201);
  const cookie = cookieFrom(created);
  assert.equal(created.body.user.email, "student@example.com");
  assert.equal(created.body.user.passwordHash, undefined);
  const stored = readFileSync(path.join(process.env.MEAL_AGENT_DATA_DIR, "users.json"), "utf8");
  assert.equal(stored.includes("correct-horse"), false);
  assert.match(stored, /passwordHash/);

  const me = await call(server, "GET", "/api/me", { cookie });
  assert.equal(me.body.user.profile.trainingDays, 3);
  const loggedOut = await call(server, "POST", "/api/logout", { cookie });
  assert.equal(loggedOut.status, 200);
  const denied = await call(server, "GET", "/api/me", { cookie });
  assert.equal(denied.status, 401);

  const bad = await call(server, "POST", "/api/login", { body: { email: "student@example.com", password: "wrong-password" } });
  assert.equal(bad.status, 401);
  const loggedIn = await call(server, "POST", "/api/login", { body: { email: "student@example.com", password: "correct-horse" } });
  const nextCookie = cookieFrom(loggedIn);
  assert.equal(loggedIn.body.user.profile.weightKg, 70);

  const budget = await call(server, "POST", "/api/chat", { cookie: nextCookie, body: { message: "請計算今日熱量預算", brain: "deterministic", profile: { weightKg: 40, heightCm: 150, age: 20, sex: "female", activity: "low", goal: "lose", targetWeightKg: 39, trainingDays: 1 } } });
  assert.equal(budget.status, 200);
  assert.equal(budget.body.memory.needs.bmrKcal, 1648.8);
  assert.equal(budget.body.memory.profile.weightKg, 70);

  const meal = await call(server, "POST", "/api/chat", { cookie: nextCookie, body: { message: "白飯 200克", brain: "deterministic" } });
  assert.equal(meal.body.memory.meals.at(-1).nutrients.energyKcal, 366);
  const again = await call(server, "GET", "/api/me", { cookie: nextCookie });
  assert.equal(again.body.user.meals.at(-1).nutrients.energyKcal, 366);
  server.close();
});

test("registration rejects a missing disclaimer and a short password", async () => {
  const server = await listen();
  const noAck = await call(server, "POST", "/api/register", { body: { email: "other@example.com", password: "correct-horse", profile, disclaimerAck: false } });
  assert.equal(noAck.status, 400);
  assert.equal(noAck.body.errors.includes("disclaimer-required"), true);
  const short = await call(server, "POST", "/api/register", { body: { email: "other@example.com", password: "short", profile, disclaimerAck: true } });
  assert.equal(short.status, 400);
  assert.equal(short.body.errors.includes("weak-password"), true);
  server.close();
});
