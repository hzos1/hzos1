export function deterministicStep(ctx) {
  const { memory, parsed, image, done } = ctx;
  if (image && !done.recognize_dish) {
    return { tool: "recognize_dish", agent: "nutrition", thought: "Photo attached. Call multimodal AI (English) for dish and nutrient estimates; do not use the local name table.", input: {} };
  }
  if (memory.pending && !done.lookup_meal && (parsed.intents.confirm || parsed.grams != null)) {
    const thought = memory.pending.kind === "vision"
      ? "User confirmed the vision estimate or grams; log the AI nutrition result."
      : "User confirmed the dish name or grams; look up the nutrition table next.";
    return { tool: "lookup_meal", agent: "nutrition", thought, input: {} };
  }
  if (parsed.intents.profile && !done.save_profile) {
    return { tool: "save_profile", agent: "controller", thought: "對話裡有身體或目標資料。缺的欄位保持空白。", input: parsed.profile };
  }
  if (parsed.intents.training && !done.training_guidance) {
    return { tool: "training_guidance", agent: "training", thought: "訓練次數改由公開指引工具回答，不編成一套訓練課。", input: {} };
  }
  const wantsBudget = parsed.intents.calories || parsed.intents.plan || (parsed.intents.profile && parsed.profile.goal);
  if (wantsBudget && !memory.needs && !done.estimate_needs) {
    return { tool: "estimate_needs", agent: "nutrition", thought: "用 Mifflin–St Jeor × FAO PAL 計算每日預算。公式由工具計算。", input: {} };
  }
  if (!memory.pending && parsed.grams != null && parsed.foodQuery && !done.lookup_meal) {
    return { tool: "lookup_meal", agent: "nutrition", thought: "句子裡有菜名和克數，查本地營養表。", input: {} };
  }
  if (parsed.intents.plan && memory.needs && !memory.needs.rejected && !done.suggest_meal) {
    return { tool: "suggest_meal", agent: "nutrition", thought: "用檔案和資料表組一日餐單。每餐的克數、熱量和營養素只來自已引用的列，不猜餐廳或卡路里。", input: {} };
  }
  if (!done.check_constraints && (done.suggest_meal || (done.lookup_meal && (parsed.intents.calories || parsed.intents.plan)))) {
    return { tool: "check_constraints", agent: "nutrition", thought: "用 WHO 和衞生防護中心的公開原則做約束檢查。", input: {} };
  }
  return { stop: true, agent: "controller", thought: "這一輪規劃結束。還缺的資料會在回覆裡問，不會填假數字。" };
}
