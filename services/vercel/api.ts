// Vercel runs this bundle (see vite.api.config.ts); services/functions/api.ts
// wraps the shared handler.
import api from "../functions/api";
export const GET = api;
export const POST = api;
