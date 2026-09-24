import type {Metadata} from "next";
import {BrandLogo} from "@/components/BrandLogo";
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

export default function LojaPage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <a href="/" className={styles.brand} aria-label="DevinX"><BrandLogo/></a>
      <a className={styles.login} href="https://www.vetorizeai.com.br/login?next=%2Fminha-loja%2Fpainel">Entrar na Loja</a>
    </header>

    <section className={styles.hero}>
      <span className={styles.eyebrow}>DEVINX LOJA</span>
      <h1>Sua loja para vender.<br/><em>Seu painel para organizar.</em></h1>
      <p>Tenha uma vitrine profissional para seus clientes e controle produtos, estoque e vendas sem misturar a operação com o seu controle financeiro.</p>
      <div className={styles.actions}>
        <a className={styles.primary} href="https://www.vetorizeai.com.br/minha-loja#planos">Ver planos da Loja</a>
        <a className={styles.secondary} href="https://www.vetorizeai.com.br/login?next=%2Fminha-loja%2Fpainel">Já tenho acesso</a>
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

    <section className={styles.bridge}>
      <div>
        <span>DEVINX</span>
        <h2>Financeiro e Loja continuam independentes.</h2>
        <p>Você usa somente o produto que contratou. A Loja não depende de créditos do Vetorize AI e o Financeiro não é obrigatório para usar a Loja.</p>
      </div>
      <a href="/" className={styles.secondary}>Conhecer DevinX Financeiro</a>
    </section>
  </main>;
}
