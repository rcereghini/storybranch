// Vercel runs this bundle (see vite.api.config.ts) with the same handler Netlify uses.
import api from "../functions/api";
export const GET = api;
export const POST = api;
