/** True when running on Vercel (serverless). File writes use browser localStorage instead. */
export function isVercel() {
  return Boolean(process.env.VERCEL);
}
