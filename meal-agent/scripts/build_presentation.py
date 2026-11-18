"""Build Meal Agent DSC4070 presentation template (Sage Calm theme)."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from lxml import etree
from pathlib import Path

SAGE = RGBColor(0x84, 0xB5, 0x9F)
EUC = RGBColor(0x69, 0xA2, 0x97)
SLATE = RGBColor(0x50, 0x80, 0x8E)
MIST = RGBColor(0xEE, 0xF3, 0xF1)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
INK = RGBColor(0x2A, 0x3A, 0x3F)
MUTED = RGBColor(0x5A, 0x6F, 0x74)

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
W, H = prs.slide_width, prs.slide_height


def set_run(run, size=18, bold=False, color=INK, font="Calibri"):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    r_pr = run._r.get_or_add_rPr()
    ea = r_pr.find(qn("a:ea"))
    if ea is None:
        ea = etree.SubElement(r_pr, qn("a:ea"))
    ea.set("typeface", "Microsoft JhengHei")


def add_rect(slide, left, top, width, height, fill):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background()
    return shape


def add_text(slide, left, top, width, height, lines, size=18, bold=False, color=INK, align=PP_ALIGN.LEFT, font="Calibri"):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        run = p.add_run()
        run.text = line
        use_font = "Barlow Condensed" if (bold and size >= 28) else font
        set_run(run, size=size, bold=bold, color=color, font=use_font)
    return box


def add_bullets(slide, left, top, width, height, items, size=18, color=INK):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.level = item.get("level", 0)
        run = p.add_run()
        run.text = item["text"]
        set_run(run, size=size - 2 * item.get("level", 0), bold=item.get("bold", False), color=color)
    return box


def footer(slide, page, total=10):
    add_text(slide, Inches(0.5), Inches(7.05), Inches(8), Inches(0.35),
             ["Meal Agent · DSC4070 Group Project"], size=11, color=MUTED)
    add_text(slide, Inches(11.5), Inches(7.05), Inches(1.5), Inches(0.35),
             [f"{page} / {total}"], size=11, color=MUTED, align=PP_ALIGN.RIGHT)


def section_bar(slide):
    add_rect(slide, 0, 0, W, Inches(0.18), SAGE)
    add_rect(slide, 0, Inches(0.18), W, Inches(0.08), EUC)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


# 1 Title
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, MIST)
add_rect(s, 0, 0, Inches(0.35), H, SLATE)
add_rect(s, 0, Inches(5.9), W, Inches(1.6), SLATE)
add_text(s, Inches(0.8), Inches(1.8), Inches(11), Inches(1), ["Meal Agent"], size=54, bold=True, color=SLATE)
add_text(s, Inches(0.8), Inches(2.8), Inches(11), Inches(0.6),
         ["An agent-based meal logging & daily intake system"], size=24, color=EUC)
add_text(s, Inches(0.8), Inches(3.6), Inches(11), Inches(1.2),
         ["DSC4070 Group Project  ·  Presentation (10 min)",
          "Replace: Group name / members / demo URL"], size=18, color=MUTED)
add_text(s, Inches(0.8), Inches(6.2), Inches(11), Inches(0.9),
         ["Demo: https://________________.trycloudflare.com",
          "Repo: github.com/hzos1/hzos1  ·  branch cursor/meal-agent-demo-07aa"], size=16, color=WHITE)
notes(s, "Opening (~20s). Introduce team, one-sentence product pitch, point to live demo URL.")

# 2 Agenda
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, WHITE)
section_bar(s)
add_text(s, Inches(0.6), Inches(0.5), Inches(12), Inches(0.6), ["Agenda · 10 minutes"], size=32, bold=True, color=SLATE)
rows = [
    ("~2 min", "Problem & why an agent (not a chatbot)", "Speaker A"),
    ("~2.5 min", "System design: loop, tools, memory, harness", "Speaker B"),
    ("~2.5 min", "Live demo (Home → Analyze → Plan)", "Speaker C"),
    ("~2 min", "Evaluation & limitations", "A / B"),
    ("~1 min", "Sources, contributions, Q&A", "All"),
]
y = 1.4
for time, topic, who in rows:
    add_rect(s, Inches(0.6), Inches(y), Inches(12.1), Inches(0.85), MIST)
    add_rect(s, Inches(0.6), Inches(y), Inches(0.18), Inches(0.85), SAGE)
    add_text(s, Inches(1.0), Inches(y + 0.18), Inches(2), Inches(0.5), [time], size=18, bold=True, color=EUC)
    add_text(s, Inches(3.2), Inches(y + 0.18), Inches(7), Inches(0.5), [topic], size=18, color=INK)
    add_text(s, Inches(10.3), Inches(y + 0.18), Inches(2.2), Inches(0.5), [who], size=16, color=MUTED)
    y += 1.0
footer(s, 2)
notes(s, "Show speaking order. Keep to time boxes.")

# 3 Problem
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, WHITE)
section_bar(s)
add_text(s, Inches(0.6), Inches(0.5), Inches(12), Inches(0.6), ["1 · Problem & users"], size=32, bold=True, color=SLATE)
add_bullets(s, Inches(0.7), Inches(1.4), Inches(6), Inches(4.5), [
    {"text": "Real-life need", "bold": True},
    {"text": "Estimate meal energy after eating", "level": 1},
    {"text": "Know today's budget from body profile & target weight", "level": 1},
    {"text": "See remaining intake after logged meals", "level": 1},
    {"text": "Why not a plain chatbot?", "bold": True},
    {"text": "Calories must come from tools / cited rows / vision estimates", "level": 1},
    {"text": "Human confirms dish + grams before logging", "level": 1},
    {"text": "Home is the default; Chat is a separate page", "level": 1},
], size=18)
add_rect(s, Inches(7.4), Inches(1.4), Inches(5.2), Inches(4.6), MIST)
add_text(s, Inches(7.7), Inches(1.7), Inches(4.6), Inches(0.5), ["One-sentence pitch"], size=16, bold=True, color=EUC)
add_text(s, Inches(7.7), Inches(2.4), Inches(4.6), Inches(3), [
    "A meal agent website that logs food (photo AI or table), computes a daily target from your profile, and recommends remaining intake toward your target weight — with a visible ReAct tool trace."
], size=18, color=INK)
footer(s, 3)
notes(s, "Speaker A ~2 min. Emphasize agent vs chatbot and human-in-the-loop.")

# 4 Architecture
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, WHITE)
section_bar(s)
add_text(s, Inches(0.6), Inches(0.5), Inches(12), Inches(0.6), ["2 · Agent design"], size=32, bold=True, color=SLATE)
add_text(s, Inches(0.6), Inches(1.2), Inches(12), Inches(0.4),
         ["Goal → Plan → Tool → Observe → Update state"], size=20, bold=True, color=EUC)
boxes = [
    (0.6, "Planning", "planning.js\ndeterministic /\nGrok chooser"),
    (3.7, "Tools", "tools.js\nschema-bound\ncalls"),
    (6.8, "Memory", "session +\nprofile / meals\neaten / needs"),
    (9.9, "Harness", "max 8 loops\nforbid inventing\nkcal fields"),
]
for x, title, body in boxes:
    add_rect(s, Inches(x), Inches(1.9), Inches(2.8), Inches(2.6), MIST)
    add_rect(s, Inches(x), Inches(1.9), Inches(2.8), Inches(0.55), SLATE)
    add_text(s, Inches(x + 0.15), Inches(2.0), Inches(2.5), Inches(0.4), [title], size=18, bold=True, color=WHITE)
    add_text(s, Inches(x + 0.2), Inches(2.7), Inches(2.4), Inches(1.6), body.split("\n"), size=15, color=INK)
add_bullets(s, Inches(0.6), Inches(4.8), Inches(12), Inches(1.8), [
    {"text": "UI shows thought / action / observation for each turn"},
    {"text": "Model selects tools only — it cannot write calorie numbers into the schema"},
    {"text": "Failure falls back to deterministic planner (harness recovery)"},
], size=17)
footer(s, 4)
notes(s, "Speaker B. Map to Weng agent loop + harness lecture.")

# 5 Tools
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, WHITE)
section_bar(s)
add_text(s, Inches(0.6), Inches(0.5), Inches(12), Inches(0.6), ["2 · Tools catalog"], size=32, bold=True, color=SLATE)
tools = [
    ("recognize_dish", "Multimodal AI → dish + macros + micros"),
    ("lookup_meal", "Log confirmed meal / vision override"),
    ("estimate_needs", "Mifflin × PAL → classroom target kcal"),
    ("recommend_intake", "Target / logged / remaining vs weight path"),
    ("suggest_meal", "Day plan inside remaining budget"),
    ("check_constraints", "WHO-style checks + advice"),
    ("training_guidance", "Public frequency note only"),
    ("save_profile", "Store body fields user provided"),
]
y = 1.25
for i, (name, desc) in enumerate(tools):
    col = i % 2
    row = i // 2
    x = 0.6 + col * 6.3
    yy = y + row * 1.15
    add_rect(s, Inches(x), Inches(yy), Inches(6.0), Inches(1.0), MIST)
    add_text(s, Inches(x + 0.25), Inches(yy + 0.15), Inches(5.5), Inches(0.35), [name], size=16, bold=True, color=SLATE)
    add_text(s, Inches(x + 0.25), Inches(yy + 0.5), Inches(5.5), Inches(0.4), [desc], size=14, color=MUTED)
footer(s, 5)
notes(s, "Quick tool tour. Highlight recognize_dish + recommend_intake.")

# 6 Demo
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, WHITE)
section_bar(s)
add_text(s, Inches(0.6), Inches(0.5), Inches(12), Inches(0.6), ["3 · Live demo script"], size=32, bold=True, color=SLATE)
steps = [
    ("01", "Register → Home", "Profile + disclaimer → BMR / PAL / TDEE / AI daily intake"),
    ("02", "Analyze", "Photo → multimodal estimate → edit ingredients → confirm log"),
    ("03", "Plan", "Day meals within remaining budget; each item cites a source id"),
    ("04", "Optional Chat", "Prompt chips + ReAct trace (needs XAI_API_KEY)"),
]
y = 1.3
for num, title, detail in steps:
    add_rect(s, Inches(0.6), Inches(y), Inches(1.1), Inches(1.05), SAGE)
    add_text(s, Inches(0.7), Inches(y + 0.28), Inches(0.9), Inches(0.5), [num], size=22, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
    add_rect(s, Inches(1.85), Inches(y), Inches(10.8), Inches(1.05), MIST)
    add_text(s, Inches(2.1), Inches(y + 0.15), Inches(10), Inches(0.4), [title], size=18, bold=True, color=SLATE)
    add_text(s, Inches(2.1), Inches(y + 0.55), Inches(10), Inches(0.4), [detail], size=15, color=MUTED)
    y += 1.25
footer(s, 6)
notes(s, "Speaker C. Pre-open tunnel. Backup: localhost:8787.")

# 7 Evaluation
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, WHITE)
section_bar(s)
add_text(s, Inches(0.6), Inches(0.5), Inches(12), Inches(0.6), ["4 · Evaluation (npm run eval)"], size=32, bold=True, color=SLATE)
metrics = [
    ("28 / 29", "Name match ≈ 0.966", "Alias → cited row\n(not a photo study)"),
    ("MAE 0", "MAPE 0", "On labeled parsed rows\nMissing rows excluded"),
    ("3 / 3", "Budgets OK", "180 / 450 / 700 kcal\nplans did not exceed"),
]
for i, (big, mid, small) in enumerate(metrics):
    x = 0.7 + i * 4.1
    add_rect(s, Inches(x), Inches(1.5), Inches(3.8), Inches(3.6), MIST)
    add_rect(s, Inches(x), Inches(1.5), Inches(3.8), Inches(0.2), EUC)
    add_text(s, Inches(x + 0.2), Inches(2.0), Inches(3.4), Inches(0.8), [big], size=36, bold=True, color=SLATE, align=PP_ALIGN.CENTER)
    add_text(s, Inches(x + 0.2), Inches(2.9), Inches(3.4), Inches(0.5), [mid], size=18, bold=True, color=EUC, align=PP_ALIGN.CENTER)
    add_text(s, Inches(x + 0.3), Inches(3.6), Inches(3.2), Inches(1.2), small.split("\n"), size=14, color=MUTED, align=PP_ALIGN.CENTER)
add_text(s, Inches(0.7), Inches(5.4), Inches(12), Inches(1), [
    "Limitations: demo estimates ≠ medical advice; table coverage gaps; vision needs a valid XAI key; Quick Tunnel URL changes on restart."
], size=16, color=INK)
footer(s, 7)
notes(s, "Speaker A/B ~2 min. Stress what the metrics are NOT.")

# 8 Course mapping
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, WHITE)
section_bar(s)
add_text(s, Inches(0.6), Inches(0.5), Inches(12), Inches(0.6), ["Course concepts → this project"], size=32, bold=True, color=SLATE)
pairs = [
    ("Agent loop", "src/agent.js + UI ReAct trace"),
    ("Planning / Tools / Memory", "planning.js · tools/harness · session + var/"),
    ("Tool calling + schema", "GET /api/meta; forbid invented kcal"),
    ("Harness limits", "8 tools / 8 loops; recovery path"),
    ("Human in the loop", "Confirm name + grams before log"),
    ("Not done", "SFT / RL / PEFT / DPO / Generative Agents"),
]
y = 1.3
for left, right in pairs:
    add_rect(s, Inches(0.6), Inches(y), Inches(4.2), Inches(0.75), SLATE)
    add_text(s, Inches(0.8), Inches(y + 0.18), Inches(3.8), Inches(0.45), [left], size=16, bold=True, color=WHITE)
    add_rect(s, Inches(4.9), Inches(y), Inches(7.8), Inches(0.75), MIST)
    add_text(s, Inches(5.15), Inches(y + 0.18), Inches(7.4), Inches(0.45), [right], size=16, color=INK)
    y += 0.88
footer(s, 8)
notes(s, "Tie back to lectures. Useful if asked where the harness is.")

# 9 Team
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, WHITE)
section_bar(s)
add_text(s, Inches(0.6), Inches(0.5), Inches(12), Inches(0.6), ["Team & next steps"], size=32, bold=True, color=SLATE)
add_text(s, Inches(0.6), Inches(1.3), Inches(12), Inches(0.4), ["Fill before the talk"], size=16, bold=True, color=EUC)
members = [
    ("Member A — ____________", "UI / Home intake / presentation opening"),
    ("Member B — ____________", "Agent loop / tools / harness"),
    ("Member C — ____________", "Demo / eval / analyze vision path"),
]
y = 1.9
for name, role in members:
    add_rect(s, Inches(0.6), Inches(y), Inches(12.1), Inches(0.95), MIST)
    add_text(s, Inches(0.9), Inches(y + 0.15), Inches(11), Inches(0.35), [name], size=18, bold=True, color=SLATE)
    add_text(s, Inches(0.9), Inches(y + 0.5), Inches(11), Inches(0.35), [role], size=15, color=MUTED)
    y += 1.1
add_text(s, Inches(0.6), Inches(5.4), Inches(12), Inches(1.2), [
    "Report (50%): 5 sections only — members, task, metrics, design, how well it works.",
    "File: XXXX-report.pdf → Canvas by end of week 13."
], size=16, color=INK)
footer(s, 9)
notes(s, "Replace blanks with real names/IDs. Align with report section 1.")

# 10 Q&A
s = prs.slides.add_slide(prs.slide_layouts[6])
add_rect(s, 0, 0, W, H, SLATE)
add_rect(s, 0, 0, W, Inches(0.25), SAGE)
add_text(s, Inches(0.8), Inches(2.4), Inches(11.5), Inches(1), ["Thank you"], size=54, bold=True, color=WHITE, align=PP_ALIGN.CENTER)
add_text(s, Inches(0.8), Inches(3.5), Inches(11.5), Inches(0.6), ["Questions?"], size=28, color=SAGE, align=PP_ALIGN.CENTER)
add_text(s, Inches(0.8), Inches(4.5), Inches(11.5), Inches(1.2), [
    "Demo · GitHub · Trace on Home / Analyze / Plan",
    "Replace this line with your live tunnel URL before class"
], size=16, color=WHITE, align=PP_ALIGN.CENTER)
notes(s, "Leave demo open. Ready answers: why not invent kcal; vision editable; eval scope.")

out = Path(__file__).resolve().parents[1] / "docs" / "Meal-Agent-Presentation-Template.pptx"
out.parent.mkdir(parents=True, exist_ok=True)
prs.save(out)
print(out)
