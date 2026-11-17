# Meal agent

DSC4070 / DSE4070 course demo. One responsive website for desktop and phone. It is not a native app.

Register with email and password, including the body profile, then the default page is **今日概覽 / Home**. Chat is an extra page under **更多**, not the entry point. The phone layout uses a bottom tab bar. The desktop layout uses a sidebar and a three-column home. There is no Google login.

| Route | Page |
| --- | --- |
| `/register` | Email, password, body profile, and the disclaimer acknowledgement. Not in the tab bar. |
| `/login` | Email and password. Restores the saved profile. |
| `/home` | Today's energy from the saved profile, recent meal summary, 30-day update reminder. |
| `/analyze` | Camera or album. Confirm the dish name and grams, then look up the database. |
| `/plan` | Next meal, cited healthy-eating checks, training-frequency comparison. |
| `/places` | GPS or a typed area. OpenStreetMap names only. |
| `/more` | Links to chat and profile. |
| `/chat` | Extra agent conversation. |
| `/profile` | View and edit the body profile. |

## Start

```bash
cd meal-agent
npm install
npm test
npm start
```

- Computer: `http://127.0.0.1:8787` opens login. Register once, then the app lands on `/home`.
- Phone camera needs a secure context. The server also listens on `https://<this-machine-LAN-ip>:8443` with a self-signed certificate in `meal-agent/certs/` (not committed). On the phone, open that HTTPS URL, accept the certificate warning, log in, then use **分析**.

`npm start` preloads the dish-name model and, unless disabled, the local tool-choice model. Both download on first use into `meal-agent/.cache` (not committed).

## What runs without API keys

Structured pages send `brain: "deterministic"`. The controller still runs the loop and the same tools: estimate, lookup, suggest, checks, training text, and places. Nutrition numbers come from `data/foods.json`.

Chat uses xAI Grok when `XAI_API_KEY` is set. The default model is `grok-4.7` (`POST https://api.x.ai/v1/chat/completions`). Gemini is not called. If the key is missing, chat tries local `onnx-community/Qwen2.5-0.5B-Instruct` once per turn. If that JSON is invalid, the harness recovers to the deterministic planner and the trace says so. Set `MEAL_AGENT_DISABLE_LOCAL_LLM=1` to skip that download. Final sentences are templates of tool observations.

Passwords are scrypt hashes in `meal-agent/var/` (gitignored). The session cookie is httpOnly. Do not commit that directory or any key.

## Environment

PowerShell:

```powershell
$env:XAI_API_KEY = "your-key"
npm start
```

Or create `meal-agent/.env` (gitignored) and restart `npm start`:

```
XAI_API_KEY=your-key
```

The process does not print the key. Optional `XAI_MODEL` overrides `grok-4.7`.

| Variable | Use |
| --- | --- |
| `XAI_API_KEY` | Optional. Chat controller calls Grok. Not used for calories. |
| `XAI_MODEL` | Optional. Defaults to `grok-4.7`. |
| `FDC_API_KEY` | Optional. English names missing from the local table can query USDA FoodData Central. The response stores the FDC id. |
| `MEAL_AGENT_DISABLE_LOCAL_LLM=1` | Do not load the local Qwen tool chooser. |
| `PORT` / `HTTPS_PORT` | Default `8787` and `8443`. |

## Cloudflare Quick Tunnel

Point the tunnel at the HTTP server, not the self-signed HTTPS port:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

Do not target port 8443. The public tunnel URL is HTTPS, so a phone can use the camera through it.

## Tools

The catalog is `GET /api/meta`. Calls are capped at 8 tools and 8 loops.

- `save_profile` — copies only fields the user typed or submitted. Missing fields stay empty.
- `estimate_needs` — Mifflin–St Jeor times FAO/WHO/UNU PAL 1.50 / 1.75 / 2.10. Cut is TDEE minus 500 kcal. Bulk is TDEE plus 400 kcal. Maintain is TDEE. A target below BMR is rejected.
- `recognize_dish` — photo to a dish label only. No calories.
- `lookup_meal` — name and grams must be in the user text or a confirmed proposal. Energy, protein, carbohydrate, fat, and sodium come from a cited row. Missing sodium stays null.
- `suggest_meal` — combinations from the local table, inside the meal budget, with avoid tags applied.
- `check_constraints` — protein, energy shares, sodium, and fruit/vegetable checks from the cited public rules.
- `training_guidance` — WHO 150 minutes and the 2-day muscle-strengthening reference, compared with the saved days. No sets or reps.
- `find_places` — Nominatim and Overpass after consent. No invented shops, menus, or calories.

## Eval

```bash
npm run eval
```

Writes `eval-output/results.json` and `results.csv`. Name accuracy is alias resolution against the cited table, not a photo study and not a clinical study. Calorie MAE/MAPE is only where a labeled row exists.

## Phone path

1. Open the HTTPS LAN URL, or a Cloudflare tunnel aimed at `http://127.0.0.1:8787`, and accept a certificate warning if you use the self-signed port.
2. Register with email, password, height, weight, age, sex, activity, target weight, goal, training days, and the disclaimer checkbox. The app lands on `/home`.
3. On a phone the bottom bar is 今日, 分析, 計劃, 餐廳, 更多. On a wide window the same destinations are in the sidebar, and Home is three columns.
4. On 分析, use 拍照, 相簿, or 開鏡頭. Confirm the name and grams. The calorie line appears only after lookup.
5. 計劃 and 餐廳 are separate pages. 更多 opens 聊天室 or 我的檔案; those are separate routes.
