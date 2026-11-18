export const LIMITS = { maxToolCalls: 8, maxLoops: 8 };

export const TOOLS = {
  recognize_dish: { agent: "nutrition", network: "xai-vision-if-configured", writes: ["pending"] },
  lookup_meal: { agent: "nutrition", network: "usda-only-if-configured", writes: ["meals"] },
  estimate_needs: { agent: "nutrition", network: false, writes: ["needs"] },
  recommend_intake: { agent: "nutrition", network: false, writes: ["intakeRecommendation"] },
  check_constraints: { agent: "nutrition", network: false, writes: ["checks"] },
  suggest_meal: { agent: "nutrition", network: false, writes: ["plan"] },
  training_guidance: { agent: "training", network: false, writes: ["training"] },
  save_profile: { agent: "controller", network: false, writes: ["profile"] },
};

const SCHEMAS = {
  recognize_dish: { required: [], properties: { note: { type: "string" } }, forbidden: [] },
  lookup_meal: { required: ["name", "grams"], properties: { name: { type: "string" }, grams: { type: "number" }, foodId: { type: "string" } }, forbidden: ["energyKcal", "calories", "proteinG"] },
  estimate_needs: { required: [], properties: {}, forbidden: ["targetKcal", "bmrKcal"] },
  recommend_intake: { required: [], properties: {}, forbidden: ["targetKcal", "proteinG", "tip"] },
  check_constraints: { required: [], properties: {}, forbidden: [] },
  suggest_meal: { required: [], properties: {}, forbidden: ["items", "calories"] },
  training_guidance: { required: [], properties: {}, forbidden: ["sets", "reps"] },
  save_profile: { required: [], properties: { weightKg: { type: "number" }, heightCm: { type: "number" }, age: { type: "number" }, sex: { type: "string" }, activity: { type: "string" }, goal: { type: "string" }, targetWeightKg: { type: "number" } }, forbidden: ["targetKcal"] },
};

export function toolCatalog() {
  return Object.entries(SCHEMAS).map(([name, schema]) => ({
    name,
    agent: TOOLS[name].agent,
    network: TOOLS[name].network,
    writes: TOOLS[name].writes,
    inputSchema: schema,
  }));
}

export function bindCall(choice, context) {
  const tool = choice?.tool;
  if (!TOOLS[tool]) return { ok: false, errors: ["unknown-tool"] };
  const schema = SCHEMAS[tool];
  const input = {};
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (choice.input?.[key] == null) continue;
    const value = choice.input[key];
    if (spec.type === "number" && !Number.isFinite(Number(value))) continue;
    if (spec.type === "string") input[key] = String(value).slice(0, 160);
    else input[key] = Number(value);
  }
  for (const key of schema.forbidden) {
    if (choice.input && key in choice.input) input[`stripped:${key}`] = true;
  }
  if (tool === "lookup_meal") {
    const grounded = groundLookup(input, context);
    if (!grounded.ok) return grounded;
    return { ok: true, tool, agent: TOOLS[tool].agent, input: grounded.input };
  }
  if (tool === "save_profile") {
    const fromUser = { ...(context.formProfile || {}), ...(context.parsed?.profile || {}) };
    const safe = {};
    for (const key of Object.keys(schema.properties)) {
      if (fromUser[key] != null) safe[key] = fromUser[key];
    }
    if (Object.keys(safe).length === 0) return { ok: false, errors: ["profile-not-in-user-text"] };
    return { ok: true, tool, agent: TOOLS[tool].agent, input: safe };
  }
  return { ok: true, tool, agent: TOOLS[tool].agent, input };
}

function groundLookup(input, context) {
  const pending = context.memory.pending;
  const text = context.message || "";
  const gramsFromUser = context.parsed?.grams;
  const nameFromUser = context.parsed?.foodQuery;
  let name = nameFromUser || null;
  let grams = gramsFromUser;
  let foodId = null;
  if (pending && (context.parsed?.intents.confirm || gramsFromUser || /就係|用|確認|confirm/i.test(text))) {
    name = nameFromUser && nameFromUser.length > 1 ? nameFromUser : pending.name;
    foodId = pending.kind === "vision" ? null : (nameFromUser && nameFromUser.length > 1 ? null : pending.foodId);
    if (grams == null && pending.kind === "vision" && pending.estimatedGrams != null) grams = pending.estimatedGrams;
    if (grams == null) return { ok: false, errors: ["grams-not-confirmed"] };
  }
  if (!name) return { ok: false, errors: ["food-name-not-in-user-text"] };
  if (grams == null) return { ok: false, errors: ["grams-not-in-user-text"] };
  if (grams <= 0 || grams > 2000) return { ok: false, errors: ["grams-out-of-range"] };
  return { ok: true, input: { name, grams, foodId, confirmed: true } };
}

export function validateResult(tool, result) {
  if (!result || typeof result !== "object") return { ok: false, errors: ["result-not-object"] };
  if (tool === "recognize_dish") {
    if (!result.ok) return { ok: true, result };
    if (result.nutrients?.energyKcal == null || !result.sourceId) return { ok: false, errors: ["vision-missing-nutrients"] };
    return { ok: true, result };
  }
  if (tool === "lookup_meal" && result.ok) {
    if (result.nutrients?.energyKcal == null || !result.sourceId) return { ok: false, errors: ["lookup-missing-source"] };
  }
  if (tool === "suggest_meal" && Array.isArray(result.items)) {
    for (const item of result.items) {
      if (!item.sourceId || item.nutrients?.energyKcal == null) return { ok: false, errors: ["suggestion-not-sourced"] };
    }
  }
  return { ok: true, result };
}
