const NAMES = { controller: "控制器", nutrition: "營養 agent", training: "訓練 agent", places: "餐廳 agent" };

export function agentName(id) {
  return NAMES[id] || "控制器";
}

function nutrientLine(nutrients, missing = []) {
  const sodium = nutrients.sodiumMg == null || missing.includes("sodium") ? "鈉：資料沒有，不估算" : `鈉 ${nutrients.sodiumMg} mg`;
  return `${nutrients.energyKcal} kcal，蛋白質 ${nutrients.proteinG ?? "缺"} g，碳水 ${nutrients.carbohydrateG ?? "缺"} g，脂肪 ${nutrients.fatG ?? "缺"} g，${sodium}`;
}

export function observationText(tool, result) {
  if (tool === "recognize_dish") {
    if (!result.ok) return `認菜失敗：${result.reason || "模型沒有返回菜名"}。請在對話打菜名和克數。`;
    const proposal = result.proposal
      ? (result.proposal.exact
        ? `資料列名稱是「${result.proposal.name}」（${result.proposal.sourceId}）。請確認克數，我先不計熱量。`
        : `類別「${result.label}」不是資料列「${result.proposal.name}」本身。若要用這列，請回覆確認和克數。`)
      : "本地表沒有對應列。請打一個表上有的菜名和克數。";
    return `只認到菜名：${result.label}（信心 ${Math.round(result.score * 100)}%）。${proposal}`;
  }
  if (tool === "lookup_meal") {
    if (!result.ok) return result.status === "ambiguous"
      ? `「${result.name}」對到多於一列，我不選熱量。`
      : `資料庫沒有「${result.name}」的營養列，所以沒有卡路里數字。`;
    return `${result.name} ${result.grams} 克：${nutrientLine(result.nutrients, result.missing)}。來源 ${result.source} ${result.sourceId}。`;
  }
  if (tool === "estimate_needs") {
    if (!result.ok) return `不能計算預算：${(result.errors || []).join("、") || "資料不足"}。沒有改用一個較低或假設的熱量。`;
    return `BMR ${result.bmrKcal} kcal，PAL ${result.pal}，TDEE ${result.tdeeKcal} kcal，課堂目標 ${result.targetKcal} kcal（調整 ${result.adjustmentKcal} kcal）。目標體重 ${result.targetWeightKg} kg。`;
  }
  if (tool === "training_guidance") return `${result.text} ${result.statedNote || ""} ${result.muscleNote}`;
  if (tool === "suggest_meal") {
    if (!result.items?.length) return result.reason || "沒有可推薦的菜式。";
    const lines = result.items.map((item) => `${item.name} ${item.grams} 克，${item.nutrients.energyKcal} kcal，${item.sourceId}，${item.portionLabel}`);
    return `下一餐建議合計 ${result.totalKcal} kcal，上限 ${result.capKcal} kcal。${lines.join("；")}。這不是餐廳菜單。`;
  }
  if (tool === "check_constraints") {
    const advice = (result.advice || []).join("");
    const head = result.planPassed ? "餐單通過預算和忌口檢查。" : "餐單尚未通過檢查，不會把它當成完成。";
    return `${head} ${advice}`.trim();
  }
  if (tool === "find_places") {
    if (!result.ok) return result.reason;
    const names = result.places.map((place) => `${place.name}${place.cuisine ? `（cuisine: ${place.cuisine}）` : ""} ${place.url}`).join("；");
    return `${result.reason} ${names}。沒有為這些店填卡路里或菜單。`.trim();
  }
  if (tool === "save_profile") {
    return result.complete ? "身體和目標資料已寫進記憶，欄位足夠計算預算。" : `已記下部分資料，還缺：${(result.errors || []).join("、") || "一些欄位"}。`;
  }
  return "工具已返回。";
}

export function askForMissing(memory, parsed) {
  if (memory.pending && parsed.grams == null) return "請確認菜名，並告訴我克數。確認之前我不查熱量。";
  if ((parsed.intents.calories || parsed.intents.plan || parsed.profile.goal) && !memory.needs) {
    return "要計每日預算，請在對話提供：體重 kg、身高 cm、年齡、男或女、活動量（少動／中度／高活動）、目標（減脂／增肌／維持）和目標體重。";
  }
  if (parsed.intents.places && !memory.places?.ok) return "查附近餐廳前，請允許定位，或輸入地區，例如：附近 地區：九龍塘。";
  return "";
}
