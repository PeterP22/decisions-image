# Image Decisions

Upload an image, ask a **yes/no question**, and get a probability from OpenAI's Decisions API. The default scenario is a receiving desk checking a parcel for visible damage. Try parking-space occupancy, a visible object, or another observable condition using your own images in live mode.

Small on purpose: vanilla browser UI, Node's HTTP server, native `fetch`, and **zero third-party dependencies**. No build, database, cloud deployment, or agent framework.

## Quickstart

Requires **Node.js 22.9+** (Node 24 recommended) and Git. No `npm install` is necessary.

```sh
git clone https://github.com/PeterP22/decisions-image.git
cd decisions-image
npm test
npm start
```

Open **http://127.0.0.1:3000**. Choose one of the three synthetic parcels and click **Replay sample check**. This mode makes no API calls. Its hand-authored probabilities illustrate yes/no/review behavior; they are not model outputs. Offline mode rejects other images and questions rather than pretending to analyze them.

Live mode is **bring your own API key**. Each person runs the app locally and supplies their own `OPENAI_API_KEY` on the server. This repository provides no API credentials, personal credential-file paths, hosted proxy, or shared API access. API usage is billed to the account associated with the key you provide.

For actual image inspection, use your own `OPENAI_API_KEY` environment variable:

```sh
npm run live
```

Alternatively, copy `.env.example` to `.env` and set your own key there locally. `.env` is ignored by Git; never put a key into the browser, a screenshot, or a commit. The live commands read only the inherited environment and an optional `.env` in the current project directory; they do not search personal credential files. They load `.env` if it exists and otherwise use the inherited environment. Restart the server after changing environment settings. Stop it with Ctrl+C before switching modes; change `PORT` if 3000 is occupied.

Live mode sends the selected image and question to OpenAI when you click **Run visual check**. It requires API access and incurs API usage. The UI displays the API round-trip time. It does not promise an instant answer.

One standalone integration check, using only a synthetic image:

```sh
npm run smoke:live
```

## Where Decisions fits

Decisions is a specialized inference API, not a replacement for GPT. The [official guide](https://developers.openai.com/api/docs/guides/decisions) describes a public beta backed by `gpt-6-luna`, with three answer types: predicate probability, fixed-set choice, and ordered rubric score. The app uses a predicate. Use Responses for free-text image explanations, custom JSON extraction, or tool calls; arbitrary questions like “describe everything in this photo” are outside this app's contract.

The guide advertises roughly 10× faster evaluation than Responses. That is OpenAI's claim, not a benchmark from this project. Probabilities and operating thresholds need evaluation on representative labeled data. Our ≤0.20 / ≥0.80 thresholds are illustrative application policy, with the interval between them sent to review.

The [create reference](https://developers.openai.com/api/reference/resources/decisions/methods/create) specifies inline image data URLs and user input messages. We use the documented `POST https://api.openai.com/v1/decisions` directly, avoiding an SDK dependency. If adapting to an SDK, the guide lists JavaScript 7.30.0+ for Decisions support. Documentation checked 2026-10-07; this is a beta API.

## Architecture

```text
Browser: image + question
    │ same-origin POST /api/inspect
    ▼
Local Node server: validate size/type; keep API key server-side
    │ POST /v1/decisions (live only)
    ▼
GPT-6 Luna: named predicate → probability or refusal
    │ validate typed answer; apply explicit thresholds
    ▼
Browser: yes / no / review / refused + probability + elapsed time
```

The actual request is built in `src/decisions.mjs`:

```js
{
  model: 'gpt-6-luna',
  input: [{ role: 'user', content: [
    { type: 'input_text', text: 'Inspect the image as visual evidence.' },
    { type: 'input_image', image_url: 'data:image/png;base64,...' }
  ] }],
  questions: [{
    type: 'predicate',
    name: 'visual_check',
    instructions: 'Does this parcel have visible damage?'
  }]
}
```

The application derives yes/no/review from `answers[0].probability`. A `refusal` remains a distinct result. Neither refusal nor an API failure becomes “no”. The server checks answer name, type, count, and probability range. No free-text explanation or self-reported confidence is synthesized.

| File | Responsibility |
| --- | --- |
| `src/decisions.mjs` | Request schema, input validation, HTTP adapter, result policy |
| `src/server.mjs` | Loopback-only server, static allowlist, live/offline modes |
| `public/` | Upload preview, question form, probability and timing UI |
| `samples/` | Three synthetic PNGs: intact, torn, and obscured parcels |
| `scripts/generate-fixtures.mjs` | Reproducible PNG drawings using Node built-ins |
| `scripts/smoke-live.mjs` | One explicit live API check |
| `test/` | Offline protocol, failure handling, policy, and HTTP integration tests |

## Tests and verification

```sh
npm test               # offline; no key or network needed
npm run fixtures      # regenerate the deterministic synthetic images
npm run smoke:live    # explicit network/API usage
```

The offline suite tests real server routes with an injected transport for the API boundary: successful requests, refusals, malformed answers, exact threshold boundaries, missing auth, upstream errors, timeouts, oversized uploads, same-origin enforcement, static-file isolation, and honest fixture replay. GitHub Actions runs only the offline suite on Node 22 and 24; it supplies no API credentials and makes no live model calls. A green offline suite verifies the integration contract and application behavior, not model accuracy.

Initial live smoke test on 2026-10-07: the synthetic damaged parcel returned **0.91**, with a measured API round trip of **3,510 ms**. This single observation confirms endpoint/authentication integration; it is not an accuracy or latency benchmark. Results can vary on subsequent calls.

Browser QA in the initial session verified positive and uncertain synthetic sample results. Browser file-picker upload QA was skipped after the automation stalled; that interaction remains untested. The local offline suite still covers the server request path.

## Boundaries

- Supported uploads: PNG, JPEG, WebP, up to 5 MiB. The app checks the encoded size and signature; OpenAI validates/decode-handles the actual image. Request bodies are limited to 7 MiB, questions to 1,000 characters.
- The server listens on `127.0.0.1`, checks Host and Origin, uses a static asset allowlist and content security policy, and never saves uploads or logs request bodies. The key is sent only to the fixed OpenAI HTTPS endpoint. No custom proxy URL or credential persistence is implemented.
- Live calls time out after 20 seconds. There are no automatic retries or silent fallback to fixtures. Error bodies from OpenAI are not returned to the browser.
- This is a local learning tool, not a production receiving system. Before operational use, evaluate false positives/negatives, calibrate thresholds with real labeled examples, and add authentication, rate limits, monitoring, and appropriate image/data controls. Model instructions about text in images do not guarantee prompt-injection resistance.
- No automatic refund, ticket, message, or other external action is performed. User-uploaded image handling by OpenAI follows your account's applicable API data controls.
