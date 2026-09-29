import type {Metadata} from 'next';

export const metadata:Metadata={
  title:{absolute:'Obrigado | DevinX Laser Control'},
  robots:{index:false,follow:false}
};

export default function LaserThankYouPage(){
  return <main style={{
    minHeight:'100vh',display:'grid',placeItems:'center',padding:'28px',
    color:'#f5fbff',
    background:'radial-gradient(circle at 50% 0%,rgba(95,185,220,.20),transparent 34%),linear-gradient(180deg,#263947,#172833 100%)'
  }}>
    <section style={{
      width:'min(720px,100%)',padding:'34px',borderRadius:24,
      border:'1px solid rgba(145,222,248,.24)',
      background:'linear-gradient(180deg,rgba(45,68,82,.96),rgba(25,42,53,.98))',
      boxShadow:'0 28px 70px rgba(0,0,0,.28)'
    }}>
      <small style={{fontWeight:900,letterSpacing:'.14em',color:'#a9e8ff'}}>DEVINX LASER CONTROL</small>
      <h1 style={{margin:'12px 0 10px',fontSize:'clamp(32px,6vw,54px)',lineHeight:1}}>Obrigado pela compra.</h1>
      <p style={{margin:0,color:'#c5d7df',fontSize:16,lineHeight:1.65}}>
        Entre ou crie sua conta DevinX com o mesmo e-mail usado na Kiwify. Após a confirmação do pagamento, seu plano ou adicional será associado a esse e-mail conforme o item comprado.
      </p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:10,marginTop:24}}>
        <a href="/entrar?next=/laser-control&modo=criar" style={{
          minHeight:50,display:'grid',placeItems:'center',borderRadius:14,textDecoration:'none',
          fontWeight:900,color:'#10202a',background:'linear-gradient(135deg,#8bdcf4,#d8f7ff)'
        }}>Criar conta e ativar acesso</a>
        <a href="/entrar?next=/laser-control" style={{
          minHeight:50,display:'grid',placeItems:'center',borderRadius:14,textDecoration:'none',
          fontWeight:900,color:'#edfaff',border:'1px solid rgba(169,232,255,.34)',background:'rgba(13,31,40,.52)'
        }}>Já tenho conta · Entrar</a>
      </div>
      <p style={{margin:'22px 0 0',color:'#91aab5',fontSize:12,lineHeight:1.6}}>
        Na mentoria, o computador do aluno/origem precisa estar com o LightBurn aberto antes de iniciar a conexão.
      </p>
    </section>
  </main>;
}
