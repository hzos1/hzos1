import { round1 } from "./foods.js";

export const GOAL = "記錄餐次、算出剩餘熱量，並產出通過約束檢查的餐單。成敗看這三項世界狀態，不看一句像營養師的話。";

export function createMemory() {
  return {
    goal: GOAL,
    profile: null,
    avoid: [],
    meals: [],
    needs: null,
    eaten: emptyEaten(),
    remainingKcal: null,
    intakeComplete: true,
    plan: null,
    checks: null,
    places: null,
    training: null,
    pending: null,
    warnings: [],
    goalStatus: { mealsRecorded: false, remainingKcal: null, planPassed: false, intakeComplete: true, achieved: false },
  };
}

function emptyEaten() {
  return { kcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, sodiumMg: 0, sodiumKnown: true, proteinKnown: true, fatKnown: true, produceG: 0, fruitItems: 0, vegItems: 0 };
}

export function recompute(memory) {
  const eaten = emptyEaten();
  for (const meal of memory.meals) {
    if (meal.status !== "resolved") continue;
    const row = meal.nutrients;
    eaten.kcal += row.energyKcal || 0;
    eaten.proteinG += row.proteinG || 0;
    eaten.carbohydrateG += row.carbohydrateG || 0;
    eaten.fatG += row.fatG || 0;
    if (row.proteinG == null) eaten.proteinKnown = false;
    if (row.fatG == null) eaten.fatKnown = false;
    if (row.sodiumMg == null) eaten.sodiumKnown = false;
    else eaten.sodiumMg += row.sodiumMg;
    if (meal.produce && !meal.starchyRoot) {
      eaten.produceG += meal.grams;
      if (meal.group === "fruit") eaten.fruitItems += 1;
      if (meal.group === "vegetable") eaten.vegItems += 1;
    }
  }
  for (const key of ["kcal", "proteinG", "carbohydrateG", "fatG", "sodiumMg", "produceG"]) eaten[key] = round1(eaten[key]);
  memory.eaten = eaten;
  memory.intakeComplete = memory.meals.every((meal) => meal.status === "resolved");
  memory.remainingKcal = memory.needs && !memory.needs.rejected ? round1(memory.needs.targetKcal - eaten.kcal) : null;
  const mealsRecorded = memory.meals.length > 0 && memory.meals.every((meal) => meal.status === "resolved" || meal.status === "missing");
  const planPassed = Boolean(memory.plan?.passedChecks);
  memory.goalStatus = {
    mealsRecorded,
    remainingKcal: memory.remainingKcal,
    planPassed,
    intakeComplete: memory.intakeComplete,
    achieved: Boolean(memory.needs && !memory.needs.rejected && memory.remainingKcal != null && planPassed && memory.intakeComplete),
  };
  return memory;
}

export function snapshot(memory) {
  return {
    meals: memory.meals.map((meal) => ({ name: meal.name, grams: meal.grams, status: meal.status, kcal: meal.nutrients?.energyKcal ?? null, sourceId: meal.sourceId || null })),
    eatenKcal: memory.eaten.kcal,
    remainingKcal: memory.remainingKcal,
    targetWeightKg: memory.profile?.targetWeightKg ?? null,
    goal: memory.profile?.goal ?? null,
    planPassed: Boolean(memory.plan?.passedChecks),
    intakeComplete: memory.intakeComplete,
    achieved: memory.goalStatus.achieved,
  };
}
