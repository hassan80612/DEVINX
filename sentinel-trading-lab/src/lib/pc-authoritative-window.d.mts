export type PcWindowPhase='scanning'|'open'|'cancelled'|'fired'|null;
export type PcWindowArgs={
 windowStartedAt?:number;windowEndsAt?:number;phase?:PcWindowPhase;
 side?:string|null;entryTriggeredAt?:number;quoteAt?:number;now?:number;
};
export type PcWindowView={
 active:boolean;enterNow:boolean;withinDeadline:boolean;
 remainingSeconds:number|null;label:string;phase:PcWindowPhase;startedAt:number;deadline:number;
};
export declare function pcAuthoritativeWindow(args?:PcWindowArgs):PcWindowView;
