# Sentinel 13.9.30 — production verification

Published production deployment `dpl_BFKuVZ8dj6z9HAxFuxxLTi5VTjji` is READY with canonical alias `https://trading.devinx.com.br`, pinned to source commit `a90906220fd8ac810f77139f933570e5d81d2aff` on `release/sentinel-13.9.30`. Production source tree matches the reviewed local tree `ffc53e4c5a66fdfd43d509c2e67097cf7569936d`.

Downloaded the manifest, exact-version EXE, stable EXE alias, alternative ZIP and home from production. All five returned HTTP 200. The manifest and embedded release identify version 13.9.30/build `13.9.30-shared-install-completion-stable-package`. Exact and stable EXE bytes match. Published EXE, payload ZIP and alternative ZIP hashes match the local artifacts documented in the installation report.

Verified payload CRC, reviewed Agent source bytes, the reviewed lockfile and exclusion of installed dependencies/session data. EXE embedded installer and alternative ZIP installer match the shared reviewed script. The alternative CMD uses real CRLF and passes `OpenSiteAfterInstall`. EXE and ZIP downloads also returned HTTP 206 with correct range bytes and attachment headers; EXEs use application/octet-stream. No error/fatal runtime logs were returned in the initial deployment-scoped scan.

The standalone PowerShell URL remains protected by the existing login checks. It is not a public download test target; both offline installers contain the reviewed script. No authentication bypass was added.

Windows execution/default-browser opening and the user's Edge failure have not been reproduced in this Linux environment. Successful server download verification does not prove the user's Edge issue eliminated. The two subsequent screenshots show `SINAL · RELÓGIO LOCAL`: card deadlines start at signal issue, whereas a manually clicked 30-second trade starts later. Changing live directional indices during a pinned signal does not itself prove that the issued direction flipped. No additional prediction or clock change was made based solely on those still images.
