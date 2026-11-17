export const TRAINING = {
  agent: "training",
  daysPerWeek: 2,
  aerobicMinutes: 150,
  text: "一般參考：成年人每週至少 150 分鐘中等強度有氧活動；另外每週 2 天或以上做涉及主要肌群、中等或更高強度的肌力活動。這不是私人教練課、不是復康計劃，也不會量度或保證肌肉公斤。",
    citations: [
    "WHO fact sheet, physical activity: not meeting at least 150 minutes of moderate-intensity activity per week is counted as inactive. https://www.who.int/news-room/fact-sheets/detail/physical-activity",
    "Bull et al., WHO 2020 guidelines, Br J Sports Med. 2020;54:1451-1462. Adults should do muscle-strengthening activities involving all major muscle groups on 2 or more days a week. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7719906/",
  ],
  textEn: "General reference: adults should do at least 150 minutes of moderate aerobic activity a week, plus muscle-strengthening of the major muscle groups on 2 or more days. This is not a personal trainer plan, not rehab, and it does not measure or promise kilograms of muscle.",
};

export function trainingGuidance(profile) {
  return {
    ok: true,
    ...TRAINING,
    goal: profile?.goal || null,
    statedDays: profile?.trainingDays ?? null,
    statedNote: profile?.trainingDays == null
      ? "檔案沒有填每週訓練天數。"
      : `檔案寫每週訓練 ${profile.trainingDays} 天。公開指引的肌力活動參考是每週 2 天或以上；這只是對照，不是加課指令。`,
    statedNoteEn: profile?.trainingDays == null
      ? "The profile has no weekly training days."
      : `The profile says ${profile.trainingDays} training days a week. The public muscle-strengthening reference is 2 or more days; this is a comparison, not an instruction to add sessions.`,
    muscleNote: profile?.goal === "gain"
      ? "增肌在這個示範只用目標體重和課堂 +400 kcal 處理，不估算體脂或肌肉公斤。"
      : "目標體重只用於熱量方向，不用來估算體脂或肌肉公斤。",
    muscleNoteEn: profile?.goal === "gain"
      ? "Muscle gain in this demo is only target weight plus the classroom +400 kcal. It does not estimate body fat or kilograms of muscle."
      : "Target weight is only used for the calorie direction. It is not used to estimate body fat or kilograms of muscle.",
  };
}
