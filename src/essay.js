import fs from "fs";
import OpenAI from "openai";
import { config } from "./config.js";
import { getOpenAiKey } from "./settings.js";
import { loadProfile } from "./profile.js";

let client = null;
let cachedEssay = null;

function getClient() {
  const apiKey = getOpenAiKey();
  if (!apiKey) return null;
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

export function loadMasterEssay() {
  if (cachedEssay) return cachedEssay;
  cachedEssay = fs.readFileSync(config.essayPath, "utf8").trim();
  return cachedEssay;
}

function profileEmphasis(profile) {
  const points = [];
  if (profile.diabetesStory) points.push(`- Emphasize: ${profile.diabetesStory.slice(0, 200)}`);
  if (profile.sports?.length) points.push(`- Emphasize student-athlete background (${profile.sports.join(", ")})`);
  if (profile.intendedMajor) points.push(`- Align with intended major: ${profile.intendedMajor}`);
  if (profile.careerGoals) points.push(`- Connect to career goals: ${profile.careerGoals.slice(0, 200)}`);
  if (!points.length) points.push("- Keep the student's authentic voice from the master essay");
  return points.join("\n");
}

export async function rewriteEssay({ scholarshipDetails, wordLimit }) {
  const openai = getClient();
  const masterEssay = loadMasterEssay();
  const profile = loadProfile();

  if (!openai) return masterEssay;

  const wordInstruction = wordLimit
    ? `- Match requested word count as closely as possible (target: ${wordLimit} words)`
    : "- Keep a concise scholarship essay length (about 400-550 words unless details specify otherwise)";

  const userPrompt = `Rewrite this master scholarship essay to fit the following scholarship details.

Student: ${profile.fullName}
Scholarship Details:
${scholarshipDetails || "General scholarship application"}

Requirements:
- Keep authentic tone
${profileEmphasis(profile)}
${wordInstruction}
- Do not invent false facts
- Output only the final essay text, no headings or commentary

Master Essay:
${masterEssay}`;

  try {
    const response = await openai.chat.completions.create({
      model: config.openaiModel,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You are an expert scholarship essay editor. Rewrite essays to fit specific prompts while preserving the student's authentic voice.",
        },
        { role: "user", content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content?.trim() || masterEssay;
  } catch (error) {
    const msg = error?.message || String(error);
    if (/401|incorrect api key|invalid api key/i.test(msg)) {
      console.warn("OpenAI key invalid — using bundled master essay.");
      return masterEssay;
    }
    throw error;
  }
}

export function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
