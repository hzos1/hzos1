import { round1 } from "./foods.js";

const PROTEIN_G_PER_KG = 0.83;
const PRODUCE_G = 400;
const SODIUM_MG = 2000;

export function checkConstraints(memory) {
  const eaten = memory.eaten;
  const needs = memory.needs;
  const flags = [];
  const weight = memory.profile?.weightKg;
  if (weight && eaten.proteinKnown) {
    const reference = round1(PROTEIN_G_PER_KG * weight);
    flags.push({
      id: "protein-grams",
      pass: eaten.proteinG + 0.05 >= reference,
      detail: `已記錄蛋白質 ${eaten.proteinG} g，對照 WHO/FAO/UNU 2007 成人安全攝取量 ${PROTEIN_G_PER_KG} g/kg × ${weight} kg = ${reference} g。這是一般參考，不是個人處方。`,
      citation: "WHO/FAO/UNU. Protein and amino acid requirements in human nutrition. WHO TRS 935, 2007. https://iris.who.int/handle/10665/43411",
    });
  } else {
    flags.push({ id: "protein-grams", pass: null, detail: "蛋白質未能對照 0.83 g/kg：缺體重或缺資料。", citation: "WHO TRS 935" });
  }
  if (eaten.kcal > 0 && eaten.proteinKnown && eaten.fatKnown) {
    const proteinShare = round1((eaten.proteinG * 4 / eaten.kcal) * 100);
    const fatShare = round1((eaten.fatG * 9 / eaten.kcal) * 100);
    const carbShare = round1((eaten.carbohydrateG * 4 / eaten.kcal) * 100);
    flags.push({
      id: "energy-shares",
      pass: fatShare <= 30,
      detail: `至今供能比例（Atwater 4/4/9，只作對照）：蛋白質 ${proteinShare}%、脂肪 ${fatShare}%、碳水 ${carbShare}%。WHO 健康飲食頁：脂肪約 15–30%，碳水約 45–75%，蛋白質 10–15% 通常足夠，增肌者可以更高。未食完一日時，這不是全日結論。`,
      citation: "WHO healthy diet fact sheet, updated 26 January 2026. https://www.who.int/news-room/fact-sheets/detail/healthy-diet",
    });
  }
  if (eaten.sodiumKnown) {
    flags.push({
      id: "sodium",
      pass: eaten.sodiumMg < SODIUM_MG,
      detail: `已記錄鈉 ${eaten.sodiumMg} mg。WHO：成人每日鹽少於 5 g（鈉少於 2000 mg）。缺列的食物沒有被當成 0。`,
      citation: "WHO healthy diet fact sheet, 26 January 2026.",
    });
  } else {
    flags.push({ id: "sodium", pass: null, detail: "有餐次沒有鈉數據，所以不判斷鈉是否偏高，也不把缺值當 0。", citation: "WHO healthy diet fact sheet" });
  }
  flags.push({
    id: "produce",
    pass: eaten.produceG >= PRODUCE_G ? true : null,
    detail: `已記錄非澱粉蔬果 ${eaten.produceG} g（水果 ${eaten.fruitItems} 項、蔬菜 ${eaten.vegItems} 項）。WHO 與衞生防護中心都以每日至少約 400 g 蔬果為對照；馬鈴薯和甘藷不算入這 400 g。防護中心另建議每天至少 2 份水果、3 份蔬菜，本系統不把每 100 克自動換成「一份」。`,
    citation: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet ; https://www.chp.gov.hk/en/static/90022.html ; https://www.chp.gov.hk/en/static/109964.html",
  });
  const plan = memory.plan;
  let planPassed = false;
  const planErrors = [];
  if (needs?.rejected) planErrors.push("needs-rejected");
  if (plan) {
    const over = plan.totalKcal > (memory.remainingKcal ?? needs?.targetKcal ?? 0) + 0.05;
    if (over) planErrors.push("over-budget");
    if (plan.avoidViolation) planErrors.push("avoid-tag");
    if (plan.unverified) planErrors.push("unverified-item");
    planPassed = planErrors.length === 0;
  }
  const advice = [];
  if (flags.find((flag) => flag.id === "protein-grams" && flag.pass === false)) advice.push("下一餐優先從資料表選一個蛋白食物。");
  if (eaten.produceG < PRODUCE_G) advice.push("下一餐加入蔬菜或水果；少油少鹽是防護中心食物金字塔「吃最少油鹽糖」的一般原則。");
  if (flags.find((flag) => flag.id === "sodium" && flag.pass === false)) advice.push("今日鈉已達到或超過 2000 mg 的對照值，下一餐不要再自動選高鈉菜式。");
  if (flags.find((flag) => flag.id === "energy-shares" && flag.pass === false)) advice.push("至今脂肪供能比例高於 30%，下一餐改用較低脂的資料列。");
  return {
    ok: true,
    flags,
    advice,
    planPassed,
    planErrors,
    citations: flags.map((flag) => flag.citation),
  };
}
