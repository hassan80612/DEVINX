// Forward-only, quote-settled evidence for independently issued signals.
// This is NOT brokerage execution history or a promise of win probability.
// Strong negative evidence may stop repeating a statistically losing pattern.
export const ENTRY_QUALITY_EPOCH = 'independent-forward-quality-v1';

export function wilsonInterval(wins, samples, z = 1.96) {
  if (!Number.isInteger(samples) || samples <= 0) return { lower: 0, upper: 1 };
  const p = wins / samples, zz = z * z, divisor = 1 + zz / samples;
  const center = (p + zz / (2 * samples)) / divisor;
  const radius = z * Math.sqrt((p * (1 - p) + zz / (4 * samples)) / samples) / divisor;
  return { lower: Math.max(0, center - radius), upper: Math.min(1, center + radius) };
}

export function assessIndependentSignalHistory({
  outcomes = [], asset, provider, durationMs, side, payout = null,
  minSamples = 60, maxSamples = 240
} = {}) {
  const targetAsset = String(asset || '').toUpperCase();
  const targetProvider = String(provider || '').toLowerCase();
  const targetSide = String(side || '').toUpperCase();
  const comparable = (Array.isArray(outcomes) ? outcomes : []).filter(row =>
    row?.kind === 'operational_v3' &&
    row?.entryQualityEpoch === ENTRY_QUALITY_EPOCH &&
    row?.settlementQuality === 'exact' &&
    String(row.asset || '').toUpperCase() === targetAsset &&
    String(row.provider || '').toLowerCase() === targetProvider &&
    Number(row.settleDurationMs ?? row.durationMs) === Number(durationMs) &&
    (row.side === 'BUY' ? 'CALL' : row.side === 'SELL' ? 'PUT' : '') === targetSide &&
    (row.won === true || row.won === false)
  ).slice(-maxSamples);
  const samples = comparable.length;
  const wins = comparable.filter(row => row.won === true).length;
  const losses = samples - wins;
  const interval = wilsonInterval(wins, samples);
  // Unknown payout must not be treated as zero-cost or as a 50% break-even market.
  const safePayout = Number(payout);
  const economicBreakEven = payout != null && Number.isFinite(safePayout) &&
    safePayout > 0 && safePayout <= 1 ? 1 / (1 + safePayout) : 0.55;
  // Do not block from one loss or an arbitrary target win rate. Stop only
  // when the upper 95% bound is beneath economic break-even.
  const blocked = samples >= minSamples && interval.upper < economicBreakEven;
  return {
    status: blocked ? 'historically-underperforming' : samples < minSamples ? 'collecting-forward-evidence' : 'not-statistically-rejected',
    samples, wins, losses, winRate: samples ? wins / samples : null,
    lower95: interval.lower, upper95: interval.upper, economicBreakEven,
    minSamples, blocked, source: 'local-quote-settled-forward-signals',
    probabilityValidated: false, epoch: ENTRY_QUALITY_EPOCH
  };
}
