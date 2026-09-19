export default function Home(){
  return <main className="landingV2">
    <header className="top landingTop"><div className="brand"><span className="mark">D</span><b>DEVINX</b></div><a className="ghost" href="/entrar">Entrar</a></header>
    <section className="landingHero">
      <div className="landingCopy"><span className="pill">FINANÇAS SEM PLANILHA</span><h1>Abra. Registre.<br/><em>Entenda o que sobrou.</em></h1><p>Para quem não tem tempo de procurar menu. Entradas, gastos, trabalho, cartões, parcelas e contas mensais em um só lugar.</p><div className="heroActions"><a className="primary" href="/entrar">Começar agora</a><a className="secondary" href="#como">Ver como funciona</a></div><div className="landingProof"><span>Sem planilha</span><span>Sem anúncios</span><span>Feito para celular</span></div></div>
      <div className="landingPreview" aria-label="Exemplo do painel"><div className="previewTop"><small>SETEMBRO</small><b>Seu mês</b></div><div className="previewBalance"><span>Saldo previsto</span><strong>R$ 1.880,00</strong><small>depois dos compromissos cadastrados</small></div><div className="previewQuick"><button>＋ Entrada</button><button>− Gasto</button><button>◷ Jornada</button><button>▣ Cartão</button></div><div className="previewRows"><div><span>Entrou</span><b>R$ 4.850</b></div><div><span>Gastou</span><b>R$ 2.190</b></div><div><span>A pagar</span><b>R$ 780</b></div></div></div>
    </section>
    <section className="landingSteps" id="como"><div><small>01</small><h2>Registre em segundos</h2><p>O que entrou, o que saiu ou uma jornada de trabalho.</p></div><div><small>02</small><h2>Veja o mês real</h2><p>Cartões, parcelas, contas e dívidas entram no cálculo sem duplicar.</p></div><div><small>03</small><h2>Decida com seus números</h2><p>Saldo previsto, metas e custo real do trabalho sempre à vista.</p></div></section>
    <footer>DEVINX <span>Seu dinheiro. Mais claro.</span></footer>
  </main>;
}
