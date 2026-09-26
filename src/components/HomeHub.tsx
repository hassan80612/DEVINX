"use client";

import {BrandLogo} from "@/components/BrandLogo";
import {LanguageMenu} from "@/components/LanguageMenu";
import {useI18n} from "@/i18n/provider";
import styles from "./HomeHub.module.css";

const COPY={
  "pt-BR":{
    control:"DEVINX · VOCÊ NO CONTROLE",
    choose:"Escolha o que mantém você no controle.",
    chooseText:"Finanças, trabalho ou negócio: use o DevinX que faz sentido para a sua rotina.",
    intlChoose:"Organize sua vida financeira.",
    intlChooseText:"Controle seu dinheiro com o DevinX Financeiro.",
    independent:"PRODUTO INDEPENDENTE",
    ownPlan:"Assinatura própria · não inclui o outro produto",
    or:"OU",
    financeTag:"DEVINX FINANCEIRO · SUA VIDA FINANCEIRA EM UM SÓ LUGAR",
    financeLine1:"Seu dinheiro organizado.",
    financeLine2:"Sua rotina sob controle.",
    financeText:"Do salário ao negócio, acompanhe dinheiro, metas, contas e trabalho com uma visão clara do que entra, do que sai e do que vem pela frente.",
    financePrimary:"Teste grátis",
    financeSecondary:"Ver por dentro",
    financeLogin:"Já tenho acesso · Entrar",
    financeFeaturesTitle:"FINANCEIRO · CONTROLE COMPLETO DA SUA ROTINA",
    storeTag:"DEVINX LOJA · SUA OPERAÇÃO EM UM SÓ LUGAR",
    storeLine1:"Uma loja bonita para o cliente.",
    storeLine2:"Um negócio organizado para você.",
    storeText:"Vitrine, produtos, estoque, custos, personalização e vendas reunidos em um único lugar — sem comissão por venda.",
    storePrimary:"Criar minha loja",
    storeSecondary:"Ver por dentro",
    storeLogin:"Já tenho loja · Entrar",
    storeExample:"Ver vitrine real de exemplo",
    storeFeaturesTitle:"LOJA · TUDO PARA ORGANIZAR E VENDER"
  },
  en:{
    control:"DEVINX · YOU'RE IN CONTROL",
    choose:"Choose what keeps you in control.",
    chooseText:"Money, work or business: use the DevinX that fits your routine.",
    intlChoose:"Take control of your finances.",
    intlChooseText:"Manage your money with DevinX Finance.",
    independent:"INDEPENDENT PRODUCT",
    ownPlan:"Own subscription · does not include the other product",
    or:"OR",
    financeTag:"DEVINX FINANCE · YOUR FINANCES IN ONE PLACE",
    financeLine1:"Your money organized.",
    financeLine2:"Your routine under control.",
    financeText:"From salary to business income, track money, goals, bills and work with a clear view of what comes in, goes out and comes next.",
    financePrimary:"Free trial",
    financeSecondary:"See inside",
    financeLogin:"I already have access · Sign in",
    financeFeaturesTitle:"FINANCE · COMPLETE CONTROL OF YOUR ROUTINE",
    storeTag:"DEVINX STORE · YOUR OPERATION IN ONE PLACE",
    storeLine1:"A beautiful store for your customer.",
    storeLine2:"An organized business for you.",
    storeText:"Storefront, products, stock, costs, personalization and sales in one place — with no sales commission.",
    storePrimary:"Create my store",
    storeSecondary:"See inside",
    storeLogin:"I already have a store · Sign in",
    storeExample:"View real example storefront",
    storeFeaturesTitle:"STORE · EVERYTHING TO ORGANIZE AND SELL"
  },
  es:{
    control:"DEVINX · TÚ TIENES EL CONTROL",
    choose:"Elige lo que te mantiene en control.",
    chooseText:"Dinero, trabajo o negocio: usa el DevinX que encaja con tu rutina.",
    intlChoose:"Toma el control de tus finanzas.",
    intlChooseText:"Organiza tu dinero con DevinX Finanzas.",
    independent:"PRODUCTO INDEPENDIENTE",
    ownPlan:"Suscripción propia · no incluye el otro producto",
    or:"O",
    financeTag:"DEVINX FINANZAS · TU VIDA FINANCIERA EN UN SOLO LUGAR",
    financeLine1:"Tu dinero organizado.",
    financeLine2:"Tu rutina bajo control.",
    financeText:"Del salario al negocio, controla dinero, metas, cuentas y trabajo con una visión clara de lo que entra, sale y viene después.",
    financePrimary:"Prueba gratis",
    financeSecondary:"Ver por dentro",
    financeLogin:"Ya tengo acceso · Entrar",
    financeFeaturesTitle:"FINANZAS · CONTROL COMPLETO DE TU RUTINA",
    storeTag:"DEVINX TIENDA · TU OPERACIÓN EN UN SOLO LUGAR",
    storeLine1:"Una tienda bonita para el cliente.",
    storeLine2:"Un negocio organizado para ti.",
    storeText:"Vitrina, productos, stock, costos, personalización y ventas en un solo lugar — sin comisión por venta.",
    storePrimary:"Crear mi tienda",
    storeSecondary:"Ver por dentro",
    storeLogin:"Ya tengo tienda · Entrar",
    storeExample:"Ver tienda real de ejemplo",
    storeFeaturesTitle:"TIENDA · TODO PARA ORGANIZAR Y VENDER"
  },
  fr:{
    control:"DEVINX · VOUS GARDEZ LE CONTRÔLE",
    choose:"Choisissez ce qui vous garde aux commandes.",
    chooseText:"Argent, travail ou activité : utilisez le DevinX adapté à votre quotidien.",
    intlChoose:"Prenez le contrôle de vos finances.",
    intlChooseText:"Organisez votre argent avec DevinX Finance.",
    independent:"PRODUIT INDÉPENDANT",
    ownPlan:"Abonnement propre · n’inclut pas l’autre produit",
    or:"OU",
    financeTag:"DEVINX FINANCE · VOS FINANCES EN UN SEUL ENDROIT",
    financeLine1:"Votre argent organisé.",
    financeLine2:"Votre quotidien sous contrôle.",
    financeText:"Du salaire à l’activité professionnelle, suivez argent, objectifs, factures et travail avec une vision claire de votre situation.",
    financePrimary:"Essai gratuit",
    financeSecondary:"Voir l'intérieur",
    financeLogin:"J'ai déjà accès · Connexion",
    financeFeaturesTitle:"FINANCE · CONTRÔLE COMPLET DE VOTRE QUOTIDIEN",
    storeTag:"DEVINX BOUTIQUE · VOTRE ACTIVITÉ EN UN SEUL ENDROIT",
    storeLine1:"Une belle boutique pour le client.",
    storeLine2:"Une activité organisée pour vous.",
    storeText:"Vitrine, produits, stock, coûts, personnalisation et ventes réunis — sans commission sur les ventes.",
    storePrimary:"Créer ma boutique",
    storeSecondary:"Voir l'intérieur",
    storeLogin:"J'ai déjà une boutique · Connexion",
    storeExample:"Voir une vraie boutique exemple",
    storeFeaturesTitle:"BOUTIQUE · TOUT POUR ORGANISER ET VENDRE"
  },
  de:{
    control:"DEVINX · DU HAST DIE KONTROLLE",
    choose:"Wähle, was dich unter Kontrolle hält.",
    chooseText:"Geld, Arbeit oder Geschäft: nutze den DevinX, der zu deinem Alltag passt.",
    intlChoose:"Bring deine Finanzen unter Kontrolle.",
    intlChooseText:"Organisiere dein Geld mit DevinX Finanzen.",
    independent:"EIGENSTÄNDIGES PRODUKT",
    ownPlan:"Eigenes Abo · enthält nicht das andere Produkt",
    or:"ODER",
    financeTag:"DEVINX FINANZEN · DEINE FINANZEN AN EINEM ORT",
    financeLine1:"Dein Geld organisiert.",
    financeLine2:"Dein Alltag unter Kontrolle.",
    financeText:"Von Gehalt bis Geschäftseinnahmen: Geld, Ziele, Rechnungen und Arbeit mit klarem Überblick verwalten.",
    financePrimary:"Kostenlos testen",
    financeSecondary:"Innen ansehen",
    financeLogin:"Ich habe Zugang · Anmelden",
    financeFeaturesTitle:"FINANZEN · VOLLE KONTROLLE ÜBER DEINEN ALLTAG",
    storeTag:"DEVINX SHOP · DEIN GESCHÄFT AN EINEM ORT",
    storeLine1:"Ein schöner Shop für Kunden.",
    storeLine2:"Ein organisiertes Geschäft für dich.",
    storeText:"Shop, Produkte, Bestand, Kosten, Personalisierung und Verkäufe an einem Ort — ohne Verkaufsprovision.",
    storePrimary:"Shop erstellen",
    storeSecondary:"Innen ansehen",
    storeLogin:"Ich habe einen Shop · Anmelden",
    storeExample:"Echten Beispiel-Shop ansehen",
    storeFeaturesTitle:"SHOP · ALLES ZUM ORGANISIEREN UND VERKAUFEN"
  },
  ar:{
    control:"DEVINX · أنت المتحكم",
    choose:"اختر ما يبقيك مسيطراً.",
    chooseText:"المال أو العمل أو النشاط التجاري: استخدم DevinX المناسب لروتينك.",
    intlChoose:"تحكّم في حياتك المالية.",
    intlChooseText:"نظّم أموالك مع DevinX المالي.",
    independent:"منتج مستقل",
    ownPlan:"اشتراك مستقل · لا يشمل المنتج الآخر",
    or:"أو",
    financeTag:"DEVINX المالي · حياتك المالية في مكان واحد",
    financeLine1:"أموالك منظمة.",
    financeLine2:"روتينك تحت السيطرة.",
    financeText:"من الراتب إلى دخل العمل، تابع أموالك وأهدافك وفواتيرك وعملك برؤية واضحة لما يدخل ويخرج وما هو قادم.",
    financePrimary:"تجربة مجانية",
    financeSecondary:"شاهد من الداخل",
    financeLogin:"لدي وصول · دخول",
    financeFeaturesTitle:"المالي · تحكم كامل في روتينك",
    storeTag:"DEVINX المتجر · نشاطك في مكان واحد",
    storeLine1:"متجر جميل لعميلك.",
    storeLine2:"ونشاط منظم لك.",
    storeText:"واجهة المتجر والمنتجات والمخزون والتكاليف والتخصيص والمبيعات في مكان واحد — بدون عمولة على المبيعات.",
    storePrimary:"أنشئ متجري",
    storeSecondary:"شاهد من الداخل",
    storeLogin:"لدي متجر · دخول",
    storeExample:"عرض متجر حقيقي كمثال",
    storeFeaturesTitle:"المتجر · كل ما تحتاجه للتنظيم والبيع"
  }
} as const;

const LASER_SOON={
  "pt-BR":{title:"Laser Control",status:"Em breve",text:"Controle e monitoramento do LightBurn pelo celular."},
  en:{title:"Laser Control",status:"Coming soon",text:"Monitor and control LightBurn from your phone."},
  es:{title:"Laser Control",status:"Próximamente",text:"Control y monitoreo de LightBurn desde el móvil."},
  fr:{title:"Laser Control",status:"Bientôt",text:"Contrôle et suivi de LightBurn depuis le mobile."},
  de:{title:"Laser Control",status:"Demnächst",text:"LightBurn vom Smartphone überwachen und steuern."},
  ar:{title:"Laser Control",status:"قريباً",text:"مراقبة LightBurn والتحكم به من الهاتف."}
} as const;

const FINANCE_FEATURES={
  "pt-BR":[
    "Salário e renda mensal","Entradas extras",
    "Meta diária automática","Saldo atual",
    "Saldo previsto","Contas mensais",
    "Cartões e parcelas","Recebimentos automáticos",
    "Gastos futuros programados","Reservas financeiras",
    "Metas e objetivos","Jornada de trabalho",
    "Bruto x líquido","Planejamento mensal",
    "Movimentos diários","Categorias e filtros",
    "Histórico de 12 meses","Entradas x saídas",
    "Previsão dos próximos 30 dias","Relatórios completos",
    "Reservas para compromissos","Autônomos e freelancers",
    "Motoristas de aplicativo","Empresas e negócios"
  ],
  en:[
    "Salary and monthly income","Extra income",
    "Automatic daily target","Current balance",
    "Projected balance","Monthly bills",
    "Cards and installments","Automatic receivables",
    "Scheduled future expenses","Financial reserves",
    "Goals and objectives","Work sessions",
    "Gross vs net","Monthly planning",
    "Daily transactions","Categories and filters",
    "12-month history","Income vs expenses",
    "30-day forecast","Complete reports",
    "Commitment reserves","Freelancers and self-employed",
    "App drivers","Companies and businesses"
  ],
  es:[
    "Salario e ingreso mensual","Ingresos extra",
    "Meta diaria automática","Saldo actual",
    "Saldo previsto","Cuentas mensuales",
    "Tarjetas y cuotas","Cobros automáticos",
    "Gastos futuros programados","Reservas financieras",
    "Metas y objetivos","Jornada de trabajo",
    "Bruto vs neto","Planificación mensual",
    "Movimientos diarios","Categorías y filtros",
    "Historial de 12 meses","Ingresos vs gastos",
    "Previsión de los próximos 30 días","Informes completos",
    "Reservas para compromisos","Autónomos y freelancers",
    "Conductores de aplicaciones","Empresas y negocios"
  ],
  fr:[
    "Salaire et revenu mensuel","Revenus supplémentaires",
    "Objectif quotidien automatique","Solde actuel",
    "Solde prévisionnel","Factures mensuelles",
    "Cartes et échéances","Encaissements automatiques",
    "Dépenses futures programmées","Réserves financières",
    "Objectifs","Journée de travail",
    "Brut vs net","Planification mensuelle",
    "Mouvements quotidiens","Catégories et filtres",
    "Historique sur 12 mois","Entrées vs sorties",
    "Prévision sur 30 jours","Rapports complets",
    "Réserves pour engagements","Indépendants et freelances",
    "Chauffeurs d'applications","Entreprises et activités"
  ],
  de:[
    "Gehalt und Monatseinkommen","Zusätzliche Einnahmen",
    "Automatisches Tagesziel","Aktueller Saldo",
    "Prognostizierter Saldo","Monatliche Rechnungen",
    "Karten und Raten","Automatische Einnahmen",
    "Geplante zukünftige Ausgaben","Finanzielle Rücklagen",
    "Ziele","Arbeitszeiten",
    "Brutto vs netto","Monatsplanung",
    "Tägliche Bewegungen","Kategorien und Filter",
    "12-Monats-Verlauf","Einnahmen vs Ausgaben",
    "30-Tage-Prognose","Vollständige Berichte",
    "Rücklagen für Verpflichtungen","Selbstständige und Freelancer",
    "App-Fahrer","Unternehmen und Betriebe"
  ],
  ar:[
    "الراتب والدخل الشهري","دخل إضافي",
    "هدف يومي تلقائي","الرصيد الحالي",
    "الرصيد المتوقع","الفواتير الشهرية",
    "البطاقات والأقساط","تحصيلات تلقائية",
    "مصروفات مستقبلية مجدولة","الاحتياطي المالي",
    "الأهداف","ساعات العمل",
    "الإجمالي مقابل الصافي","تخطيط شهري",
    "الحركات اليومية","الفئات والفلاتر",
    "سجل 12 شهراً","الدخل مقابل المصروف",
    "توقعات 30 يوماً","تقارير كاملة",
    "احتياطي للالتزامات","المستقلون وأصحاب الأعمال الحرة",
    "سائقو التطبيقات","الشركات والأعمال"
  ]
} as const;

const STORE_FEATURES=[
  "Vitrine própria","Cadastro de produtos",
  "Estoque por produto","Estoque por cor",
  "Reposição de estoque","Custo médio automático",
  "Personalização de produtos","Preço e custo",
  "Registro de vendas","Lucro ajustado",
  "Perdas e peças perdidas","Afiliados",
  "Comissões","Valores a pagar",
  "Pedidos pelo WhatsApp","Vários WhatsApps",
  "Clientes online ao vivo","Melhor Envio",
  "Frete grátis","Prazo de produção",
  "Equipe","Acessos e permissões",
  "Relatórios","Publicar ou ocultar produtos"
] as const;

function FeatureGrid({title,items}:{title:string;items:readonly string[]}){
  return <section className={styles.featureSection}>
    <div className={styles.featureTitle}>{title}</div>
    <div className={styles.featureGrid}>
      {items.map((item)=><div className={styles.featureLine} key={item}><i aria-hidden="true"></i><strong>{item}</strong></div>)}
    </div>
  </section>;
}

export function HomeHub(){
  const{locale}=useI18n();
  const activeLocale=(locale in COPY?locale:"pt-BR") as keyof typeof COPY;
  const c=COPY[activeLocale];
  const showStore=locale==="pt-BR";
  const intl=locale!=="pt-BR";
  const financeFeatures=FINANCE_FEATURES[activeLocale];

  return <main className={styles.page}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}><BrandLogo/></a>
      <LanguageMenu/>
    </header>

    <section className={styles.intro}>
      <span className={styles.control}><b>{c.control}</b></span>
      <h1>{intl?c.intlChoose:c.choose}</h1>
      <p>{intl?c.intlChooseText:c.chooseText}</p>
      <div className={styles.laserSoon} aria-label={LASER_SOON[activeLocale].status}>
        <span>{LASER_SOON[activeLocale].title}</span>
        <b>{LASER_SOON[activeLocale].status}</b>
        <small>{LASER_SOON[activeLocale].text}</small>
      </div>
    </section>

    <section className={`${styles.products} ${!showStore?styles.financeOnly:""}`} aria-label={intl?c.intlChoose:c.choose}>
      <article className={`${styles.product} ${styles.financeProduct}`}>
        <div className={styles.productGlow}></div>
        <div className={styles.independent}><b>{c.independent}</b><span>{c.ownPlan}</span></div>
        <div className={styles.copy}>
          <span className={styles.tag}><i></i>{c.financeTag}</span>
          <h2>{c.financeLine1}<br/><em>{c.financeLine2}</em></h2>
          <p>{c.financeText}</p>
          <div className={styles.actions}>
            <a className={`${styles.primary} ${styles.trialPrimary}`} href="/entrar?trial=1">{c.financePrimary}</a>
            <a className={styles.secondary} href="/financeiro">{c.financeSecondary}</a>
          </div>
          <a className={styles.accessButton} href="/entrar">{c.financeLogin} →</a>
        </div>
        <FeatureGrid title={c.financeFeaturesTitle} items={financeFeatures}/>
      </article>

      {showStore&&<>
      <div className={styles.or} aria-hidden="true">{c.or}</div>

      <article className={`${styles.product} ${styles.storeProduct}`}>
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
          <a className={styles.accessButton} href="/loja/entrar">{c.storeLogin} →</a>
        </div>

        <FeatureGrid title={c.storeFeaturesTitle} items={STORE_FEATURES}/>

        <a className={styles.exampleButton} href="/iguassu-shop">
          <span>VITRINE REAL</span>
          <strong>{c.storeExample}</strong>
          <b aria-hidden="true">↗</b>
        </a>
      </article>
      </>}
    </section>

    <footer className={styles.footer}>{c.control}</footer>
  </main>;
}
