import { lookupFood, foodById, nutrientsFor, lookupUsdaLive, proposalForLabel, round1 } from "./foods.js";
import { estimateNeeds } from "./needs.js";
import { checkConstraints } from "./health.js";
import { suggestMeal, verifyPlan, annotatePlan } from "./suggest.js";
import { trainingGuidance } from "./training.js";
import { recompute } from "./memory.js";
import { recognizeDish, scaleVisionNutrients } from "./recognize.js";

export async function executeTool(tool, input, ctx) {
  const memory = ctx.memory;
  if (tool === "save_profile") {
    memory.profile = { ...(memory.profile || {}), ...input };
    if (Array.isArray(ctx.avoid)) memory.avoid = ctx.avoid;
    const check = estimateNeeds(memory.profile);
    return { ok: true, profile: memory.profile, complete: check.ok && !check.rejected, errors: check.errors || [], warnings: check.warnings || [] };
  }
  if (tool === "estimate_needs") {
    const result = estimateNeeds(memory.profile || {});
    if (!result.incomplete) {
      memory.needs = result;
      if (!result.ok) memory.plan = null;
      recompute(memory);
    }
    return result;
  }
  if (tool === "training_guidance") {
    const result = trainingGuidance(memory.profile);
    memory.training = result;
    return result;
  }
  if (tool === "recognize_dish") {
    const result = await recognizeDish(ctx.image, { fetchImpl: ctx.fetchImpl, lang: "en" });
    if (result.ok) {
      memory.pending = {
        kind: "vision",
        name: result.name,
        nameEn: result.nameEn,
        estimatedGrams: result.estimatedGrams,
        nutrients: result.nutrients,
        micros: result.micros || {},
        items: result.items || [],
        slot: result.slot || "lunch",
        notes: result.notes,
        notesEn: result.notesEn,
        source: result.source,
        sourceId: result.sourceId,
        model: result.model,
        method: result.method,
      };
    }
    return result;
  }
  if (tool === "lookup_meal") {
    if (!input.confirmed) return { ok: false, error: "confirmation_required", nutrients: null };
    const pending = memory.pending;
    if (pending?.kind === "vision" && pending.nutrients) {
      const grams = input.grams;
      const nutrients = pending.editedByUser
        ? {
          energyKcal: pending.nutrients.energyKcal,
          proteinG: pending.nutrients.proteinG,
          carbohydrateG: pending.nutrients.carbohydrateG,
          fatG: pending.nutrients.fatG,
          sodiumMg: pending.nutrients.sodiumMg ?? null,
        }
        : (scaleVisionNutrients(pending, grams) || pending.nutrients);
      memory.meals.push({
        name: input.name || pending.name,
        query: input.name || pending.name,
        grams,
        status: "resolved",
        foodId: null,
        source: pending.source || "xai-vision",
        sourceId: pending.sourceId,
        group: "vision",
        produce: false,
        starchyRoot: false,
        state: pending.editedByUser ? "user-edited-estimate" : "ai-estimate",
        nutrients,
        micros: pending.micros || {},
        items: pending.items || [],
        live: false,
        vision: true,
        notes: pending.notes,
      });
      memory.pending = null;
      recompute(memory);
      const missing = [];
      if (nutrients.sodiumMg == null) missing.push("sodium");
      if (nutrients.proteinG == null) missing.push("protein");
      return {
        ok: true,
        name: input.name || pending.name,
        grams,
        source: pending.source || "xai-vision",
        sourceId: pending.sourceId,
        datasetUrl: null,
        state: pending.editedByUser ? "user-edited-estimate" : "ai-estimate",
        nutrients,
        missing,
        vision: true,
        method: pending.method || "multimodal-tool-call",
      };
    }
    let found = input.foodId ? { status: foodById(input.foodId) ? "found" : "missing", food: foodById(input.foodId) } : lookupFood(input.name);
    let live = false;
    if (found.status !== "found" && process.env.FDC_API_KEY) {
      found = await lookupUsdaLive(input.name, process.env.FDC_API_KEY);
      live = found.status === "found";
    }
    if (found.status !== "found") {
      memory.meals.push({ name: input.name, grams: input.grams, status: found.status === "ambiguous" ? "missing" : "missing", nutrients: null, sourceId: null });
      recompute(memory);
      return { ok: false, status: found.status, name: input.name, grams: input.grams, nutrients: null, candidates: (found.foods || []).map((food) => ({ id: food.id, name: food.name })) };
    }
    const food = found.food;
    const nutrients = nutrientsFor(food, input.grams);
    memory.meals.push({
      name: food.name,
      query: input.name,
      grams: input.grams,
      status: "resolved",
      foodId: food.id,
      source: food.source,
      sourceId: food.sourceId,
      group: food.group,
      produce: Boolean(food.produce),
      starchyRoot: Boolean(food.starchyRoot),
      state: food.state,
      nutrients,
      live,
    });
    memory.pending = null;
    recompute(memory);
    const missing = [];
    if (nutrients.sodiumMg == null) missing.push("sodium");
    if (nutrients.proteinG == null) missing.push("protein");
    return { ok: true, name: food.name, grams: input.grams, source: food.source, sourceId: food.sourceId, datasetUrl: food.datasetUrl, state: food.state, nutrients, missing };
  }
  if (tool === "suggest_meal") {
    if (!memory.needs || memory.needs.rejected || memory.remainingKcal == null) {
      return { ok: false, reason: "還沒有可用的熱量預算。", items: [] };
    }
    const cap = memory.remainingKcal;
    const sodiumTight = Boolean(memory.eaten.sodiumKnown && memory.eaten.sodiumMg >= 2000);
    const suggestion = suggestMeal({
      budgetKcal: cap,
      avoid: memory.avoid,
      goal: memory.profile?.goal || "maintain",
      sodiumTight,
      needProduce: memory.eaten.produceG < 400,
      needProtein: memory.profile?.goal === "gain",
      profile: memory.profile,
    });
    const verified = verifyPlan(suggestion, memory.avoid);
    const annotated = annotatePlan({ ...suggestion, ...verified }, memory.profile, memory.avoid);
    const together = round1((memory.eaten.kcal || 0) + (annotated.totalKcal || 0));
    const delta = round1(together - memory.needs.targetKcal);
    memory.plan = {
      ...annotated,
      capKcal: cap,
      eatenKcal: memory.eaten.kcal,
      togetherKcal: together,
      deltaKcal: delta,
      targetKcal: memory.needs.targetKcal,
      tdeeKcal: memory.needs.tdeeKcal,
      adjustmentKcal: memory.needs.adjustmentKcal,
      comparison: `已記錄 ${memory.eaten.kcal} kcal。這份餐單 ${annotated.totalKcal} kcal，蛋白質 ${annotated.proteinG} g、碳水 ${annotated.carbohydrateG} g、脂肪 ${annotated.fatG} g。合計 ${together} kcal，對課堂目標 ${memory.needs.targetKcal} kcal（TDEE ${memory.needs.tdeeKcal}，調整 ${memory.needs.adjustmentKcal}）相差 ${delta} kcal。數字只來自資料列。`,
      comparisonEn: `Logged intake is ${memory.eaten.kcal} kcal. This plan is ${annotated.totalKcal} kcal, protein ${annotated.proteinG} g, carbohydrate ${annotated.carbohydrateG} g, fat ${annotated.fatG} g. Together ${together} kcal, which is ${delta} kcal versus the classroom target ${memory.needs.targetKcal} kcal (TDEE ${memory.needs.tdeeKcal}, adjustment ${memory.needs.adjustmentKcal}). Numbers come only from cited rows.`,
      passedChecks: false,
    };
    return memory.plan;
  }
  if (tool === "check_constraints") {
    if (memory.plan) {
      const verified = verifyPlan(memory.plan, memory.avoid);
      memory.plan = { ...memory.plan, ...verified, passedChecks: false };
    }
    const result = checkConstraints(memory);
    if (memory.plan) memory.plan.passedChecks = result.planPassed && memory.plan.totalKcal <= (memory.remainingKcal ?? 0) + 0.05;
    memory.checks = result;
    recompute(memory);
    return result;
  }
  return { ok: false, error: "unknown-tool" };
}

export { proposalForLabel };
