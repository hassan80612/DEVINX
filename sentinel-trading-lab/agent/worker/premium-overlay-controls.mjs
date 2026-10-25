// Shadow-root styles only. No timers, filters, canvases, broker reads or libraries.
export const PREMIUM_OVERLAY_CSS=`
[data-sentinel-command-dock]{position:static;background:none;border:0;border-radius:0;padding:0;margin:8px 0;box-shadow:none}
.sentinel-console-shell{height:100%;display:flex;flex-direction:column;gap:4px;overflow:hidden}
[data-sentinel-primary]{flex:none;min-width:0}
[data-sentinel-details-scroll]{flex:1;min-height:22px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;border-top:1px solid rgba(140,160,182,.22);padding-top:5px}
#sentinel-trading-overlay[data-console-layout="scroll"] .sentinel-console-shell{height:auto;overflow:visible}
#sentinel-trading-overlay[data-console-layout="scroll"] [data-sentinel-details-scroll]{flex:none;overflow:visible}
.sentinel-price-cell{display:flex;flex-direction:column;gap:4px;min-width:0;padding:7px 9px;border:1px solid rgba(140,160,182,.2);border-radius:8px}
.sentinel-price-cell small{font-size:9px;line-height:12px;opacity:.75;white-space:normal}
.sentinel-price-cell b{font-size:17px;line-height:21px;font-weight:750;font-variant-numeric:tabular-nums}
[data-sentinel-primary] [data-sentinel-card="horizon"]{margin-top:6px!important;border-radius:10px!important}
[data-sentinel-primary] [data-sentinel-vnext-cards] [data-sentinel-summary]{border-radius:8px!important;padding:6px 7px!important}
[data-sentinel-primary] [data-sentinel-executor-message]{max-height:16px;overflow:hidden}
#sentinel-trading-overlay[data-console-layout="split"]{scrollbar-gutter:auto!important}
[data-sentinel-command-dock] [data-sentinel-executor-monitor]{font-size:11px}
.sentinel-monitor-head{display:flex;align-items:center;gap:7px;min-height:38px}.sentinel-monitor-head>[data-sentinel-executor-state]{font-size:10px;line-height:13px;max-width:160px}.sentinel-monitor-head strong{margin-left:auto;font-size:18px!important;white-space:nowrap}
.sentinel-monitor-results{display:flex;align-items:center;justify-content:space-between;gap:7px;margin-top:4px;font-size:10px;line-height:14px;flex-wrap:wrap}
.sentinel-monitor-results>[data-sentinel-executor-broker-balance]{margin-top:0!important;font-size:9px!important}
[data-sentinel-executor-action-msg]:empty,[data-sentinel-control-msg]:empty{display:none}
[data-sentinel-executor-state][data-bot-state="off"]{color:#ed9ca8;background:rgba(190,75,95,.13);display:inline-block;padding:3px 6px;border-radius:5px}
[data-sentinel-executor-state][data-bot-state="scanning"],[data-sentinel-executor-state][data-bot-state="trading"]{color:#72ddb1;background:rgba(60,179,128,.13);display:inline-block;padding:3px 6px;border-radius:5px}
[data-sentinel-executor-state][data-bot-state="arming"],[data-sentinel-executor-state][data-bot-state="waiting"]{color:#efc66f;background:rgba(192,143,57,.14);display:inline-block;padding:3px 6px;border-radius:5px}
[data-sentinel-command-buttons]{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin-top:8px}
[data-sentinel-command-buttons] [data-sentinel-analysis-actions],[data-sentinel-command-buttons] [data-sentinel-bot-actions]{display:contents!important}
[data-sentinel-command-buttons] button{height:33px!important;min-height:33px!important;padding:4px!important;font-size:10px!important;line-height:1.15}
[data-sentinel-command-dock] [data-sentinel-executor-balance]{font-size:19px!important;letter-spacing:-.3px}
[data-sentinel-command-dock] [data-sentinel-executor-broker-balance]{font-size:10px;opacity:.78}
[data-sentinel-command-dock] [data-sentinel-executor-message]{max-height:28px;overflow:auto;font-size:10px}
[data-sentinel-command-dock] [data-sentinel-executor-next]{font-size:10px}
.sentinel-mg-strip{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:7px;padding:6px 8px;border:1px solid rgba(139,158,170,.22);border-radius:8px;font-size:11px}
.sentinel-mg-strip label{display:flex;align-items:center;gap:7px;cursor:pointer;font-weight:700}.sentinel-mg-strip input{accent-color:#64d5b0;width:15px;height:15px;margin:0}
#sentinel-trading-overlay button{transition:transform 90ms ease,box-shadow 90ms ease,opacity 90ms ease;box-shadow:none}
#sentinel-trading-overlay button:not(:disabled):active{transform:translateY(2px);box-shadow:inset 0 2px 5px rgba(0,0,0,.4)}
#sentinel-trading-overlay button:focus-visible{outline:2px solid #79cdbf;outline-offset:2px}
#sentinel-trading-overlay button:disabled{opacity:.42;cursor:default!important;box-shadow:none}
#sentinel-trading-overlay button[data-command-feedback="pending"]{box-shadow:inset 0 0 0 2px #e5c272;opacity:.8}
#sentinel-trading-overlay button[data-command-feedback="done"]{box-shadow:inset 0 0 0 2px #67d4ae}
#sentinel-trading-overlay button[data-command-feedback="error"]{box-shadow:inset 0 0 0 2px #f098a6}
@media(prefers-reduced-motion:reduce){#sentinel-trading-overlay button{transition:none}}
`;
