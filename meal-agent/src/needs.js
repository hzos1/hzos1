import { round1 } from "./foods.js";

export const PAL = { low: 1.5, moderate: 1.75, high: 2.1 };
export const LOSS_KCAL = 500;
export const GAIN_KCAL = 400;

const LIMITS = {
  weightKg: [35, 250],
  heightCm: [120, 230],
  age: [15, 100],
  targetWeightKg: [35, 250],
};

export function bmr({ sex, weightKg, heightCm, age }) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function validateProfile(input) {
  const errors = [];
  const warnings = [];
  const required = ["weightKg", "heightCm", "age", "sex", "activity", "goal", "targetWeightKg"];
  for (const field of required) {
    if (input?.[field] == null || input[field] === "") errors.push(`missing:${field}`);
  }
  if (errors.length) return { ok: false, errors, warnings };

  const profile = {
    weightKg: Number(input.weightKg),
    heightCm: Number(input.heightCm),
    age: Number(input.age),
    sex: input.sex,
    activity: input.activity,
    goal: input.goal,
    targetWeightKg: Number(input.targetWeightKg),
  };
  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    if (!Number.isFinite(profile[field]) || profile[field] < min || profile[field] > max) errors.push(`range:${field}`);
  }
  if (!["male", "female"].includes(profile.sex)) errors.push("range:sex");
  if (!PAL[profile.activity]) errors.push("range:activity");
  if (!["lose", "gain", "maintain"].includes(profile.goal)) errors.push("range:goal");
  if (profile.goal === "lose" && profile.targetWeightKg >= profile.weightKg) errors.push("inconsistent:lose-target");
  if (profile.goal === "gain" && profile.targetWeightKg <= profile.weightKg) errors.push("inconsistent:gain-target");
  if (profile.goal === "maintain" && Math.abs(profile.targetWeightKg - profile.weightKg) > 2) errors.push("inconsistent:maintain-target");
  if (input.trainingDays != null && input.trainingDays !== "") {
    const days = Number(input.trainingDays);
    if (!Number.isInteger(days) || days < 0 || days > 7) errors.push("range:trainingDays");
    else profile.trainingDays = days;
  }
  if (profile.age < 19 || profile.age > 78) warnings.push("age-outside-mifflin-sample-19-78");
  if (Math.abs(profile.targetWeightKg - profile.weightKg) > 10) warnings.push("target-gap-over-10kg-deficit-not-increased");
  return { ok: errors.length === 0, errors, warnings, profile };
}

export function estimateNeeds(profileInput) {
  const validated = validateProfile(profileInput);
  if (!validated.ok) {
    const incomplete = validated.errors.every((error) => error.startsWith("missing:"));
    return { ok: false, rejected: !incomplete, incomplete, errors: validated.errors, warnings: validated.warnings };
  }
  const profile = validated.profile;
  const bmrKcal = bmr(profile);
  const pal = PAL[profile.activity];
  const tdeeKcal = bmrKcal * pal;
  const adjustment = profile.goal === "lose" ? -LOSS_KCAL : profile.goal === "gain" ? GAIN_KCAL : 0;
  const targetKcal = tdeeKcal + adjustment;
  const warnings = [...validated.warnings];
  const rejected = targetKcal < bmrKcal;
  if (rejected) warnings.push("target-below-bmr");
  if (targetKcal > 4500) warnings.push("target-above-4500");
    return {
    ok: !rejected,
    rejected,
    incomplete: false,
    errors: rejected ? ["extreme:target-below-bmr"] : [],
    warnings,
    bmrKcal: round1(bmrKcal),
    pal,
    tdeeKcal: round1(tdeeKcal),
    adjustmentKcal: adjustment,
    targetKcal: round1(targetKcal),
    goal: profile.goal,
    targetWeightKg: profile.targetWeightKg,
    citations: [
      "Mifflin et al., Am J Clin Nutr. 1990;51:241-247. https://pubmed.ncbi.nlm.nih.gov/2305711/",
      "FAO/WHO/UNU Human energy requirements, PAL bands. https://www.fao.org/4/y5686e/y5686e07.htm",
      "NIH News in Health, Dec 2022: about 500 fewer calories per day for about one pound per week. https://newsinhealth.nih.gov/2022/12/healthy-weight-control",
      "Course demo rule: lose = TDEE − 500 kcal, gain = TDEE + 400 kcal, maintain = TDEE. The gap to target weight does not deepen the deficit.",
    ],
  };
}
