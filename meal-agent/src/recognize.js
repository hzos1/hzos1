import { round1 } from "./foods.js";
import { DEFAULT_GROK_MODEL } from "./llm.js";
import { pickMicros, scaleMicros } from "./micros.js";

let status = { state: "idle", mode: "xai-vision", error: null };

export function recognitionStatus() {
  return status;
}

/** Warm-up hook kept for server startup; vision analysis uses the live multimodal API. */
export function preloadRecognizer() {
  status = {
    state: process.env.XAI_API_KEY ? "ready" : "needs-key",
    mode: "xai-vision",
    error: process.env.XAI_API_KEY ? null : "XAI_API_KEY missing",
  };
  return Promise.resolve(null);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? round1(n) : null;
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function normalizeAnalysis(parsed, model) {
  const itemsIn = Array.isArray(parsed?.items) ? parsed.items : [];
  const items = itemsIn.map((item) => ({
    name: String(item?.name || item?.nameZh || "食物").slice(0, 120),
    nameEn: String(item?.nameEn || item?.name || "").slice(0, 120),
    grams: num(item?.grams) ?? 100,
    nutrients: {
      energyKcal: num(item?.energyKcal ?? item?.nutrients?.energyKcal),
      proteinG: num(item?.proteinG ?? item?.nutrients?.proteinG),
      carbohydrateG: num(item?.carbohydrateG ?? item?.nutrients?.carbohydrateG),
      fatG: num(item?.fatG ?? item?.nutrients?.fatG),
      sodiumMg: num(item?.sodiumMg ?? item?.nutrients?.sodiumMg),
    },
  })).filter((item) => item.nutrients.energyKcal != null);

  let nutrients = {
    energyKcal: num(parsed?.energyKcal ?? parsed?.nutrients?.energyKcal),
    proteinG: num(parsed?.proteinG ?? parsed?.nutrients?.proteinG),
    carbohydrateG: num(parsed?.carbohydrateG ?? parsed?.nutrients?.carbohydrateG),
    fatG: num(parsed?.fatG ?? parsed?.nutrients?.fatG),
    sodiumMg: num(parsed?.sodiumMg ?? parsed?.nutrients?.sodiumMg),
  };
  let micros = pickMicros(parsed, num);
  if (micros.sodiumMg == null && nutrients.sodiumMg != null) micros.sodiumMg = nutrients.sodiumMg;
  if (nutrients.sodiumMg == null && micros.sodiumMg != null) nutrients.sodiumMg = micros.sodiumMg;
  let grams = num(parsed?.estimatedGrams ?? parsed?.grams);
  const mealType = String(parsed?.mealType || parsed?.slot || "").toLowerCase();
  const slot = ["breakfast", "lunch", "dinner", "snack"].includes(mealType) ? mealType : "lunch";

  if (items.length) {
    if (nutrients.energyKcal == null) {
      nutrients = {
        energyKcal: round1(items.reduce((sum, item) => sum + (item.nutrients.energyKcal || 0), 0)),
        proteinG: round1(items.reduce((sum, item) => sum + (item.nutrients.proteinG || 0), 0)),
        carbohydrateG: round1(items.reduce((sum, item) => sum + (item.nutrients.carbohydrateG || 0), 0)),
        fatG: round1(items.reduce((sum, item) => sum + (item.nutrients.fatG || 0), 0)),
        sodiumMg: items.every((item) => item.nutrients.sodiumMg == null)
          ? null
          : round1(items.reduce((sum, item) => sum + (item.nutrients.sodiumMg || 0), 0)),
      };
    }
    if (grams == null) grams = round1(items.reduce((sum, item) => sum + (item.grams || 0), 0));
  }
  if (micros.sodiumMg == null && nutrients.sodiumMg != null) micros.sodiumMg = nutrients.sodiumMg;
  if (nutrients.sodiumMg == null && micros.sodiumMg != null) nutrients.sodiumMg = micros.sodiumMg;

  if (nutrients.energyKcal == null) return null;
  if (grams == null || grams <= 0) grams = 100;

  const nameEn = String(parsed?.nameEn || parsed?.name || items[0]?.nameEn || items[0]?.name || "Meal from photo").slice(0, 120);
  const name = String(parsed?.name || parsed?.nameZh || items[0]?.name || nameEn).slice(0, 120);
  const sourceId = `ai:vision:${model}`;
  return {
    ok: true,
    name,
    nameEn,
    estimatedGrams: grams,
    grams,
    slot,
    items,
    nutrients,
    micros,
    notes: String(parsed?.notes || parsed?.analysis || "").slice(0, 800),
    notesEn: String(parsed?.notesEn || parsed?.notes || parsed?.analysis || "").slice(0, 800),
    confidence: num(parsed?.confidence),
    model,
    source: "xai-vision",
    sourceId,
    datasetUrl: null,
    method: "multimodal-tool-call",
  };
}

function visionPrompt() {
  return [
    "You are a multimodal meal-analysis tool for a demo app.",
    "Reply in English. Think and label primarily in English.",
    "Look at the food photo. Identify visible ingredients and estimate nutrition for the portion shown.",
    "Use vision + structured reasoning. Do not say you looked up a local database row.",
    "Return JSON only with this shape:",
    '{"name":"Chinese meal name if known else English","nameEn":"English meal name","mealType":"breakfast|lunch|dinner|snack","estimatedGrams":number,"energyKcal":number,"proteinG":number,"carbohydrateG":number,"fatG":number,"sodiumMg":number|null,"calciumMg":number|null,"ironMg":number|null,"potassiumMg":number|null,"magnesiumMg":number|null,"zincMg":number|null,"phosphorusMg":number|null,"vitaminAUcg":number|null,"vitaminCMg":number|null,"vitaminDUcg":number|null,"vitaminB12Ucg":number|null,"folateUcg":number|null,"fiberG":number|null,"confidence":0-1,"notes":"short Chinese note optional","notesEn":"short English analysis","items":[{"name":"Chinese item name optional","nameEn":"English item name","grams":number,"energyKcal":number,"proteinG":number,"carbohydrateG":number,"fatG":number,"sodiumMg":number|null}]}',
    "Prefer English fields (nameEn, notesEn, item.nameEn). Always fill English names. Chinese name/notes are optional extras for the UI.",
    "Split the plate into ingredient items with their own kcal when possible. Estimate micronutrients when you can: sodium/calcium/iron/potassium/magnesium/zinc/phosphorus in mg; vitamin A/D/B12 and folate in µg; vitamin C in mg; fiber in g. Use null when unknown.",
    "Numbers are classroom demo estimates, not medical advice.",
  ].join(" ");
}

function textFromResponsesBody(body) {
  if (!body || typeof body !== "object") return "";
  if (typeof body.output_text === "string" && body.output_text.trim()) return body.output_text;
  const parts = [];
  for (const item of body.output || []) {
    if (item?.type === "message" || item?.role === "assistant") {
      for (const part of item.content || []) {
        if (part?.type === "output_text" && part.text) parts.push(part.text);
        else if (typeof part?.text === "string") parts.push(part.text);
      }
    }
  }
  return parts.join("\n");
}

async function readApiError(response) {
  try {
    const raw = await response.text();
    if (!raw) return "";
    try {
      const body = JSON.parse(raw);
      const detail = body?.error?.message || body?.error?.code || body?.message || body?.error;
      if (detail && typeof detail === "object") return JSON.stringify(detail).slice(0, 240);
      if (detail) return String(detail).slice(0, 240);
    } catch {
      /* plain text body */
    }
    return raw.slice(0, 240);
  } catch {
    return "";
  }
}

function dataUrl(mime, base64) {
  const clean = String(base64 || "").replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  return { mime, clean, url: `data:${mime};base64,${clean}` };
}

async function callResponsesVision({ fetchImpl, key, model, prompt, url }) {
  const response = await fetchImpl("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        {
          role: "user",
          content: [
            { type: "input_image", image_url: url, detail: "auto" },
            { type: "input_text", text: prompt },
          ],
        },
      ],
    }),
  });
  return response;
}

async function callChatCompletionsVision({ fetchImpl, key, model, prompt, url }) {
  const response = await fetchImpl("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url, detail: "auto" } },
          ],
        },
      ],
    }),
  });
  return response;
}

function textFromChatBody(body) {
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text === "string") return text;
  if (Array.isArray(text)) return text.map((part) => (typeof part === "string" ? part : part?.text || "")).join("\n");
  return "";
}

/**
 * Multimodal analysis via xAI (Responses API first; chat-completions fallback).
 * This replaces Food-101 label → table lookup for the photo path.
 */
export async function recognizeDish(image, options = {}) {
  if (!image?.base64) {
    return { ok: false, reason: "沒有收到圖片。", reasonEn: "No image was received." };
  }
  const key = process.env.XAI_API_KEY;
  if (!key) {
    status = { state: "needs-key", mode: "xai-vision", error: "XAI_API_KEY missing" };
    return {
      ok: false,
      reason: "相片分析需要多模態 AI。請在執行伺服器的 PowerShell 設定 XAI_API_KEY 後重開 node src/server.js。",
      reasonEn: "Photo analysis needs a multimodal AI. Set XAI_API_KEY in the server PowerShell window, then restart node src/server.js.",
      needsKey: true,
    };
  }

  const model = process.env.XAI_MODEL || DEFAULT_GROK_MODEL;
  const mime = image.mime === "image/png" ? "image/png" : "image/jpeg";
  const { clean, url } = dataUrl(mime, image.base64);
  if (!clean || clean.length < 8) {
    return { ok: false, reason: "圖片資料不完整。", reasonEn: "The image payload is incomplete." };
  }
  // Rough guard: ~3MB base64 ≈ large phone photo after resize; API max is 20MiB.
  if (clean.length > 4_000_000) {
    return {
      ok: false,
      reason: "相片太大。請改用較近距離或較小的照片再試。",
      reasonEn: "The photo is too large. Try a closer crop or a smaller image.",
    };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const prompt = visionPrompt();
  status = { state: "loading", mode: "xai-vision", error: null };

  try {
    let response = await callResponsesVision({ fetchImpl, key, model, prompt, url });
    let pathUsed = "responses";
    if (!response.ok) {
      const firstDetail = await readApiError(response);
      console.error(`[recognize_dish] responses HTTP ${response.status}: ${firstDetail || "(empty body)"}`);
      response = await callChatCompletionsVision({ fetchImpl, key, model, prompt, url });
      pathUsed = "chat.completions";
      if (!response.ok) {
        const secondDetail = await readApiError(response);
        console.error(`[recognize_dish] chat.completions HTTP ${response.status}: ${secondDetail || "(empty body)"}`);
        const detail = secondDetail || firstDetail;
        status = { state: "failed", mode: "xai-vision", error: `HTTP ${response.status}${detail ? `: ${detail}` : ""}` };
        return {
          ok: false,
          reason: detail
            ? `多模態 AI 回應失敗（HTTP ${response.status}）：${detail}`
            : `多模態 AI 回應失敗（HTTP ${response.status}）。請確認模型名稱（而家係 ${model}）同 XAI_API_KEY。`,
          reasonEn: detail
            ? `The multimodal AI request failed (HTTP ${response.status}): ${detail}`
            : `The multimodal AI request failed (HTTP ${response.status}). Check model (${model}) and XAI_API_KEY.`,
          httpStatus: response.status,
          model,
        };
      }
    }

    const body = await response.json();
    const content = pathUsed === "responses" ? textFromResponsesBody(body) : textFromChatBody(body);
    const parsed = extractJson(content);
    const normalized = parsed ? normalizeAnalysis(parsed, model) : null;
    if (!normalized) {
      status = { state: "failed", mode: "xai-vision", error: "invalid-json" };
      return {
        ok: false,
        reason: "AI 沒有返回可用的營養 JSON。請換一張較清楚的相片再試。",
        reasonEn: "The AI did not return usable nutrition JSON. Try a clearer photo.",
        raw: String(content || "").slice(0, 240),
        pathUsed,
      };
    }
    status = { state: "ready", mode: "xai-vision", error: null };
    return { ...normalized, pathUsed };
  } catch (error) {
    status = { state: "failed", mode: "xai-vision", error: error.message };
    console.error("[recognize_dish]", error);
    return {
      ok: false,
      reason: `多模態分析失敗：${error.message}`,
      reasonEn: `Multimodal analysis failed: ${error.message}`,
    };
  }
}

/** Rescale AI nutrients when the user confirms a different portion size. */
export function scaleVisionNutrients(analysis, grams) {
  const baseGrams = Number(analysis?.estimatedGrams || analysis?.grams || 0);
  const target = Number(grams);
  if (!analysis?.nutrients || !(baseGrams > 0) || !(target > 0)) return null;
  const factor = target / baseGrams;
  const scaleOne = (value) => (value == null ? null : round1(value * factor));
  return {
    energyKcal: scaleOne(analysis.nutrients.energyKcal),
    proteinG: scaleOne(analysis.nutrients.proteinG),
    carbohydrateG: scaleOne(analysis.nutrients.carbohydrateG),
    fatG: scaleOne(analysis.nutrients.fatG),
    sodiumMg: scaleOne(analysis.nutrients.sodiumMg),
    micros: scaleMicros(analysis.micros || {}, factor),
  };
}
