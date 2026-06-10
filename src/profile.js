import fs from "fs";
import { config } from "./config.js";

let cachedProfile = null;

export function loadProfile() {
  if (cachedProfile) return cachedProfile;
  const raw = fs.readFileSync(config.profilePath, "utf8");
  cachedProfile = JSON.parse(raw);
  return cachedProfile;
}

export function getProfileValue(profile, key) {
  switch (key) {
    case "firstName":
      return profile.firstName;
    case "lastName":
      return profile.lastName;
    case "fullName":
      return profile.fullName;
    case "email":
      return profile.email;
    case "phone":
      return profile.phone;
    case "street":
      return profile.address?.street || "";
    case "city":
      return profile.address?.city || "";
    case "state":
      return profile.address?.state || "";
    case "zip":
      return profile.address?.zip || "";
    case "highSchool":
      return profile.highSchool;
    case "gpa":
      return profile.gpa;
    case "intendedMajor":
      return profile.intendedMajor;
    case "careerGoals":
      return profile.careerGoals || "";
    case "diabetesStory":
      return profile.diabetesStory || "";
    case "sports":
      return (profile.sports || []).join(", ");
    default:
      return "";
  }
}

export function buildAutofillEntries(profile) {
  const keys = Object.keys(profile.fieldMappings || {});
  return keys.map((key) => ({
    key,
    value: getProfileValue(profile, key),
    labels: profile.fieldMappings[key],
  }));
}
