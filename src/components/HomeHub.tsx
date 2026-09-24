"use client";

import {BrandLogo} from "@/components/BrandLogo";
import {LanguageMenu} from "@/components/LanguageMenu";
import {useI18n} from "@/i18n/provider";
import styles from "./HomeHub.module.css";

const COPY={
  "pt-BR":{
    control:"DEVINX · VOCÊ NO CONTROLE",
    choose:"Escolha um produto.",
    chooseText:"Financeiro e Loja são produtos separados. Você pode usar apenas um deles — não precisa contratar os dois.",
    independent:"PRODUTO INDEPENDENTE",
    ownPlan:"Assinatura própria · não inclui o outro produto",
    or:"OU",
    financeTag:"DEVINX FINANCEIRO · SUA VIDA FINANCEIRA EM UM SÓ LUGAR",
    financeLine1:"Seu dinheiro organizado.",
    financeLine2:"Sua rotina sob controle.",
    financeText:"Contas, cartões, metas, reservas, recebimentos e jornada reunidos para você saber onde está e quanto precisa fazer.",
    financePrimary:"Teste grátis",
    financeSecondary:"Ver por dentro",
    financeLogin:"Já tenho acesso · Entrar",
    storeTag:"DEVINX LOJA · SUA OPERAÇÃO EM UM SÓ LUGAR",
    storeLine1:"Uma loja bonita para o cliente.",
    storeLine2:"Um negócio organizado para você.",
    storeText:"Vitrine, produtos, estoque, custos e vendas reunidos em um único lugar — sem comissão por venda.",
    storePrimary:"Criar minha loja",
    storeSecondary:"Ver por dentro",
    storeLogin:"Já tenho loja · Entrar",
    daily:"Meta diária",
    available:"Saldo atual",
    month:"Compromissos",
    stock:"Estoque por cor",
    orders:"WhatsApp direto",
    noFee:"0% comissão",
    example:"EXEMPLO"
  },
  en:{
    control:"DEVINX · YOU'RE IN CONTROL",choose:"Choose one product.",chooseText:"Finance and Store are separate products. You can use only one — you do not need to subscribe to both.",independent:"INDEPENDENT PRODUCT",ownPlan:"Own subscription · does not include the other product",or:"OR",
    financeTag:"DEVINX FINANCE · YOUR FINANCES IN ONE PLACE",financeLine1:"Your money organized.",financeLine2:"Your routine under control.",financeText:"Bills, cards, goals, savings, income and work sessions together so you always know where you stand.",financePrimary:"Free trial",financeSecondary:"See inside",financeLogin:"I already have access · Sign in",
    storeTag:"DEVINX STORE · YOUR OPERATION IN ONE PLACE",storeLine1:"A beautiful store for your customer.",storeLine2:"An organized business for you.",storeText:"Storefront, products, stock, costs and sales in one place — with no sales commission.",storePrimary:"Create my store",storeSecondary:"See inside",storeLogin:"I already have a store · Sign in",
    daily:"Daily target",available:"Current balance",month:"Commitments",stock:"Stock by color",orders:"Direct WhatsApp",noFee:"0% commission",example:"EXAMPLE"
  },
  es:{
    control:"DEVINX · TÚ TIENES EL CONTROL",choose:"Elige un producto.",chooseText:"Finanzas y Tienda son productos separados. Puedes usar solo uno — no necesitas contratar ambos.",independent:"PRODUCTO INDEPENDIENTE",ownPlan:"Suscripción propia · no incluye el otro producto",or:"O",
    financeTag:"DEVINX FINANZAS · TU VIDA FINANCIERA EN UN SOLO LUGAR",financeLine1:"Tu dinero organizado.",financeLine2:"Tu rutina bajo control.",financeText:"Cuentas, tarjetas, metas, reservas, ingresos y jornadas reunidos para que sepas dónde estás.",financePrimary:"Prueba gratis",financeSecondary:"Ver por dentro",financeLogin:"Ya tengo acceso · Entrar",
    storeTag:"DEVINX TIENDA · TU OPERACIÓN EN UN SOLO LUGAR",storeLine1:"Una tienda bonita para el cliente.",storeLine2:"Un negocio organizado para ti.",storeText:"Vitrina, productos, stock, costos y ventas en un solo lugar — sin comisión por venta.",storePrimary:"Crear mi tienda",storeSecondary:"Ver por dentro",storeLogin:"Ya tengo tienda · Entrar",
    daily:"Meta diaria",available:"Saldo actual",month:"Compromisos",stock:"Stock por color",orders:"WhatsApp directo",noFee:"0% comisión",example:"EJEMPLO"
  },
  fr:{
    control:"DEVINX · VOUS GARDEZ LE CONTRÔLE",choose:"Choisissez un produit.",chooseText:"Finance et Boutique sont des produits séparés. Vous pouvez n’en utiliser qu’un.",independent:"PRODUIT INDÉPENDANT",ownPlan:"Abonnement propre · n’inclut pas l’autre produit",or:"OU",
    financeTag:"DEVINX FINANCE · VOS FINANCES EN UN SEUL ENDROIT",financeLine1:"Votre argent organisé.",financeLine2:"Votre quotidien sous contrôle.",financeText:"Factures, cartes, objectifs, réserves, revenus et travail réunis pour garder une vision claire.",financePrimary:"Essai gratuit",financeSecondary:"Voir l'intérieur",financeLogin:"J'ai déjà accès · Connexion",
    storeTag:"DEVINX BOUTIQUE · VOTRE ACTIVITÉ EN UN SEUL ENDROIT",storeLine1:"Une belle boutique pour le client.",storeLine2:"Une activité organisée pour vous.",storeText:"Vitrine, produits, stock, coûts et ventes réunis — sans commission sur les ventes.",storePrimary:"Créer ma boutique",storeSecondary:"Voir l'intérieur",storeLogin:"J'ai déjà une boutique · Connexion",
    daily:"Objectif du jour",available:"Solde actuel",month:"Engagements",stock:"Stock par couleur",orders:"WhatsApp direct",noFee:"0% commission",example:"EXEMPLE"
  },
  de:{
    control:"DEVINX · DU HAST DIE KONTROLLE",choose:"Wähle ein Produkt.",chooseText:"Finanzen und Shop sind getrennte Produkte. Du kannst nur eines davon nutzen.",independent:"EIGENSTÄNDIGES PRODUKT",ownPlan:"Eigenes Abo · enthält nicht das andere Produkt",or:"ODER",
    financeTag:"DEVINX FINANZEN · DEINE FINANZEN AN EINEM ORT",financeLine1:"Dein Geld organisiert.",financeLine2:"Dein Alltag unter Kontrolle.",financeText:"Rechnungen, Karten, Ziele, Rücklagen, Einnahmen und Arbeit zusammen an einem Ort.",financePrimary:"Kostenlos testen",financeSecondary:"Innen ansehen",financeLogin:"Ich habe Zugang · Anmelden",
    storeTag:"DEVINX SHOP · DEIN GESCHÄFT AN EINEM ORT",storeLine1:"Ein schöner Shop für Kunden.",storeLine2:"Ein organisiertes Geschäft für dich.",storeText:"Shop, Produkte, Bestand, Kosten und Verkäufe an einem Ort — ohne Verkaufsprovision.",storePrimary:"Shop erstellen",storeSecondary:"Innen ansehen",storeLogin:"Ich habe einen Shop · Anmelden",
    daily:"Tagesziel",available:"Aktueller Saldo",month:"Verpflichtungen",stock:"Bestand nach Farbe",orders:"WhatsApp direkt",noFee:"0% Provision",example:"BEISPIEL"
  },
  ar:{
    control:"DEVINX · أنت المتحكم",choose:"اختر منتجاً واحداً.",chooseText:"المالي والمتجر منتجان منفصلان. يمكنك استخدام واحد فقط ولا تحتاج للاشتراك في الاثنين.",independent:"منتج مستقل",ownPlan:"اشتراك مستقل · لا يشمل المنتج الآخر",or:"أو",
    financeTag:"DEVINX المالي · حياتك المالية في مكان واحد",financeLine1:"أموالك منظمة.",financeLine2:"روتينك تحت السيطرة.",financeText:"الفواتير والبطاقات والأهداف والاحتياطي والدخل والعمل في مكان واحد لتعرف وضعك دائماً.",financePrimary:"تجربة مجانية",financeSecondary:"شاهد من الداخل",financeLogin:"لدي وصول · دخول",
    storeTag:"DEVINX المتجر · نشاطك في مكان واحد",storeLine1:"متجر جميل لعميلك.",storeLine2:"ونشاط منظم لك.",storeText:"واجهة المتجر والمنتجات والمخزون والتكاليف والمبيعات في مكان واحد — بدون عمولة على المبيعات.",storePrimary:"أنشئ متجري",storeSecondary:"شاهد من الداخل",storeLogin:"لدي متجر · دخول",
    daily:"الهدف اليومي",available:"الرصيد الحالي",month:"الالتزامات",stock:"المخزون حسب اللون",orders:"واتساب مباشر",noFee:"0% عمولة",example:"مثال"
  }
} as const;

export function HomeHub(){
  const{locale}=useI18n();
  const c=COPY[(locale in COPY?locale:"pt-BR") as keyof typeof COPY];

  return <main className={styles.page}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}><BrandLogo/></a>
      <LanguageMenu/>
    </header>

    <section className={styles.intro}>
      <span className={styles.control}>{c.control}</span>
      <h1>{c.choose}</h1>
      <p>{c.chooseText}</p>
    </section>

    <section className={styles.products} aria-label={c.choose}>
      <article className={styles.product}>
        <div className={styles.productGlow}></div>
        <div className={styles.independent}><b>{c.independent}</b><span>{c.ownPlan}</span></div>
        <div className={styles.copy}>
          <span className={styles.tag}><i></i>{c.financeTag}</span>
          <h2>{c.financeLine1}<br/><em>{c.financeLine2}</em></h2>
          <p>{c.financeText}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href="/entrar?trial=1">{c.financePrimary}</a>
            <a className={styles.secondary} href="/financeiro">{c.financeSecondary}</a>
          </div>
          <a className={styles.loginLink} href="/entrar">{c.financeLogin} →</a>
        </div>

        <div className={styles.preview} aria-hidden="true">
          <div className={styles.previewBar}><span></span><span></span><span></span><b>DevinX Financeiro</b><small>{c.example}</small></div>
          <div className={styles.financeHero}>
            <small>{c.daily}</small><strong>R$ 286</strong><span>até o dia 10</span>
          </div>
          <div className={styles.kpis}>
            <div><small>{c.available}</small><b>R$ 1.240</b></div>
            <div><small>{c.month}</small><b>R$ 2.670</b></div>
          </div>
          <div className={styles.progress}><span style={{width:"68%"}}></span></div>
          <div className={styles.financeRows}><span>Contas</span><i></i><span>Cartões</span><i></i><span>Reservas</span></div>
        </div>
      </article>

      <div className={styles.or} aria-hidden="true">{c.or}</div>

      <article className={styles.product}>
        <div className={styles.productGlow}></div>
        <div className={styles.independent}><b>{c.independent}</b><span>{c.ownPlan}</span></div>
        <div className={styles.copy}>
          <span className={styles.tag}><i></i>{c.storeTag}</span>
          <h2>{c.storeLine1}<br/><em>{c.storeLine2}</em></h2>
          <p>{c.storeText}</p>
          <div className={styles.actions}>
            <a className={styles.primary} href="/loja#planos">{c.storePrimary}</a>
            <a className={styles.secondary} href="/loja#visao">{c.storeSecondary}</a>
          </div>
          <a className={styles.loginLink} href="/loja/entrar">{c.storeLogin} →</a>
        </div>

        <div className={styles.preview} aria-hidden="true">
          <div className={styles.previewBar}><span></span><span></span><span></span><b>DevinX Loja · Painel</b><small>AO VIVO</small></div>
          <div className={styles.storeSummary}>
            <small>RESUMO DO MÊS</small><strong>Sua operação em um só lugar</strong>
          </div>
          <div className={styles.kpis}>
            <div><small>Vendas</small><b>24</b></div>
            <div><small>Faturamento</small><b>R$ 3.840</b></div>
          </div>
          <div className={styles.stock}><b>Copo térmico personalizado</b><strong>15 un.</strong><small>{c.stock}</small></div>
          <div className={styles.factChips}><span>{c.noFee}</span><span>{c.orders}</span><span>{c.stock}</span></div>
        </div>
      </article>
    </section>

    <footer className={styles.footer}>DEVINX · VOCÊ NO CONTROLE</footer>
  </main>;
}
