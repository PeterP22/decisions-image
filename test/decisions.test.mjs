import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseDecision, requestDecision, MAX_IMAGE_BYTES } from '../src/decisions.mjs';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==';
const question = 'Is the parcel visibly damaged?';
const answer = (probability) => ({ model: 'gpt-6-luna', answers: [{ name: 'visual_check', type: 'predicate', probability }] });

test('sends an inline image and independent named predicate to Decisions', () => {
  const body = buildRequest({ imageDataUrl: png, question });
  assert.equal(body.model, 'gpt-6-luna');
  assert.equal(body.input[0].role, 'user');
  assert.deepEqual(body.input[0].content[1], { type: 'input_image', image_url: png });
  assert.equal(body.questions[0].type, 'predicate');
  assert.equal(body.questions[0].name, 'visual_check');
  assert.match(body.questions[0].instructions, /Is the parcel visibly damaged/);
});

test('rejects external image URLs, empty questions, spoofed formats and oversized images', () => {
  for (const imageDataUrl of ['https://example.com/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YWJj']) {
    assert.throws(() => buildRequest({ imageDataUrl, question }), /image/i);
  }
  assert.throws(() => buildRequest({ imageDataUrl: png, question: ' ' }), /question/i);
  assert.throws(() => buildRequest({ imageDataUrl: png, question: 'x'.repeat(1001) }), /question/i);
  assert.throws(() => buildRequest({ imageDataUrl: 'data:image/png;base64,' + Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64'), question }), /5 MiB/);
});

test('probability thresholds produce yes, no, or human review without rounding first', () => {
  for (const [p, outcome] of [[0, 'no'], [0.2, 'no'], [0.20001, 'review'], [0.79999, 'review'], [0.8, 'yes'], [1, 'yes']]) {
    assert.equal(parseDecision(answer(p)).outcome, outcome);
  }
});

test('refusal is explicit and never treated as a negative answer', () => {
  assert.deepEqual(parseDecision({ answers: [{ type: 'refusal', name: 'visual_check' }] }), { outcome: 'refused', probability: null });
});

test('malformed, duplicate, missing or unexpected answers fail closed', () => {
  for (const value of [null, {}, { answers: [] }, answer(NaN), answer(-0.1), answer(1.1), answer('0.9'), { answers: [{ type: 'choice', name: 'visual_check', choice: 'yes' }] }, { answers: [...answer(0.9).answers, ...answer(0.9).answers] }, { answers: [{ type: 'predicate', name: 'wrong', probability: 0.9 }] }]) {
    assert.throws(() => parseDecision(value), /response/i);
  }
});

test('HTTP adapter uses the documented endpoint and bearer auth, returns parsed answer', async () => {
  const result = await requestDecision({ imageDataUrl: png, question }, { apiKey: 'test-only', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/decisions');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-only');
    assert.ok(options.signal);
    assert.equal(JSON.parse(options.body).questions[0].type, 'predicate');
    return new Response(JSON.stringify(answer(0.93)), { status: 200 });
  } });
  assert.equal(result.probability, 0.93);
  assert.equal(result.outcome, 'yes');
  assert.equal(result.mode, 'live');
  assert.ok(result.elapsedMs >= 0);
});

test('auth, upstream errors and timeouts have safe actionable errors', async () => {
  await assert.rejects(requestDecision({ imageDataUrl: png, question }, { apiKey: '' }), /OPENAI_API_KEY/);
  for (const status of [401, 403, 404, 429, 500]) {
    await assert.rejects(requestDecision({ imageDataUrl: png, question }, { apiKey: 'test-secret', fetchImpl: async () => new Response('secret echoed by upstream', { status }) }), error => {
      assert.match(error.message, new RegExp(String(status)));
      assert.doesNotMatch(error.message, /test-secret|echoed/);
      return true;
    });
  }
  await assert.rejects(requestDecision({ imageDataUrl: png, question }, { apiKey: 'test-only', fetchImpl: async () => { throw new DOMException('hidden', 'TimeoutError'); } }), /timed out/);
});
