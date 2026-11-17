const view = document.querySelector("#view");
const tabbar = document.querySelector("#tabbar");
const sidebar = document.querySelector("#sidebar");
const title = document.querySelector("#title");
const LANG_KEY = "meal-lang";
const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const AVOID_IDS = ["pork", "beef", "poultry", "seafood", "egg", "dairy", "soy", "gluten", "nuts", "sesame"];
const PAGES = {
  "/login": "loginTitle",
  "/register": "registerTitle",
  "/home": "pageHome",
  "/analyze": "pageAnalyze",
  "/plan": "pagePlan",
  "/more": "pageMore",
  "/chat": "pageChat",
  "/profile": "pageProfile",
};
let lang = localStorage.getItem(LANG_KEY) === "en" ? "en" : "zh";
let me = null;
let image = null;
let stream = null;
let chatLog = [];
let meta = null;

function t(key) {
  const value = MEAL_I18N[lang][key];
  return value == null ? key : value;
}
function avoidLabel(id) { return MEAL_I18N[lang].avoid[id] || id; }
function setLang(next) {
  const draft = snapshotForm();
  lang = next;
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
  render();
  restoreForm(draft);
}
function snapshotForm() {
  const data = {};
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (!el.id) continue;
    data[el.id] = el.type === "checkbox" ? el.checked : el.value;
  }
  return data;
}
function restoreForm(data) {
  for (const [id, value] of Object.entries(data || {})) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value;
  }
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
  if (!me && path !== "/login" && path !== "/register") path = "/login";
  if (me && (path === "/login" || path === "/register" || path === "/onboarding" || path === "/")) path = "/home";
  history.pushState({}, "", path);
  render();
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href]");
  const href = link?.getAttribute("href") || "";
  if (link && href.startsWith("/") && !href.startsWith("//")) {
    event.preventDefault();
    go(link.dataset.path || href);
  }
  if (event.target?.id === "lang-toggle" || event.target?.id === "lang-side") setLang(lang === "en" ? "zh" : "en");
  if (event.target?.id === "logout" || event.target?.id === "logout-side") logout();
  if (event.target?.id === "dismiss-reminder") dismissReminder();
});
window.addEventListener("popstate", render);

function chrome() {
  document.documentElement.lang = lang === "en" ? "en" : "zh-Hant";
  document.querySelector("#disclaimer").textContent = t("disclaimer");
  document.querySelector("#brand-name").textContent = t("brand");
  document.querySelector("#brand-sub").textContent = t("brandSub");
  document.querySelector("#logout").textContent = t("logout");
  document.querySelector("#logout-side").textContent = t("logout");
  for (const button of [document.querySelector("#lang-toggle"), document.querySelector("#lang-side")]) button.textContent = lang === "en" ? "中文" : "EN";
  const labels = { "/home": "navHome", "/analyze": "navAnalyze", "/plan": "navPlan", "/chat": "navChat", "/more": "navMore" };
  for (const link of document.querySelectorAll("#tabbar a, #side-nav a")) link.textContent = t(labels[link.dataset.path]);
  document.querySelector("#model-line").textContent = modelText();
}

function render() {
  let path = location.pathname;
  if (path === "/onboarding") path = "/register";
  if (!PAGES[path]) path = "/";
  if (!me && path !== "/login" && path !== "/register") path = "/login";
  if (me && (path === "/" || path === "/login" || path === "/register")) path = "/home";
  if (location.pathname !== path) history.replaceState({}, "", path);
  const guest = path === "/login" || path === "/register";
  document.body.classList.toggle("guest", guest);
  sidebar.hidden = guest;
  tabbar.hidden = guest;
  document.querySelector("#logout").hidden = guest;
  title.textContent = t(PAGES[path] || "brand");
  for (const link of document.querySelectorAll("#tabbar a, #side-nav a")) {
    const more = path === "/profile" && link.dataset.path === "/more";
    link.classList.toggle("active", link.dataset.path === path || more);
  }
  chrome();
  view.innerHTML = "";
  const page = { "/login": renderLogin, "/register": renderRegister, "/home": renderHome, "/analyze": renderAnalyze, "/plan": renderPlan, "/more": renderMore, "/chat": renderChat, "/profile": renderProfile }[path];
  page();
}

function field(label, html) { return `<label>${label}${html}</label>`; }
function profileFields(profile = {}, avoid = []) {
  const goal = profile.goal || "";
  const sex = profile.sex || "";
  const activity = profile.activity || "";
  return `<div class="grid">
    ${field(t("height"), `<input id="height" inputmode="decimal" value="${escapeAttr(profile.heightCm ?? "")}">`)}
    ${field(t("weight"), `<input id="weight" inputmode="decimal" value="${escapeAttr(profile.weightKg ?? "")}">`)}
    ${field(t("age"), `<input id="age" inputmode="numeric" value="${escapeAttr(profile.age ?? "")}">`)}
    ${field(t("target"), `<input id="target" inputmode="decimal" value="${escapeAttr(profile.targetWeightKg ?? "")}">`)}
    ${field(t("sex"), `<select id="sex"><option value="">${t("sexUnset")}</option><option value="male" ${sex === "male" ? "selected" : ""}>${t("sexMale")}</option><option value="female" ${sex === "female" ? "selected" : ""}>${t("sexFemale")}</option></select>`)}
    ${field(t("activity"), `<select id="activity"><option value="">${t("activityUnset")}</option><option value="low" ${activity === "low" ? "selected" : ""}>${t("activityLow")}</option><option value="moderate" ${activity === "moderate" ? "selected" : ""}>${t("activityModerate")}</option><option value="high" ${activity === "high" ? "selected" : ""}>${t("activityHigh")}</option></select>`)}
    ${field(t("goal"), `<select id="goal"><option value="">${t("goalUnset")}</option><option value="lose" ${goal === "lose" ? "selected" : ""}>${t("goalLose")}</option><option value="gain" ${goal === "gain" ? "selected" : ""}>${t("goalGain")}</option><option value="maintain" ${goal === "maintain" ? "selected" : ""}>${t("goalMaintain")}</option></select>`)}
    ${field(t("days"), `<input id="days" inputmode="numeric" min="0" max="7" value="${escapeAttr(profile.trainingDays ?? "")}">`)}
  </div>
  <fieldset><legend>${t("avoidLegend")}</legend><div class="checks">${AVOID_IDS.map((id) => `<label><input id="avoid-${id}" type="checkbox" ${avoid.includes(id) ? "checked" : ""}>${avoidLabel(id)}</label>`).join("")}</div></fieldset>
  <p class="note">${t("profileNote")}</p>`;
}
function readAvoid() { return AVOID_IDS.filter((id) => document.querySelector(`#avoid-${id}`)?.checked); }
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
function clientProfileError(profile) {
  if ([profile.heightCm, profile.weightKg, profile.age, profile.targetWeightKg].some((value) => !Number.isFinite(value))) return t("errNumbers");
  if (!profile.sex || !profile.activity || !profile.goal) return t("errChoices");
  if (!Number.isInteger(profile.trainingDays) || profile.trainingDays < 0 || profile.trainingDays > 7) return t("errDays");
  return "";
}
function errorText(data) {
  if (data?.errors?.length) return data.errors.map((code) => t(code)).join(" ");
  return t(data?.error || "request-failed");
}

function renderLogin() {
  view.innerHTML = `<section class="card auth-card"><h2>${t("loginTitle")}</h2><p>${t("loginLead")}</p><div class="grid">${field(t("email"), `<input id="email" type="email" autocomplete="username">`)}${field(t("password"), `<input id="password" type="password" autocomplete="current-password">`)}</div><p id="form-error" class="error"></p><button id="enter" type="button">${t("loginSubmit")}</button><p><a href="/register">${t("noAccount")}</a></p></section>`;
  document.querySelector("#enter").addEventListener("click", async () => {
    const response = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.querySelector("#email").value, password: document.querySelector("#password").value }) });
    const data = await response.json();
    if (!response.ok) { document.querySelector("#form-error").textContent = errorText(data); return; }
    me = data.user;
    go("/home");
  });
}

function renderRegister() {
  view.innerHTML = `<section class="card auth-card"><h2>${t("registerTitle")}</h2><p>${t("registerLead")}</p><div class="auth-grid"><div class="grid">${field(t("email"), `<input id="email" type="email" autocomplete="username">`)}${field(t("password"), `<input id="password" type="password" autocomplete="new-password">`)}<p class="note">${t("passwordHint")}</p><label><input id="ack" type="checkbox">${t("disclaimerAck")}</label></div><div>${profileFields()}</div></div><p id="form-error" class="error"></p><button id="enter" type="button">${t("registerSubmit")}</button><p><a href="/login">${t("haveAccount")}</a></p></section>`;
  document.querySelector("#enter").addEventListener("click", async () => {
    const profile = readProfileForm();
    const local = clientProfileError(profile);
    if (local) { document.querySelector("#form-error").textContent = local; return; }
    if (!document.querySelector("#ack").checked) { document.querySelector("#form-error").textContent = t("errDisclaimer"); return; }
    const response = await fetch("/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: document.querySelector("#email").value, password: document.querySelector("#password").value, profile, avoid: readAvoid(), disclaimerAck: true }) });
    const data = await response.json();
    if (!response.ok) { document.querySelector("#form-error").textContent = errorText(data); return; }
    me = data.user;
    go("/home");
  });
}

function renderProfile() {
  view.innerHTML = `<section class="card"><h2>${t("pageProfile")}</h2><p class="note">${t("lastSaved")}：${escapeHtml(me.updatedAt || t("neverSaved"))}</p>${reminderHtml()}${profileFields(me.profile, me.avoid || [])}<p id="form-error" class="error"></p><button id="save-profile" type="button">${t("saveProfile")}</button></section>`;
  document.querySelector("#save-profile").addEventListener("click", async () => {
    const profile = readProfileForm();
    const local = clientProfileError(profile);
    if (local) { document.querySelector("#form-error").textContent = local; return; }
    const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile, avoid: readAvoid() }) });
    const data = await response.json();
    if (!response.ok) { document.querySelector("#form-error").textContent = errorText(data); return; }
    me = data.user;
    go("/home");
  });
}

function renderHome() {
  view.innerHTML = `<div class="home-grid"><section class="card"><h2>${t("homeEnergy")}</h2>${reminderHtml()}<p id="budget">${t("budgetLoading")}</p></section><section class="card"><h2>${t("homeMeals")}</h2><div id="meals"></div></section><section class="card"><h2>${t("homeTips")}</h2><p>${t("tip1")}</p><p>${t("tip2")}</p><p>${t("tip3")}</p></section></div><section class="card"><h2>${t("homeTrace")}</h2><div id="trace"></div></section>`;
  renderMeals();
  ask({ message: lang === "en" ? "Calculate today's calorie budget" : "請計算今日熱量預算", brain: "deterministic" }).then((data) => {
    if (data.user) me = data.user;
    const needs = data.memory?.needs;
    const budget = document.querySelector("#budget");
    if (!budget) return;
    budget.innerHTML = needs?.ok
      ? `<div class="kcal">${needs.targetKcal}</div><p>BMR ${needs.bmrKcal}&nbsp;kcal · PAL ${needs.pal} · TDEE ${needs.tdeeKcal}&nbsp;kcal</p>`
      : `${t("budgetBad")}：${escapeHtml((needs?.errors || ["invalid-profile"]).join(", "))}`;
    renderTrace(data);
  }).catch(() => { const budget = document.querySelector("#budget"); if (budget) budget.textContent = t("budgetFail"); });
}

function renderMeals() {
  const host = document.querySelector("#meals");
  if (!host) return;
  const meals = me.meals || [];
  host.innerHTML = meals.length ? meals.slice(-5).reverse().map((meal) => `<p>${escapeHtml(meal.name)} ${meal.grams} ${t("grams")}：${meal.nutrients?.energyKcal ?? t("noEnergy")} kcal。${t("source")} ${escapeHtml(meal.sourceId || t("neverSaved"))}</p>`).join("") : `<p>${t("emptyMeals")}</p>`;
}

function renderAnalyze() {
  view.innerHTML = `<div class="analyze-layout"><section class="card"><h2>${t("pageAnalyze")}</h2><p>${t("analyzeLead")}</p><div id="preview" class="preview"></div><div id="camera-panel" hidden><video id="video" playsinline autoplay muted></video><button id="shutter" class="secondary" type="button">${t("shutter")}</button></div><div class="actions analyze-actions"><label class="file">${t("camera")}<input id="camera-file" type="file" accept="image/*" capture="environment"></label><label class="file">${t("album")}<input id="album-file" type="file" accept="image/*"></label><button id="live" class="secondary" type="button">${t("live")}</button></div></section><section class="card"><div id="confirm"></div><div id="result"></div><h2>${t("homeTrace")}</h2><div id="trace"></div></section></div>`;
  document.querySelector("#camera-file").addEventListener("change", (event) => useFile(event.target.files[0]));
  document.querySelector("#album-file").addEventListener("change", (event) => useFile(event.target.files[0]));
  document.querySelector("#live").addEventListener("click", openCamera);
  document.querySelector("#shutter").addEventListener("click", snap);
}

async function useFile(file) {
  if (!file) return;
  image = await resize(file);
  document.querySelector("#preview").innerHTML = `<img alt="" src="data:image/jpeg;base64,${image.base64}">`;
  const data = await ask({ message: lang === "en" ? "Name the dish only" : "請只辨識菜名", image, brain: "deterministic" });
  if (data.user) me = data.user;
  renderTrace(data);
  const step = (data.trace || []).find((item) => item.action?.tool === "recognize_dish");
  const observation = step?.observation;
  if (!observation?.ok) {
    document.querySelector("#confirm").innerHTML = `<p>${escapeHtml(lang === "en" ? (observation?.reasonEn || observation?.reason || t("recognizeFail")) : (observation?.reason || t("recognizeFail")))}</p>${confirmFields("", "")}`;
  } else {
    const name = observation.proposal?.name || observation.label || "";
    document.querySelector("#confirm").innerHTML = `<p>${t("modelName")}：${escapeHtml(observation.label)}. ${t("confirmBefore")}</p>${confirmFields(name, "")}`;
  }
  bindConfirm();
}
function confirmFields(name, grams) {
  return `<div class="grid">${field(t("dish"), `<input id="dish" value="${escapeAttr(name)}">`)}${field(t("grams"), `<input id="grams" inputmode="decimal" value="${escapeAttr(grams)}">`)}</div><button id="confirm-dish" type="button">${t("confirmLookup")}</button>`;
}
function bindConfirm() {
  document.querySelector("#confirm-dish").addEventListener("click", async () => {
    const name = document.querySelector("#dish").value.trim();
    const grams = document.querySelector("#grams").value.trim();
    const data = await ask({ message: `${lang === "en" ? "confirm" : "確認"} ${name} ${grams}${lang === "en" ? " g" : "克"}`, brain: "deterministic" });
    if (data.user) me = data.user;
    renderTrace(data);
    const meal = (data.memory?.meals || []).at(-1);
    if (!meal || meal.status !== "resolved") { document.querySelector("#result").textContent = t("noRow"); return; }
    const row = meal.nutrients;
    document.querySelector("#result").innerHTML = `<p>${escapeHtml(meal.name)} ${meal.grams} ${t("grams")}：${row.energyKcal} kcal，${t("protein")} ${row.proteinG} g，${t("carb")} ${row.carbohydrateG} g，${t("fat")} ${row.fatG} g，${t("sodium")} ${row.sodiumMg ?? t("sodiumMissing")}。${t("source")} ${escapeHtml(meal.sourceId)}。</p>`;
  });
}

function renderPlan() {
  view.innerHTML = `<section class="card"><h2>${t("pagePlan")}</h2><p>${t("planLead")}</p><button id="make-plan" type="button">${t("planButton")}</button><div id="result"></div></section><section class="card"><h2>${t("homeTrace")}</h2><div id="trace"></div></section>`;
  document.querySelector("#make-plan").addEventListener("click", async () => {
    const data = await ask({ message: lang === "en" ? "Build a day meal plan from my profile and the training days" : "請用檔案做一日餐單，並講訓練次數", brain: "deterministic" });
    if (data.user) me = data.user;
    renderTrace(data);
    const plan = data.memory?.plan;
    const training = data.memory?.training;
    const trainingText = lang === "en" ? `${training?.textEn || ""} ${training?.statedNoteEn || ""}` : `${training?.text || ""} ${training?.statedNote || ""}`;
    const advice = lang === "en" ? (data.memory?.checks?.adviceEn || []) : (data.memory?.checks?.advice || []);
    const profileLine = lang === "en" ? (plan?.profileLineEn || "") : (plan?.profileLine || "");
    const comparison = lang === "en" ? (plan?.comparisonEn || plan?.reasonEn || plan?.reason || "") : (plan?.comparison || plan?.reason || "");
    document.querySelector("#result").innerHTML = `<p>${escapeHtml(trainingText)}</p><p>${plan?.passedChecks ? t("planPassed") : t("planFailed")}</p><p>${escapeHtml(profileLine)}</p>${mealBlocks(plan)}<p>${escapeHtml(comparison)}</p><p>${escapeHtml(advice.join(" "))}</p>`;
  });
}
function mealBlocks(plan) {
  const meals = plan?.meals || [];
  if (!meals.length) {
    const lines = (plan?.items || []).map((item) => `${lang === "en" ? (item.nameEn || item.name) : item.name} ${item.grams} ${t("grams")}, ${item.nutrients?.energyKcal} kcal, ${item.sourceId}`);
    return lines.length ? `<p>${escapeHtml(lines.join("; "))}</p>` : "";
  }
  return meals.map((meal) => {
    const title = lang === "en" ? meal.en : meal.zh;
    const foods = (meal.items || []).map((item) => {
      const name = lang === "en" ? (item.nameEn || item.name) : item.name;
      const row = item.nutrients || {};
      return `<li>${escapeHtml(name)} ${item.grams} ${t("grams")} · ${row.energyKcal} kcal · ${t("protein")} ${row.proteinG} g · ${t("carb")} ${row.carbohydrateG} g · ${t("fat")} ${row.fatG} g · ${t("source")} ${escapeHtml(item.sourceId || "")}</li>`;
    }).join("");
    const reason = lang === "en" ? meal.reasonEn : meal.reason;
    const prep = lang === "en" ? meal.prepEn : meal.prep;
    const swap = lang === "en" ? meal.swapEn : meal.swap;
    return `<article class="meal-block"><h3>${escapeHtml(title || "")} · ${meal.totalKcal} kcal</h3><ul>${foods}</ul><p>${escapeHtml(reason || "")}</p><p>${escapeHtml(prep || "")}</p><p>${escapeHtml(swap || "")}</p></article>`;
  }).join("");
}

function renderMore() {
  view.innerHTML = `<section class="links"><a href="/profile"><strong>${t("moreProfile")}</strong><br>${t("moreProfileNote")}</a></section>`;
}
function improvePrompt(text) {
  const body = text.trim() || (lang === "en" ? "plan today from my saved profile" : "用已儲存的檔案安排今天");
  if (lang === "en") return `Goal: ${body}. Plan the steps, call a named tool (estimate_needs, lookup_meal, suggest_meal, check_constraints, or training_guidance), show the reasoning in the trace, and do not look up calories until the dish name and grams are confirmed. Do not guess energy.`;
  return `目標：${body}。先寫計劃，再呼叫具名工具（estimate_needs、lookup_meal、suggest_meal、check_constraints 或 training_guidance），在軌跡顯示推理，菜名和克數未確認前不要查卡路里。不要猜熱量。`;
}
function renderChat() {
  const chips = ["chipGoal", "chipTool", "chipTrace", "chipConfirm"].map((key) => `<button class="secondary chip" type="button" data-chip="${key}">${t(key)}</button>`).join("");
  view.innerHTML = `<section class="card"><p>${t("chatLead")}</p><p class="meta">${t("chatHint")}</p><div class="chips">${chips}<button id="improve" class="secondary" type="button">${t("improvePrompt")}</button></div><ol id="log"></ol><div id="preview" class="preview"></div><textarea id="message" placeholder="${escapeAttr(t("chatPlaceholder"))}"></textarea><div class="actions"><label class="file">${t("camera")}<input id="camera-file" type="file" accept="image/*" capture="environment"></label><label class="file">${t("album")}<input id="album-file" type="file" accept="image/*"></label><button id="send" type="button">${t("send")}</button></div></section>`;
  for (const button of document.querySelectorAll("[data-chip]")) {
    button.addEventListener("click", () => { document.querySelector("#message").value = t(`${button.dataset.chip}Text`); });
  }
  document.querySelector("#improve").addEventListener("click", () => {
    const box = document.querySelector("#message");
    box.value = improvePrompt(box.value);
  });
  document.querySelector("#camera-file").addEventListener("change", (event) => attach(event.target.files[0]));
  document.querySelector("#album-file").addEventListener("change", (event) => attach(event.target.files[0]));
  document.querySelector("#send").addEventListener("click", sendChat);
  for (const item of chatLog) addBubble(item.agent, item.role, item.text);
}
async function attach(file) { if (file) { image = await resize(file); document.querySelector("#preview").innerHTML = `<img alt="" src="data:image/jpeg;base64,${image.base64}">`; } }
async function sendChat() {
  const text = document.querySelector("#message").value.trim();
  if (!text && !image) return;
  addBubble("user", t("you"), text || t("photoOnly"));
  const sent = image;
  image = null;
  document.querySelector("#message").value = "";
  document.querySelector("#preview").innerHTML = "";
  const data = await ask({ message: text || (lang === "en" ? "Name the dish only" : "請只辨識菜名"), image: sent });
  if (data.user) me = data.user;
  for (const bubble of data.bubbles || []) addBubble(bubble.agent, bubble.roleName, bubble.text, null, data.trace);
}
function addBubble(agent, role, text, base64, trace) {
  chatLog.push({ agent, role, text });
  const list = document.querySelector("#log");
  if (!list) return;
  const item = document.createElement("li");
  item.className = `bubble ${agent === "user" ? "user" : ""}`;
  const steps = (trace || []).filter((step) => step.agent === agent);
  item.innerHTML = `<span class="role">${escapeHtml(role || agent)}</span><div>${escapeHtml(text || "")}</div>${base64 ? `<img alt="" src="data:image/jpeg;base64,${base64}">` : ""}${steps.length ? `<details><summary>${t("react")}</summary><pre>${escapeHtml(JSON.stringify(steps, null, 2))}</pre></details>` : ""}`;
  list.append(item);
}

function reminderHtml() {
  if (!showReminder(me)) return "";
  return `<div class="banner"><p>${t("reminder")}</p><button id="dismiss-reminder" class="secondary" type="button">${t("dismiss")}</button> <a href="/profile">${t("updateProfile")}</a></div>`;
}
async function dismissReminder() {
  const response = await fetch("/api/reminder", { method: "POST" });
  if (response.ok) me = (await response.json()).user;
  render();
}
function renderTrace(data) {
  const host = document.querySelector("#trace");
  if (!host) return;
  host.innerHTML = (data.trace || []).map((step) => `<details open><summary>${escapeHtml(step.roleName || step.agent)} · ${escapeHtml(step.action?.tool || "")}</summary><p>${escapeHtml(step.thought || "")}</p><pre>${escapeHtml(JSON.stringify({ input: step.action?.input, observation: step.observation, state: step.state }, null, 2))}</pre></details>`).join("") || `<p>${t("traceEmpty")}</p>`;
}

async function ask(body) {
  const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, lang }) });
  if (response.status === 401) { me = null; go("/login"); return { trace: [], bubbles: [] }; }
  return response.json();
}
async function logout() {
  await fetch("/api/logout", { method: "POST" });
  me = null;
  chatLog = [];
  go("/login");
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
    document.querySelector("#confirm").innerHTML = `<p>${t("cameraNeedsHttps")}</p>`;
    return;
  }
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
  document.querySelector("#video").srcObject = stream;
  document.querySelector("#camera-panel").hidden = false;
}
function snap() {
  const video = document.querySelector("#video");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext("2d").drawImage(video, 0, 0);
  canvas.toBlob((blob) => useFile(new File([blob], "camera.jpg", { type: "image/jpeg" })), "image/jpeg", 0.85);
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value); }

function modelText() {
  if (!meta) return "";
  const brain = meta.llm?.grok ? `${t("modelGrok")} (${meta.llm.grokModel})` : t("modelLocal");
  return `${brain} · ${t("recognition")}: ${meta.recognition?.state || "idle"}`;
}
fetch("/api/meta").then((response) => response.json()).then((payload) => {
  meta = payload;
  const line = document.querySelector("#model-line");
  if (line) line.textContent = modelText();
}).catch(() => {});

fetch("/api/me").then(async (response) => {
  if (response.ok) me = (await response.json()).user;
  render();
}).catch(() => render());
