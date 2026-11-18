import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { validateProfile } from "./needs.js";

const scrypt = promisify(scryptCb);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(code, errors = []) {
    super(code);
    this.code = code;
    this.errors = errors;
  }
}

function dataDir() {
  return process.env.MEAL_AGENT_DATA_DIR || path.join(root, "var");
}
function usersFile() { return path.join(dataDir(), "users.json"); }
function sessionsFile() { return path.join(dataDir(), "sessions.json"); }

function readJson(file) {
  if (!existsSync(file)) return [];
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return []; }
}
function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, file);
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return `${salt}:${hash}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const next = (await scrypt(password, salt, 64)).toString("hex");
  const left = Buffer.from(hash, "hex");
  const right = Buffer.from(next, "hex");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    profile: user.profile,
    avoid: user.avoid || [],
    updatedAt: user.updatedAt,
    reminderDismissedAt: user.reminderDismissedAt || null,
    createdAt: user.createdAt,
    meals: user.meals || [],
    disclaimerAck: Boolean(user.disclaimerAck),
  };
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function checkAccount({ email, password, profile, disclaimerAck, requireTraining = true }) {
  const errors = [];
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 200) errors.push("invalid-email");
  if (typeof password !== "string" || password.length < 8 || password.length > 200) errors.push("weak-password");
  if (disclaimerAck !== true) errors.push("disclaimer-required");
  const check = validateProfile(profile || {});
  if (!check.ok) errors.push(...check.errors);
  if (requireTraining && check.ok && check.profile.trainingDays == null) errors.push("missing:trainingDays");
  return { ok: errors.length === 0, errors, email: normalized, profile: check.profile };
}

export async function registerUser({ email, password, profile, avoid = [], disclaimerAck }) {
  const checked = checkAccount({ email, password, profile, disclaimerAck });
  if (!checked.ok) throw new AuthError("invalid-registration", checked.errors);
  const users = readJson(usersFile());
  if (users.some((user) => user.email === checked.email)) throw new AuthError("email-taken");
  const user = {
    id: randomBytes(16).toString("hex"),
    email: checked.email,
    passwordHash: await hashPassword(password),
    profile: checked.profile,
    avoid: Array.isArray(avoid) ? avoid.map(String).slice(0, 12) : [],
    meals: [],
    disclaimerAck: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reminderDismissedAt: null,
  };
  users.push(user);
  writeJson(usersFile(), users);
  return user;
}

export async function loginUser({ email, password }) {
  const normalized = normalizeEmail(email);
  const users = readJson(usersFile());
  const user = users.find((item) => item.email === normalized);
  const stored = user?.passwordHash || "00:00";
  const ok = await verifyPassword(password, stored);
  if (!user || !ok) throw new AuthError("bad-login");
  return user;
}

export function findUser(id) {
  return readJson(usersFile()).find((user) => user.id === id) || null;
}

export function saveUser(user) {
  const users = readJson(usersFile());
  const index = users.findIndex((item) => item.id === user.id);
  if (index < 0) throw new AuthError("missing-user");
  users[index] = user;
  writeJson(usersFile(), users);
  return user;
}

export function createSession(userId) {
  const sessions = readJson(sessionsFile()).filter((session) => Date.parse(session.expiresAt) > Date.now());
  const token = randomBytes(32).toString("hex");
  sessions.push({ token, userId, expiresAt: new Date(Date.now() + SESSION_MS).toISOString() });
  writeJson(sessionsFile(), sessions);
  return token;
}

export function userForToken(token) {
  if (!token) return null;
  const sessions = readJson(sessionsFile());
  const session = sessions.find((item) => item.token === token && Date.parse(item.expiresAt) > Date.now());
  if (!session) return null;
  return findUser(session.userId);
}

export function deleteSession(token) {
  const sessions = readJson(sessionsFile()).filter((session) => session.token !== token);
  writeJson(sessionsFile(), sessions);
}
