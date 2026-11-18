import { round1 } from "./foods.js";

/** Build daily macro targets from classroom calorie target + body weight. */
export function macroTargets(targetKcal, weightKg) {
  const kcal = Number(targetKcal);
  const weight = Number(weightKg);
  if (!(kcal > 0) || !(weight > 0)) return null;
  const proteinG = round1(Math.max(0.83 * weight, (kcal * 0.15) / 4));
  const fatG = round1((kcal * 0.25) / 9);
  const carbG = round1(Math.max(0, (kcal - proteinG * 4 - fatG * 9) / 4));
  return {
    energyKcal: round1(kcal),
    proteinG,
    carbohydrateG: carbG,
    fatG,
    fiberG: 25,
    sodiumMg: 2000,
  };
}

function tipFor({ goal, gapKg, remaining, mealsLogged }) {
  const rem = remaining.energyKcal;
  if (mealsLogged === 0) {
    return {
      tip: `今日尚未記錄餐點。建議全日約 ${remaining.energyKcal} kcal（已按體重與目標體重方向調整）。先吃蛋白質與蔬果，再按剩餘熱量安排正餐。`,
      tipEn: `No meals logged yet. Aim for about ${remaining.energyKcal} kcal today based on your weight and target-weight direction. Lead with protein and produce, then fill the rest of the day inside that budget.`,
    };
  }
  if (rem <= 0) {
    return {
      tip: `已記錄熱量已達或超過今日目標。其餘時間以清水、蔬菜或無額外熱量飲料為主，不要再加高熱量小食。`,
      tipEn: `Logged energy already meets or exceeds today’s target. Prefer water, vegetables, or zero-calorie drinks for the rest of the day instead of more high-energy snacks.`,
    };
  }
  if (goal === "lose" && gapKg < 0) {
    return {
      tip: `距離目標體重約 ${Math.abs(gapKg)} kg。今日還剩約 ${rem} kcal、蛋白質 ${Math.max(0, remaining.proteinG)} g。下一餐優先蛋白質與蔬菜，控制油與甜食。`,
      tipEn: `About ${Math.abs(gapKg)} kg above your target weight. Roughly ${rem} kcal and ${Math.max(0, remaining.proteinG)} g protein remain today. Prioritise protein and vegetables at the next meal; keep oils and sweets low.`,
    };
  }
  if (goal === "gain" && gapKg > 0) {
    return {
      tip: `距離目標體重還差約 ${gapKg} kg。今日還剩約 ${rem} kcal。下一餐可加入含碳水的主食與蛋白質，避免只靠油脂把熱量補滿。`,
      tipEn: `About ${gapKg} kg below your target weight. Roughly ${rem} kcal remain today. Add a carbohydrate staple plus protein at the next meal instead of filling the budget with fat alone.`,
    };
  }
  return {
    tip: `今日還剩約 ${rem} kcal（蛋白質 ${Math.max(0, remaining.proteinG)} g、碳水 ${Math.max(0, remaining.carbohydrateG)} g、脂肪 ${Math.max(0, remaining.fatG)} g）。按已記錄餐點調整下一餐份量即可。`,
    tipEn: `About ${rem} kcal remain today (protein ${Math.max(0, remaining.proteinG)} g, carbs ${Math.max(0, remaining.carbohydrateG)} g, fat ${Math.max(0, remaining.fatG)} g). Size the next meal from what you already logged.`,
  };
}

export function buildDailyIntakeRecommendation(memory) {
  const needs = memory?.needs;
  const profile = memory?.profile;
  if (!needs?.ok || needs.rejected) {
    return {
      ok: false,
      reason: "還沒有可用的每日熱量目標。",
      reasonEn: "No usable daily energy target yet.",
    };
  }
  if (profile?.weightKg == null || profile?.targetWeightKg == null) {
    return {
      ok: false,
      reason: "需要體重和目標體重才能推薦每日攝取。",
      reasonEn: "Weight and target weight are required for a daily intake recommendation.",
    };
  }

  const target = macroTargets(needs.targetKcal, profile.weightKg);
  const eaten = memory.eaten || {};
  const remaining = {
    energyKcal: round1(target.energyKcal - (eaten.kcal || 0)),
    proteinG: round1(target.proteinG - (eaten.proteinG || 0)),
    carbohydrateG: round1(target.carbohydrateG - (eaten.carbohydrateG || 0)),
    fatG: round1(target.fatG - (eaten.fatG || 0)),
  };
  const mealsLogged = (memory.meals || []).filter((meal) => meal.status === "resolved").length;
  const gapKg = round1(profile.targetWeightKg - profile.weightKg);
  const { tip, tipEn } = tipFor({ goal: profile.goal || needs.goal, gapKg, remaining, mealsLogged });

  return {
    ok: true,
    weightKg: profile.weightKg,
    targetWeightKg: profile.targetWeightKg,
    goal: profile.goal || needs.goal,
    gapKg,
    tdeeKcal: needs.tdeeKcal,
    adjustmentKcal: needs.adjustmentKcal,
    target,
    eaten: {
      energyKcal: eaten.kcal || 0,
      proteinG: eaten.proteinG || 0,
      carbohydrateG: eaten.carbohydrateG || 0,
      fatG: eaten.fatG || 0,
    },
    remaining,
    mealsLogged,
    tip,
    tipEn,
    method: "mifflin-pal-classroom-target + logged-meals + WHO-aligned macro shares",
    citations: [
      ...(needs.citations || []).slice(0, 2),
      "WHO healthy diet: fat about 15–30% of energy; carbohydrate about 45–75%; protein often 10–15% of energy is enough for most adults.",
      "WHO/FAO/UNU 2007: adult safe protein intake about 0.83 g/kg.",
    ],
  };
}
