const view = document.querySelector("#view");
const tabbar = document.querySelector("#tabbar");
const title = document.querySelector("#title");
const KEY = "meal-agent-record";
const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const PAGES = {
  "/onboarding": "入門",
  "/home": "今日概覽",
  "/analyze": "餐點分析",
  "/plan": "飲食計劃",
  "/places": "附近餐廳",
  "/more": "更多",
  "/chat": "聊天室",
  "/profile": "我的檔案",
};
let image = null;
let stream = null;
let chatLog = [];

function loadRecord() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}
function saveRecord(record) { localStorage.setItem(KEY, JSON.stringify(record)); }
function profileReady(record) {
  const profile = record?.profile;
  return Boolean(profile?.weightKg && profile.heightCm && profile.age && profile.sex && profile.activity && profile.goal && profile.targetWeightKg && profile.trainingDays != null);
}
function stale(record) {
  if (!record?.updatedAt) return false;
  return Date.now() - new Date(record.updatedAt).getTime() >= STALE_MS;
}
function showReminder(record) {
  if (!stale(record)) return false;
  if (!record.reminderDismissedAt) return true;
  return new Date(record.reminderDismissedAt).getTime() < new Date(record.updatedAt).getTime();
}

function go(path) {
  const record = loadRecord();
  if (path !== "/onboarding" && !profileReady(record)) path = "/onboarding";
  history.pushState({}, "", path);
  render();
}

window.addEventListener("popstate", render);
document.querySelector("#tabbar").addEventListener("click", (event) => {
  const link = event.target.closest("a");
  if (!link) return;
  event.preventDefault();
  go(link.dataset.path);
});

function render() {
  let path = location.pathname;
  if (!PAGES[path]) path = "/";
  const record = loadRecord();
  if (path === "/" || (path !== "/onboarding" && !profileReady(record))) {
    history.replaceState({}, "", profileReady(record) ? "/home" : "/onboarding");
    path = location.pathname;
  }
  title.textContent = PAGES[path] || "餐點 agent";
  tabbar.hidden = path === "/onboarding";
  for (const link of tabbar.querySelectorAll("a")) link.classList.toggle("active", link.dataset.path === path || (path === "/chat" || path === "/profile") && link.dataset.path === "/more");
  const page = {
    "/onboarding": renderOnboarding,
    "/home": renderHome,
    "/analyze": renderAnalyze,
    "/plan": renderPlan,
    "/places": renderPlaces,
    "/more": renderMore,
    "/chat": renderChat,
    "/profile": renderProfile,
  }[path];
  view.innerHTML = "";
  page(record);
}

function field(label, html) { return `<label>${label}${html}</label>`; }
const AVOIDS = [["pork", "豬肉"], ["beef", "牛肉"], ["poultry", "禽肉"], ["seafood", "海鮮"], ["egg", "蛋"], ["dairy", "奶"], ["soy", "大豆"], ["gluten", "麩質"], ["nuts", "堅果"], ["sesame", "芝麻"]];

function profileForm(profile = {}, avoid = []) {
  const goal = profile.goal || "";
  const sex = profile.sex || "";
  const activity = profile.activity || "";
  return `<div class="grid">
    ${field("身高 cm", `<input id="height" inputmode="decimal" value="${escapeAttr(profile.heightCm ?? "")}">`)}
    ${field("體重 kg", `<input id="weight" inputmode="decimal" value="${escapeAttr(profile.weightKg ?? "")}">`)}
    ${field("年齡", `<input id="age" inputmode="numeric" value="${escapeAttr(profile.age ?? "")}">`)}
    ${field("目標體重 kg", `<input id="target" inputmode="decimal" value="${escapeAttr(profile.targetWeightKg ?? "")}">`)}
    ${field("生理性別", `<select id="sex"><option value="">未填</option><option value="male" ${sex === "male" ? "selected" : ""}>男</option><option value="female" ${sex === "female" ? "selected" : ""}>女</option></select>`)}
    ${field("活動量", `<select id="activity"><option value="">未填</option><option value="low" ${activity === "low" ? "selected" : ""}>少動 PAL 1.50</option><option value="moderate" ${activity === "moderate" ? "selected" : ""}>中度 PAL 1.75</option><option value="high" ${activity === "high" ? "selected" : ""}>高活動 PAL 2.10</option></select>`)}
    ${field("目標類型", `<select id="goal"><option value="">未填</option><option value="lose" ${goal === "lose" ? "selected" : ""}>cut／減脂</option><option value="gain" ${goal === "gain" ? "selected" : ""}>bulk／增肌</option><option value="maintain" ${goal === "maintain" ? "selected" : ""}>maintain／維持</option></select>`)}
    ${field("每週訓練天數", `<input id="days" inputmode="numeric" min="0" max="7" value="${escapeAttr(profile.trainingDays ?? "")}">`)}
  </div>
  <fieldset class="card"><legend>想避開的食材（可留空）</legend><div class="checks">${AVOIDS.map(([id, label]) => `<label><input type="checkbox" name="avoid" value="${id}" ${avoid.includes(id) ? "checked" : ""}>${label}</label>`).join("")}</div></fieldset>
  <p class="note">公式只有男、女兩條已發表算式。增肌只配合目標體重，不量度肌肉公斤。空白不會由模型填上。</p>`;
}
function readAvoid() {
  return [...document.querySelectorAll("input[name=avoid]:checked")].map((input) => input.value);
}
function readProfileForm() {
  const value = (id) => document.querySelector(id).value;
  return {
    heightCm: num(value("#height")),
    weightKg: num(value("#weight")),
    age: num(value("#age")),
    targetWeightKg: num(value("#target")),
    sex: value("#sex"),
    activity: value("#activity"),
    goal: value("#goal"),
    trainingDays: value("#days") === "" ? null : Number(value("#days")),
  };
}
function num(value) { return value === "" ? null : Number(value); }

function renderOnboarding() {
  view.innerHTML = `<section class="card"><h2>先建立檔案</h2><p>之後的預算、餐單和訓練對照都只用這份檔案。模型不會猜缺少的數字。</p>${profileForm()}<p id="form-error"></p><button id="enter" type="button">儲存並進入今日概覽</button></section>`;
  document.querySelector("#enter").addEventListener("click", () => {
    const profile = readProfileForm();
    const error = clientProfileError(profile);
    if (error) { document.querySelector("#form-error").textContent = error; return; }
    saveRecord({ profile, avoid: readAvoid(), updatedAt: new Date().toISOString(), meals: loadRecord()?.meals || [], reminderDismissedAt: null });
    go("/home");
  });
}

function renderProfile(record) {
  view.innerHTML = `<section class="card"><h2>我的檔案</h2><p class="note">上次儲存：${escapeHtml(record.updatedAt || "沒有")}</p>${reminderHtml(record)}${profileForm(record.profile, record.avoid || [])}<p id="form-error"></p><button id="save-profile" type="button">更新檔案</button></section>`;
  document.querySelector("#save-profile").addEventListener("click", () => {
    const profile = readProfileForm();
    const error = clientProfileError(profile);
    if (error) { document.querySelector("#form-error").textContent = error; return; }
    saveRecord({ ...record, profile, avoid: readAvoid(), updatedAt: new Date().toISOString(), reminderDismissedAt: null });
    go("/home");
  });
}

function renderHome(record) {
  view.innerHTML = `<section class="card"><h2>今日能量</h2>${reminderHtml(record)}<p id="budget">正在用檔案呼叫能量工具…</p></section><section class="card"><h2>近期餐點</h2><div id="meals"></div></section><section class="card"><h2>工具軌跡</h2><div id="trace"></div></section>`;
  renderMeals(record);
  ask({ message: "請計算今日熱量預算", profile: record.profile, avoid: record.avoid || [], brain: "deterministic" }).then((data) => {
    const needs = data.memory?.needs;
    document.querySelector("#budget").textContent = needs?.ok
      ? `BMR ${needs.bmrKcal} kcal，PAL ${needs.pal}，TDEE ${needs.tdeeKcal} kcal，課堂目標 ${needs.targetKcal} kcal。`
      : `未能計算：${(needs?.errors || data.memory?.needs?.errors || ["檔案未通過驗證"]).join("、")}`;
    renderTrace(data);
  }).catch(() => { document.querySelector("#budget").textContent = "能量工具這輪沒有返回。"; });
}

function renderMeals(record) {
  const meals = record.meals || [];
  document.querySelector("#meals").innerHTML = meals.length ? meals.slice(-5).reverse().map((meal) => `<p>${escapeHtml(meal.name)} ${meal.grams} 克：${meal.nutrients?.energyKcal ?? "沒有熱量"} kcal。來源 ${escapeHtml(meal.sourceId || "沒有")}</p>`).join("") : "<p>還沒有分析過的餐點。</p>";
}

function renderAnalyze() {
  view.innerHTML = `<section class="card"><h2>餐點分析</h2><p>相片只負責菜名。確認菜名和克數之後才查資料庫。</p><div id="preview"></div><div id="camera-panel" hidden><video id="video" playsinline autoplay muted></video><button id="shutter" class="secondary" type="button">拍下這張</button></div><div class="actions"><label class="file">拍照<input id="camera-file" type="file" accept="image/*" capture="environment"></label><label class="file">相簿<input id="album-file" type="file" accept="image/*"></label><button id="live" class="secondary" type="button">開鏡頭</button></div><div id="confirm"></div><div id="result"></div></section><section class="card"><h2>工具軌跡</h2><div id="trace"></div></section>`;
  document.querySelector("#camera-file").addEventListener("change", (event) => useFile(event.target.files[0]));
  document.querySelector("#album-file").addEventListener("change", (event) => useFile(event.target.files[0]));
  document.querySelector("#live").addEventListener("click", openCamera);
  document.querySelector("#shutter").addEventListener("click", snap);
}

async function useFile(file) {
  if (!file) return;
  image = await resize(file);
  document.querySelector("#preview").innerHTML = `<img alt="餐點相片" src="data:image/jpeg;base64,${image.base64}">`;
  const data = await ask({ message: "請只辨識菜名", image, profile: loadRecord()?.profile, brain: "deterministic" });
  renderTrace(data);
  const step = (data.trace || []).find((item) => item.action?.tool === "recognize_dish");
  const observation = step?.observation;
  if (!observation?.ok) {
    document.querySelector("#confirm").innerHTML = `<p>${escapeHtml(observation?.reason || "認菜失敗，請手動輸入。")}</p>${confirmFields("", "")}`;
  } else {
    const name = observation.proposal?.name || observation.label || "";
    document.querySelector("#confirm").innerHTML = `<p>模型菜名：${escapeHtml(observation.label)}。請確認資料列和克數，未確認前沒有卡路里。</p>${confirmFields(name, "")}`;
  }
  bindConfirm();
}

function confirmFields(name, grams) {
  return `<div class="grid">${field("菜名", `<input id="dish" value="${escapeAttr(name)}">`)}${field("克數", `<input id="grams" inputmode="decimal" value="${escapeAttr(grams)}">`)}</div><button id="confirm-dish" type="button">確認並查資料庫</button>`;
}
function bindConfirm() {
  document.querySelector("#confirm-dish").addEventListener("click", async () => {
    const name = document.querySelector("#dish").value.trim();
    const grams = document.querySelector("#grams").value.trim();
    const data = await ask({ message: `確認 ${name} ${grams}克`, profile: loadRecord()?.profile, brain: "deterministic" });
    renderTrace(data);
    const meal = (data.memory?.meals || []).at(-1);
    if (!meal || meal.status !== "resolved") {
      document.querySelector("#result").textContent = "資料庫沒有這一列，所以沒有卡路里。";
      return;
    }
    const record = loadRecord();
    record.meals = [...(record.meals || []), { ...meal, at: new Date().toISOString() }].slice(-30);
    saveRecord(record);
    const row = meal.nutrients;
    document.querySelector("#result").innerHTML = `<p>${escapeHtml(meal.name)} ${meal.grams} 克：${row.energyKcal} kcal，蛋白質 ${row.proteinG} g，碳水 ${row.carbohydrateG} g，脂肪 ${row.fatG} g，鈉 ${row.sodiumMg ?? "資料沒有"}。來源 ${escapeHtml(meal.sourceId)}。</p>`;
  });
}

function renderPlan(record) {
  view.innerHTML = `<section class="card"><h2>飲食計劃</h2><p>餐單、飲食原則和訓練次數都由工具按檔案產出。</p><button id="make-plan" type="button">產生下一餐和訓練對照</button><div id="result"></div></section><section class="card"><h2>工具軌跡</h2><div id="trace"></div></section>`;
  document.querySelector("#make-plan").addEventListener("click", async () => {
    const data = await ask({ message: "請推薦下一餐，並講訓練次數", profile: record.profile, avoid: record.avoid || [], brain: "deterministic" });
    renderTrace(data);
    const plan = data.memory?.plan;
    const training = data.memory?.training;
    const lines = (plan?.items || []).map((item) => `${item.name} ${item.grams} 克，${item.nutrients.energyKcal} kcal，${item.sourceId}`);
    document.querySelector("#result").innerHTML = `<p>${escapeHtml(training?.text || "")}</p><p>${escapeHtml(training?.statedNote || "")}</p><p>${plan?.passedChecks ? "餐單已通過檢查。" : "餐單未通過檢查。"} ${escapeHtml(lines.join("；") || plan?.reason || "")}</p><p>${escapeHtml((data.memory?.checks?.advice || []).join(""))}</p>`;
  });
}

function renderPlaces() {
  view.innerHTML = `<section class="card"><h2>附近餐廳</h2><p>只顯示 OpenStreetMap 返回的店。沒有菜單和卡路里就留空。</p><div class="actions"><button id="gps" type="button">同意定位</button></div><div class="grid">${field("地區", `<input id="area" placeholder="九龍塘">`)}</div><button id="area-go" class="secondary" type="button">用地區查詢</button><div id="result"></div></section><section class="card"><h2>工具軌跡</h2><div id="trace"></div></section>`;
  document.querySelector("#gps").addEventListener("click", () => {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const data = await ask({ message: "附近餐廳", location: { consent: true, lat: position.coords.latitude, lon: position.coords.longitude }, profile: loadRecord()?.profile, brain: "deterministic" });
      showPlaces(data);
    }, () => { document.querySelector("#result").textContent = "定位被拒絕。可以改輸入地區。"; });
  });
  document.querySelector("#area-go").addEventListener("click", async () => {
    const area = document.querySelector("#area").value.trim();
    const data = await ask({ message: `附近餐廳 地區：${area}`, location: { consent: true, area }, profile: loadRecord()?.profile, brain: "deterministic" });
    showPlaces(data);
  });
}
function showPlaces(data) {
  renderTrace(data);
  const places = data.memory?.places;
  if (!places?.ok) { document.querySelector("#result").textContent = places?.reason || "沒有查到。"; return; }
  document.querySelector("#result").innerHTML = `<p>${escapeHtml(places.reason)}</p>` + (places.places || []).map((place) => `<p><a href="${escapeAttr(place.url)}">${escapeHtml(place.name)}</a>${place.cuisine ? `，cuisine: ${escapeHtml(place.cuisine)}` : ""}</p>`).join("") + "<p>這些不是菜單，也沒有卡路里。</p>";
}

function renderMore() {
  view.innerHTML = `<section class="links"><a href="/chat">聊天室：額外的 agent 對話，不是主畫面</a><a href="/profile">我的檔案：查看和更新身體資料</a></section>`;
  view.querySelectorAll("a").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); go(link.getAttribute("href")); }));
}

function renderChat() {
  view.innerHTML = `<section class="card"><p>這是額外頁面。主要拍照流程在餐點分析。</p><ol id="log"></ol><div id="preview"></div><textarea id="message" placeholder="可以問熱量、訓練次數或附近晚餐"></textarea><div class="actions"><label class="file">拍照<input id="camera-file" type="file" accept="image/*" capture="environment"></label><label class="file">相簿<input id="album-file" type="file" accept="image/*"></label><button id="send" type="button">送出</button></div></section>`;
  document.querySelector("#camera-file").addEventListener("change", (event) => attach(event.target.files[0]));
  document.querySelector("#album-file").addEventListener("change", (event) => attach(event.target.files[0]));
  document.querySelector("#send").addEventListener("click", sendChat);
  for (const item of chatLog) addBubble(item.agent, item.role, item.text);
}
async function attach(file) { if (file) { image = await resize(file); document.querySelector("#preview").innerHTML = `<img alt="聊天附件" src="data:image/jpeg;base64,${image.base64}">`; } }
async function sendChat() {
  const text = document.querySelector("#message").value.trim();
  if (!text && !image) return;
  addBubble("user", "你", text || "（相片）");
  const sent = image;
  image = null;
  document.querySelector("#message").value = "";
  document.querySelector("#preview").innerHTML = "";
  const data = await ask({ message: text || "請只辨識菜名", image: sent, profile: loadRecord()?.profile, avoid: loadRecord()?.avoid || [] });
  for (const bubble of data.bubbles || []) addBubble(bubble.agent, bubble.roleName, bubble.text, null, data.trace);
}

function addBubble(agent, role, text, base64, trace) {
  chatLog.push({ agent, role, text });
  const list = document.querySelector("#log");
  if (!list) return;
  const item = document.createElement("li");
  item.className = `bubble ${agent === "user" ? "user" : ""}`;
  const steps = (trace || []).filter((step) => step.agent === agent);
  item.innerHTML = `<span class="role">${escapeHtml(role || agent)}</span><div>${escapeHtml(text || "")}</div>${base64 ? `<img alt="附件" src="data:image/jpeg;base64,${base64}">` : ""}${steps.length ? `<details><summary>ReAct</summary><pre>${escapeHtml(JSON.stringify(steps, null, 2))}</pre></details>` : ""}`;
  list.append(item);
}

function reminderHtml(record) {
  if (!showReminder(record)) return "";
  return `<div class="banner"><p>身體資料大約 30 天未更新。這是一次性提醒，不是醫療追蹤。</p><button id="dismiss-reminder" class="secondary" type="button">知道了</button> <a href="/profile">去更新檔案</a></div>`;
}
document.addEventListener("click", (event) => {
  if (event.target?.id !== "dismiss-reminder") return;
  const record = loadRecord();
  record.reminderDismissedAt = new Date().toISOString();
  saveRecord(record);
  render();
});

function renderTrace(data) {
  const host = document.querySelector("#trace");
  if (!host) return;
  host.innerHTML = (data.trace || []).map((step) => `<details open><summary>${escapeHtml(step.roleName || step.agent)} · ${escapeHtml(step.action?.tool || "")}</summary><p>${escapeHtml(step.thought || "")}</p><pre>${escapeHtml(JSON.stringify({ input: step.action?.input, observation: step.observation, state: step.state }, null, 2))}</pre></details>`).join("") || "<p>這輪沒有工具呼叫。</p>";
}

async function ask(body) {
  const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sessionStorage.getItem("meal-session") || "", ...body }) });
  const data = await response.json();
  if (data.sessionId) sessionStorage.setItem("meal-session", data.sessionId);
  return data;
}

function clientProfileError(profile) {
  if ([profile.heightCm, profile.weightKg, profile.age, profile.targetWeightKg].some((value) => !Number.isFinite(value))) return "身高、體重、年齡和目標體重都要填數字。";
  if (!profile.sex || !profile.activity || !profile.goal) return "請選擇生理性別、活動量和目標類型。";
  if (!Number.isInteger(profile.trainingDays) || profile.trainingDays < 0 || profile.trainingDays > 7) return "訓練頻率要填 0 到 7 的整天數。";
  return "";
}
async function resize(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { base64: btoa(binary), mime: "image/jpeg" };
}
async function openCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    document.querySelector("#confirm").innerHTML = "<p>即時鏡頭需要 HTTPS。請改用拍照或相簿。</p>";
    return;
  }
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  const video = document.querySelector("#video");
  video.srcObject = stream;
  document.querySelector("#camera-panel").hidden = false;
}
function snap() {
  const video = document.querySelector("#video");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob(async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    image = { base64: btoa(binary), mime: "image/jpeg" };
    document.querySelector("#preview").innerHTML = `<img alt="餐點相片" src="data:image/jpeg;base64,${image.base64}">`;
    useFile(new File([blob], "camera.jpg", { type: "image/jpeg" }));
  }, "image/jpeg", 0.85);
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value).replace(/"/g, "&quot;"); }

fetch("/api/meta").then((response) => response.json()).then((meta) => {
  const brain = meta.llm?.gemini ? "聊天室控制器可使用 Gemini" : "未設定 GEMINI_API_KEY；聊天室會嘗試本地模型，失敗則改由確定性規劃呼叫同一套工具";
  document.querySelector("#model-line").textContent = `${brain}。認菜：${meta.recognition?.state || "idle"}。`;
}).catch(() => {});
render();
