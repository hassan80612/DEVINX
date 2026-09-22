import {ImageResponse} from 'next/og';

export const alt='DEVINX — Seu dinheiro. Mais claro.';
export const size={width:1200,height:630};
export const contentType='image/png';

export default function Image(){
  return new ImageResponse(
    <div style={{
      width:'100%',
      height:'100%',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      background:'radial-gradient(circle at 50% 35%, #1d2a2e 0%, #0b1316 42%, #05090b 100%)',
      color:'#f7faf8',
      padding:'70px'
    }}>
      <div style={{
        display:'flex',
        flexDirection:'column',
        alignItems:'center',
        justifyContent:'center',
        gap:'22px'
      }}>
        <svg width="220" height="220" viewBox="0 0 64 64" role="img" aria-label="DEVINX">
          <defs>
            <linearGradient id="devinxOgGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#8f641b"/>
              <stop offset="28%" stopColor="#f1c85f"/>
              <stop offset="52%" stopColor="#fff0a4"/>
              <stop offset="76%" stopColor="#d49a2e"/>
              <stop offset="100%" stopColor="#7c5415"/>
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="27.5" fill="none" stroke="url(#devinxOgGold)" strokeWidth="2.4"/>
          <path d="M22 19.5h13.5c9.2 0 16.5 7 16.5 15.8S44.7 51 35.5 51H26V39.9h9.5c3.7 0 6.6-2.1 6.6-4.7 0-2.7-2.9-4.7-6.6-4.7H28z" fill="url(#devinxOgGold)"/>
          <path d="M20 25.3l20.7 20.2-6.7 5.7L20 37.4z" fill="url(#devinxOgGold)"/>
          <path d="M20 42.2l7 6.8H20z" fill="url(#devinxOgGold)"/>
        </svg>
        <div style={{
          display:'flex',
          fontSize:86,
          fontWeight:800,
          letterSpacing:'0.12em',
          lineHeight:1,
          color:'#f4cf69'
        }}>DEVINX</div>
        <div style={{
          display:'flex',
          fontSize:32,
          letterSpacing:'0.02em',
          color:'#d9e3df'
        }}>Seu dinheiro. Mais claro.</div>
      </div>
    </div>,
    size
  );
}
