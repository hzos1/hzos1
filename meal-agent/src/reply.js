const NAMES = {
  zh: { controller: "控制器", nutrition: "營養 agent", training: "訓練 agent" },
  en: { controller: "Controller", nutrition: "Nutrition agent", training: "Training agent" },
};

export function agentName(id, lang = "zh") {
  const table = NAMES[lang === "en" ? "en" : "zh"];
  return table[id] || table.controller;
}

function nutrientLine(nutrients, missing = [], lang = "zh") {
  const sodium = nutrients.sodiumMg == null || missing.includes("sodium")
    ? (lang === "en" ? "sodium: not in the row, not estimated" : "鈉：資料沒有，不估算")
    : (lang === "en" ? `sodium ${nutrients.sodiumMg} mg` : `鈉 ${nutrients.sodiumMg} mg`);
  if (lang === "en") {
    return `${nutrients.energyKcal} kcal, protein ${nutrients.proteinG ?? "missing"} g, carbohydrate ${nutrients.carbohydrateG ?? "missing"} g, fat ${nutrients.fatG ?? "missing"} g, ${sodium}`;
  }
  return `${nutrients.energyKcal} kcal，蛋白質 ${nutrients.proteinG ?? "缺"} g，碳水 ${nutrients.carbohydrateG ?? "缺"} g，脂肪 ${nutrients.fatG ?? "缺"} g，${sodium}`;
}

function textOf(result, lang, zhKey, enKey) {
  if (lang === "en" && result?.[enKey]) return result[enKey];
  return result?.[zhKey] || "";
}

export function observationText(tool, result, lang = "zh") {
  const en = lang === "en";
  if (tool === "recognize_dish") {
    if (!result.ok) {
      const reason = en ? (result.reasonEn || result.reason || "The multimodal model returned no analysis") : (result.reason || "多模態模型沒有返回分析");
      return en ? `Photo analysis failed: ${reason}` : `相片分析失敗：${reason}`;
    }
    const conf = result.confidence != null ? (en ? ` Confidence ${Math.round(result.confidence * 100)}%.` : ` 信心 ${Math.round(result.confidence * 100)}%。`) : "";
    const notes = en ? (result.notesEn || result.notes || "") : (result.notes || "");
    return en
      ? `Vision AI estimate for “${result.nameEn || result.name}” (~${result.estimatedGrams} g): ${nutrientLine(result.nutrients, [], lang)}. Source ${result.sourceId}.${conf} ${notes} Confirm the name/grams to log it.`
      : `多模態 AI 估算「${result.name}」（約 ${result.estimatedGrams} 克）：${nutrientLine(result.nutrients, [], lang)}。來源 ${result.sourceId}。${conf}${notes ? ` ${notes}` : ""} 請確認菜名／克數後記錄。`;
  }
  if (tool === "lookup_meal") {
    if (!result.ok) return result.status === "ambiguous"
      ? (en ? `“${result.name}” matches more than one row, so there is no calorie number.` : `「${result.name}」對到多於一列，我不選熱量。`)
      : (en ? `The database has no nutrient row for “${result.name}”, so there is no calorie number.` : `資料庫沒有「${result.name}」的營養列，所以沒有卡路里數字。`);
    const via = result.vision
      ? (en ? "Vision AI estimate" : "多模態 AI 估算")
      : (en ? `Source ${result.source}` : `來源 ${result.source}`);
    return en
      ? `${result.name}, ${result.grams} g: ${nutrientLine(result.nutrients, result.missing, lang)}. ${via} ${result.sourceId}.`
      : `${result.name} ${result.grams} 克：${nutrientLine(result.nutrients, result.missing, lang)}。${via} ${result.sourceId}。`;
  }
  if (tool === "estimate_needs") {
    if (!result.ok) return en
      ? `Cannot calculate a budget: ${(result.errors || []).join(", ") || "not enough data"}. No lower or assumed calorie target was substituted.`
      : `不能計算預算：${(result.errors || []).join("、") || "資料不足"}。沒有改用一個較低或假設的熱量。`;
    return en
      ? `BMR ${result.bmrKcal} kcal, PAL ${result.pal}, TDEE ${result.tdeeKcal} kcal, classroom target ${result.targetKcal} kcal (adjustment ${result.adjustmentKcal} kcal). Target weight ${result.targetWeightKg} kg.`
      : `BMR ${result.bmrKcal} kcal，PAL ${result.pal}，TDEE ${result.tdeeKcal} kcal，課堂目標 ${result.targetKcal} kcal（調整 ${result.adjustmentKcal} kcal）。目標體重 ${result.targetWeightKg} kg。`;
  }
  if (tool === "recommend_intake") {
    if (!result.ok) return en
      ? (result.reasonEn || result.reason || "Could not build a daily intake recommendation.")
      : (result.reason || "未能建立每日攝取建議。");
    const tip = en ? result.tipEn : result.tip;
    return en
      ? `Daily target ${result.target.energyKcal} kcal (protein ${result.target.proteinG} g, carbs ${result.target.carbohydrateG} g, fat ${result.target.fatG} g). Weight ${result.weightKg} → ${result.targetWeightKg} kg. Logged ${result.eaten.energyKcal} kcal; ${result.remaining.energyKcal} kcal left. ${tip}`
      : `每日目標 ${result.target.energyKcal} kcal（蛋白質 ${result.target.proteinG} g、碳水 ${result.target.carbohydrateG} g、脂肪 ${result.target.fatG} g）。體重 ${result.weightKg} → ${result.targetWeightKg} kg。已記錄 ${result.eaten.energyKcal} kcal，剩餘 ${result.remaining.energyKcal} kcal。${tip}`;
  }
  if (tool === "training_guidance") return `${textOf(result, lang, "text", "textEn")} ${textOf(result, lang, "statedNote", "statedNoteEn")} ${textOf(result, lang, "muscleNote", "muscleNoteEn")}`.trim();
  if (tool === "suggest_meal") {
    if (!result.items?.length) return textOf(result, lang, "reason", "reasonEn") || (en ? "No dish to suggest." : "沒有可推薦的菜式。");
    if (result.meals?.length) {
      const blocks = result.meals.map((meal) => {
        const foods = (meal.items || []).map((item) => en
          ? `${item.nameEn || item.name} ${item.grams} g, ${item.nutrients.energyKcal} kcal, protein ${item.nutrients.proteinG} g, carbohydrate ${item.nutrients.carbohydrateG} g, fat ${item.nutrients.fatG} g, source ${item.sourceId}`
          : `${item.name} ${item.grams} 克，${item.nutrients.energyKcal} kcal，蛋白質 ${item.nutrients.proteinG} g，碳水 ${item.nutrients.carbohydrateG} g，脂肪 ${item.nutrients.fatG} g，來源 ${item.sourceId}`);
        const title = en ? meal.en : meal.zh;
        const reason = en ? meal.reasonEn : meal.reason;
        const prep = en ? meal.prepEn : meal.prep;
        const swap = en ? meal.swapEn : meal.swap;
        return `${title} (${meal.totalKcal} kcal)\n${foods.join("\n")}\n${reason || ""}\n${prep || ""}\n${swap || ""}`;
      });
      const head = en ? (result.profileLineEn || "") : (result.profileLine || "");
      const compare = en ? (result.comparisonEn || "") : (result.comparison || "");
      return [head, ...blocks, compare].filter(Boolean).join("\n");
    }
    const lines = result.items.map((item) => en
      ? `${item.name} ${item.grams} g, ${item.nutrients.energyKcal} kcal, ${item.sourceId}, ${item.portionLabel}`
      : `${item.name} ${item.grams} 克，${item.nutrients.energyKcal} kcal，${item.sourceId}，${item.portionLabel}`);
    return en
      ? `Plan total ${result.totalKcal} kcal. ${lines.join("; ")}. Numbers come from cited rows.`
      : `餐單合計 ${result.totalKcal} kcal。${lines.join("；")}。數字來自資料列。`;
  }
  if (tool === "check_constraints") {
    const advice = en ? (result.adviceEn || result.advice || []) : (result.advice || []);
    const head = result.planPassed
      ? (en ? "The meal passed the budget and avoid-list checks." : "餐單通過預算和忌口檢查。")
      : (en ? "The meal has not passed the checks, so it is not treated as done." : "餐單尚未通過檢查，不會把它當成完成。");
    return `${head} ${advice.join("")}`.trim();
  }
  if (tool === "save_profile") {
    return result.complete
      ? (en ? "The body and goal fields are stored and enough to calculate a budget." : "身體和目標資料已寫進記憶，欄位足夠計算預算。")
      : (en ? `Partial data stored. Still missing: ${(result.errors || []).join(", ") || "some fields"}.` : `已記下部分資料，還缺：${(result.errors || []).join("、") || "一些欄位"}。`);
  }
  return en ? "The tool returned." : "工具已返回。";
}

export function askForMissing(memory, parsed, lang = "zh") {
  const en = lang === "en";
  if (memory.pending?.kind === "vision") {
    return en
      ? "Confirm or edit the dish name and grams, then I will log the vision AI nutrition estimate."
      : "請確認或修改菜名和克數，我會把多模態 AI 的營養估算寫進今日餐點。";
  }
  if (memory.pending && parsed.grams == null) return en ? "Confirm the dish name and tell me the grams. I will not look up calories before that." : "請確認菜名，並告訴我克數。確認之前我不查熱量。";
  if ((parsed.intents.calories || parsed.intents.plan || parsed.profile.goal) && !memory.needs) {
    return en
      ? "To calculate a daily budget, the saved profile needs weight kg, height cm, age, sex, activity, goal, and target weight."
      : "要計每日預算，請在對話提供：體重 kg、身高 cm、年齡、男或女、活動量（少動／中度／高活動）、目標（減脂／增肌／維持）和目標體重。";
  }
  return "";
}
