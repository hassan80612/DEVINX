export type SentinelLanguage='pt'|'en';
export declare const translations:Readonly<{en:Readonly<Record<string,string>>}>;
export declare function sentinelLanguage(value:unknown):SentinelLanguage;
export declare function sentinelText(language:SentinelLanguage|string,key:unknown):string;
