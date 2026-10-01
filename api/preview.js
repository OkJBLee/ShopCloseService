// Vercel Function: POST /api/preview
import { handleApi } from '../src/api.js';
export function POST(request) { return handleApi(request, process.env, '/api/preview'); }
