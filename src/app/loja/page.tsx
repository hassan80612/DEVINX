import type {Metadata} from "next";
import {BrandLogo} from "@/components/BrandLogo";
import {fetchPublicStorePlans} from "@/lib/storefront-backend";
import styles from "./page.module.css";
import {StoreAvailabilityGate} from "@/components/StoreAvailabilityGate";

export const metadata:Metadata={
  title:{absolute:"DevinX Loja | Vitrine, estoque e vendas"},
  description:"Sua vitrine, estoque, vendas, frete, equipe e financeiro em um único painel para quem vende produtos.",
  alternates:{canonical:"/loja"},
  openGraph:{
    title:"DevinX Loja",
    description:"Uma loja bonita para o cliente. Um negócio organizado para você.",
    url:"https://devinx.com.br/loja",
    siteName:"DevinX Loja",
    type:"website"
  }
};

const capabilities=[
  ["Vitrine própria","Produtos, fotos, preço e prazo"],
  ["WhatsApp","Pedido organizado em um toque"],
  ["Estoque por cor","Quantidade certa por variação"],
  ["Financeiro","Custo, venda e lucro"],
  ["Frete","Melhor Envio + frete grátis"],
  ["Equipe","Acessos e permissões"],
  ["Comissões","Aprovações e valores a pagar"],
  ["Relatórios","Resumo detalhado do mês"],
];

const money=(cents:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(cents||0)/100);

export default async function LojaPage(){
  const planData=await fetchPublicStorePlans().catch(()=>({plans:[]}));
  const plans=Array.isArray(planData?.plans)?planData.plans:[];

  return <StoreAvailabilityGate><main className={styles.page}>
    <header className={styles.header}>
      <a href="/" className={styles.brand} aria-label="DevinX"><BrandLogo/></a>
      <div className={styles.headerActions}>
        <a href="/financeiro">Financeiro</a>
        <a href="#planos">Planos</a>
        <a href="/loja/entrar" className={styles.headerLogin}>Entrar na DevinX Loja</a>
      </div>
    </header>

    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <div className={styles.badge}>DEVINX LOJA · SUA OPERAÇÃO EM UM SÓ LUGAR</div>
        <h1>Uma loja bonita para o cliente.<br/><span>Um negócio organizado para você.</span></h1>
        <p>Vitrine, pedidos, estoque por cor, frete, equipe e lucro reunidos em um único lugar — sem comissão por venda.</p>
        <div className={styles.heroActions}>
          <a href="#planos" className={styles.primary}>Criar minha loja</a>
          <a href="#visao" className={styles.secondary}>Ver por dentro</a>
        </div>
        <div className={styles.heroFacts}>
          <span><b>0%</b> comissão</span>
          <span><b>WhatsApp</b> direto</span>
          <span><b>Estoque</b> por cor</span>
        </div>
      </div>

      <div className={styles.stage} aria-label="Prévia visual da DevinX Loja">
        <div className={styles.stageGlow}></div>
        <div className={styles.desktopApp}>
          <div className={styles.windowBar}><i></i><i></i><i></i><span>DevinX Loja · Painel</span></div>
          <div className={styles.appBody}>
            <aside className={styles.appSide}>
              <strong>Visão geral</strong>
              <span>Minha loja</span><span>Produtos</span><span>Vendas</span><span>Comissões</span><span>Plano e uso</span>
            </aside>
            <div className={styles.dashboard}>
              <div className={styles.dashboardHead}><div><small>RESUMO DO MÊS</small><b>Sua operação em um só lugar</b></div><span>AO VIVO</span></div>
              <div className={styles.kpis}>
                <div><small>Vendas</small><b>24</b></div>
                <div><small>Faturamento</small><b>R$ 3.840</b></div>
                <div><small>Lucro</small><b>R$ 1.280</b></div>
              </div>
              <div className={styles.stockCard}>
                <div className={styles.stockTitle}><div><b>Copo térmico personalizado</b><small>Estoque por cor</small></div><strong>15 un.</strong></div>
                <div className={styles.stockColors}><span>Preto <b>5</b></span><span>Branco <b>3</b></span><span>Azul <b>7</b></span></div>
              </div>
              <div className={styles.miniChart}><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
            </div>
          </div>
        </div>

        <div className={styles.phoneStore}>
          <div className={styles.phoneNotch}></div>
          <div className={styles.storeHeader}><div className={styles.storeLogo}>DX</div><div><b>Laser Presentes</b><small>Personalizados sob encomenda</small></div></div>
          <div className={styles.storeProducts}>
            <article><div className={styles.productThumb}><span>COPO</span></div><div><b>Copo personalizado</b><small>R$ 120,00</small></div></article>
            <article><div className={styles.productThumb}><span>360°</span></div><div><b>Arte 360°</b><small>R$ 135,00</small></div></article>
          </div>
          <button type="button" tabIndex={-1}>Personalizar e pedir</button>
        </div>

        <div className={`${styles.floatPill} ${styles.pillOne}`}><span>✓</span><div><b>Frete calculado</b><small>Melhor Envio</small></div></div>
        <div className={`${styles.floatPill} ${styles.pillTwo}`}><span>R$</span><div><b>Lucro atualizado</b><small>após cada venda</small></div></div>
      </div>
    </section>

    <section className={styles.capabilities} aria-label="Recursos da DevinX Loja">
      {capabilities.map(([title,text],index)=><article key={title}><span>{String(index+1).padStart(2,"0")}</span><div><b>{title}</b><small>{text}</small></div></article>)}
    </section>

    <section id="visao" className={styles.operations}>
      <div className={styles.operationsIntro}>
        <span>POR DENTRO DA DEVINX LOJA</span>
        <h2>Você vende. O painel organiza.</h2>
        <p>Sem transformar sua rotina em planilha, menu infinito ou ferramenta complicada.</p>
      </div>

      <div className={styles.operationsGrid}>
        <article className={styles.opCard}>
          <div className={styles.opIcon}>01</div>
          <h3>Produto e estoque</h3>
          <p>Cadastre fotos, preço, custo, prazo e quantidade. Se vender por cores, cada cor tem seu próprio estoque.</p>
          <div className={styles.colorLine}><span>Preto <b>5</b></span><span>Branco <b>3</b></span><span>Azul <b>7</b></span></div>
        </article>

        <article className={`${styles.opCard} ${styles.opFeature}`}>
          <div className={styles.opIcon}>02</div>
          <h3>Venda, custo e lucro</h3>
          <p>Quando a venda é confirmada, o estoque correto baixa e seu resultado entra no resumo financeiro da Loja.</p>
          <div className={styles.saleLine}><span><small>Venda</small><b>R$ 120</b></span><i>→</i><span><small>Custo</small><b>R$ 80</b></span><i>→</i><span className={styles.saleProfit}><small>Lucro</small><b>R$ 40</b></span></div>
        </article>

        <article className={styles.opCard}>
          <div className={styles.opIcon}>03</div>
          <h3>Frete e equipe</h3>
          <p>Calcule frete pelo CEP, use frete grátis, conecte o Melhor Envio e libere acessos com permissões para sua equipe.</p>
          <div className={styles.actionChips}><span>Melhor Envio</span><span>Permissões</span><span>Comissões</span><span>Aprovações</span></div>
        </article>
      </div>

      <div className={styles.whatsappBand}>
        <div className={styles.whatsappCopy}><span>PEDIDO SEM ENROLAÇÃO</span><h3>O cliente escolhe na vitrine e fala com você no WhatsApp.</h3><p>Produto, preço, prazo e personalização chegam organizados. Você continua atendendo do seu jeito.</p></div>
        <div className={styles.whatsappMessage}>
          <div className={styles.waTop}><i></i><b>Laser Presentes</b><small>online</small></div>
          <div className={styles.waBubble}><small>Pedido pela DevinX Loja</small><b>Copo térmico personalizado</b><span>Personalização: “Melhor Pai do Mundo”</span><span>Preço: R$ 120,00 · Prazo: 2 dias</span></div>
        </div>
      </div>
    </section>

    <section id="planos" className={styles.plansSection}>
      <div className={styles.sectionTitle}><span>PLANOS DEVINX LOJA</span><h2>Comece do tamanho da sua operação.</h2><p>Todos os planos têm vitrine, pedidos no WhatsApp, estoque, vendas, lucro e recursos de frete.</p></div>
      {plans.length?<div className={styles.plans}>{plans.map((plan:any)=><article key={plan.id} className={plan.id==="pro"?styles.featured:""}>
        {plan.id==="pro"&&<div className={styles.planBadge}>MAIS EQUILIBRADO</div>}
        <h3>{plan.name}</h3>
        <div className={styles.price}><strong>{money(plan.priceCents)}</strong><span>/mês</span></div>
        <ul>
          <li>Até {plan.products} produtos</li>
          <li>Até {plan.photosPerProduct} fotos por produto</li>
          <li>{plan.whatsappContacts} {plan.whatsappContacts===1?"WhatsApp":"WhatsApps"}</li>
          <li>{plan.links} {plan.links===1?"link externo":"links externos"}</li>
          <li>Até {Number(plan.collaborators||0)+1} usuários</li>
        </ul>
        <a href={`/loja/assinar/${plan.id}`} className={styles.subscribeButton}>Assinar {plan.name}</a>
      </article>)}</div>:<div className={styles.planUnavailable}>Os planos estão temporariamente indisponíveis. Tente novamente em instantes.</div>}
      <div className={styles.planNote}>Sem comissão por venda. A assinatura libera os recursos da DevinX Loja conforme o plano escolhido.</div>
    </section>

    <section className={styles.finalCta}>
      <div><span>SUA OPERAÇÃO JÁ EXISTE</span><h2>Agora dê a ela uma estrutura à altura.</h2><p>Uma vitrine bonita para vender e um painel simples para não perder o controle.</p></div>
      <a href="/iguassu-shop" className={styles.primary}>Ver vitrine de exemplo</a>
    </section>

    <section className={styles.retention}><strong>Sobre cancelamento e seus dados</strong><p>Ao cancelar, você continua com acesso até o fim do período pago. Depois do vencimento, a loja é suspensa e mantida por 7 dias para possível reativação. Sem reativação nesse prazo, o conteúdo é excluído definitivamente.</p></section>

    <footer className={styles.footer}><span>© 2026 DevinX · Loja</span><div className={styles.footerLinks}><a href="/financeiro">Conhecer DevinX Financeiro</a><a href="/">Voltar ao DevinX</a></div></footer>
  </main></StoreAvailabilityGate>;
}
