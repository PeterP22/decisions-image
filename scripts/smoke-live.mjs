import { readFile } from 'node:fs/promises';
import { requestDecision, DEFAULT_QUESTION } from '../src/decisions.mjs';

try {
  const image = await readFile(new URL('../samples/damaged.png', import.meta.url));
  const result = await requestDecision({ imageDataUrl: `data:image/png;base64,${image.toString('base64')}`, question: DEFAULT_QUESTION });
  console.log(JSON.stringify({ scenario: 'synthetic damaged parcel', ...result }, null, 2));
  if (result.outcome === 'refused') process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
