/** Client-side match scoring (mirrors src/match.js for scraped rows on Vercel). */

const TAG_RULES = [
  { tag: "Ohio", weight: 3, terms: ["ohio", "lebanon", "midwest"] },
  {
    tag: "Diabetes",
    weight: 4,
    terms: ["diabetes", "diabetic", "t1d", "type 1", "chronic illness", "chronic condition"],
  },
  { tag: "Athlete", weight: 3, terms: ["athlete", "athletic", "basketball", "sport", "sports"] },
  { tag: "Marketing", weight: 2, terms: ["marketing", "business", "communications", "advertising"] },
  { tag: "High school", weight: 1, terms: ["high school", "senior", "undergraduate", "college"] },
];

function haystack(record) {
  return [
    record.name,
    record.organization,
    record.description,
    record.amount,
    record.deadline,
    record.source,
    record.state,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function scoreScholarship(record, profile = null) {
  const text = haystack(record);
  const tags = [];
  let score = 0;

  for (const rule of TAG_RULES) {
    if (rule.terms.some((t) => text.includes(t))) {
      tags.push(rule.tag);
      score += rule.weight;
    }
  }

  if (profile) {
    const homeState = (profile.address?.state || "").toLowerCase();
    if (homeState && text.includes(homeState)) {
      if (!tags.includes("Ohio")) tags.push("Ohio");
      score += 2;
    }
    if (profile.intendedMajor && text.includes(profile.intendedMajor.toLowerCase())) score += 1;
    if ((profile.sports || []).some((s) => text.includes(s.toLowerCase()))) {
      if (!tags.includes("Athlete")) tags.push("Athlete");
      score += 1;
    }
  }

  if (record.source === "Diabetes Scholars") {
    if (!tags.includes("Diabetes")) tags.push("Diabetes");
    score += 3;
  }

  return { matchScore: score, matchTags: [...new Set(tags)] };
}

export function enrichRecord(record, profile = null) {
  const { matchScore, matchTags } = scoreScholarship(record, profile);
  return { ...record, matchScore, matchTags };
}
