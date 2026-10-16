import { G, scalarMultiply, serializePoint } from './ecc.js';
import { requireWebCrypto, encodeMessage, encryptMessage, decryptMessage, attackCiphertext } from './hybrid.js';
import { caesarEncrypt, caesarDecrypt } from './caesar.js';
import { loadCorpora, recoverCaesar, sampleWindows } from './cryptanalysis.js';

const find = id => document.getElementById(id);
const show = (id, value) => { find(id).textContent = value; };
const describeText = text => text === '' ? '(empty message)' : text;
let ecc = null, caesar = null, busy = false, cryptoReady = false, corpus = null, knownShift = null;

function integerInput(id, minimum, maximum, label) {
  const raw = find(id).value;
  const number = Number(raw);
  if (!/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return number;
}

function receiver() {
  const keySpace = integerInput('key-space', 1, 4096, 'Key-space size K');
  const privateKey = BigInt(integerInput('receiver-key', 1, keySpace, 'Private scalar d'));
  return { keySpace, privateKey, publicPoint: scalarMultiply(G, privateKey) };
}

function refreshControls() {
  document.querySelectorAll('[data-demo-control]').forEach(node => { node.disabled = busy; });
  find('ecc-encrypt').disabled = busy || !cryptoReady;
  find('ecc-decrypt').disabled = busy || !cryptoReady || !ecc;
  find('ecc-attack').disabled = busy || !cryptoReady || !ecc;
  find('caesar-decrypt').disabled = busy || !caesar;
  find('use-caesar').disabled = !corpus || !caesar;
}

function status(id, message, error = false) {
  show(id, message);
  find(id).dataset.state = error ? 'error' : 'ready';
}

async function demoAction(statusId, action) {
  if (busy) return;
  busy = true;
  refreshControls();
  status(statusId, 'Working…');
  await new Promise(resolve => setTimeout(resolve, 0));
  try { await action(); }
  catch (error) { status(statusId, error.message, true); }
  finally { busy = false; refreshControls(); }
}

function clearAttack() {
  find('attack-result').hidden = true;
  for (const id of ['attack-tested', 'attack-key', 'attack-match', 'attack-plaintext']) show(id, '—');
  status('ecc-attack-status', 'Encrypt a message above, then recover its receiver key from public information.');
}

function clearECC() {
  ecc = null;
  find('ecc-result').hidden = true;
  show('ecc-plaintext', '—'); show('ecc-payload', '');
  show('intercept-summary', 'No intercepted ciphertext yet.');
  clearAttack();
  if (cryptoReady) status('ecc-status', 'Ready to encrypt with fresh randomness.');
  refreshControls();
}

function updatePublicKey() {
  try {
    const { publicPoint, keySpace } = receiver();
    const point = serializePoint(publicPoint);
    show('public-key-summary', `Q = dG · ${point.slice(0, 14)}…${point.slice(-12)} · K = ${keySpace}`);
    show('receiver-public', point);
  } catch (error) {
    show('public-key-summary', error.message); show('receiver-public', '—');
  }
}

find('message').addEventListener('input', () => {
  clearECC(); caesar = null; find('caesar-result').hidden = true;
  show('caesar-ciphertext', '—'); show('caesar-plaintext', '—');
  status('caesar-status', 'The shared message changed. Encrypt it again.'); refreshControls();
});
for (const id of ['receiver-key', 'key-space']) find(id).addEventListener('input', () => { clearECC(); updatePublicKey(); });
find('caesar-shift').addEventListener('input', () => {
  caesar = null; find('caesar-result').hidden = true;
  status('caesar-status', 'The shift changed. Encrypt again.'); refreshControls();
});

find('ecc-encrypt').addEventListener('click', () => demoAction('ecc-status', async () => {
  clearECC();
  const { privateKey, ...publicInformation } = receiver();
  const message = find('message').value;
  encodeMessage(message);
  const payload = await encryptMessage(message, publicInformation.publicPoint);
  ecc = { ...publicInformation, payload, message }; // no d or r in the attack's state
  show('ecc-payload', JSON.stringify(payload, null, 2));
  show('ecc-summary', `${encodeMessage(message).length} UTF-8 bytes → ${payload.ciphertext.length / 2} encrypted bytes including the 16-byte authentication tag.`);
  show('intercept-summary', `Available to the attacker: public Q, K = ${ecc.keySpace}, and the displayed payload (R, salt, IV, ciphertext and tag).`);
  find('ecc-result').hidden = false;
  status('ecc-status', 'Encrypted with a fresh ephemeral scalar, salt, and IV. Decrypt to check the round trip.');
}));

find('ecc-decrypt').addEventListener('click', () => demoAction('ecc-status', async () => {
  show('ecc-plaintext', '—');
  const recovered = await decryptMessage(ecc.payload, receiver().privateKey);
  show('ecc-plaintext', describeText(recovered));
  status('ecc-status', recovered === ecc.message ? 'Authenticated decryption succeeded; the recovered text exactly matches the original.' : 'Recovered text differs from the original.', recovered !== ecc.message);
}));

find('caesar-encrypt').addEventListener('click', () => demoAction('caesar-status', () => {
  caesar = null; find('caesar-result').hidden = true;
  const message = find('message').value;
  encodeMessage(message); // same short-message contract as the ECC demonstration
  const key = integerInput('caesar-shift', 0, 25, 'Caesar shift');
  caesar = { key, message, ciphertext: caesarEncrypt(message, key) };
  show('caesar-ciphertext', describeText(caesar.ciphertext)); show('caesar-plaintext', '—');
  find('caesar-result').hidden = false;
  status('caesar-status', `Encrypted using shift ${key}; non-ASCII letters, spaces, and punctuation are unchanged.`);
}));

find('caesar-decrypt').addEventListener('click', () => demoAction('caesar-status', () => {
  const recovered = caesarDecrypt(caesar.ciphertext, caesar.key);
  show('caesar-plaintext', describeText(recovered));
  status('caesar-status', recovered === caesar.message ? 'Decryption exactly matches the shared original message.' : 'Recovered text differs.', recovered !== caesar.message);
}));

find('ecc-attack').addEventListener('click', () => demoAction('ecc-attack-status', async () => {
  clearAttack();
  status('ecc-attack-status', 'Enumerating public points G, 2G, …, KG…');
  const started = performance.now();
  const result = await attackCiphertext(ecc.publicPoint, ecc.keySpace, ecc.payload);
  show('attack-tested', `${result.tested} / ${ecc.keySpace}`);
  show('attack-key', result.privateKey === null ? 'Not found' : result.privateKey.toString());
  show('attack-match', result.matched ? 'Yes · recovered dG = Q' : 'No match in this range');
  show('attack-plaintext', result.plaintext === null ? '—' : describeText(result.plaintext));
  find('attack-result').hidden = false;
  status('ecc-attack-status', result.matched
    ? `Key recovered and ciphertext authenticated/decrypted in ${(performance.now() - started).toFixed(1)} ms on this device.`
    : `No key found after ${result.tested} candidates.`, !result.matched);
}));

function tableRow(values, heading = true) {
  const row = document.createElement('tr');
  values.forEach((value, index) => {
    const cell = document.createElement(heading && index === 0 ? 'th' : 'td');
    if (heading && index === 0) cell.scope = 'row';
    cell.textContent = String(value); row.append(cell);
  });
  return row;
}

function clearStatisticalResult() {
  find('statistical-result').hidden = true;
  find('candidate-rows').replaceChildren(); show('statistical-plaintext', '—');
}

find('attack-text').addEventListener('input', () => {
  knownShift = null; clearStatisticalResult(); show('sample-description', 'Custom ciphertext; the attack receives no known plaintext or key.');
});

function loadExample(ciphertext, key, description) {
  find('attack-text').value = ciphertext; knownShift = key; clearStatisticalResult();
  show('sample-description', description); status('statistical-status', 'Ready to rank all 26 candidate shifts.');
}

find('held-out-example').addEventListener('click', () => {
  const sample = sampleWindows(corpus.heldOut, 300)[1].plaintext;
  loadExample(caesarEncrypt(sample, 11), 11, 'Held-out English: 300 letters, shift 11. The true shift is used only to check the result.');
});
find('use-caesar').addEventListener('click', () => {
  loadExample(caesar.ciphertext, caesar.key, `Ciphertext from the Caesar demonstration; true shift ${caesar.key} is retained only for checking.`);
  find('attack-text').focus();
});
find('statistical-attack').addEventListener('click', () => {
  clearStatisticalResult();
  try {
    const result = recoverCaesar(find('attack-text').value, corpus.reference.probabilities);
    if (!result.best) { status('statistical-status', 'No ASCII letters: there is no frequency evidence to rank keys.', true); return; }
    show('predicted-shift', String(result.best.key)); show('statistical-plaintext', result.best.plaintext);
    find('candidate-rows').replaceChildren(...result.candidates.slice(0, 3).map(item => tableRow([item.key, item.score.toFixed(3)])));
    find('statistical-result').hidden = false;
    const checked = knownShift === null ? '' : result.best.key === knownShift && !result.tied ? ' Correct for this labelled example.' : ' Failed or ambiguous for this labelled example.';
    status('statistical-status', `${result.total} letters scored. ${result.tied ? 'The best score is tied; the smallest tied key is shown.' : 'The smallest χ² score ranks first.'}${checked}${result.total < 50 ? ' Short texts can be misleading.' : ''}`);
  } catch (error) { status('statistical-status', error.message, true); }
});

find('run-experiment').addEventListener('click', () => {
  find('run-experiment').disabled = true;
  status('experiment-status', 'Recomputing in a background worker…');
  const started = performance.now();
  const results = [];
  let worker;
  const finish = (message, error = false) => {
    worker?.terminate(); find('run-experiment').disabled = false; status('experiment-status', message, error);
  };
  try {
    worker = new Worker(new URL('./experiment-worker.js', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }) => {
      if (data.type === 'error') { finish(data.message, true); return; }
      if (data.type === 'row') {
        results.push(data.result);
        const row = tableRow([data.result.length, data.result.trials, data.result.correct, `${data.result.accuracy.toFixed(1)}%`]);
        row.dataset.length = String(data.result.length);
        find('length-results').querySelector(`[data-length="${data.result.length}"]`).replaceWith(row);
        status('experiment-status', `Computed ${results.length} of 6 lengths…`);
      }
      if (data.type === 'complete') {
        const total = results.reduce((sum, row) => sum + row.trials, 0);
        const correct = results.reduce((sum, row) => sum + row.correct, 0);
        finish(`${total.toLocaleString('en')} trials recomputed: ${correct.toLocaleString('en')} correct, ${total - correct} failed or tied. ${(performance.now() - started).toFixed(0)} ms on this device. Repeated keys are dependent trials.`);
        const failure = results.find(row => row.firstFailure)?.firstFailure;
        if (failure) show('observed-failure', `Observed 20-letter failure: ${failure.plaintext} (true shift ${failure.trueKey}) was ranked as shift ${failure.predictedKey}, giving ${failure.recovered}.`);
      }
    });
    worker.addEventListener('error', () => finish('The experiment worker could not run. The recorded results remain visible; reload and try again.', true));
    worker.postMessage({ heldOut: corpus.heldOut, probabilities: corpus.reference.probabilities });
  } catch (error) { finish(error.message, true); }
});

try { requireWebCrypto(); cryptoReady = true; status('ecc-status', 'Ready to encrypt with fresh randomness.'); }
catch (error) { status('ecc-status', error.message, true); }
updatePublicKey(); refreshControls();

try {
  corpus = await loadCorpora();
  show('corpus-summary', `Training: ${corpus.reference.total.toLocaleString('en')} ASCII letters from Alice’s Adventures in Wonderland. Evaluation: ${corpus.heldOutLetters.toLocaleString('en')} from the separate book Through the Looking-Glass.`);
  find('frequency-rows').replaceChildren(...corpus.reference.counts.map((count, i) => tableRow([String.fromCharCode(65 + i), count.toLocaleString('en'), `${(100 * corpus.reference.probabilities[i]).toFixed(3)}%`])));
  for (const id of ['held-out-example', 'statistical-attack', 'run-experiment']) find(id).disabled = false;
  find('held-out-example').click(); refreshControls();
} catch (error) {
  status('statistical-status', error.message, true); status('experiment-status', 'Corpus unavailable; the table below records the verified local run.', true);
}
