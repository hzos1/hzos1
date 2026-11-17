#!/usr/bin/env python3
"""Build data/foods.json from the USDA SR Legacy CSV and the Taiwan FDA CSV.

Numbers are copied from those files. This script does not invent nutrient values.
The upstream zips are not committed; pass their extracted paths if you rebuild.
"""

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
USDA = Path("/tmp/sr/FoodData_Central_sr_legacy_food_csv_2018-04")
TW = Path("/tmp/twfood/20_2.csv")
OUT = ROOT / "data" / "foods.json"

# avoid tags: pork beef poultry seafood egg dairy soy gluten nuts sesame
USDA_FOODS = [
    ("168878", ["white rice", "steamed white rice", "cooked white rice"], "grain", False, False, [], ["western"]),
    ("169704", ["brown rice", "cooked brown rice"], "grain", False, False, [], ["western"]),
    ("171477", ["chicken breast", "roasted chicken breast"], "protein", False, False, ["poultry"], ["western"]),
    ("173424", ["hard-boiled egg", "boiled egg"], "protein", False, False, ["egg"], ["western"]),
    ("169967", ["cooked broccoli", "broccoli"], "vegetable", True, False, [], ["western"]),
    ("175168", ["cooked salmon", "salmon"], "protein", False, False, ["seafood"], ["western"]),
    ("173944", ["banana"], "fruit", True, False, [], ["western"]),
    ("171688", ["apple", "raw apple"], "fruit", True, False, [], ["western"]),
    ("171265", ["whole milk", "milk"], "dairy", False, False, ["dairy"], ["western"]),
    ("174924", ["white bread", "bread"], "grain", False, False, ["gluten"], ["western"]),
    ("172475", ["firm tofu", "tofu"], "protein", False, False, ["soy"], ["chinese"]),
    ("168250", ["pork tenderloin", "roasted pork tenderloin"], "protein", False, False, ["pork"], ["western"]),
    ("174031", ["lean ground beef", "ground beef"], "protein", False, False, ["beef"], ["western"]),
    ("168634", ["sirloin steak", "beef sirloin"], "protein", False, False, ["beef"], ["western"]),
    ("169737", ["cooked pasta", "pasta"], "grain", False, False, ["gluten"], ["western"]),
    ("170440", ["boiled potato", "potato"], "starch", False, True, [], ["western"]),
    ("168463", ["cooked spinach", "spinach"], "vegetable", True, False, [], ["western"]),
    ("170457", ["tomato", "raw tomato"], "vegetable", True, False, [], ["western"]),
    ("171284", ["plain yogurt", "yogurt"], "dairy", False, False, ["dairy"], ["western"]),
    ("173905", ["cooked oats", "oatmeal"], "grain", False, False, ["gluten"], ["western"]),
    ("169976", ["cooked cabbage", "cabbage"], "vegetable", True, False, [], ["western"]),
    ("170391", ["cooked bok choy", "bok choy", "pak choi"], "vegetable", True, False, [], ["chinese"]),
    ("168572", ["cooked napa cabbage", "napa cabbage"], "vegetable", True, False, [], ["chinese"]),
    ("170393", ["carrot", "raw carrot"], "vegetable", True, False, [], ["western"]),
    ("171971", ["cooked shrimp", "shrimp"], "protein", False, False, ["seafood"], ["western"]),
    ("173709", ["canned tuna", "tuna"], "protein", False, False, ["seafood"], ["western"]),
    ("169097", ["orange"], "fruit", True, False, [], ["western"]),
    ("168483", ["baked sweet potato", "sweet potato"], "starch", False, True, [], ["western"]),
    ("168409", ["cucumber"], "vegetable", True, False, [], ["western"]),
    ("169141", ["cooked green beans", "green beans"], "vegetable", True, False, [], ["western"]),
    ("168914", ["cooked rice noodles", "rice noodles"], "grain", False, False, [], ["chinese"]),
    ("167668", ["chinese fried rice without meat", "fried rice without meat"], "grain", False, False, [], ["chinese"]),
    ("171821", ["wonton soup"], "mixed", False, False, [], ["chinese"]),
    ("167667", ["chinese restaurant egg rolls", "egg rolls"], "mixed", False, False, ["gluten"], ["chinese"]),
    ("170698", ["french fries"], "starch", False, True, [], ["western"]),
    ("170317", ["cheese pizza regular crust", "cheese pizza"], "mixed", False, False, ["gluten", "dairy"], ["western"]),
    ("175006", ["prepared pancakes", "pancakes"], "grain", False, False, ["gluten", "egg", "dairy"], ["western"]),
    ("175039", ["waffles prepared from recipe", "waffles"], "grain", False, False, ["gluten", "egg", "dairy"], ["western"]),
    ("168411", ["edamame", "prepared edamame"], "protein", False, False, ["soy"], ["japanese"]),
    ("174289", ["hummus"], "protein", False, False, ["sesame"], ["western"]),
    ("167882", ["pan-fried pork chop", "pork chop"], "protein", False, False, ["pork"], ["western"]),
]

TW_FOODS = [
    ("A0550601", ["白飯", "白米飯"], "grain", False, False, [], ["chinese"]),
    ("R0100101", ["廣東粥"], "mixed", False, False, ["seafood", "pork", "egg", "gluten"], ["chinese"]),
    ("K0111101", ["雞水煮蛋", "水煮蛋"], "protein", False, False, ["egg", "poultry"], ["chinese"]),
    ("R4700901", ["傳統豆腐", "豆腐"], "protein", False, False, ["soy"], ["chinese"]),
    ("E3201201", ["青江菜"], "vegetable", True, False, [], ["chinese"]),
    ("I0402102", ["雞胸肉", "雞胸", "肉雞里肌肉"], "protein", False, False, ["poultry"], ["chinese"]),
    ("I0306101", ["豬小里肌", "豬里肌"], "protein", False, False, ["pork"], ["chinese"]),
    ("R5100101", ["叉燒", "叉燒肉"], "protein", False, False, ["pork"], ["chinese"]),
    ("L0102101", ["全脂鮮乳", "鮮乳"], "dairy", False, False, ["dairy"], ["chinese"]),
    ("E7400101", ["牛番茄", "番茄"], "vegetable", True, False, [], ["chinese"]),
    ("E5000101", ["菠菜"], "vegetable", True, False, [], ["chinese"]),
    ("B0700201", ["馬鈴薯"], "starch", False, True, [], ["chinese"]),
    ("E5800101", ["花椰菜"], "vegetable", True, False, [], ["chinese"]),
    ("E0200101", ["胡蘿蔔", "紅蘿蔔"], "vegetable", True, False, [], ["chinese"]),
    ("R2201501", ["高麗菜水餃", "熟水餃"], "mixed", False, False, ["gluten"], ["chinese"]),
    ("O0701501", ["鮮奶茶", "無糖鮮奶茶"], "drink", False, False, ["dairy"], ["chinese"]),
    ("O0702201", ["珍珠奶茶", "全糖珍珠奶茶"], "drink", False, False, ["dairy"], ["chinese"]),
    ("E3900101", ["芥藍", "芥藍菜"], "vegetable", True, False, [], ["chinese"]),
    ("B0400401", ["紅肉甘藷", "地瓜", "甘藷"], "starch", False, True, [], ["chinese"]),
    ("D3200404", ["富士蘋果"], "fruit", True, False, [], ["chinese"]),
    ("D0800401", ["北蕉", "香蕉"], "fruit", True, False, [], ["chinese"]),
]


def num(value):
    text = (value or "").strip().replace(",", "")
    if text == "":
        return None
    return float(text)


def load_usda():
    nutrients = {item[0]: {} for item in USDA_FOODS}
    wanted = {"1003", "1004", "1005", "1008", "1093"}
    with (USDA / "food_nutrient.csv").open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["fdc_id"] in nutrients and row["nutrient_id"] in wanted:
                nutrients[row["fdc_id"]][row["nutrient_id"]] = num(row["amount"])
    names = {}
    with (USDA / "food.csv").open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["fdc_id"] in nutrients:
                names[row["fdc_id"]] = row["description"]
    units = {}
    with (USDA / "measure_unit.csv").open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            units[row["id"]] = row["name"]
    portions = {item[0]: [] for item in USDA_FOODS}
    with (USDA / "food_portion.csv").open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row["fdc_id"] not in portions or len(portions[row["fdc_id"]]) >= 6:
                continue
            unit = units.get(row["measure_unit_id"], "")
            if unit == "undetermined":
                unit = ""
            label = " ".join(
                part
                for part in [row["amount"], unit, row["portion_description"], row["modifier"]]
                if part
            ).strip()
            grams = num(row["gram_weight"])
            if label and grams and grams > 0:
                portions[row["fdc_id"]].append({"label": label, "grams": grams})
    foods = []
    for fdc, aliases, group, produce, starchy, avoid, cuisine in USDA_FOODS:
        got = nutrients[fdc]
        missing = [key for key in ("1008", "1003", "1004", "1005") if got.get(key) is None]
        if missing:
            raise SystemExit(f"USDA {fdc} missing nutrients {missing}")
        foods.append(
            {
                "id": f"usda:{fdc}",
                "source": "usda-sr-legacy",
                "sourceId": fdc,
                "name": names[fdc],
                "aliases": aliases,
                "per100g": {
                    "energyKcal": got["1008"],
                    "proteinG": got["1003"],
                    "fatG": got["1004"],
                    "carbohydrateG": got["1005"],
                    "sodiumMg": got.get("1093"),
                },
                "state": "as described in the SR Legacy food name",
                "group": group,
                "produce": produce,
                "starchyRoot": starchy,
                "avoid": avoid,
                "cuisine": cuisine,
                "portions": portions[fdc],
                "dataset": "USDA FoodData Central SR Legacy CSV, April 2018 release files",
                "datasetUrl": "https://fdc.nal.usda.gov/download-datasets/",
                "license": "CC0 1.0",
            }
        )
    return foods


def load_taiwan():
    wanted_ids = {item[0] for item in TW_FOODS}
    rows = {item: {} for item in wanted_ids}
    meta = {}
    nutrient_name = {
        "熱量": "energyKcal",
        "粗蛋白": "proteinG",
        "粗脂肪": "fatG",
        "總碳水化合物": "carbohydrateG",
        "鈉": "sodiumMg",
    }
    with TW.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            sample_id = row["整合編號"]
            if sample_id not in wanted_ids:
                continue
            meta[sample_id] = {
                "name": row["樣品名稱"].strip(),
                "nameEn": (row["樣品英文名稱"] or "").strip(),
                "state": (row["內容物描述"] or "").strip(),
                "unitWeight": (row["每單位重"] or "").strip(),
            }
            key = nutrient_name.get(row["分析項"])
            if key:
                rows[sample_id][key] = num(row["每100克含量"])
    foods = []
    for sample_id, aliases, group, produce, starchy, avoid, cuisine in TW_FOODS:
        got = rows[sample_id]
        for key in ("energyKcal", "proteinG", "fatG", "carbohydrateG"):
            if got.get(key) is None:
                raise SystemExit(f"Taiwan {sample_id} missing {key}")
        info = meta[sample_id]
        portions = []
        unit = info["unitWeight"]
        if unit and unit not in {"0.0克", "0克", "0"}:
            grams = num(unit.replace("克", ""))
            if grams and grams > 0:
                portions.append({"label": f"資料集單位重 {unit}", "grams": grams})
        foods.append(
            {
                "id": f"tw:{sample_id}",
                "source": "taiwan-fda",
                "sourceId": sample_id,
                "name": info["name"],
                "nameEn": info["nameEn"],
                "aliases": aliases,
                "per100g": {
                    "energyKcal": got["energyKcal"],
                    "proteinG": got["proteinG"],
                    "fatG": got["fatG"],
                    "carbohydrateG": got["carbohydrateG"],
                    "sodiumMg": got.get("sodiumMg"),
                },
                "state": info["state"],
                "group": group,
                "produce": produce,
                "starchyRoot": starchy,
                "avoid": avoid,
                "cuisine": cuisine,
                "portions": portions,
                "dataset": "Taiwan FDA open data export 20, file 20_2.csv, package modified 2026-10-05",
                "datasetUrl": "https://data.gov.tw/dataset/8543",
                "license": "政府資料開放授權條款第 1 版",
            }
        )
    return foods


def main():
    foods = load_usda() + load_taiwan()
    seen = {}
    for food in foods:
        for alias in [food["name"], *food["aliases"]]:
            key = " ".join(alias.lower().replace("_", " ").split())
            if key in seen and seen[key] != food["id"]:
                raise SystemExit(f"alias collision {alias!r}: {seen[key]} and {food['id']}")
            seen[key] = food["id"]
    payload = {
        "retrieved": "2026-11-17",
        "note": "Per-100 g values are copied from the named datasets. Blank sodium stays null.",
        "foods": foods,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(foods)} foods to {OUT}")


if __name__ == "__main__":
    main()
