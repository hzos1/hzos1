# 餐點熱量 agent：可引用的資料來源

三人課堂示範用。查核日期：2026-11-17。價格與額度會改，實作前再看各官網。數字是估算，不是醫療或飲食建議。公式適用對象是健康成人（Mifflin–St Jeor 的樣本為 19–78 歲）。

示範要做三件事：文字（最好也能用照片）估算一餐熱量與基本營養、由身高體重年齡性別與目標估算每日需要、再依剩餘熱量推薦一餐。照片只負責認出食物；熱量一律查資料庫，再乘上克數。

---

## 1. 營養資料庫與 API

### USDA FoodData Central（建議主庫）

- 網站：[fdc.nal.usda.gov](https://fdc.nal.usda.gov/)
- API 說明：[API Guide](https://fdc.nal.usda.gov/api-guide/)；免費金鑰：[註冊](https://fdc.nal.usda.gov/api-key-signup/)；整包下載：[Download](https://fdc.nal.usda.gov/download-datasets/)
- 提供：食物搜尋與單筆營養。能量、蛋白質、碳水、脂肪等，含每 100 克與家用份量。Foundation Foods、SR Legacy 適合原料；Branded 是包裝食品。
- 存取：免費。正式金鑰預設每 IP 每小時 1,000 次。文件裡的 `DEMO_KEY` 只供試用（每 IP 每小時 30 次、每日 50 次）。金鑰不要放進公開程式庫。
- 授權：公有領域，[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。請註明來源。建議引用：U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. [fdc.nal.usda.gov](https://fdc.nal.usda.gov/).
- 怎麼用：`GET https://api.nal.usda.gov/fdc/v1/foods/search?api_key=KEY&query=chicken%20breast&dataType=Foundation,SR%20Legacy&pageSize=5`。讀營養素名稱為 Energy、單位為 kcal 的欄位。熱量 = 每 100 克熱量 × 克數 / 100。中文菜名要先對到英文，或走下面的本地表。

### Open Food Facts（包裝食品、條碼）

- 文件：[API 介紹](https://openfoodfacts.github.io/openfoodfacts-server/api/)；使用條款：[terms of use](https://world.openfoodfacts.org/terms-of-use)；資料下載：[data](https://world.openfoodfacts.org/data)
- 提供：全球包裝食品的名稱、條碼、營養標示（`nutriments`，常見為每 100 克）。資料由志工填寫，不保證正確。
- 存取：讀取免費，不必金鑰。每次請求加上 `User-Agent: 應用名稱/版本 (聯絡信箱)`。產品讀取約 15 次/分鐘/IP，搜尋約 10 次/分鐘/IP。大量使用請下載 CSV 或 JSONL。
- 授權：資料庫 [ODbL](https://opendatacommons.org/licenses/odbl/1-0/)，內容 [DbCL](https://opendatacommons.org/licenses/dbcl/1-0/)，產品照片 CC BY-SA。公開使用要標示「資料來自 Open Food Facts」。若把本庫改寫後再散布，衍生資料庫也要按 ODbL 公開。課堂示範只在查詢時呼叫、不合併再發布，頁面上放出處即可。
- 怎麼用：條碼 `https://world.openfoodfacts.org/api/v2/product/3017624010701.json?fields=product_name,nutriments`。適合掃描包裝；不適合「一碗白飯」。全文搜尋仍是舊的 `/cgi/search.pl`，新的全文搜尋見 [Search-a-licious](https://search.openfoodfacts.org/)。

### 臺灣食品營養成分資料集（中式食材）

- 查詢：[食藥署食品營養成分資料庫](https://consumer.fda.gov.tw/Food/TFND.aspx?nodeID=178)
- 下載：[政府資料開放平臺 dataset/8543](https://data.gov.tw/dataset/8543)（CSV、JSON、XML）
- 提供：本土與市面常見食材，數值為每 100 克可食部分。2026 年 4 月查詢頁更新；開放平臺註明約每季更新。
- 存取：免費，不必金鑰。沒有好用的即時搜尋 API。下載後在自己的程式裡依中文名稱搜尋。
- 授權：[政府資料開放授權條款第 1 版](https://data.gov.tw/license)。
- 怎麼用：中文菜名先查這張表，查不到再查 USDA。

### 香港食物安全中心營養資料查詢（引用用，不能當 API）

- 查詢：[營養資料查詢](https://www.cfs.gov.hk/tc_chi/nutrient/fc-nutrientvalue.php)
- 提供：能量、蛋白質、碳水、脂肪、纖維、糖、鈉等。來源含本地化驗所、USDA、中國食物成分表（CFC2002Ed2）等，頁面有註記。
- 存取：網站免費查詢。沒有公開 REST API。
- 授權：以食安中心網站的轉載規定為準；報告請註明查詢日期與食物名稱。
- 怎麼用：示範若包含茶餐廳或本地菜，先手動抄 20–30 項做成小表，不要在示範當下爬站。

### 可選，但有限制

| 來源 | 網址 | 提供 | 存取 | 授權／備註 |
| --- | --- | --- | --- | --- |
| Spoonacular | [定價](https://spoonacular.com/food-api/pricing)、[文件](https://spoonacular.com/food-api/docs) | 食譜、營養，以及依 `targetCalories` 產生一日三餐：[Generate Meal Plan](https://spoonacular.com/food-api/docs#Generate-Meal-Plan) | 免費層每日 50 points，用完回 HTTP 402，午夜 UTC 重置。官網免費層不必信用卡，但要放回連。RapidAPI 上的免費層可能要信用卡。付費自約 US$29/月起 | 專有 API。食譜偏西式。扣點以回應標頭 `X-API-Quota-Request` 為準 |
| FatSecret Platform | [方案](https://platform.fatsecret.com/api-editions) | 美國食物搜尋、日記、食譜 | Basic 免費註冊，5,000 次/日，只含美國資料，要標示出處。學生可另外申請 Premier Free | 專有。影像辨識與自然語言是付費附加 |
| Edamam Nutrition Analysis | [說明](https://developer.edamam.com/edamam-nutrition-api) | 把一段食材文字拆成營養 | **要付費。** 沒有可長期使用的免費層；最小方案約 US$29/月，頁面有短期試用 | 專有，要標示出處 |
| Nutritionix | [API](https://www.nutritionix.com/api) | 自然語言食物紀錄、餐廳與品牌 | **要付費。** 沒有公開免費層；官網寫學生非商業試用已停止。公開牌價自約 US$499/月起 | 專有 |

**不要用 API Ninjas 的免費營養 API 當熱量來源。** [文件](https://api-ninjas.com/api/nutrition)寫明 `calories` 與 `protein_g` 是付費欄位。免費層有金鑰（約 3,000 次/月），但拿不到這次示範需要的熱量。

---

## 2. 開放資料集

| 資料集 | 網址 | 內容 | 授權與用法 |
| --- | --- | --- | --- |
| USDA 整包資料 | [下載頁](https://fdc.nal.usda.gov/download-datasets/) | 與 API 相同的營養表。Foundation、SR Legacy 小，可放進示範 | CC0。離線查詢、不必在課堂打 API |
| Open Food Facts dump | [data](https://world.openfoodfacts.org/data) | 包裝食品每日匯出 | ODbL。只在要做條碼示範時下載需要的欄位 |
| 臺灣開放資料 | [dataset/8543](https://data.gov.tw/dataset/8543) | 中文食材營養 | 政府資料開放授權條款第 1 版 |
| Food-101 | [ETH 頁](https://data.vision.ee.ethz.ch/cvl/datasets_extra/food-101/)、[Hugging Face](https://huggingface.co/datasets/ethz/food101)、論文 [Bossard 等，ECCV 2014](https://data.vision.ee.ethz.ch/cvl/datasets_extra/food-101/static/bossard_eccv14_food-101.pdf) | 101 類、101,000 張，每類 750 張訓練、250 張測試。只有菜名，沒有熱量 | 影像來自 Foodspotting，不屬 ETH。學術合理使用可以；其他用途要向影像權利人取得許可。類別以西式為主 |
| Nutrition5k | [GitHub](https://github.com/google-research-datasets/nutrition5k)（已封存）、論文 [Thames 等，CVPR 2021](https://arxiv.org/abs/2103.03375) | 5,006 盤真實餐點：影片、部分 RGB-D、食材克數、熱量與三大營養素。營養由 USDA 計算 | 以 repo 的 LICENSE 為準。壓縮檔約 181 GB。用來引用誤差，不要在課堂重訓 |
| ChineseFoodNet | [計畫頁](https://sites.google.com/view/chinesefoodnet/)、論文 [Chen 等，arXiv:1705.02743](https://arxiv.org/abs/1705.02743) | 約 185,628 張、208 類中國菜。只有類別 | 學術免費；影像不屬發布者，超出非商業合理使用要另洽。下載連結可能失效 |
| Vireo Food-172 | 論文 Chen 與 Ngo，ACM Multimedia 2016；資料曾放在 `vireo.cs.cityu.edu.hk` | 110,241 張、172 類中國菜，另有食材標籤 | 學術資料。連結不穩，只作「中式菜辨識」的文獻，不列入必備下載 |

---

## 3. 食物辨識與從照片估熱量

課堂做法：照片 → 菜名（與大致份量）→ 使用者確認克數 → 資料庫換算。模型直接回答的卡路里只可當對照，不可當結果。

### 可直接用的模型

- **[nateraw/food](https://huggingface.co/nateraw/food)**：`google/vit-base-patch16-224-in21k` 在 Food-101 上微調。模型卡自述驗證集準確率 0.8913。輸出 101 類菜名與信心，沒有克數、沒有熱量。可在本機用 Transformers 跑，不必付費。模型卡沒有另寫授權；Food-101 影像的限制仍在。中式混合餐、一盤多道菜會失敗。
- **Gemini 多模態（免費層，當菜名解析器）**：[定價](https://ai.google.dev/gemini-api/docs/pricing)、[額度](https://ai.google.dev/gemini-api/docs/rate-limits)、金鑰在 [Google AI Studio](https://aistudio.google.com/apikey)。2026-11-17 定價頁上，`gemini-3.5-flash-lite` 的標準輸入（含影像）與輸出在免費層不計費，並寫成適合大量 agent 工作。免費層內容可能被用來改進 Google 產品。額度以該專案在 AI Studio 顯示的數字為準，文件不再公布固定的每分鐘次數。請模型只回食物名稱與估計克數，熱量仍查 USDA 或臺灣表。示範用虛構個資。

### 論文（說明方法，沒有可呼叫的 API）

- Myers 等，[Im2Calories，ICCV 2015](https://www.cs.ubc.ca/~murphyk/Papers/im2calories_iccv15.pdf)。餐廳場景是「辨識菜名 → 查該餐廳營養」；餐廳外還要分割與體積。這就是本示範該抄的流程。沒有公開權重。
- Thames 等，[Nutrition5k，CVPR 2021](https://arxiv.org/abs/2103.03375)。單張 RGB 直接回歸熱量的平均絕對誤差約 26.1%；加上深度估出的體積與「每克營養」模型後，熱量誤差約 16.5%。用來說明：就算有專門資料，照片直接報卡路里仍然粗。

### 影像 API（試用後要付費）

- [LogMeal](https://logmeal.com/food-ai-engine-pricing)、[文件](https://docs.logmeal.com/docs/guides-essential-concepts-plans-limits)：上傳餐點照片，回菜名與營養。新用戶試用最長 30 天或 200 次查詢、5 位使用者，之後要訂閱。**試用結束就要付費金鑰。** 三人示範不必依賴它。

---

## 4. 每日熱量：公式，不必呼叫 API

**Mifflin–St Jeor（1990）估靜息消耗，再乘身體活動水平（PAL）。**

- 論文：Mifflin 等，*Am J Clin Nutr.* 1990;51(2):241–247。[PubMed 2305711](https://pubmed.ncbi.nlm.nih.gov/2305711/)
- 男性 BMR = 10×體重(kg) + 6.25×身高(cm) − 5×年齡 + 5
- 女性 BMR = 10×體重(kg) + 6.25×身高(cm) − 5×年齡 − 161
- Frankenfield、Roth-Yousey、Compher 的 2005 年系統性回顧認為，在常見公式裡這條最常落在實測值 ±10% 以內，個人仍可能偏差更大（*J Am Diet Assoc.* 2005;105:775–789）。

**PAL** 用 FAO/WHO/UNU《Human energy requirements》（2001 年專家會議，2004 年出版）：[第 5.3 節](https://www.fao.org/4/y5686e/y5686e07.htm)。成人可長期維持的範圍約 1.40–2.40。

| 表單選項 | 公布範圍 | 示範採用 |
| --- | --- | --- |
| 少動 | 1.40–1.69 | 1.50 |
| 中度活動 | 1.70–1.99 | 1.75 |
| 高活動 | 2.00–2.40 | 2.10 |

TDEE = BMR × PAL。1.50、1.75、2.10 是各檔範圍內的代表值，方便做三個選項，不是另一條新公式。健身網站常見的 1.2、1.375、1.55、1.725、1.9 不要寫進報告，那組數字不在這份 FAO 報告裡。

**目標（課堂粗估）：** 維持 = TDEE；減重 = TDEE − 500 kcal；增重 = TDEE + 400 kcal。500 kcal 的缺口常被說成大約每週 0.5 公斤，只適合當示範規則。頁面上寫明這是估算。

剩餘預算 = 目標 − 當天已記錄熱量。推薦時只從自己的小菜表挑，使這一餐熱量不超過剩餘預算。不必為了推薦再接一個食譜 API。若一定要現成食譜，再用 Spoonacular 的 `targetCalories`，並注意 50 points/日。

---

## 5. 網頁上可示範的 agent 範式

用**工具呼叫迴圈**：使用者在網頁輸入文字或照片 → 模型決定呼叫哪個工具 → 工具回傳 JSON → 模型用這些數字寫回答。一個頁面、三個工具就對上作業三項功能。

| 工具 | 輸入 | 做什麼 |
| --- | --- | --- |
| `lookup_meal` | 食物名稱與克數，或一張照片 | 照片只取菜名；熱量與蛋白質、碳水、脂肪查 USDA／本地表 |
| `estimate_needs` | 體重、身高、年齡、性別、活動、目標 | 計算 BMR、TDEE、目標熱量 |
| `suggest_meal` | 剩餘熱量 | 從小菜表挑一餐，總熱量不超過剩餘 |

程式與示範頁：

- 短食譜（客戶端加一個 API route，工具範例是天氣，改成上面三個工具）：[Call Tools](https://ai-sdk.dev/cookbook/next/call-tools)
- 同一套 UI 的說明（伺服器工具、需要使用者確認的工具）：[Chatbot Tool Usage](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage)
- 可打開的網頁：[chatbot.ai-sdk.dev](https://chatbot.ai-sdk.dev/)
- 該網頁的原始碼：[vercel/chatbot](https://github.com/vercel/chatbot)（Apache-2.0）。這包還含資料庫、登入與 AI Gateway，**不要整包當作業**。抄食譜那一頁即可
- SDK 本身：[vercel/ai](https://github.com/vercel/ai)，Apache-2.0，說明在 [ai-sdk.dev](https://ai-sdk.dev/)
- 更小、已部署、看得出工具被呼叫的參考頁：[ai-sdk-from-zero.vercel.app](https://ai-sdk-from-zero.vercel.app/)，程式 [dev48v/ai-sdk-from-zero](https://github.com/dev48v/ai-sdk-from-zero)。它用 Gemini 免費金鑰，工具是時間與字數，可改成營養工具

食譜裡的模型字串要換成 AI Studio 的免費模型（優先 `gemini-3.5-flash-lite`）。先在 AI Studio 確認該模型可以 function calling；不行就改定價頁上另一個免費 Flash。這一步要免費金鑰，不是付費金鑰。免費層不要送真實健康資料。

若報告要引用「模型先想再行動」這類論文，用 Yao 等，[ReAct，ICLR 2023](https://arxiv.org/abs/2210.03629)。示範頁不必實作完整的 thought / action / observation 軌跡；工具呼叫就是可展示的版本。

---

## 6. 建議組合

1. **營養資料庫：USDA FoodData Central API。** 免費金鑰、CC0、能依文字搜尋並回傳熱量與三大營養素。中文食材用同一支 `lookup_meal` 先查下載好的臺灣食品營養成分表，查不到再查 USDA。香港本地菜用手動抄的小表。Open Food Facts 只留給條碼。
2. **每日需要：Mifflin–St Jeor × FAO 的 PAL（1.50 / 1.75 / 2.10）。** 幾十行就能算完，有論文與 FAO 報告可引用，不必付費，也不會因 API 額度在示範時失敗。減重減 500 kcal、增重加 400 kcal，頁面標成粗估。
3. **照片：`nateraw/food` 只輸出菜名，使用者確認克數後查 USDA。** 本機可跑、不必付費、Food-101 與 89% 的驗證準確率寫得進報告。它認不好中式混合餐；那種照片改走文字，或讓 Gemini 免費層只回菜名與克數，熱量仍查資料庫。Nutrition5k 用來說明「照片直接回歸熱量」誤差仍大，不拿來訓練。
4. **Agent：Vercel AI SDK 的工具呼叫網頁。** 食譜有完整程式，[chatbot.ai-sdk.dev](https://chatbot.ai-sdk.dev/) 是可打開的網頁，授權 Apache-2.0。三個工具對上三項功能。語言模型用 Gemini 免費層。不要採用整包 `vercel/chatbot`（資料庫與登入超出作業範圍），也不要接 Edamam、Nutritionix 或 LogMeal 的付費金鑰。

---

## 7. 實作時採用的頁面（2026-11-17）

上面第 5 節的食譜是資料來源，不是最後的畫面。示範是同一個響應式網頁，聊天室不是預設入口。路由是 `/onboarding`、`/home`、`/analyze`、`/plan`、`/places`、`/more`、`/chat`、`/profile`。每頁的動作都走同一套工具迴圈，並顯示 thought / action / observation。這份筆記前文說「不必實作完整軌跡」只描述食譜；本示範有做軌跡。沒有把這份筆記改寫成可繳交的報告正文。
