"""Offline audit of version-separated Sentinel JSONL ZIPs; no trading or network."""
import argparse
import collections
import datetime
import hashlib
import json
import math
import pathlib
import statistics
import zipfile
import zoneinfo


def stats(values):
    ordered = sorted(values)
    if not ordered:
        return None
    return {"n": len(values), "min": ordered[0], "median": statistics.median(ordered),
            "p95_lower_index": ordered[math.floor((len(ordered)-1)*.95)], "max": ordered[-1]}


def group(rows, field):
    buckets = collections.defaultdict(list)
    for row in rows:
        buckets[str(row[field])].append(row)
    result = {}
    for name, values in buckets.items():
        counts = collections.Counter(r["result"] for r in values)
        resolved = counts["win"] + counts["loss"]
        result[name] = {"settled": len(values), "wins": counts["win"], "losses": counts["loss"],
                        "ties": counts["tie"], "winRateExcludingTies": round(100*counts["win"]/resolved, 4) if resolved else None,
                        "netPnl": round(sum(r["netPnl"] for r in values), 8)}
    return result


def audit(path):
    sessions = []
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            if not member.filename.endswith(".jsonl"):
                continue
            if member.file_size > 64*1024*1024:
                raise ValueError("Journal exceeds offline audit size limit")
            raw = archive.read(member)
            events = [json.loads(line) for line in raw.decode("utf-8-sig").splitlines() if line.strip()]
            identities = {(e["release"]["version"], e["release"]["build"]) for e in events}
            if len(identities) != 1:
                raise ValueError("Split mixed-release journals before comparing")
            version, build = identities.pop()
            decisions = {(e["provider"], e["batchId"]): e for e in events if e["type"] == "trade_decision"}
            accepted = {(e["provider"], e["orderId"]): e for e in events if e["type"] == "broker_accepted"}
            settled = {(e["provider"], e["orderId"]): e for e in events if e["type"] == "broker_settlement"}
            rows, unmatched = [], []
            for key, result in settled.items():
                ack = accepted.get(key)
                batch = ack["localId"].rsplit("|click-", 1)[0] if ack else None
                decision = decisions.get((key[0], batch))
                if not decision:
                    unmatched.append(key)
                    continue
                sign = 1 if decision["side"] == "CALL" else -1
                price_delta = sign*(result["exitPrice"]-result["entryPrice"])
                consistent = "win" if price_delta > 0 else "loss" if price_delta < 0 else "tie"
                hypothetical_delta = sign*(result["exitPrice"]-decision["signalPrice"])
                hypothetical = "win" if hypothetical_delta > 0 else "loss" if hypothetical_delta < 0 else "tie"
                structure = decision.get("structure") or {}
                proof = structure.get("levelExpiryProof") or {}
                wall = (structure.get("resistance" if sign > 0 else "support") or {}).get("level")
                room = sign*(wall-decision["signalPrice"]) if wall is not None else None
                moves = proof.get("moves") or []
                rows.append({"version": version, "build": build, "provider": key[0], "orderId": key[1],
                             "batchId": batch, "asset": decision["asset"], "side": decision["side"],
                             "durationMs": decision["durationMs"], "signalAt": decision["signalAt"],
                             "signalLocal": datetime.datetime.fromtimestamp(decision["signalAt"]/1000, zoneinfo.ZoneInfo("America/Sao_Paulo")).isoformat(),
                             "reason": structure.get("reason"), "rawSide": structure.get("rawSide"),
                             "signalPrice": decision["signalPrice"], "acceptedEntryPrice": ack["entryPrice"],
                             "settlementEntryPrice": result["entryPrice"], "exitPrice": result["exitPrice"],
                             "result": result["result"], "netPnl": result["netPnl"],
                             "sidePriceOutcomeConsistent": consistent == result["result"],
                             "hypotheticalAtSignalPrice": hypothetical,
                             "quoteAgeMs": decision["signalAt"]-decision["snapshotQuoteAt"],
                             "decisionLogDelayMs": decision["ts"]-decision["signalAt"],
                             "signalToAckMs": ack["ts"]-decision["signalAt"],
                             "signalToSettlementMs": result["ts"]-decision["signalAt"],
                             "proofConfirmed": proof.get("confirmed"), "proofMoves": moves,
                             "roomToRecordedOpposingLevel": room,
                             "roomVsProofFirstMove": None if not moves or room is None else room <= moves[0]})
            eligible = [r for r in rows if decisions[(r["provider"], r["batchId"])]["directionMode"] == "automatic"
                        and not decisions[(r["provider"], r["batchId"])]["independent"]
                        and decisions[(r["provider"], r["batchId"])]["martingaleLevel"] == 0
                        and decisions[(r["provider"], r["batchId"])]["clickCount"] == 1]
            sessions.append({"file": member.filename, "sha256": hashlib.sha256(raw).hexdigest(), "version": version, "build": build,
                             "firstEvent": min(e["ts"] for e in events), "lastEvent": max(e["ts"] for e in events),
                             "eventCounts": dict(collections.Counter(e["type"] for e in events)),
                             "decisions": len(decisions), "accepted": len(accepted), "settled": len(settled),
                             "unresolvedAccepted": len(accepted.keys()-settled.keys()), "unmatchedSettlements": unmatched,
                             "all": group(eligible, "version")[version], "byReason": group(eligible, "reason"),
                             "bySide": group(eligible, "side"), "byDuration": group(eligible, "durationMs"),
                             "quoteAgeMs": stats([r["quoteAgeMs"] for r in eligible]),
                             "signalToAckMs": stats([r["signalToAckMs"] for r in eligible]),
                             "decisionLogDelayMs": stats([r["decisionLogDelayMs"] for r in eligible]),
                             "inconsistentSidePriceOutcomes": sum(not r["sidePriceOutcomeConsistent"] for r in rows),
                             "hypotheticalAtSignalPrice": dict(collections.Counter(r["hypotheticalAtSignalPrice"] for r in rows)),
                             "rows": rows})
    return {"archive": pathlib.Path(path).name, "archiveSha256": hashlib.sha256(pathlib.Path(path).read_bytes()).hexdigest(),
            "sessions": sorted(sessions, key=lambda s: s["firstEvent"]),
            "limits": ["Sessions use different times/providers; this is not same-data version A/B.",
                       "No market trajectory, candidate-rejection history, CPU profile or expiry-selector events.",
                       "The fixed-exit hypothetical is not a simulation of execution with no latency."]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("archive")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    result = audit(args.archive)
    pathlib.Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2))
    for session in result["sessions"]:
        print(session["version"], session["all"], "unresolved", session["unresolvedAccepted"])
