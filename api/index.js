// Vercel function for every /api/* request (routed by vercel.json).
// The bundle is produced by `pnpm build:vercel` before Vercel packages this file.
export { GET, POST } from "../dist-api/api.js";
