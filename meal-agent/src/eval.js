import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { lookupFood, nutrientsFor, foodById } from "./foods.js";
import { suggestMeal } from "./suggest.js";
import { createMemory } from "./memory.js";
import { runTurn, deterministicBrain } from "./agent.js";

const cases = [
  ["白飯", 200, "tw:A0550601"],
  ["白米飯", 150, "tw:A0550601"],
  ["雞胸肉", 120, "tw:I0402102"],
  ["水煮蛋", 50, "tw:K0111101"],
  ["傳統豆腐", 150, "tw:R4700901"],
  ["青江菜", 100, "tw:E3201201"],
  ["叉燒", 80, "tw:R5100101"],
  ["全脂鮮乳", 240, "tw:L0102101"],
  ["牛番茄", 169, "tw:E7400101"],
  ["菠菜", 80, "tw:E5000101"],
  ["花椰菜", 100, "tw:E5800101"],
  ["芥藍", 100, "tw:E3900101"],
  ["胡蘿蔔", 80, "tw:E0200101"],
  ["香蕉", 100, "tw:D0800401"],
  ["富士蘋果", 150, "tw:D3200404"],
  ["廣東粥", 300, "tw:R0100101"],
  ["高麗菜水餃", 150, "tw:R2201501"],
  ["鮮奶茶", 234, "tw:O0701501"],
  ["珍珠奶茶", 251, "tw:O0702201"],
  ["chicken breast", 100, "usda:171477"],
  ["cooked salmon", 100, "usda:175168"],
  ["banana", 118, "usda:173944"],
  ["white rice", 158, "usda:168878"],
  ["boiled potato", 100, "usda:170440"],
  ["蛋撻", 80, null],
  ["腸粉", 200, null],
  ["菠蘿包", 90, null],
  ["絲襪奶茶", 300, null],
  ["雲吞麵", 400, null],
];

const rows = [];
for (const [name, grams, expectedId] of cases) {
  const found = lookupFood(name);
  const predictedId = found.status === "found" ? found.food.id : "";
  const predicted = found.status === "found" ? nutrientsFor(found.food, grams) : null;
  const truthFood = expectedId ? foodById(expectedId) : null;
  const truth = truthFood ? nutrientsFor(truthFood, grams) : null;
  rows.push({
    name,
    grams,
    expectedId: expectedId || "",
    predictedId,
    nameCorrect: predictedId === (expectedId || ""),
    predictedKcal: predicted?.energyKcal ?? null,
    truthKcal: truth?.energyKcal ?? null,
    sodiumPredicted: predicted?.sodiumMg ?? null,
    missingExpected: !expectedId,
  });
}

const comparable = rows.filter((row) => row.truthKcal != null && row.predictedKcal != null);
const calorieMae = comparable.reduce((sum, row) => sum + Math.abs(row.predictedKcal - row.truthKcal), 0) / comparable.length;
const calorieMape = comparable.reduce((sum, row) => sum + Math.abs(row.predictedKcal - row.truthKcal) / row.truthKcal, 0) / comparable.length;
const nameAccuracy = rows.filter((row) => row.nameCorrect).length / rows.length;

const budgets = [180, 450, 700];
const budgetChecks = budgets.map((budget) => {
  const suggestion = suggestMeal({ budgetKcal: budget, avoid: [], goal: "lose", needProduce: true });
  return { budget, totalKcal: suggestion.totalKcal, exceeded: suggestion.totalKcal > budget + 0.05, items: suggestion.items.length };
});

let memory = createMemory();
let turn = await runTurn({ memory, message: "男 21歲 170cm 體重 65kg 少動 減脂 目標體重 62kg", brain: deterministicBrain() });
memory = turn.memory;
turn = await runTurn({ memory, message: "白飯 180克", brain: deterministicBrain() });
const exceededPlan = Boolean(turn.memory.plan && turn.memory.plan.totalKcal > turn.memory.remainingKcal + 0.05);

const summary = {
  generatedAt: "2026-11-17",
  note: "Name accuracy is alias resolution against the cited table, not a photo test and not a clinical study. Calorie error is only computed where a labeled row exists. Missing dishes contribute to coverage, not to MAE.",
  counts: { cases: rows.length, comparable: comparable.length, missingExpected: rows.filter((row) => row.missingExpected).length },
  nameAccuracy,
  calorieMae,
  calorieMape,
  budgetChecks,
  planExceededAfterLoggedRice: exceededPlan,
  rows,
};

const dir = path.join(process.cwd(), "eval-output");
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, "results.json"), JSON.stringify(summary, null, 2));
const header = "name,grams,expectedId,predictedId,nameCorrect,predictedKcal,truthKcal,sodiumPredicted,missingExpected";
const csv = [header, ...rows.map((row) => [row.name, row.grams, row.expectedId, row.predictedId, row.nameCorrect, row.predictedKcal ?? "", row.truthKcal ?? "", row.sodiumPredicted ?? "", row.missingExpected].join(","))].join("\n");
writeFileSync(path.join(dir, "results.csv"), csv + "\n");
console.log(JSON.stringify({ nameAccuracy, calorieMae, calorieMape, budgetChecks, planExceededAfterLoggedRice: exceededPlan }, null, 2));
