import type {Metadata} from "next";
import {BrandLogo} from "@/components/BrandLogo";
import {fetchPublicStorePlans} from "@/lib/storefront-backend";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: {absolute: "DevinX Loja | Vitrine, estoque e vendas"},
  description: "Sua vitrine pública, produtos, estoque, vendas e atendimento pelo WhatsApp em uma operação organizada.",
  alternates: {canonical: "/loja"},
  openGraph: {
    title: "DevinX Loja",
    description: "Vitrine, estoque e vendas em um só lugar.",
    url: "https://devinx.com.br/loja",
    siteName: "DevinX Loja",
    type: "website",
  },
};

const features = [
  ["Vitrine própria", "Compartilhe sua loja em devinx.com.br/seu-nome."],
  ["Estoque organizado", "Produtos, quantidades e variações por cor."],
  ["Vendas pelo WhatsApp", "O cliente escolhe e o pedido chega organizado."],
  ["Gestão do negócio", "Custos, vendas, lucro e operação no mesmo painel."],
];

const money=(cents:number)=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(cents||0)/100);

export default async function LojaPage() {
  const planData=await fetchPublicStorePlans().catch(()=>({plans:[]}));
  const plans=Array.isArray(planData?.plans)?planData.plans:[];

  return <main className={styles.page}>
    <header className={styles.header}>
      <a href="/" className={styles.brand} aria-label="DevinX"><BrandLogo/></a>
      <a className={styles.login} href="/loja/entrar">Entrar na Loja</a>
    </header>

    <section className={styles.hero}>
      <span className={styles.eyebrow}>DEVINX LOJA</span>
      <h1>Sua loja para vender.<br/><em>Seu painel para organizar.</em></h1>
      <p>Tenha uma vitrine profissional para seus clientes e controle produtos, estoque e vendas sem misturar a operação com o seu controle financeiro.</p>
      <div className={styles.actions}>
        <a className={styles.primary} href="#planos">Ver planos da Loja</a>
        <a className={styles.secondary} href="/loja/entrar">Já tenho acesso</a>
      </div>
      <small className={styles.permanent}>A vitrine pública do lojista usa endereço definitivo no DevinX.</small>
    </section>

    <section className={styles.grid} aria-label="Recursos da DevinX Loja">
      {features.map(([title, text]) => <article key={title}>
        <span>◆</span>
        <h2>{title}</h2>
        <p>{text}</p>
      </article>)}
    </section>

    <section id="planos" className={styles.plansSection}>
      <div className={styles.sectionHead}>
        <span>PLANOS DEVINX LOJA</span>
        <h2>Escolha o tamanho da sua operação.</h2>
        <p>Todos os planos são da Loja e independentes do DevinX Financeiro.</p>
      </div>
      {plans.length?<div className={styles.plans}>
        {plans.map(plan=><article key={plan.id} className={plan.id==="pro"?styles.planFeatured:""}>
          <small>DEVINX LOJA</small>
          <h3>{plan.name}</h3>
          <div className={styles.planPrice}><strong>{money(plan.priceCents)}</strong><span>/mês</span></div>
          <ul>
            <li>✓ {plan.products} produtos</li>
            <li>✓ {plan.photos} fotos</li>
            <li>✓ {plan.links} links/vídeos</li>
            <li>✓ {plan.collaborators} colaborador(es)</li>
            <li>✓ {plan.whatsappContacts} contato(s) de WhatsApp</li>
            <li>✓ Sem comissão por venda</li>
          </ul>
          <a className={styles.primary} href={`/loja/assinar/${plan.id}`}>Assinar {plan.name}</a>
        </article>)}
      </div>:<div className={styles.planUnavailable}>Os planos estão temporariamente indisponíveis. Tente novamente em instantes.</div>}
    </section>

    <section className={styles.bridge}>
      <div>
        <span>DEVINX</span>
        <h2>Financeiro e Loja continuam independentes.</h2>
        <p>Você usa somente o produto que contratou. A Loja possui assinatura própria e o Financeiro não é obrigatório para usar a Loja.</p>
      </div>
      <a href="/#financeiro" className={styles.secondary}>Conhecer DevinX Financeiro</a>
    </section>
  </main>;
}
