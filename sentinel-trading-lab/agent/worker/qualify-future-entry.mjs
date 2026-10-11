/**
 * Paired 13.4.67 vs 13.4.70 market-price validation.
 * Offline, read-only, opt-in journals; never operates or changes production.
 * Scores the user's FUTURE ENTRY at T+H to EXPIRY at T+2H.
 *
 * Important: broker quote outcomes are not execution receipts or broker P&L.
 * The evaluation does not assume a time with no usable quote was a win.
 */
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {pathToFileURL} from 'node:url';
import {SCENARIO_ENGINES} from '../src/core/scenario-engine-catalog.mjs';
import {futureEntrySchedule as baseline67} from '../src/core/research-baseline-13467/future-entry-schedule.mjs';
import {futureEntrySchedule as candidate70} from '../src/core/future-entry-schedule.mjs';

export const HORIZONS = Object.freeze([5, 10, 30, 60, 120, 300]);
const MAX_OUTCOME_LAG_MS = 1100;
const ENGINES = SCENARIO_ENGINES.map(e => e.id);
const asNumber = v => Number.isFinite(Number(v)) ? Number(v) : null;
const day = ms => new Date(ms).toISOString().slice(0, 10);
const pct = (n, d) => d ? Number((100 * n / d).toFixed(2)) : null;

function firstAtOrAfter(quotes, target) {
  let low = 0, high = quotes.length;
  while (low < high) {
    const m = (low + high) >>> 1;
    if (quotes[m].ts < target) low = m + 1;
    else high = m;
  }
  const q = quotes[low];
  // Late broker backfill is not a quote observable at expiry.
  return q && q.ts - target <= MAX_OUTCOME_LAG_MS &&
    q.receivedAt <= target + 2500 ? q : null;
}

function lastAtOrBefore(quotes, target) {
  let low = 0, high = quotes.length;
  while (low < high) {
    const m = (low + high) >>> 1;
    if (quotes[m].ts <= target) low = m + 1;
    else high = m;
  }
  return low ? quotes[low - 1] : null;
}

export function regimeBeforeIssue(history, now) {
  const curr = lastAtOrBefore(history, now);
  const prior10 = lastAtOrBefore(history, now - 10000);
  const prior60 = lastAtOrBefore(history, now - 60000);
  if (!curr || !prior10 || !prior60) return 'unknown';
  const short = Math.log(curr.price / prior10.price);
  const long = Math.log(curr.price / prior60.price);
  let abs = 0, net = 0, flips = 0, prev = 0;
  const recent = history.filter(q => q.ts >= now - 60000 && q.ts <= now);
  for (let i = 1; i < recent.length; i++) {
    const r = Math.log(recent[i].price / recent[i - 1].price);
    abs += Math.abs(r);
    net += r;
    const sign = Math.sign(r);
    if (sign && prev && sign !== prev) flips++;
    if (sign) prev = sign;
  }
  const efficiency = abs > 0 ? Math.abs(net) / abs : 0;
  // Regime assigned ONLY from previously observed prices, never hindsight.
  if (Math.abs(short) > 1e-10 && Math.abs(long) > 1e-10 &&
      short * long < 0 && Math.abs(short) / Math.max(Math.abs(long), 1e-10) > 0.22)
    return 'reversal-in-progress';
  if (efficiency < 0.22 && flips >= 7) return 'oscillation';
  if (efficiency > 0.50 && short * long > 0) return 'trend';
  return 'mixed';
}

export function scoredSide(side, trueSide) {
  if (!['CALL', 'PUT'].includes(side)) return null;
  return side === trueSide;
}

export function summarizePaired(rows) {
  const both = rows.filter(r => ['CALL', 'PUT'].includes(r.oldSide) &&
    ['CALL', 'PUT'].includes(r.newSide) &&
    ['CALL', 'PUT', 'DRAW'].includes(r.trueSide));
  const wins67 = both.filter(r => scoredSide(r.oldSide, r.trueSide)).length;
  const wins70 = both.filter(r => scoredSide(r.newSide, r.trueSide)).length;
  const draws = both.filter(r => r.trueSide === 'DRAW').length;
  const rescued = both.filter(r => !scoredSide(r.oldSide, r.trueSide) &&
    scoredSide(r.newSide, r.trueSide)).length;
  const harmed = both.filter(r => scoredSide(r.oldSide, r.trueSide) &&
    !scoredSide(r.newSide, r.trueSide)).length;
  const rate67 = pct(wins67, both.length), rate70 = pct(wins70, both.length);
  return {
    eligible: rows.length, comparable: both.length,
    coveragePct: pct(both.length, rows.length),
    draws, wins67, wins70, rate67, rate70,
    deltaPercentagePoints: rate67 == null ? null : Number((rate70 - rate67).toFixed(2)),
    rescued, harmed, changedDirection: both.filter(r => r.oldSide !== r.newSide).length
  };
}

export function qualifyPairedRows(rows, {targetPct = 70, minDays = 7,
  minComparable = 500, minDistinctMarketMoments = 250,
  minMotorHorizon = 80, minRegime = 75} = {}) {
  const days = [...new Set(rows.map(r => day(r.issuedAt)))].sort();
  const split = Math.max(1, Math.floor(days.length * 0.65));
  const heldOutDays = days.slice(split);
  const heldOut = rows.filter(r => heldOutDays.includes(day(r.issuedAt)));
  const total = summarizePaired(heldOut);
  // Nine engines often score the same observation. Never treat all nine
  // as nine independent market events when deciding data sufficiency.
  const distinctMarketMoments = new Set(heldOut.map(r =>
    r.provider + '|' + r.asset + '|' + r.issuedAt)).size;
  const byEngine = byFor(heldOut, r => r.engine);
  const byHorizon = byFor(heldOut, r => String(r.h));
  const byRegime = byFor(heldOut, r => r.regime);
  const byEngineHorizon = byFor(heldOut, r => r.engine + '/' + r.h);
  const requiredEngineHorizon = ENGINES.flatMap(engine =>
    HORIZONS.map(h => engine + '/' + h));
  const blockers = [];
  if (days.length < minDays || heldOutDays.length < 2)
    blockers.push('insufficient_independent_market_days');
  if (total.comparable < minComparable)
    blockers.push('insufficient_holdout_outcomes');
  if (distinctMarketMoments < minDistinctMarketMoments)
    blockers.push('insufficient_distinct_market_moments');
  if (total.rate70 == null || total.rate70 < targetPct)
    blockers.push('candidate_below_target_70pct');
  if (total.wins70 < total.wins67)
    blockers.push('aggregate_regression_against_67');
  for (const key of requiredEngineHorizon) {
    const m = byEngineHorizon[key];
    if (!m || m.comparable < minMotorHorizon)
      blockers.push('missing_independent_evidence:' + key);
    else if (m.rate70 < targetPct || m.wins70 < m.wins67)
      blockers.push('motor_horizon_fails:' + key);
  }
  for (const label of ['oscillation', 'reversal-in-progress']) {
    const m = byRegime[label];
    if (!m || m.comparable < minRegime)
      blockers.push('insufficient_' + label + '_evidence');
    else if (m.rate70 < targetPct || m.wins70 < m.wins67)
      blockers.push('unresolved_' + label + '_regression');
  }
  return {
    targetPct, daysObserved: days.length, distinctMarketMoments,
    trainingDays: days.slice(0, split),
    holdoutDays: heldOutDays, method: 'chronological held-out paired broker QUOTES; future entry T+H, expiry T+2H',
    total, byEngine, byHorizon, byRegime, byEngineHorizon,
    approvedForAutomaticPromotion: false,
    eligibleForHumanReview: blockers.length === 0,
    blockers,
    warning: 'Observações de motores/prazos sobre os mesmos preços são correlacionadas e a contagem de instantes únicos NÃO torna horizontes sobrepostos independentes. Cotações locais NÃO são confirmações de execução ou liquidação da corretora. Nenhum resultado deve autorizar operação real automaticamente.'
  };
}
function byFor(rows, keyOf) {
  return Object.fromEntries([...new Set(rows.map(keyOf))].sort()
    .map(key => [key, summarizePaired(rows.filter(r => keyOf(r) === key))]));
}

export async function loadPriceOnlyJournals(paths) {
  if (!paths.length) throw Error('no_journal_files');
  const contexts = new Map();
  let invalidEvents = 0, events = 0;
  for (const path of paths) {
    const lines = createInterface({input: createReadStream(path), crlfDelay: Infinity});
    for await (const line of lines) {
      if (!line.trim()) continue;
      const e = JSON.parse(line);
      if (e.type !== 'market') continue;
      if (![1, 2].includes(e.schema)) throw Error('unsupported_market_journal_schema');
      const when = asNumber(e.ts), asset = String(e.asset || '').trim().toUpperCase();
      const provider = String(e.provider || '').trim().toLowerCase();
      if (!(when > 0) || !asset || !provider) { invalidEvents++; continue; }
      const key = provider + '|' + asset;
      const c = contexts.get(key) || {provider, asset, events: [], quotes: new Map()};
      const quoteCandidates = Array.isArray(e.quotes) ? e.quotes : [];
      const all = [...quoteCandidates, {ts: e.quoteTs, price: e.quote}];
      for (const v of all) {
        const ts = asNumber(v?.ts), price = asNumber(v?.price);
        if (!(ts > 0) || !(price > 0) || ts > when) continue;
        const old = c.quotes.get(ts);
        // Preserve FIRST arrival time. Historical backfills that arrive later
        // must not be available to earlier forecasts (no hindsight leakage).
        if (!old || when < old.receivedAt)
          c.quotes.set(ts, {price, receivedAt: when});
      }
      c.events.push({ts: when});
      contexts.set(key, c);
      events++;
    }
  }
  return {
    events, invalidEvents,
    series: [...contexts.values()].map(c => ({
      provider: c.provider, asset: c.asset,
      // Sort by original quote timestamp, never by arrival order.
      quotes: [...c.quotes].sort((a, b) => a[0] - b[0])
        .map(([ts, record]) => ({ts, price: record.price,
          receivedAt: record.receivedAt})), 
      events: [...new Set(c.events.map(e => e.ts))].sort((a, b) => a - b)
    }))
  };
}

export function compareRecordedSeries(series, {maxIssuesPerHorizonPerDay = 70} = {}) {
  const rows = [], gaps = {entry: 0, expiry: 0, history: 0, forecasts: 0};
  for (const c of series) {
    if (c.quotes.length < 150) continue;
    const lastQuoteTs = c.quotes.at(-1).ts;
    for (const h of HORIZONS) {
      let lastIssued = -Infinity;
      const dailyCount = new Map();
      for (const now of c.events) {
        if (now - lastIssued < Math.max(60000, h * 2000 + 5000)) continue;
        if (now + 2 * h * 1000 > lastQuoteTs) break;
        const d = day(now), issuedToday = dailyCount.get(d) || 0;
        if (issuedToday >= maxIssuesPerHorizonPerDay) continue;
        const history = c.quotes.filter(q => q.ts <= now && q.receivedAt <= now &&
          q.ts >= now - Math.max(1800000, h * 8000)).slice(-2400);
        if (history.length < 100 ||
            now - history[0].ts < Math.max(120000, h * 3000)) {
          gaps.history++;
          continue;
        }
        const entry = firstAtOrAfter(c.quotes, now + h * 1000);
        if (!entry) {gaps.entry++; continue;}
        const expiry = firstAtOrAfter(c.quotes, now + 2 * h * 1000);
        if (!expiry) {gaps.expiry++; continue;}
        const delta = expiry.price - entry.price;
        const trueSide = delta > 0 ? 'CALL' : delta < 0 ? 'PUT' : 'DRAW';
        const regime = regimeBeforeIssue(history, now);
        const snap = {provider: c.provider, quoteHistory: history,
          quoteTs: history.at(-1).ts};
        for (const engine of ENGINES) {
          const settings = {asset: c.asset, engine, orderDurationMs: h * 1000};
          const old = baseline67({settings, snap, now, delays: [h]})[0];
          const newer = candidate70({settings, snap, now, delays: [h]})[0];
          if (old.entryAt && (old.entryAt !== newer.entryAt ||
              old.exitAt !== newer.exitAt))
            throw Error('baseline_candidate_schedule_mismatch');
          if (!old.side || !newer.side) gaps.forecasts++;
          rows.push({provider: c.provider, asset: c.asset, engine, h, regime,
            issuedAt: now, entryAt: now + h * 1000,
            expiryAt: now + 2 * h * 1000, quoteEntryLagMs: entry.ts - (now + h * 1000),
            quoteExpiryLagMs: expiry.ts - (now + 2 * h * 1000),
            oldSide: old.side, newSide: newer.side, trueSide});
        }
        lastIssued = now;
        dailyCount.set(d, issuedToday + 1);
      }
    }
  }
  return {rows, gaps};
}

export async function qualifyJournals(paths, options = {}) {
  const market = await loadPriceOnlyJournals(paths);
  const paired = compareRecordedSeries(market.series, options);
  return {
    scope: 'LOCAL PRICE-ONLY DEMO JOURNAL. NO TRADES. NO DATABASE.',
    sourceFiles: paths.length, observedMarketEvents: market.events,
    invalidMarketEvents: market.invalidEvents,
    series: market.series.map(x => ({provider: x.provider, asset: x.asset,
      quotes: x.quotes.length, observations: x.events.length})),
    evaluated: paired.rows.length,
    missing: paired.gaps,
    qualification: qualifyPairedRows(paired.rows, options)
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = process.argv.slice(2);
  if (!paths.length) {
    console.error('Use: node worker/qualify-future-entry.mjs "worker/data/market-history/2026-*.jsonl"');
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(await qualifyJournals(paths), null, 2));
    } catch (error) {
      console.error('Qualification refused: ' + error.message);
      process.exitCode = 1;
    }
  }
}
