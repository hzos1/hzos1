import { createMemory, recompute, snapshot } from "./memory.js";
import { parseMessage } from "./parse.js";
import { validateProfile } from "./needs.js";
import { bindCall, validateResult, LIMITS, TOOLS, toolCatalog } from "./harness.js";
import { deterministicStep } from "./planning.js";
import { executeTool } from "./tools.js";
import { agentName, observationText, askForMissing } from "./reply.js";
import { geminiChoose, localChoose, llmStatus } from "./llm.js";

export const DISCLAIMER = "本系統只供 DSC4070 課程演示和粗略估算，不是醫療診斷、臨床營養治療或專業訓練方案。有慢性病或特殊需要請諮詢醫生、營養師或合格教練。系統不會代下單，也不會開治療餐單。";

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
      if (process.env.GEMINI_API_KEY) {
        try {
          const choice = await geminiChoose(ctx);
          if (choice?.tool || choice?.stop) return { ...choice, source: "gemini" };
        } catch (error) {
          ctx.modelError = error.message;
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
  }
  return check;
}

export async function runTurn({ memory, message = "", image = null, location = null, avoid = null, profile = null, brain, fetchImpl = fetch }) {
  if (!memory) memory = createMemory();
  const parsed = parseMessage(message);
  if (Array.isArray(avoid)) memory.avoid = avoid;
  if (profile) applySavedProfile(memory, profile);
  if (!location?.consent && parsed.area) location = { consent: true, area: parsed.area };
  const done = {};
  const trace = [];
  const safety = ["no-order", "numbers-from-tools", "disclaimer"];
  let toolsUsed = 0;
  let loops = 0;
  let stopReason = "completed";
  const ctx = { memory, message, parsed, image, location, fetchImpl, done, modelAttempted: false };
  const activeBrain = brain || autoBrain();

  while (toolsUsed < LIMITS.maxToolCalls && loops < LIMITS.maxLoops) {
    loops += 1;
    let choice;
    if (image && !done.recognize_dish) {
      choice = { tool: "recognize_dish", agent: "nutrition", source: "harness", thought: "Harness：相片只能先呼叫認菜工具，模型不可以直接報卡路里。" };
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
      roleName: agentName(TOOLS[bound.tool].agent),
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
    roleName: agentName("controller"),
    text: `目標係更新世界狀態，不是寫一段營養師口吻。這一輪規劃來源：${trace.find((step) => step.source && step.source !== "harness")?.source || activeBrain.id}。`,
  }];
  for (const step of trace) {
    if (!step.action?.tool) continue;
    bubbles.push({ agent: step.agent, roleName: agentName(step.agent), text: observationText(step.action.tool, step.observation) });
  }
  const followup = askForMissing(memory, parsed);
  if (followup) bubbles.push({ agent: "controller", roleName: agentName("controller"), text: followup });
  return {
    bubbles,
    trace,
    memory,
    stopReason,
    toolsUsed,
    loops,
    safety: [...new Set(safety)],
    disclaimer: DISCLAIMER,
    planner: trace.some((step) => step.source === "gemini") ? "gemini" : trace.some((step) => step.source === "local-llm") ? "local-llm" : activeBrain.id,
    limits: LIMITS,
    tools: toolCatalog(),
    llm: llmStatus(),
  };
}

export { createMemory };
