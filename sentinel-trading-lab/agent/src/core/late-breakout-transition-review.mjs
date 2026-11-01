// Sentinel 13.9.212 — selective one-minute late breakout / counter-leg review.
// Read-only admission of already confirmed signals. No quote polling, timers,
// side switching, broker access, delays or expiry changes.
const policy = Object.freeze({ durationMs: 60000, lateSecond: 30, maxQuoteLagMs: 1950, maxLookbackGapMs: 2500 });
const validSide = side => side === 'CALL' || side === 'PUT';

export function evaluateLateBreakoutTransition({ candidate, quoteHistory = [], quoteAt, now = quoteAt,
  price, durationMs } = {}) {
  const allowed = { blocked: false, kind: 'late-breakout-transition', reasons: [] };
  // Reversals are handled by their existing independent structural confirmation.
  // No blanket second-of-candle veto and no impact on 30s or 5m.
  if (Number(durationMs) !== policy.durationMs || candidate?.ready !== true ||
      candidate?.reason !== 'historical-level-breakout' || !validSide(candidate.side)) return allowed;
  const at = Number(quoteAt), clock = Number(now), spot = Number(price);
  if (!(at > 0 && clock >= at && clock - at <= policy.maxQuoteLagMs &&
        spot > 0 && candidate.observedAt === at && candidate.entryPrice === spot)) return allowed;
  if (Math.floor(at / 1000) % 60 < policy.lateSecond) return allowed;
  const rows = (Array.isArray(quoteHistory) ? quoteHistory : []).filter(q => {
    const ts = Number(q?.ts), received = Number(q?.receivedAt ?? q?.ts), p = Number(q?.price);
    return Number.isFinite(ts) && ts <= at && ts >= at - 65000 &&
      Number.isFinite(received) && received <= clock &&
      Number.isFinite(p) && p > 0;
  }).sort((a,b) => Number(a.ts) - Number(b.ts));
  const recent = rows.at(-1);
  if (Number(recent?.ts) !== at || Number(recent?.price) !== spot) return allowed;
  const previous = seconds => {
    const target = at - seconds * 1000;
    for (let i = rows.length - 1; i >= 0; i--) {
      const t = Number(rows[i].ts);
      if (t <= target) return target - t <= policy.maxLookbackGapMs ? Number(rows[i].price) : null;
    }
    return null;
  };
  const p5 = previous(5), p60 = previous(60);
  if (p5 === null || p60 === null) return allowed;
  const sign = candidate.side === 'CALL' ? 1 : -1;
  const shortMove = sign * (spot - p5), minuteMove = sign * (spot - p60);
  // Short-lived move toward the signal, but the fully observed previous minute
  // does not confirm that breakout: do NOT treat a bounce as continuation.
  if (!(shortMove > 0 && minuteMove <= 0)) return allowed;
  return {blocked:true,kind:'late-breakout-transition',reasons:['late-breakout-without-minute-direction-support'],
    details: {second:Math.floor(at/1000)%60, fiveSecondMove:shortMove, minuteMove}};
}

export function reviewLateBreakoutTransition({candidate,...input}={}) {
  const result=evaluateLateBreakoutTransition({candidate,...input});
  if(!result.blocked)return candidate;
  return {...candidate,ready:false,side:null,provisionalSide:candidate.side,
    reason:'Rompimento tardio sem confirmação direcional do último minuto.',entryRisk:result};
}
