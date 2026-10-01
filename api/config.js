// Vercel Function: GET /api/config
import { handleApi } from '../src/api.js';
export function GET(request) { return handleApi(request, process.env, '/api/config'); }
