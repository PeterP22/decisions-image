const $ = id => document.getElementById(id);
let config, imageDataUrl, revision = 0, busy = false;
function resetResult() {
  revision++;
  $('outcome').textContent = 'Ready when you are.';
  $('result-note').textContent = 'Run your check on the selected image and question.';
  $('probability-section').hidden = true;
  $('result-meta').hidden = true;
  $('error').hidden = true;
}
function showError(message) { $('error').textContent = message; $('error').hidden = false; }
function readImage(file) {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return reject(new Error('Choose a PNG, JPEG, or WebP image.'));
    if (file.size > 5 * 1024 * 1024) return reject(new Error('Choose an image up to 5 MiB.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
  });
}
async function selectFile(file, sampleName) {
  if (!file || busy) return;
  resetResult();
  const selection = revision;
  try {
    const data = await readImage(file);
    if (selection !== revision) return;
    imageDataUrl = data;
    $('preview').src = data;
    $('preview').hidden = false;
    $('upload-placeholder').hidden = true;
    $('filename').textContent = file.name;
    $('submit').disabled = !config;
    document.querySelectorAll('[data-sample]').forEach(button => button.classList.toggle('selected', button.dataset.sample === sampleName));
  } catch (error) { showError(error.message); }
}
$('image-file').addEventListener('change', event => selectFile(event.target.files[0]));
$('replace').addEventListener('click', () => $('image-file').click());
$('question').addEventListener('input', resetResult);
for (const eventName of ['dragenter', 'dragover']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.add('dragging'); });
for (const eventName of ['dragleave', 'drop']) $('dropzone').addEventListener(eventName, event => { event.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', event => selectFile(event.dataTransfer.files[0]));
document.querySelectorAll('[data-sample]').forEach(button => button.addEventListener('click', async () => {
  if (busy || !config) return;
  try {
    const name = button.dataset.sample;
    const response = await fetch(`/samples/${name}.png`);
    if (!response.ok) throw new Error('Could not load the sample.');
    $('question').value = config.defaultQuestion;
    await selectFile(new File([await response.blob()], `${name}.png`, { type: 'image/png' }), name);
  } catch (error) { showError(error.message); }
}));
document.querySelectorAll('[data-question]').forEach(button => button.addEventListener('click', () => {
  if (busy || !config) return;
  $('question').value = button.dataset.question === 'damage' ? config.defaultQuestion : button.dataset.question;
  resetResult();
}));
$('inspect-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!imageDataUrl || busy || !config) return;
  resetResult();
  const requestRevision = revision;
  busy = true;
  $('submit').disabled = true;
  $('question').disabled = true;
  $('submit').textContent = 'Checking image…';
  $('outcome').textContent = 'Looking…';
  $('result-note').textContent = config.mode === 'live' ? 'Waiting for the Decisions API.' : 'Loading the synthetic fixture.';
  try {
    const response = await fetch('/api/inspect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageDataUrl, question: $('question').value }), signal: AbortSignal.timeout(25_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Request failed.');
    if (requestRevision !== revision) return;
    const labels = { yes: 'Yes.', no: 'No.', review: 'Needs a closer look.', refused: 'Unable to evaluate.' };
    $('outcome').textContent = labels[result.outcome];
    $('result-note').textContent = result.notice || ({ yes: 'The probability clears the example’s yes threshold.', no: 'The probability falls below the example’s no threshold.', review: 'The result falls between the example thresholds. Review the image.', refused: 'The API refused this question. No probability was returned.' })[result.outcome];
    $('probability-section').hidden = result.probability === null;
    if (result.probability !== null) { $('probability').textContent = `${(result.probability * 100).toFixed(1)}%`; $('meter').value = result.probability; }
    $('result-meta').hidden = false;
    $('latency').textContent = result.mode === 'live' ? `${result.elapsedMs} ms · API round trip` : 'OFFLINE · NO API CALL';
    $('source').textContent = result.mode === 'live' ? result.model : 'HAND-AUTHORED FIXTURE';
  } catch (error) {
    $('outcome').textContent = 'Check not completed.';
    $('result-note').textContent = 'No decision was made.';
    showError(error.name === 'TimeoutError' ? 'The request timed out. Try again.' : error.message);
  } finally {
    busy = false; $('submit').disabled = !imageDataUrl; $('question').disabled = false;
    $('submit').textContent = config.mode === 'live' ? 'Run visual check ↗' : 'Replay sample check ↗';
  }
});
try {
  const response = await fetch('/api/config');
  if (!response.ok) throw new Error('Could not load app configuration.');
  config = await response.json();
  $('mode').textContent = config.mode === 'live' ? 'Live · GPT-6 Luna' : 'Offline fixture replay';
  $('mode-note').textContent = config.mode === 'live' ? 'Live mode. Your selected image and question are sent to OpenAI when you run a check. The key stays on this local server.' : 'Offline preview: choose a synthetic parcel below. Results are hand-authored examples. Run npm run live to use your own images and questions.';
  $('question').value = config.defaultQuestion;
  $('submit').textContent = config.mode === 'live' ? 'Run visual check ↗' : 'Replay sample check ↗';
  $('submit').disabled = !imageDataUrl;
} catch (error) { $('mode').textContent = 'Unavailable'; showError(error.message); }
