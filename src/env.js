/** True on Vercel serverless. */
export function isVercel() {
  return Boolean(process.env.VERCEL);
}

/** True on any cloud host (Vercel, Render, Netlify). */
export function isHosted() {
  return Boolean(process.env.VERCEL || process.env.RENDER || process.env.NETLIFY);
}

/** Serverless platforms — no persistent disk writes. */
export function isServerless() {
  return Boolean(process.env.VERCEL || process.env.NETLIFY);
}

export function hostedPlatform() {
  if (process.env.VERCEL) return "vercel";
  if (process.env.RENDER) return "render";
  if (process.env.NETLIFY) return "netlify";
  return null;
}
