# Sentinel 13.9.180

Published scope: the reviewed candidate from PR #164, commit 91b9e43401ee358e0b861cda5b4b9770d462d8a6, without any further market-decision changes. The user authorized publication after reviewing the paired replay and explicitly accepting a loss/win retention tradeoff.

Historical breakouts on 30s/1m now pass the existing direct clearance check before entering toward a role-correct opposing wall with at least one pivot and two independent rejections. The same existing room calculation applies even if price is still accelerating. Already cleared barriers remain eligible. No 40-second cutoff, fixed wait, pending candidate, mandatory retest, direction inversion, probability override or new broker request is introduced. Impulse setup logic, reversal detectors, 5m reversal-only policy, quote freshness, lifecycle, expiry and UI are preserved.

Validation of the exact candidate: 803 regression tests and production/type build passed. Paired causal replay on 247 recorded decision instants withholds seven original LOSS and three WIN, adds no entries and changes no directions. Within recorded 179, it withholds five LOSS and one WIN. These are same-instant comparisons on previously inspected records, not a blind holdout or complete simulation of replacement trades. The remaining 179 subset is 42 WIN/42 LOSS; improved live accuracy and profitability are not established. Full observations and limitations remain in the candidate protocol and paired report.

Release preparation changes only version/build metadata to 13.9.180 and the displayed release constant. The Vercel production pipeline repeats regression checks and builds the versioned installer. Confirm deployment aliases, downloaded manifest, payload checksum, EXE-embedded payload and exact packaged-source equality after publication.

Rollback: rollback/sentinel-13.9.179-before-180-20261030, commit e29275eb4a30039b02817fe0985985aca3c92f24, prior deployment dpl_94buryHFBiEEtCHo5uB8wQppqcfQ. The older 168 rollback remains available separately.
