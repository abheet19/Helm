import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the actual shipped answer function without starting timers or probes.
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const answerSource = source.slice(source.indexOf('function answer(q)'), source.indexOf('\nfunction viewSettings()'));
function ask(question, fleet) {
  const context = vm.createContext({ state: { fleet }, STATUS_LABEL: { up: 'Operational', down: 'Down', local: 'Local app' }, fmtMs: () => '10 ms', fmtPct: () => '100%' });
  vm.runInContext(answerSource, context);
  return context.answer(question).text;
}
const fleet = [
  { id: 'weft', name: 'Weft', status: 'up' },
  { id: 'textify', name: 'Textify', status: 'down' },
  { id: 'vantage', name: 'Vantage', status: 'unknown' },
  { id: 'zeno', name: 'Zeno', status: 'local' },
];
test('fleet lists and counts answer the requested status and disclose unknown probes', () => {
  assert.match(ask('Which services are down?', fleet), /Currently down: Textify/);
  assert.match(ask('How many services are down?', fleet), /1 of 3 probed web services are down/);
  assert.match(ask('Which services are operational?', fleet), /Currently operational: Weft/);
  assert.match(ask('How many services are up?', fleet), /1 still awaiting probe results/);
});
test('no probe results are never presented as a healthy fleet', () => {
  assert.match(ask('Which services are down?', []), /not available yet/);
  assert.match(ask('How many are up?', [{ ...fleet[0], status: 'unknown' }]), /cannot report/);
  assert.match(ask('Which are online?', [fleet[1]]), /No probed web service is currently confirmed operational/);
});
test('named projects retain their status answer and setup is not an up intent', () => {
  assert.match(ask('What is Textify status, is it down?', fleet), /Textify is Down/);
  assert.match(ask('What is the setup?', fleet), /don’t have a grounded answer/);
});
test('degraded services remain explicitly distinct from operational and down', () => {
  assert.match(ask('Which services are down?', [{ ...fleet[0], status: 'degraded' }]), /1 degraded/);
});
