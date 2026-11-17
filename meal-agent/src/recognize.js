import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { proposalForLabel } from "./foods.js";

let classifierPromise = null;
let status = { state: "idle", error: null };

export function recognitionStatus() {
  return status;
}

export function preloadRecognizer() {
  if (!classifierPromise) classifierPromise = load().catch((error) => {
    status = { state: "failed", error: error.message };
    classifierPromise = null;
    throw error;
  });
  return classifierPromise;
}

async function load() {
  status = { state: "loading", error: null };
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = path.join(process.cwd(), ".cache");
  const classifier = await pipeline("image-classification", "onnx-community/swin-finetuned-food101-ONNX", { dtype: "q8" });
  status = { state: "ready", error: null };
  return classifier;
}

export async function recognizeDish(image) {
  if (!image?.base64) return { ok: false, reason: "沒有收到圖片。", reasonEn: "No image was received." };
  let classifier;
  try {
    classifier = await preloadRecognizer();
  } catch (error) {
    return { ok: false, reason: `菜名模型載入失敗：${error.message}`, reasonEn: `The dish-name model failed to load: ${error.message}` };
  }
  const bytes = Buffer.from(image.base64, "base64");
  const dir = await mkdtemp(path.join(tmpdir(), "meal-"));
  const file = path.join(dir, "upload.jpg");
  await writeFile(file, bytes);
  const ranked = await classifier(file, { top_k: 3 });
  const list = Array.isArray(ranked) ? ranked : [ranked];
  const top = list[0];
  if (!top?.label) return { ok: false, reason: "模型沒有返回菜名。", reasonEn: "The model did not return a dish name." };
  const proposal = proposalForLabel(top.label);
  return {
    ok: true,
    label: String(top.label),
    score: Number(top.score) || 0,
    candidates: list.map((item) => ({ label: String(item.label), score: Number(item.score) || 0 })),
    proposal: proposal ? { foodId: proposal.foodId, name: proposal.name, exact: proposal.exact, sourceId: proposal.sourceId } : null,
  };
}
