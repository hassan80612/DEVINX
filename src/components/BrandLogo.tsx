import React from 'react';

export function BrandLogo({compact=false,className=''}:{compact?:boolean;className?:string}){
  return <span className={'devinxBrandLogo '+(compact?'compact ':'')+className} aria-label="DEVINX">
    <svg className="devinxEmblem" viewBox="0 0 64 64" role="img" aria-hidden="true">
      <defs>
        <linearGradient id="devinxGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8f641b"/>
          <stop offset="28%" stopColor="#f1c85f"/>
          <stop offset="52%" stopColor="#fff0a4"/>
          <stop offset="76%" stopColor="#d49a2e"/>
          <stop offset="100%" stopColor="#7c5415"/>
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="27.5" fill="none" stroke="url(#devinxGold)" strokeWidth="2.4"/>
      <path d="M22 19.5h13.5c9.2 0 16.5 7 16.5 15.8S44.7 51 35.5 51H26V39.9h9.5c3.7 0 6.6-2.1 6.6-4.7 0-2.7-2.9-4.7-6.6-4.7H28z" fill="url(#devinxGold)"/>
      <path d="M20 25.3l20.7 20.2-6.7 5.7L20 37.4z" fill="url(#devinxGold)"/>
      <path d="M20 42.2l7 6.8H20z" fill="url(#devinxGold)"/>
    </svg>
    {!compact&&<span className="devinxWordmark">DEVINX</span>}
  </span>;
}
