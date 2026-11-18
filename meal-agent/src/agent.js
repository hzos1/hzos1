import { createMemory, recompute, snapshot } from "./memory.js";
import { parseMessage } from "./parse.js";
import { validateProfile } from "./needs.js";
import { bindCall, validateResult, LIMITS, TOOLS, toolCatalog } from "./harness.js";
import { deterministicStep } from "./planning.js";
import { executeTool } from "./tools.js";
import { agentName, observationText, askForMissing } from "./reply.js";
import { grokChoose, localChoose, llmStatus } from "./llm.js";

export const DISCLAIMER = "This is a demo and a rough estimate. It is not a medical diagnosis, clinical nutrition therapy, or a professional training plan. Ask a doctor, dietitian, or qualified coach about illness or special needs. It will not place orders or write a treatment menu.";

export function deterministicBrain() {
  return {
    id: "deterministic",
    async choose(ctx) {
      return { ...deterministicStep(ctx), source: "deterministic" };
    },
  };
}

export function autoBrain() {
  return {
    id: "auto",
    async choose(ctx) {
      if (process.env.XAI_API_KEY) {
        try {
          const choice = await grokChoose(ctx, ctx.fetchImpl || fetch);
          if (choice?.tool || choice?.stop) return { ...choice, source: "grok" };
        } catch {
          ctx.modelFailed = true;
          ctx.modelError = "grok-request-failed";
        }
      } else if (!ctx.modelAttempted) {
        ctx.modelAttempted = true;
        try {
          const choice = await localChoose(ctx);
          if (choice?.tool) return { ...choice, source: "local-llm" };
          ctx.modelFailed = true;
          ctx.modelRaw = choice?.raw || choice?.thought || "";
        } catch (error) {
          ctx.modelFailed = true;
          ctx.modelError = error.message;
        }
      }
      const step = deterministicStep(ctx);
      return { ...step, source: ctx.modelFailed ? "deterministic-recovery" : "deterministic", recovered: Boolean(ctx.modelFailed) };
    },
  };
}

export function applySavedProfile(memory, input) {
  const check = validateProfile(input);
  if (!check.ok) return check;
  const same = JSON.stringify(memory.profile) === JSON.stringify(check.profile);
  memory.profile = check.profile;
  if (!same) {
    memory.needs = null;
    memory.plan = null;
    memory.checks = null;
    memory.intakeRecommendation = null;
  }
  return check;
}

export async function runTurn({ memory, message = "", image = null, location = null, avoid = null, profile = null, brain, fetchImpl = fetch, lang = "zh" }) {
  if (!memory) memory = createMemory();
  const parsed = parseMessage(message);
  if (Array.isArray(avoid)) memory.avoid = avoid;
  if (profile) applySavedProfile(memory, profile);
  const done = {};
  const trace = [];
  const safety = ["no-order", "numbers-from-tools", "disclaimer"];
  let toolsUsed = 0;
  let loops = 0;
  let stopReason = "completed";
  const language = lang === "en" ? "en" : "zh";
  const ctx = { memory, message, parsed, image, location, fetchImpl, done, modelAttempted: false, lang: language };
  const activeBrain = brain || autoBrain();

  while (toolsUsed < LIMITS.maxToolCalls && loops < LIMITS.maxLoops) {
    loops += 1;
    let choice;
    if (image && !done.recognize_dish) {
      choice = { tool: "recognize_dish", agent: "nutrition", source: "harness", thought: "Harness: with a photo, call the multimodal vision tool first so the AI returns dish and nutrient estimates (English)." };
    } else {
      choice = await activeBrain.choose(ctx);
    }
    if (!choice?.tool || choice.stop || done[choice.tool]) {
      const fallback = deterministicStep(ctx);
      if (fallback.tool && !done[fallback.tool] && choice?.source !== "deterministic") {
        safety.push("planner-recovered");
        choice = { ...fallback, source: "deterministic-recovery", recovered: true };
      } else if (!fallback.tool || done[fallback.tool]) {
        stopReason = choice?.stop ? "planner-stop" : "planner-stop";
        break;
      } else {
        choice = { ...fallback, source: choice?.source || "deterministic" };
      }
    }
    let bound = bindCall(choice, ctx);
    if (!bound.ok) {
      const fallback = deterministicStep(ctx);
      const retry = fallback.tool && !done[fallback.tool] ? bindCall(fallback, ctx) : null;
      trace.push({
        agent: "controller",
        thought: choice.thought || "工具參數未通過驗證。",
        action: { tool: choice.tool, input: choice.input || {} },
        observation: { ok: false, errors: bound.errors },
        state: snapshot(memory),
        source: choice.source,
      });
      if (!retry?.ok) {
        stopReason = "validation-rejected";
        safety.push("invalid-tool-call");
        break;
      }
      safety.push("validation-recovered");
      choice = { ...fallback, source: "deterministic-recovery", recovered: true };
      bound = retry;
    }
    toolsUsed += 1;
    let raw;
    try {
      raw = await executeTool(bound.tool, bound.input, ctx);
    } catch (error) {
      trace.push({ agent: TOOLS[bound.tool].agent, thought: choice.thought, action: { tool: bound.tool, input: bound.input }, observation: { ok: false, error: "tool-failed" }, state: snapshot(memory), source: choice.source });
      stopReason = "tool-error";
      safety.push("tool-failure");
      break;
    }
    const checked = validateResult(bound.tool, raw);
    if (!checked.ok) {
      stopReason = "output-rejected";
      safety.push("improper-output");
      break;
    }
    done[bound.tool] = true;
    trace.push({
      agent: TOOLS[bound.tool].agent,
      roleName: agentName(TOOLS[bound.tool].agent, language),
      thought: choice.thought,
      recovered: Boolean(choice.recovered),
      source: choice.source,
      untrustedText: choice.raw || "",
      action: { tool: bound.tool, input: bound.input },
      observation: checked.result,
      state: snapshot(memory),
    });
    if (bound.tool === "recognize_dish" || checked.result?.error === "confirmation_required") {
      stopReason = "await-confirmation";
      break;
    }
    if (bound.tool === "estimate_needs" && checked.result?.rejected) {
      stopReason = "extreme-rejected";
      safety.push("extreme-rejected");
      break;
    }
  }
  if (toolsUsed >= LIMITS.maxToolCalls) {
    stopReason = "tool-budget";
    safety.push("tool-budget");
  }
  recompute(memory);
  const bubbles = [{
    agent: "controller",
    roleName: agentName("controller", language),
    text: language === "en"
      ? `The goal is to update world state, not to write a dietitian paragraph. Planner this turn: ${trace.find((step) => step.source && step.source !== "harness")?.source || activeBrain.id}.`
      : `目標係更新世界狀態，不是寫一段營養師口吻。這一輪規劃來源：${trace.find((step) => step.source && step.source !== "harness")?.source || activeBrain.id}。`,
  }];
  for (const step of trace) {
    if (!step.action?.tool) continue;
    bubbles.push({ agent: step.agent, roleName: agentName(step.agent, language), text: observationText(step.action.tool, step.observation, language) });
  }
  const followup = askForMissing(memory, parsed, language);
  if (followup) bubbles.push({ agent: "controller", roleName: agentName("controller", language), text: followup });
  return {
    bubbles,
    trace,
    memory,
    stopReason,
    toolsUsed,
    loops,
    safety: [...new Set(safety)],
    disclaimer: DISCLAIMER,
    planner: trace.some((step) => step.source === "grok") ? "grok" : trace.some((step) => step.source === "local-llm") ? "local-llm" : activeBrain.id,
    limits: LIMITS,
    tools: toolCatalog(),
    llm: llmStatus(),
  };
}

export { createMemory };
