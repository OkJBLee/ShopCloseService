// Vercel Function: POST /api/send
import { handleApi } from '../src/api.js';
export function POST(request) { return handleApi(request, process.env, '/api/send'); }
