"use client";

import {BrandLogo} from "@/components/BrandLogo";
import {LanguageMenu} from "@/components/LanguageMenu";
import {useI18n} from "@/i18n/provider";
import styles from "./HomeHub.module.css";

const COPY={
  "pt-BR":{
    eyebrow:"DEVINX",title:"Organize seu dinheiro ou seu negócio.",text:"Duas ferramentas separadas. Escolha o que você precisa agora.",
    finance:"Financeiro",financeText:"Controle contas, cartões, metas, reservas, recebimentos e sua rotina de trabalho.",financeCta:"Conhecer Financeiro",financeLogin:"Entrar no Financeiro",
    store:"Loja",storeText:"Tenha sua vitrine pública e controle produtos, estoque, custos e vendas.",storeCta:"Conhecer Loja",storeLogin:"Entrar na Loja",
    note:"Cada produto tem acesso e assinatura próprios."
  },
  en:{eyebrow:"DEVINX",title:"Organize your money or your business.",text:"Two separate tools. Choose what you need right now.",finance:"Finance",financeText:"Manage bills, cards, goals, savings, income and your work routine.",financeCta:"Explore Finance",financeLogin:"Finance sign in",store:"Store",storeText:"Run a public storefront and manage products, stock, costs and sales.",storeCta:"Explore Store",storeLogin:"Store sign in",note:"Each product has its own access and subscription."},
  es:{eyebrow:"DEVINX",title:"Organiza tu dinero o tu negocio.",text:"Dos herramientas separadas. Elige lo que necesitas ahora.",finance:"Finanzas",financeText:"Controla cuentas, tarjetas, metas, reservas, ingresos y tu rutina de trabajo.",financeCta:"Conocer Finanzas",financeLogin:"Entrar en Finanzas",store:"Tienda",storeText:"Ten tu vitrina pública y controla productos, stock, costos y ventas.",storeCta:"Conocer Tienda",storeLogin:"Entrar en Tienda",note:"Cada producto tiene su propio acceso y suscripción."},
  fr:{eyebrow:"DEVINX",title:"Organisez votre argent ou votre activité.",text:"Deux outils séparés. Choisissez celui dont vous avez besoin.",finance:"Finance",financeText:"Gérez factures, cartes, objectifs, réserves, revenus et travail.",financeCta:"Découvrir Finance",financeLogin:"Connexion Finance",store:"Boutique",storeText:"Créez votre vitrine et gérez produits, stock, coûts et ventes.",storeCta:"Découvrir Boutique",storeLogin:"Connexion Boutique",note:"Chaque produit possède son propre accès et abonnement."},
  de:{eyebrow:"DEVINX",title:"Organisiere dein Geld oder dein Geschäft.",text:"Zwei getrennte Werkzeuge. Wähle, was du jetzt brauchst.",finance:"Finanzen",financeText:"Verwalte Rechnungen, Karten, Ziele, Rücklagen, Einnahmen und Arbeit.",financeCta:"Finanzen ansehen",financeLogin:"Finanzen anmelden",store:"Shop",storeText:"Betreibe deine öffentliche Shop-Seite und verwalte Produkte, Bestand, Kosten und Verkäufe.",storeCta:"Shop ansehen",storeLogin:"Shop anmelden",note:"Jedes Produkt hat eigenen Zugang und eigenes Abo."},
  ar:{eyebrow:"DEVINX",title:"نظّم أموالك أو نشاطك.",text:"أداتان منفصلتان. اختر ما تحتاجه الآن.",finance:"المالي",financeText:"نظّم الفواتير والبطاقات والأهداف والاحتياطي والدخل والعمل.",financeCta:"عرض المالي",financeLogin:"دخول المالي",store:"المتجر",storeText:"أنشئ واجهة متجرك ونظّم المنتجات والمخزون والتكاليف والمبيعات.",storeCta:"عرض المتجر",storeLogin:"دخول المتجر",note:"لكل منتج وصول واشتراك مستقل."}
} as const;

export function HomeHub(){
  const{locale}=useI18n();
  const c=COPY[(locale in COPY?locale:"pt-BR") as keyof typeof COPY];

  return <main className={styles.page}>
    <header className={styles.header}>
      <BrandLogo/>
      <LanguageMenu/>
    </header>

    <section className={styles.hero}>
      <span className={styles.eyebrow}>{c.eyebrow}</span>
      <h1>{c.title}</h1>
      <p>{c.text}</p>
    </section>

    <section className={styles.choices} aria-label={c.text}>
      <article className={styles.card}>
        <div className={styles.cardTop}><span>01</span><b>{c.finance}</b></div>
        <h2>{c.finance}</h2>
        <p>{c.financeText}</p>
        <div className={styles.actions}>
          <a className={styles.primary} href="/financeiro">{c.financeCta}</a>
          <a className={styles.secondary} href="/entrar">{c.financeLogin}</a>
        </div>
      </article>

      <article className={styles.card}>
        <div className={styles.cardTop}><span>02</span><b>{c.store}</b></div>
        <h2>{c.store}</h2>
        <p>{c.storeText}</p>
        <div className={styles.actions}>
          <a className={styles.primary} href="/loja">{c.storeCta}</a>
          <a className={styles.secondary} href="/loja/entrar">{c.storeLogin}</a>
        </div>
      </article>
    </section>

    <p className={styles.note}>{c.note}</p>
    <footer className={styles.footer}>DEVINX</footer>
  </main>;
}
