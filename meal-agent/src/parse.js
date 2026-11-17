const NUMBER = "(\\d+(?:\\.\\d+)?)";

function read(pattern, text) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

export function parseMessage(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  const profile = {};
  const target = read(new RegExp(`(?:減到|增到|增肌到|目標體重|目標)\\s*${NUMBER}\\s*(?:kg|公斤)?`, "i"), raw)
    ?? read(new RegExp(`${NUMBER}\\s*(?:kg|公斤)\\s*(?:目標)?`, "i"), lower.includes("目標") ? raw : "");
  const current = read(new RegExp(`(?:體重|而家|現在|我重)\\s*${NUMBER}\\s*(?:kg|公斤)?`, "i"), raw);
  const height = read(new RegExp(`${NUMBER}\\s*(?:cm|厘米|公分)`, "i"), raw);
  const age = read(new RegExp(`${NUMBER}\\s*歲`, "i"), raw);
  const looseKg = [...raw.matchAll(/(\d+(?:\.\d+)?)\s*(?:kg|公斤)/gi)].map((match) => Number(match[1]));
  if (current != null) profile.weightKg = current;
  else if (target == null && looseKg.length === 1 && !/減到|目標/.test(raw)) profile.weightKg = looseKg[0];
  if (target != null) profile.targetWeightKg = target;
  else if (looseKg.length === 2) {
    profile.weightKg = looseKg[0];
    profile.targetWeightKg = looseKg[1];
  }
  if (height != null) profile.heightCm = height;
  if (age != null) profile.age = age;
  if (/女|female/.test(lower) && !/男/.test(raw)) profile.sex = "female";
  else if (/男|male/.test(lower)) profile.sex = "male";
  if (/少動|低活動|不太動/.test(raw)) profile.activity = "low";
  else if (/中度|適中/.test(raw)) profile.activity = "moderate";
  else if (/高活動|經常運動|好活躍/.test(raw)) profile.activity = "high";
  if (/增肌|增重/.test(raw)) profile.goal = "gain";
  else if (/減脂|減重|減到/.test(raw)) profile.goal = "lose";
  else if (/維持/.test(raw)) profile.goal = "maintain";

  const grams = read(new RegExp(`${NUMBER}\\s*(?:g|克)`, "i"), raw);
  let foodQuery = raw
    .replace(/(?:我食咗|食咗|吃了|今日食|呢餐係|這餐是)/g, " ")
    .replace(/\d+(?:\.\d+)?\s*(?:kg|公斤|cm|厘米|公分|歲|g|克)/gi, " ")
    .replace(/(?:減到|目標體重|目標|體重|而家|現在|男|女|少動|中度|高活動|減脂|增肌|維持|確認|係|是|用)/g, " ")
    .replace(/[，,。．！？?]/g, " ")
    .trim();
  if (/幾多卡|幾多熱量|多少卡|多少熱量/.test(raw)) foodQuery = foodQuery.replace(/幾多卡路里|幾多卡|幾多熱量|多少卡路里|多少卡|多少熱量|卡路里/g, "").trim();

  const areaMatch = raw.match(/(?:地區|地址)\s*[:：]?\s*([^\s，。,]{2,40})/);
  const area = areaMatch ? areaMatch[1] : null;

  const intents = {
    training: /練|訓練|運動|gym/i.test(raw),
    places: /附近|餐廳|邊度食|地圖/.test(raw),
    plan: /餐單|下一餐|推薦|建議.*餐|晚餐|午餐|早餐/.test(raw),
    calories: /卡|熱量|kcal/i.test(raw),
    confirm: /確認|就係|就這|用這個|用呢個/.test(raw),
    profile: Object.keys(profile).length > 0,
  };
  return { raw, profile, grams, foodQuery, area, intents };
}

export function numbersInText(text) {
  return [...String(text || "").matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}
