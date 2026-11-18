import { FOODS, foodById, nutrientsFor, round1 } from "./foods.js";

const GOAL_LABEL = {
  lose: { zh: "減脂 cut", en: "cut" },
  gain: { zh: "增肌 bulk", en: "bulk" },
  maintain: { zh: "維持 maintain", en: "maintain" },
};

function portionOf(food) {
  const cited = (food.portions || []).find((portion) => portion.grams >= 40 && portion.grams <= 250);
  if (cited) return { grams: cited.grams, label: cited.label, labelEn: cited.label, cited: true };
  return { grams: 100, label: "100 g，資料表的每 100 克基準，不是相片估出的份量", labelEn: "100 g, the table's per-100 g basis, not a portion guessed from a photo", cited: false };
}

function itemFrom(food, portion, slot) {
  return {
    foodId: food.id,
    name: food.name,
    nameEn: food.nameEn || food.name,
    grams: portion.grams,
    portionLabel: portion.label,
    portionLabelEn: portion.labelEn || portion.label,
    portionCited: portion.cited,
    source: food.source,
    sourceId: food.sourceId,
    group: food.group,
    produce: Boolean(food.produce) && !food.starchyRoot,
    avoid: food.avoid || [],
    state: food.state || "",
    slot,
    nutrients: nutrientsFor(food, portion.grams),
  };
}

function allowedFoods(avoid) {
  const blocked = new Set(avoid || []);
  return FOODS.filter((food) => !(food.avoid || []).some((tag) => blocked.has(tag)));
}

function sumNutrients(items) {
  const totals = { totalKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0 };
  for (const item of items) {
    totals.totalKcal += item.nutrients?.energyKcal || 0;
    totals.proteinG += item.nutrients?.proteinG || 0;
    totals.carbohydrateG += item.nutrients?.carbohydrateG || 0;
    totals.fatG += item.nutrients?.fatG || 0;
  }
  for (const key of Object.keys(totals)) totals[key] = round1(totals[key]);
  return totals;
}

function slotsFor(budget) {
  if (budget >= 1400) {
    return [
      { id: "breakfast", share: 0.25, zh: "早餐", en: "Breakfast" },
      { id: "lunch", share: 0.35, zh: "午餐", en: "Lunch" },
      { id: "dinner", share: 0.3, zh: "晚餐", en: "Dinner" },
      { id: "snack", share: 0.1, zh: "小食", en: "Snack" },
    ];
  }
  if (budget >= 900) {
    return [
      { id: "breakfast", share: 0.3, zh: "早餐", en: "Breakfast" },
      { id: "lunch", share: 0.4, zh: "午餐", en: "Lunch" },
      { id: "dinner", share: 0.3, zh: "晚餐", en: "Dinner" },
    ];
  }
  return [{ id: "next", share: 1, zh: "下一餐", en: "Next meal" }];
}

function pickCombination({ budgetKcal, pool, goal, needProduce, needProtein, excludeIds }) {
  const available = pool.filter((food) => !excludeIds.has(food.id));
  const groups = {
    staple: available.filter((food) => food.group === "grain"),
    protein: available.filter((food) => food.group === "protein"),
    vegetable: available.filter((food) => food.group === "vegetable" && food.produce),
    fruit: available.filter((food) => food.group === "fruit"),
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
  if (candidates.length === 0 && groups.fruit.length) {
    for (const fruit of groups.fruit.slice(0, 8)) consider([fruit]);
  }
  if (candidates.length === 0) {
    for (const food of available.slice(0, 30)) consider([food]);
  }
  if (candidates.length === 0) return { items: [], totalKcal: 0 };
  candidates.sort((a, b) => {
    const aProduce = a.items.some((item) => item.produce) ? 1 : 0;
    const bProduce = b.items.some((item) => item.produce) ? 1 : 0;
    if (goal === "lose" && aProduce !== bProduce) return bProduce - aProduce;
    return Math.abs(budgetKcal - a.totalKcal) - Math.abs(budgetKcal - b.totalKcal);
  });
  return candidates[0];
}

function swapFor(item, avoid, usedIds) {
  const alt = allowedFoods(avoid).find((food) => food.group === item.group && food.id !== item.foodId && !usedIds.has(food.id));
  if (!alt) {
    return {
      swap: "這一組沒有另一筆符合忌口、又未用過的資料列可換。",
      swapEn: "No other unused cited row in this group fits the avoid list.",
    };
  }
  const portion = portionOf(alt);
  const nutrients = nutrientsFor(alt, portion.grams);
  return {
    swap: `可把「${item.name}」換成「${alt.name}」${portion.grams} 克，${nutrients.energyKcal} kcal，蛋白質 ${nutrients.proteinG} g、碳水 ${nutrients.carbohydrateG} g、脂肪 ${nutrients.fatG} g。來源 ${alt.sourceId}。這不是餐廳菜單。`,
    swapEn: `You can swap “${item.nameEn || item.name}” for “${alt.nameEn || alt.name}”, ${portion.grams} g, ${nutrients.energyKcal} kcal, protein ${nutrients.proteinG} g, carbohydrate ${nutrients.carbohydrateG} g, fat ${nutrients.fatG} g. Source ${alt.sourceId}. This is not a restaurant menu.`,
  };
}

function describeMeal(meal, items, profile, avoid, usedIds) {
  const totals = sumNutrients(items);
  const goal = GOAL_LABEL[profile?.goal] || GOAL_LABEL.maintain;
  const weight = profile?.weightKg != null ? `${profile.weightKg} kg → ${profile.targetWeightKg} kg` : "";
  const days = profile?.trainingDays != null ? profile.trainingDays : null;
  const hasProduce = items.some((item) => item.produce);
  const hasProtein = items.some((item) => item.group === "protein");
  const state = items.map((item) => item.state).find(Boolean) || "見資料列名稱";
  const stateEn = items.map((item) => item.state).find(Boolean) || "as named on the cited row";
  const lead = items[0];
  const swap = lead ? swapFor(lead, avoid, usedIds) : { swap: "", swapEn: "" };
  return {
    ...totals,
    reason: `${meal.zh}用資料列組成，${totals.totalKcal} kcal，不超過這一段 ${meal.capKcal} kcal。對${goal.zh}${weight ? `（${weight}）` : ""}${days != null ? `，檔案寫每週訓練 ${days} 天` : ""}。${hasProduce ? "含非澱粉蔬果。" : ""}${hasProtein ? "含蛋白質列。" : ""}這不是治療餐單。`,
    reasonEn: `${meal.en} is built from cited rows, ${totals.totalKcal} kcal, within this slot's ${meal.capKcal} kcal. It follows the ${goal.en} goal${weight ? ` (${weight})` : ""}${days != null ? `, with ${days} training days on the profile` : ""}. ${hasProduce ? "It includes non-starchy produce. " : ""}${hasProtein ? "It includes a protein row. " : ""}This is not a treatment menu.`,
    prep: `依資料列的狀態處理：${state}。克數是資料表份量或每 100 克基準，不是從相片猜的。`,
    prepEn: `Prepare it as the cited row states: ${stateEn}. The grams are a table portion or the per-100 g basis, not a guess from a photo.`,
    ...swap,
  };
}

function profileLines(profile, avoid) {
  if (profile?.weightKg == null) {
    return {
      profileLine: "沒有完整檔案，所以不假設體重、目標或訓練天數。",
      profileLineEn: "The profile is incomplete, so weight, target, and training days are not assumed.",
    };
  }
  const goal = GOAL_LABEL[profile.goal] || GOAL_LABEL.maintain;
  const avoided = (avoid || []).join(", ") || "none";
  return {
    profileLine: `檔案：${profile.weightKg} kg，目標 ${profile.targetWeightKg} kg，${goal.zh}，活動量 ${profile.activity || "未填"}，每週訓練 ${profile.trainingDays ?? "未填"} 天。忌口：${avoided}。`,
    profileLineEn: `Profile: ${profile.weightKg} kg, target ${profile.targetWeightKg} kg, ${goal.en}, activity ${profile.activity || "not set"}, ${profile.trainingDays ?? "unset"} training days a week. Avoid: ${avoided}.`,
  };
}

export function annotatePlan(plan, profile = {}, avoid = []) {
  const usedIds = new Set((plan.items || []).map((item) => item.foodId));
  const meals = (plan.meals || []).map((meal) => {
    const items = (meal.items || []).filter((item) => item?.nutrients?.energyKcal != null && item.sourceId);
    if (!items.length) return null;
    return { ...meal, items, ...describeMeal(meal, items, profile, avoid, usedIds) };
  }).filter(Boolean);
  const items = meals.flatMap((meal) => meal.items);
  return {
    ...plan,
    ...profileLines(profile, avoid),
    meals,
    items,
    ...sumNutrients(items),
    reason: "一日餐單只從已引用的資料列組合，每段都不超過自己的上限，全天不超過剩餘預算。",
    reasonEn: "The day is combined only from cited rows. Each slot stays inside its cap, and the day stays inside the remaining budget.",
  };
}

export function suggestMeal({ budgetKcal, avoid = [], goal = "maintain", sodiumTight = false, needProduce = false, needProtein = false, profile = null }) {
  if (!(budgetKcal > 0)) {
    return { ok: true, items: [], meals: [], totalKcal: 0, reason: "剩餘預算不是正數，所以不推薦食物。", reasonEn: "The remaining budget is not positive, so no food is suggested.", passedChecks: false };
  }
  let pool = allowedFoods(avoid);
  if (sodiumTight) {
    pool = pool.filter((food) => {
      const portion = portionOf(food);
      const sodium = nutrientsFor(food, portion.grams).sodiumMg;
      return sodium != null && sodium <= 200;
    });
  }
  const slots = slotsFor(budgetKcal);
  const caps = slots.map((slot) => round1(budgetKcal * slot.share));
  const capSum = round1(caps.reduce((sum, cap) => sum + cap, 0));
  if (capSum > budgetKcal) caps[caps.length - 1] = round1(Math.max(0, caps[caps.length - 1] - (capSum - budgetKcal)));
  const excludeIds = new Set();
  const meals = [];
  slots.forEach((slot, index) => {
    const cap = caps[index];
    if (!(cap > 0)) return;
    const picked = pickCombination({
      budgetKcal: cap,
      pool,
      goal,
      needProduce: needProduce && (slot.id === "lunch" || slot.id === "next"),
      needProtein: needProtein && (slot.id === "lunch" || slot.id === "dinner" || slot.id === "next"),
      excludeIds,
    });
    if (!picked.items.length) return;
    const items = picked.items.map((item) => ({ ...item, slot: slot.id }));
    for (const item of items) excludeIds.add(item.foodId);
    meals.push({ slot: slot.id, zh: slot.zh, en: slot.en, capKcal: cap, items });
  });
  while (meals.length > 1 && sumNutrients(meals.flatMap((meal) => meal.items)).totalKcal > budgetKcal + 0.05) meals.pop();
  const draft = { ok: true, meals, items: meals.flatMap((meal) => meal.items), passedChecks: false };
  if (!draft.items.length) {
    return { ok: true, items: [], meals: [], totalKcal: 0, reason: "資料表裡沒有能放進剩餘預算、又符合忌口的菜式。", reasonEn: "No cited row fits the remaining budget and the avoid list.", passedChecks: false };
  }
  return { ...annotatePlan(draft, profile || { goal }, avoid), passedChecks: false };
}

export function verifyPlan(plan, avoid = []) {
  if (!plan) return { ok: false, unverified: true, avoidViolation: false, items: [], meals: [] };
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
    items.push({ ...item, name: food.name, nameEn: food.nameEn || food.name, source: food.source, sourceId: food.sourceId, nutrients, state: food.state || item.state || "" });
  }
  const bySlot = new Map();
  for (const item of items) {
    const key = item.slot || "next";
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key).push(item);
  }
  const meals = (plan.meals || []).map((meal) => ({ ...meal, items: bySlot.get(meal.slot) || [] })).filter((meal) => meal.items.length);
  return { ok: !unverified && !avoidViolation, items, meals, ...sumNutrients(items), unverified, avoidViolation };
}
