const cards = [
  ['Entrou', 'R$ 4.850,00', 'renda do mês'],
  ['Gastou', 'R$ 2.190,00', 'inclui contas e dia a dia'],
  ['Ainda a pagar', 'R$ 780,00', 'próximos compromissos'],
  ['Saldo previsto', 'R$ 1.880,00', 'até o fim do mês'],
];

export default function Home() {
  return <main>
    <header className="top"><div className="brand"><span className="mark">D</span><b>DEVINX</b></div><a className="ghost" href="/entrar">Entrar</a></header>
    <section className="hero">
      <span className="pill">FINANÇAS SEM COMPLICAÇÃO</span>
      <h1>Toda a sua vida financeira<br/><em>na palma da mão.</em></h1>
      <p>Rendas, gastos, trabalho, metas, cartões e dívidas organizados em um só lugar.</p>
      <div className="heroActions"><a className="primary" href="/entrar">Começar agora</a><a className="secondary" href="#recursos">Ver como funciona</a></div>
    </section>
    <section className="phone">
      <div className="phoneHead"><div><small>EXEMPLO</small><h2>Seu mês</h2></div><span className="avatar">D</span></div>
      <div className="balance"><small>Saldo previsto</small><strong>R$ 1.880,00</strong><span>exemplo de como o painel organiza seus números</span></div>
      <div className="grid">{cards.map(([a,b,c])=><article key={a}><small>{a}</small><strong>{b}</strong><span>{c}</span></article>)}</div>
      <div className="goal"><div><b>Meta mensal</b><span>R$ 4.850 de R$ 6.000</span></div><div className="bar"><i/></div><small>81% concluída</small></div>
      <div className="quick"><button>+ Entrada</button><button>- Gasto</button></div>
      <nav><b>⌂<span>Início</span></b><b>↗<span>Rendas</span></b><b>↘<span>Gastos</span></b><b>◎<span>Metas</span></b><b>•••<span>Mais</span></b></nav>
    </section>
    <section className="features" id="recursos"><h2>Feito para a sua realidade.</h2><p>Você pode ter uma ou várias fontes de renda. O Devinx organiza tudo sem misturar o que não deve.</p><div className="featureGrid"><article>🚗<b>Motorista e entregador</b><span>Veja R$/hora, R$/km, combustível e quanto falta trabalhar para sua meta.</span></article><article>💼<b>Salário e renda extra</b><span>Organize salário, comissões, extras e outras fontes de renda.</span></article><article>🎯<b>Metas que fazem sentido</b><span>Acompanhe metas diárias, semanais e mensais usando seus próprios números.</span></article><article>💳<b>Contas, cartões e dívidas</b><span>Saiba o que já saiu, o que ainda vence e evite contar a mesma despesa duas vezes.</span></article></div></section>
    <footer>DEVINX <span>Seu dinheiro. Mais claro.</span></footer>
  </main>;
}
