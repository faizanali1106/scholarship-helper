/**
 * Copies bundled data into public/ so the hosted app can read scholarships
 * via static fallback and the API can bundle data/** via includeFiles.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "data");
const files = ["scholarships.json", "profile.json", "master-essay.txt", "essay-angles.json"];

fs.mkdirSync(out, { recursive: true });
for (const name of files) {
  const src = path.join(root, "data", name);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(out, name));
    console.log(`  copied data/${name} → public/data/${name}`);
  }
}
