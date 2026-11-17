import { FOODS, foodById, nutrientsFor, round1 } from "./foods.js";

function portionOf(food) {
  const cited = (food.portions || []).find((portion) => portion.grams >= 40 && portion.grams <= 250);
  if (cited) return { grams: cited.grams, label: cited.label, cited: true };
  return { grams: 100, label: "100 g，資料表的每 100 克基準，不是相片估出的份量", cited: false };
}

function itemFrom(food, portion) {
  return {
    foodId: food.id,
    name: food.name,
    grams: portion.grams,
    portionLabel: portion.label,
    portionCited: portion.cited,
    source: food.source,
    sourceId: food.sourceId,
    group: food.group,
    produce: Boolean(food.produce) && !food.starchyRoot,
    avoid: food.avoid || [],
    nutrients: nutrientsFor(food, portion.grams),
  };
}

function allowedFoods(avoid) {
  const blocked = new Set(avoid || []);
  return FOODS.filter((food) => !(food.avoid || []).some((tag) => blocked.has(tag)));
}

export function suggestMeal({ budgetKcal, avoid = [], goal = "maintain", sodiumTight = false, needProduce = false, needProtein = false }) {
  if (!(budgetKcal > 0)) {
    return { ok: true, items: [], totalKcal: 0, reason: "剩餘預算不是正數，所以不推薦食物。", reasonEn: "The remaining budget is not positive, so no food is suggested.", passedChecks: false };
  }
  let pool = allowedFoods(avoid);
  if (sodiumTight) {
    pool = pool.filter((food) => {
      const portion = portionOf(food);
      const sodium = nutrientsFor(food, portion.grams).sodiumMg;
      return sodium != null && sodium <= 200;
    });
  }
  const groups = {
    staple: pool.filter((food) => food.group === "grain"),
    protein: pool.filter((food) => food.group === "protein"),
    vegetable: pool.filter((food) => food.group === "vegetable" && food.produce),
    fruit: pool.filter((food) => food.group === "fruit"),
  };
  const candidates = [];
  const consider = (foods) => {
    const items = foods.map((food) => itemFrom(food, portionOf(food)));
    const total = round1(items.reduce((sum, item) => sum + item.nutrients.energyKcal, 0));
    if (total > budgetKcal + 0.05) return;
    if (needProduce && !items.some((item) => item.produce)) return;
    if (needProtein && !items.some((item) => item.group === "protein")) return;
    candidates.push({ items, totalKcal: total });
  };
  for (const staple of groups.staple.slice(0, 8)) {
    for (const protein of groups.protein.slice(0, 8)) {
      for (const vegetable of groups.vegetable.slice(0, 6)) consider([staple, protein, vegetable]);
    }
  }
  if (candidates.length === 0) {
    for (const protein of groups.protein.slice(0, 10)) {
      for (const vegetable of groups.vegetable.slice(0, 8)) consider([protein, vegetable]);
    }
  }
  if (candidates.length === 0) {
    for (const food of pool.slice(0, 30)) consider([food]);
  }
  if (candidates.length === 0) {
    return { ok: true, items: [], totalKcal: 0, reason: "資料表裡沒有能放進剩餘預算、又符合忌口的菜式。", reasonEn: "No cited row fits the remaining budget and the avoid list.", passedChecks: false };
  }
  candidates.sort((a, b) => {
    const aProduce = a.items.some((item) => item.produce) ? 1 : 0;
    const bProduce = b.items.some((item) => item.produce) ? 1 : 0;
    if (goal === "lose" && aProduce !== bProduce) return bProduce - aProduce;
    return Math.abs(budgetKcal - a.totalKcal) - Math.abs(budgetKcal - b.totalKcal);
  });
  const best = candidates[0];
  return {
    ok: true,
    items: best.items,
    totalKcal: best.totalKcal,
    reason: "只從已引用的資料列組合，總熱量不超過這一餐的上限。",
    reasonEn: "Combined only from cited rows. Total energy does not exceed this meal's cap.",
    passedChecks: false,
  };
}

export function verifyPlan(plan, avoid = []) {
  if (!plan) return { ok: false, unverified: true, avoidViolation: false };
  const blocked = new Set(avoid);
  let unverified = false;
  let avoidViolation = false;
  const items = [];
  for (const item of plan.items || []) {
    const food = foodById(item.foodId);
    if (!food) {
      unverified = true;
      continue;
    }
    if ((food.avoid || []).some((tag) => blocked.has(tag))) avoidViolation = true;
    const nutrients = nutrientsFor(food, item.grams);
    if (nutrients.energyKcal == null) unverified = true;
    items.push({ ...item, name: food.name, source: food.source, sourceId: food.sourceId, nutrients });
  }
  const totalKcal = round1(items.reduce((sum, item) => sum + (item.nutrients.energyKcal || 0), 0));
  return { ok: !unverified && !avoidViolation, items, totalKcal, unverified, avoidViolation };
}
