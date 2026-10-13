import test from 'node:test';
import assert from 'node:assert/strict';
import {readBrokerTimingFromText} from '../sentinel-trading-lab/agent/worker/broker-timing-readonly.mjs';

const anchor = Date.UTC(2026, 9, 13, 21, 35, 58);
const exnova = [
  'USD/BRL (OTC) Digital',
  'HORA DE COMPRA',
  '00:32',
  'Invest $1',
  'Expiração',
  '18:37',
  'Tempo de expiração',
  '00:07',
  'Nova opção',
  'HORA ATUAL: 13 OUTUBRO, 18:35:58 (UTC-3)'
].join('\n');

test('Exnova Digital: selected fixed expiry and purchase cutoff are different', () => {
  const r = readBrokerTimingFromText(exnova, {nowMs:anchor,instrumentKind:'digital'});
  assert.equal(r.selectedExpiration.kind, 'fixed-clock');
  assert.equal(r.selectedExpiration.expiresAt - anchor, 62000);
  assert.equal(r.selectedExpiration.durationMs, null);
  assert.equal(r.purchaseWindow.remainingMs, 32000);
  assert.equal(r.purchaseWindow.closesAt - anchor, 32000);
  assert.equal(r.openPosition.verified, false);
});

test('IQ Option English labels: same parser and no auto orders', () => {
  const r = readBrokerTimingFromText(
    'USD/JPY Digital\nTIME TO PURCHASE\n00:08\nExpiration: 18:37\nCURRENT TIME: 18:36:30 UTC-3',
    {nowMs:anchor, instrumentKind:'digital'}
  );
  assert.equal(r.selectedExpiration.expiresAt - anchor, 30000);
  assert.equal(r.purchaseWindow.remainingMs, 8000);
});

test('midnight rollover preserves actual elapsed time, not a new 24h window', () => {
  const r = readBrokerTimingFromText(
    'Expiração\n00:01\nHORA ATUAL: 13 OUTUBRO, 23:59:45 (UTC-3)',
    {nowMs:anchor, instrumentKind:'digital'}
  );
  assert.equal(r.selectedExpiration.expiresAt - anchor, 75000);
});

test('a new option is never equated with a settled or restarted prior position', () => {
  const r = readBrokerTimingFromText(exnova.replace('18:37','18:38'), {nowMs:anchor,instrumentKind:'digital'});
  assert.equal(r.selectedExpiration.expiresAt - anchor, 122000);
  assert.equal(r.openPosition.id, null);
  assert.equal(r.openPosition.expiresAt, null);
});

test('Blitz duration is not a fixed-clock settlement timestamp', () => {
  const r = readBrokerTimingFromText('Expiração\n30 s\nHORA ATUAL: 18:35:58', {nowMs:anchor,instrumentKind:'blitz'});
  assert.equal(r.selectedExpiration.kind, 'selected-duration');
  assert.equal(r.selectedExpiration.durationMs, 30000);
  assert.equal(r.selectedExpiration.expiresAt, null);
});

test('no broker clock means no guessed absolute expiry, even with device time', () => {
  const r = readBrokerTimingFromText('Expiração\n18:37', {nowMs:anchor,instrumentKind:'digital'});
  assert.equal(r.selectedExpiration.kind, 'unknown');
  assert.equal(r.selectedExpiration.expiresAt, null);
  assert.equal(r.brokerClockVerified, false);
});

test('expiring active trade countdown does not masquerade as selected expiry', () => {
  const r = readBrokerTimingFromText('Tempo de expiração\n00:07\nHORA ATUAL: 18:35:58', {nowMs:anchor,instrumentKind:'digital'});
  assert.equal(r.selectedExpiration.kind, 'unknown');
  assert.equal(r.openPosition.verified, false);
});

test('a stale or impossible fixed time is rejected rather than rewinding the analyst window', () => {
  const r = readBrokerTimingFromText('Expiração\n05:00\nHORA ATUAL: 18:35:58', {nowMs:anchor,instrumentKind:'digital'});
  assert.equal(r.selectedExpiration.kind, 'unknown');
});

test('the new helper does not import or mutate the scenario engine', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync('sentinel-trading-lab/agent/worker/broker-timing-readonly.mjs','utf8');
  assert.doesNotMatch(source,/page\.click|\.click\(|patchSettings|placeOrder|window\.open|setInterval|setTimeout|import .*runtime/);
});
