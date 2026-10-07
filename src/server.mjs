import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildRequest, requestDecision, parseDecision, DemoError, DEFAULT_QUESTION, MODEL, THRESHOLDS } from './decisions.mjs';

const asset = path => readFileSync(new URL(path, import.meta.url));
const samples = Object.fromEntries(['intact', 'damaged', 'unclear'].map(name => [name, asset(`../samples/${name}.png`)]));
const staticFiles = new Map([
  ['/', ['text/html; charset=utf-8', asset('../public/index.html')]],
  ['/app.js', ['text/javascript; charset=utf-8', asset('../public/app.js')]],
  ['/style.css', ['text/css; charset=utf-8', asset('../public/style.css')]],
  ...Object.entries(samples).map(([name, data]) => [`/samples/${name}.png`, ['image/png', data]]),
]);

function replay(input) {
  const name = Object.keys(samples).find(key => input.imageDataUrl === `data:image/png;base64,${samples[key].toString('base64')}`);
  if (!name || input.question.trim() !== DEFAULT_QUESTION) {
    throw new DemoError('Offline mode only replays the three sample images with the parcel question. Run npm run live to inspect your own images or questions.');
  }
  const probability = { intact: 0.04, damaged: 0.97, unclear: 0.52 }[name];
  return { ...parseDecision({ answers: [{ type: 'predicate', name: 'visual_check', probability }] }), mode: 'offline', model: MODEL, elapsedMs: null, notice: 'Synthetic, hand-authored fixture replay. No model call or image analysis occurred.' };
}

async function readJson(req) {
  const limit = 7 * 1024 * 1024;
  if (Number(req.headers['content-length']) > limit) throw new DemoError('Request exceeds the 7 MiB body limit.', 413);
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') throw new DemoError('Send application/json.', 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new DemoError('Request exceeds the 7 MiB body limit.', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new DemoError('Request body must be valid JSON.'); }
}

export function createApp({ mode = 'offline', inspector = requestDecision } = {}) {
  if (!['offline', 'live'].includes(mode)) throw new Error('Unknown app mode.');
  const server = createServer(async (req, res) => {
    const send = (status, data, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
      res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    try {
      const port = server.address()?.port;
      if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(req.headers.host)) throw new DemoError('Use the local app URL.', 403);
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/api/config') return send(200, { mode, model: MODEL, defaultQuestion: DEFAULT_QUESTION, thresholds: THRESHOLDS });
      if (req.method === 'GET' && staticFiles.has(path)) {
        const [type, data] = staticFiles.get(path);
        return send(200, data, type);
      }
      if (req.method !== 'POST' || path !== '/api/inspect') return send(404, { error: 'Not found.' });
      if (req.headers.origin !== `http://${req.headers.host}`) throw new DemoError('Cross-origin requests are not allowed.', 403);
      const input = await readJson(req);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DemoError('Send an image and a question.');
      buildRequest(input);
      return send(200, mode === 'offline' ? replay(input) : await inspector({ imageDataUrl: input.imageDataUrl, question: input.question }));
    } catch (error) {
      return send(error instanceof DemoError ? error.status : 500, { error: error instanceof DemoError ? error.message : 'Unexpected server error.' });
    }
  });
  server.requestTimeout = 30_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv.includes('--live') ? 'live' : 'offline';
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) { console.error('PORT must be an integer from 1 to 65535.'); process.exit(1); }
  if (mode === 'live' && !process.env.OPENAI_API_KEY?.trim()) { console.error('Live mode requires OPENAI_API_KEY. Set it in your environment or an untracked .env file.'); process.exit(1); }
  const server = createApp({ mode });
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Set PORT to another value.` : 'Could not start local server.'); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Image Decisions | ${mode} | http://127.0.0.1:${port}`));
}
