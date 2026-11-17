import { lookupFood, foodById, nutrientsFor, lookupUsdaLive, proposalForLabel } from "./foods.js";
import { estimateNeeds } from "./needs.js";
import { checkConstraints } from "./health.js";
import { suggestMeal, verifyPlan } from "./suggest.js";
import { findPlaces } from "./places.js";
import { trainingGuidance } from "./training.js";
import { recompute } from "./memory.js";
import { recognizeDish } from "./recognize.js";

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
    const result = await recognizeDish(ctx.image);
    if (result.ok) {
      memory.pending = {
        name: result.proposal?.name || result.label,
        foodId: result.proposal?.foodId || null,
        exact: result.proposal?.exact ?? false,
        label: result.label,
        score: result.score,
      };
    }
    return result;
  }
  if (tool === "lookup_meal") {
    if (!input.confirmed) return { ok: false, error: "confirmation_required", nutrients: null };
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
    const cap = Math.min(memory.remainingKcal, Math.round(memory.needs.targetKcal * 0.4 * 10) / 10);
    const sodiumTight = Boolean(memory.eaten.sodiumKnown && memory.eaten.sodiumMg >= 2000);
    const suggestion = suggestMeal({
      budgetKcal: cap,
      avoid: memory.avoid,
      goal: memory.profile?.goal || "maintain",
      sodiumTight,
      needProduce: memory.eaten.produceG < 400,
      needProtein: memory.profile?.goal === "gain",
    });
    const verified = verifyPlan(suggestion, memory.avoid);
    memory.plan = { ...suggestion, ...verified, capKcal: cap, passedChecks: false };
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
  if (tool === "find_places") {
    const result = await findPlaces({ ...input, consent: input.consent === true }, ctx.fetchImpl);
    memory.places = result;
    return result;
  }
  return { ok: false, error: "unknown-tool" };
}

export { proposalForLabel };
