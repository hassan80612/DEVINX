// Read-only broker timing contract for IQ Option and Exnova.
// Never clicks the broker, alters analyst settings, or equates purchase time
// with option expiration or a forecast horizon.
const clean = value => String(value ?? '').replace(/\u00a0/g, ' ').trim();

function labeledValue(lines, label) {
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(label);
    if (!match) continue;
    const sameLine = clean(lines[i].slice(match[0].length)).replace(/^[:\s-]+/, '');
    if (sameLine) return sameLine;
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      if (lines[j]) return lines[j];
    }
  }
  return null;
}

function clockSeconds(value, withSeconds = false) {
  const match = clean(value).match(withSeconds
    ? /(?:^|\s)([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\b|$)/
    : /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0);
}

function countdownSeconds(value) {
  const raw = clean(value);
  const clock = raw.match(/^([0-5]?\d):([0-5]\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const seconds = raw.match(/^(\d{1,4})\s*(?:s|sec|seconds|seg|segundos)$/i);
  if (seconds) return Number(seconds[1]);
  const minutes = raw.match(/^(\d{1,3})\s*(?:m|min|minutes|minutos)$/i);
  return minutes ? Number(minutes[1]) * 60 : null;
}

/**
 * Best-effort, read-only observation. Unknown is deliberately explicit.
 * expiresAt is the broker's selected FUTURE expiration, not the settlement
 * timestamp of any already opened position. No value authorizes an order.
 */
export function readBrokerTimingFromText(text, {nowMs = Date.now(), instrumentKind = 'unknown'} = {}) {
  const capturedAt = Number.isFinite(nowMs) ? nowMs : Date.now();
  const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
  const kind = /^(digital|blitz|binary)$/i.test(clean(instrumentKind))
    ? clean(instrumentKind).toLowerCase() : 'unknown';
  const currentLine = lines.find(line => /^(?:HORA\s+ATUAL|CURRENT\s+TIME|SERVER\s+TIME)\s*:/i.test(line));
  const current = currentLine ? clockSeconds(currentLine, true) : null;
  const purchaseRaw = labeledValue(lines, /^(?:HORA\s+(?:DE|DA)\s+COMPRA|TEMPO\s+(?:PARA\s+)?COMPRA|PURCHASE\s+TIME|TIME\s+TO\s+PURCHASE|BUY\s+TIME)\b\s*:?/i);
  const purchaseSeconds = purchaseRaw == null ? null : countdownSeconds(purchaseRaw);
  const expirationRaw = labeledValue(lines, /^(?:EXPIRAÇÃO|EXPIRACAO|EXPIRATION|EXPIRY)\b\s*:?/i);
  const selectedSeconds = expirationRaw == null ? null : clockSeconds(expirationRaw);
  let expiration = {kind: 'unknown', raw: expirationRaw, expiresAt: null, durationMs: null, confidence: 0};
  if (selectedSeconds != null && current != null) {
    // Fixed-clock Digital expiry is a wall-clock deadline, never the holding
    // duration of a freshly entered order or the prediction window duration.
    const secondsAhead = (selectedSeconds - current + 86400) % 86400;
    if (secondsAhead <= 4 * 3600) {
      expiration = {kind: 'fixed-clock', raw: expirationRaw, expiresAt: capturedAt + secondsAhead * 1000, durationMs: null, confidence: 1};
    }
  } else if (kind === 'blitz' || kind === 'binary') {
    // Explicit short duration only. Bare 00:30 may be ambiguous, but Blitz
    // has duration-based selectors; no absolute date can be inferred.
    const durationSeconds = expirationRaw == null ? null : countdownSeconds(expirationRaw);
    if (durationSeconds != null && durationSeconds > 0 && durationSeconds <= 3600) {
      expiration = {kind: 'selected-duration', raw: expirationRaw, expiresAt: null, durationMs: durationSeconds * 1000, confidence: .75};
    }
  }
  return {
    source: 'broker-visible-readonly',
    instrumentKind: kind,
    capturedAt,
    brokerClockVerified: current != null,
    brokerClock: current == null?{verified:false,source:'visible-broker-clock'}:
      {verified:true,source:'visible-broker-clock',capturedAt,
       clockSeconds:current},
    selectedExpiration: expiration,
    purchaseWindow: {
      raw: purchaseRaw,
      remainingMs: purchaseSeconds == null ? null : purchaseSeconds * 1000,
      closesAt: purchaseSeconds == null ? null : capturedAt + purchaseSeconds * 1000,
    },
    // A broker UI can keep one trade alive while offering a NEW option.
    // No opened-position identity is inferred from the purchase timer.
    openPosition: {verified: false, id: null, expiresAt: null},
  };
}
