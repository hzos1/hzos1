export const TRAINING = {
  agent: "training",
  daysPerWeek: 2,
  aerobicMinutes: 150,
  text: "一般參考：成年人每週至少 150 分鐘中等強度有氧活動；另外每週 2 天或以上做涉及主要肌群、中等或更高強度的肌力活動。這不是私人教練課、不是復康計劃，也不會量度或保證肌肉公斤。",
  citations: [
    "WHO fact sheet, physical activity: not meeting at least 150 minutes of moderate-intensity activity per week is counted as inactive. https://www.who.int/news-room/fact-sheets/detail/physical-activity",
    "Bull et al., WHO 2020 guidelines, Br J Sports Med. 2020;54:1451-1462. Adults should do muscle-strengthening activities involving all major muscle groups on 2 or more days a week. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7719906/",
  ],
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
    muscleNote: profile?.goal === "gain"
      ? "增肌在這個示範只用目標體重和課堂 +400 kcal 處理，不估算體脂或肌肉公斤。"
      : "目標體重只用於熱量方向，不用來估算體脂或肌肉公斤。",
  };
}
