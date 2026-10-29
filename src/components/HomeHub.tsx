"use client";

import {type MouseEvent,useEffect,useState} from "react";
import {BrandLogo} from "@/components/BrandLogo";
import {LanguageMenu} from "@/components/LanguageMenu";
import {useI18n} from "@/i18n/provider";
import {createClient} from "@/lib/supabase/client";
import styles from "./HomeHub.module.css";
import {DEVINX_SUBSCRIPTION_PLANS,pricingForLocale} from "@/lib/subscription-plans";

const COPY={
  "pt-BR":{
    control:"DEVINX · VOCÊ NO CONTROLE",
    choose:"Escolha o que mantém você no controle.",
    chooseText:"Finanças, trabalho ou negócio: use o DevinX que faz sentido para a sua rotina.",
    intlChoose:"One hub. Your tools.",
    intlChooseText:"Controle seu dinheiro com o DevinX Financeiro.",
    independent:"PRODUTO INDEPENDENTE",
    ownPlan:"Plano independente dos demais produtos",
    or:"OU",
    financeTag:"DEVINX FINANCEIRO · SUA VIDA FINANCEIRA EM UM SÓ LUGAR",
    financeLine1:"Seu dinheiro organizado.",
    financeLine2:"Sua rotina sob controle.",
    financeText:"Do salário ao negócio, acompanhe dinheiro, metas, contas e trabalho com uma visão clara do que entra, do que sai e do que vem pela frente.",
    financePrimary:"Comprar agora",
    financeSecondary:"Ver por dentro",
    financeLogin:"Já tenho acesso · Entrar",
    financeCycle:"Plano mensal",sentinelBuy:"Comprar agora",financeFeaturesTitle:"FINANCEIRO · CONTROLE COMPLETO DA SUA ROTINA",
    storeTag:"DEVINX LOJA · SUA OPERAÇÃO EM UM SÓ LUGAR",
    storeLine1:"Uma loja bonita para o cliente.",
    storeLine2:"Um negócio organizado para você.",
    storeText:"Vitrine, produtos, estoque, custos, personalização e vendas reunidos em um único lugar — sem comissão por venda.",
    storePrimary:"Criar minha loja",
    storeSecondary:"Ver por dentro",
    storeLogin:"Já tenho loja · Entrar",
    storeExample:"Ver vitrine real de exemplo",
    storeFeaturesTitle:"LOJA · TUDO PARA ORGANIZAR E VENDER",
    financeJump:"Financeiro",storeJump:"Loja",
    sentinelJump:"Sentinel",
    sentinelTag:"SENTINEL TRADING LAB · ANÁLISE E BOT AUTOMÁTICO",
    sentinelLine1:"Seu analista técnico profissional de mercado.",
    sentinelText:"Análise em tempo real, tendências, retrações e cenários CALL/PUT para IQ Option e Exnova. Inclui bot de execução automática de operações, que você pode ativar ou desligar no Agent Windows.",
    sentinelPrimary:"Conhecer o analista",
    sentinelLogin:"Já tenho acesso · Entrar",
    sentinelFeaturesTitle:"SENTINEL · O QUE ELE OFERECE",
    sentinelAccess:"ANALISTA + BOT",sentinelCycle:"30 dias de acesso · renovação manual",sentinelPreview:"PRÉVIA ILUSTRATIVA",sentinelPreviewTitle:"PAINEL DE ANÁLISE",sentinelPreviewDetail:"Estrutura · tendência · cenários"
  },
  en:{
    control:"DEVINX · YOU'RE IN CONTROL",
    choose:"Choose what keeps you in control.",
    chooseText:"Money, work or business: use the DevinX that fits your routine.",
    intlChoose:"Take control of your finances.",
    intlChooseText:"Explore Sentinel Trading Lab, personal finance, and the tools that fit your routine.",
    independent:"INDEPENDENT PRODUCT",
    ownPlan:"Separate plan · other products not included",
    or:"OR",
    financeTag:"DEVINX FINANCE · YOUR FINANCES IN ONE PLACE",
    financeLine1:"Your money organized.",
    financeLine2:"Your routine under control.",
    financeText:"From salary to business income, track money, goals, bills and work with a clear view of what comes in, goes out and comes next.",
    financePrimary:"Buy now",
    financeSecondary:"See inside",
    financeLogin:"I already have access · Sign in",
    financeCycle:"Monthly plan",sentinelBuy:"Buy now",financeFeaturesTitle:"FINANCE · COMPLETE CONTROL OF YOUR ROUTINE",
    storeTag:"DEVINX STORE · YOUR OPERATION IN ONE PLACE",
    storeLine1:"A beautiful store for your customer.",
    storeLine2:"An organized business for you.",
    storeText:"Storefront, products, stock, costs, personalization and sales in one place — with no sales commission.",
    storePrimary:"Create my store",
    storeSecondary:"See inside",
    storeLogin:"I already have a store · Sign in",
    storeExample:"View real example storefront",
    storeFeaturesTitle:"STORE · EVERYTHING TO ORGANIZE AND SELL",
    financeJump:"Finance",storeJump:"Store",
    sentinelJump:"Sentinel",
    sentinelTag:"SENTINEL TRADING LAB · ANALYSIS + AUTOMATED BOT",
    sentinelLine1:"Professional technical market analysis.",
    sentinelText:"Live market analysis, trends and CALL/PUT scenarios for IQ Option and Exnova, plus an automated trading bot you can enable or disable from the Windows Agent.",
    sentinelPrimary:"Explore Sentinel",
    sentinelLogin:"I have access · Sign in",
    sentinelFeaturesTitle:"SENTINEL · WHAT IT OFFERS",
    sentinelAccess:"ANALYST + BOT",sentinelCycle:"30 days of access · renew manually",sentinelPreview:"ILLUSTRATIVE PREVIEW",sentinelPreviewTitle:"MARKET ANALYSIS",sentinelPreviewDetail:"Structure · trend · scenarios"
  },
  es:{
    control:"DEVINX · TÚ TIENES EL CONTROL",
    choose:"Elige lo que te mantiene en control.",
    chooseText:"Dinero, trabajo o negocio: usa el DevinX que encaja con tu rutina.",
    intlChoose:"Tus herramientas, un solo lugar.",
    intlChooseText:"Descubre Sentinel Trading Lab, Finanzas y herramientas para tu rutina.",
    independent:"PRODUCTO INDEPENDIENTE",
    ownPlan:"Plan independiente · otros productos no incluidos",
    or:"O",
    financeTag:"DEVINX FINANZAS · TU VIDA FINANCIERA EN UN SOLO LUGAR",
    financeLine1:"Tu dinero organizado.",
    financeLine2:"Tu rutina bajo control.",
    financeText:"Del salario al negocio, controla dinero, metas, cuentas y trabajo con una visión clara de lo que entra, sale y viene después.",
    financePrimary:"Comprar ahora",
    financeSecondary:"Ver por dentro",
    financeLogin:"Ya tengo acceso · Entrar",
    financeCycle:"Plan mensual",sentinelBuy:"Comprar ahora",financeFeaturesTitle:"FINANZAS · CONTROL COMPLETO DE TU RUTINA",
    storeTag:"DEVINX TIENDA · TU OPERACIÓN EN UN SOLO LUGAR",
    storeLine1:"Una tienda bonita para el cliente.",
    storeLine2:"Un negocio organizado para ti.",
    storeText:"Vitrina, productos, stock, costos, personalización y ventas en un solo lugar — sin comisión por venta.",
    storePrimary:"Crear mi tienda",
    storeSecondary:"Ver por dentro",
    storeLogin:"Ya tengo tienda · Entrar",
    storeExample:"Ver tienda real de ejemplo",
    storeFeaturesTitle:"TIENDA · TODO PARA ORGANIZAR Y VENDER",
    financeJump:"Finanzas",storeJump:"Tienda",
    sentinelJump:"Sentinel",
    sentinelTag:"SENTINEL TRADING LAB · ANÁLISIS DE MERCADO",
    sentinelLine1:"Tu analista técnico profesional.",
    sentinelText:"Análisis de mercado y escenarios CALL/PUT para IQ Option y Exnova, con un bot de ejecución automática que puedes activar o desactivar en el Agent Windows.",
    sentinelPrimary:"Conocer Sentinel",
    sentinelLogin:"Ya tengo acceso · Entrar",
    sentinelFeaturesTitle:"SENTINEL · CARACTERÍSTICAS",
    sentinelAccess:"ANALISTA + BOT",sentinelCycle:"30 días de acceso · renovación manual",sentinelPreview:"VISTA ILUSTRATIVA",sentinelPreviewTitle:"ANÁLISIS DE MERCADO",sentinelPreviewDetail:"Estructura · tendencia · escenarios"
  },
  fr:{
    control:"DEVINX · VOUS GARDEZ LE CONTRÔLE",
    choose:"Choisissez ce qui vous garde aux commandes.",
    chooseText:"Argent, travail ou activité : utilisez le DevinX adapté à votre quotidien.",
    intlChoose:"Vos outils au même endroit.",
    intlChooseText:"Découvrez Sentinel Trading Lab, Finance et les outils adaptés à votre quotidien.",
    independent:"PRODUIT INDÉPENDANT",
    ownPlan:"Offre indépendante · autres produits non inclus",
    or:"OU",
    financeTag:"DEVINX FINANCE · VOS FINANCES EN UN SEUL ENDROIT",
    financeLine1:"Votre argent organisé.",
    financeLine2:"Votre quotidien sous contrôle.",
    financeText:"Du salaire à l’activité professionnelle, suivez argent, objectifs, factures et travail avec une vision claire de votre situation.",
    financePrimary:"Acheter maintenant",
    financeSecondary:"Voir l'intérieur",
    financeLogin:"J'ai déjà accès · Connexion",
    financeCycle:"Offre mensuelle",sentinelBuy:"Acheter maintenant",financeFeaturesTitle:"FINANCE · CONTRÔLE COMPLET DE VOTRE QUOTIDIEN",
    storeTag:"DEVINX BOUTIQUE · VOTRE ACTIVITÉ EN UN SEUL ENDROIT",
    storeLine1:"Une belle boutique pour le client.",
    storeLine2:"Une activité organisée pour vous.",
    storeText:"Vitrine, produits, stock, coûts, personnalisation et ventes réunis — sans commission sur les ventes.",
    storePrimary:"Créer ma boutique",
    storeSecondary:"Voir l'intérieur",
    storeLogin:"J'ai déjà une boutique · Connexion",
    storeExample:"Voir une vraie boutique exemple",
    storeFeaturesTitle:"BOUTIQUE · TOUT POUR ORGANISER ET VENDRE",
    financeJump:"Finance",storeJump:"Boutique",
    sentinelJump:"Sentinel",
    sentinelTag:"SENTINEL TRADING LAB · ANALYSE DE MARCHÉ",
    sentinelLine1:"Votre analyste technique professionnel.",
    sentinelText:"Analyse des marchés et scénarios CALL/PUT sur IQ Option et Exnova, avec un bot de passage d'ordres automatique activable ou désactivable dans l'Agent Windows.",
    sentinelPrimary:"Découvrir Sentinel",
    sentinelLogin:"J'ai un accès · Connexion",
    sentinelFeaturesTitle:"SENTINEL · FONCTIONNALITÉS",
    sentinelAccess:"ANALYSE + BOT",sentinelCycle:"30 jours d’accès · renouvellement manuel",sentinelPreview:"APERÇU ILLUSTRATIF",sentinelPreviewTitle:"ANALYSE DU MARCHÉ",sentinelPreviewDetail:"Structure · tendance · scénarios"
  },
  de:{
    control:"DEVINX · DU HAST DIE KONTROLLE",
    choose:"Wähle, was dich unter Kontrolle hält.",
    chooseText:"Geld, Arbeit oder Geschäft: nutze den DevinX, der zu deinem Alltag passt.",
    intlChoose:"Deine Werkzeuge an einem Ort.",
    intlChooseText:"Entdecke Sentinel Trading Lab, Finanzen und praktische Werkzeuge.",
    independent:"EIGENSTÄNDIGES PRODUKT",
    ownPlan:"Eigenständiger Plan · andere Produkte nicht enthalten",
    or:"ODER",
    financeTag:"DEVINX FINANZEN · DEINE FINANZEN AN EINEM ORT",
    financeLine1:"Dein Geld organisiert.",
    financeLine2:"Dein Alltag unter Kontrolle.",
    financeText:"Von Gehalt bis Geschäftseinnahmen: Geld, Ziele, Rechnungen und Arbeit mit klarem Überblick verwalten.",
    financePrimary:"Jetzt kaufen",
    financeSecondary:"Innen ansehen",
    financeLogin:"Ich habe Zugang · Anmelden",
    financeCycle:"Monatlicher Tarif",sentinelBuy:"Jetzt kaufen",financeFeaturesTitle:"FINANZEN · VOLLE KONTROLLE ÜBER DEINEN ALLTAG",
    storeTag:"DEVINX SHOP · DEIN GESCHÄFT AN EINEM ORT",
    storeLine1:"Ein schöner Shop für Kunden.",
    storeLine2:"Ein organisiertes Geschäft für dich.",
    storeText:"Shop, Produkte, Bestand, Kosten, Personalisierung und Verkäufe an einem Ort — ohne Verkaufsprovision.",
    storePrimary:"Shop erstellen",
    storeSecondary:"Innen ansehen",
    storeLogin:"Ich habe einen Shop · Anmelden",
    storeExample:"Echten Beispiel-Shop ansehen",
    storeFeaturesTitle:"SHOP · ALLES ZUM ORGANISIEREN UND VERKAUFEN",
    financeJump:"Finanzen",storeJump:"Shop",
    sentinelJump:"Sentinel",
    sentinelTag:"SENTINEL TRADING LAB · MARKTANALYSE",
    sentinelLine1:"Ihr professioneller technischer Analyst.",
    sentinelText:"Marktanalyse und CALL/PUT-Szenarien für IQ Option und Exnova, mit einem automatischen Trading-Bot, den Sie im Windows-Agent aktivieren oder deaktivieren können.",
    sentinelPrimary:"Sentinel entdecken",
    sentinelLogin:"Zugang vorhanden · Anmelden",
    sentinelFeaturesTitle:"SENTINEL · FUNKTIONEN",
    sentinelAccess:"ANALYSE + BOT",sentinelCycle:"30 Tage Zugang · manuell verlängern",sentinelPreview:"BEISPIELANSICHT",sentinelPreviewTitle:"MARKTANALYSE",sentinelPreviewDetail:"Struktur · Trend · Szenarien"
  },
  ar:{
    control:"DEVINX · أنت المتحكم",
    choose:"اختر ما يبقيك مسيطراً.",
    chooseText:"المال أو العمل أو النشاط التجاري: استخدم DevinX المناسب لروتينك.",
    intlChoose:"أدواتك في مكان واحد.",
    intlChooseText:"اكتشف Sentinel Trading Lab والمالية والأدوات المناسبة لعملك اليومي.",
    independent:"منتج مستقل",
    ownPlan:"اشتراك مستقل · لا يشمل المنتجات الأخرى",
    or:"أو",
    financeTag:"DEVINX المالي · حياتك المالية في مكان واحد",
    financeLine1:"أموالك منظمة.",
    financeLine2:"روتينك تحت السيطرة.",
    financeText:"من الراتب إلى دخل العمل، تابع أموالك وأهدافك وفواتيرك وعملك برؤية واضحة لما يدخل ويخرج وما هو قادم.",
    financePrimary:"اشترِ الآن",
    financeSecondary:"شاهد من الداخل",
    financeLogin:"لدي وصول · دخول",
    financeCycle:"خطة شهرية",sentinelBuy:"اشترِ الآن",financeFeaturesTitle:"المالي · تحكم كامل في روتينك",
    storeTag:"DEVINX المتجر · نشاطك في مكان واحد",
    storeLine1:"متجر جميل لعميلك.",
    storeLine2:"ونشاط منظم لك.",
    storeText:"واجهة المتجر والمنتجات والمخزون والتكاليف والتخصيص والمبيعات في مكان واحد — بدون عمولة على المبيعات.",
    storePrimary:"أنشئ متجري",
    storeSecondary:"شاهد من الداخل",
    storeLogin:"لدي متجر · دخول",
    storeExample:"عرض متجر حقيقي كمثال",
    storeFeaturesTitle:"المتجر · كل ما تحتاجه للتنظيم والبيع",
    financeJump:"المالي",storeJump:"المتجر",
    sentinelJump:"Sentinel",
    sentinelTag:"SENTINEL TRADING LAB · تحليل الأسواق",
    sentinelLine1:"رؤية أوضح لحركة السوق.",
    sentinelText:"تحليل للسوق وسيناريوهات CALL وPUT على IQ Option وExnova، مع بوت لتنفيذ الصفقات تلقائياً يمكنك تشغيله أو إيقافه من برنامج Windows Agent.",
    sentinelPrimary:"تعرف على Sentinel",
    sentinelLogin:"لدي حساب · دخول",
    sentinelFeaturesTitle:"SENTINEL · المزايا",
    sentinelAccess:"المحلل + البوت",sentinelCycle:"وصول لمدة 30 يوماً · تجديد يدوي",sentinelPreview:"عرض توضيحي",sentinelPreviewTitle:"تحليل السوق",sentinelPreviewDetail:"الهيكل · الاتجاه · السيناريوهات"
  }
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

const SENTINEL_FEATURES={
  "pt-BR":["Análise Contínua","Bot de execução automática opcional","Cenários CALL e PUT","Previsões para o vencimento escolhido","Leitura de tendências e reversões","IQ Option e Exnova","Acompanhamento no PC e celular"],
  en:["Continuous analysis","Optional automated trading bot","CALL and PUT scenarios","Chosen expiry forecasts","Trend and reversal context","IQ Option and Exnova","PC and phone access"],
  es:["Análisis continuo","Bot automático opcional","Escenarios CALL y PUT","Pronósticos hasta el vencimiento","Tendencias y reversiones","IQ Option y Exnova","Acceso desde PC y móvil"],
  fr:["Analyse continue","Bot automatique en option","Scénarios CALL et PUT","Prévisions à l'échéance choisie","Tendances et retournements","IQ Option et Exnova","PC et téléphone"],
  de:["Kontinuierliche Analyse","Optionaler automatischer Trading-Bot","CALL/PUT-Szenarien","Prognosen zur gewählten Laufzeit","Trends und Umkehrungen","IQ Option und Exnova","PC und Smartphone"],
  ar:["تحليل مستمر","بوت تداول تلقائي اختياري","سيناريوهات CALL و PUT","توقعات حتى انتهاء المدة","الاتجاهات والانعكاسات","IQ Option و Exnova","الوصول من الكمبيوتر والهاتف"]
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

export function HomeHub({financeVisible:initialFinanceVisible=true}:{financeVisible?:boolean}={}){
  const{locale}=useI18n();
  const[visibility,setVisibility]=useState({finance:initialFinanceVisible});

  useEffect(()=>{
    let active=true;
    const supabase=createClient();
    void supabase.rpc('get_public_site_visibility').then((result:{data?:unknown;error?:unknown})=>{
      if(!active||result.error)return;
      const data=result.data as {finance_public_visible?:boolean|null}|Array<{finance_public_visible?:boolean|null}>|null|undefined;
      const row=Array.isArray(data)?data[0]:data;
      setVisibility({finance:row?.finance_public_visible!==false});
    });
    return()=>{active=false};
  },[]);

  const financeVisible=visibility.finance;
  const activeLocale=(locale in COPY?locale:"pt-BR") as keyof typeof COPY;
  const c=COPY[activeLocale];
  const showStore=false; // Hide only the HomeHub store card and shortcut. Store data/routes remain intact.
  const intl=locale!=="pt-BR";
  const financeFeatures=FINANCE_FEATURES[activeLocale];
  const financePrice=pricingForLocale(DEVINX_SUBSCRIPTION_PLANS[0],locale);
  const financeCheckout=financePrice.checkoutUrl;
  const financePriceLabel=new Intl.NumberFormat(locale,{style:"currency",currency:financePrice.currencyCode}).format(financePrice.amountMinor/100);
  const sentinelCheckout=`https://trading.devinx.com.br/api/checkout?market=${intl?"INTL":"BR"}`;

  const jumpTo=(id:string)=>(event:MouseEvent<HTMLAnchorElement>)=>{
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"});
  };

  return <main className={styles.page}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}><BrandLogo/></a>
      <LanguageMenu/>
    </header>

    <section className={styles.intro}>
      <span className={styles.control}><b>{c.control}</b></span>
      <h1>{intl?c.intlChoose:c.choose}</h1>
      <p>{intl?c.intlChooseText:c.chooseText}</p>
    </section>

    <nav className={styles.productJumpNav} aria-label={intl?"Product shortcuts":"Atalhos dos produtos"}>
      <a className={`${styles.productJump} ${styles.sentinelJump}`} href="#sentinel" onClick={jumpTo("sentinel")}>{c.sentinelJump}</a>
      {financeVisible&&<a className={`${styles.productJump} ${styles.financeJump}`} href="#financeiro" onClick={jumpTo("financeiro")}>{c.financeJump}</a>}
      {showStore&&<a className={`${styles.productJump} ${styles.storeJump}`} href="#loja" onClick={jumpTo("loja")}>{c.storeJump}</a>}
    </nav>

    <section id="sentinel" className={`${styles.product} ${styles.sentinelProduct}`} aria-label="Sentinel Trading Lab">
      <div className={styles.productGlow}/>
      <div className={styles.independent}><b>{c.independent}</b><span>{c.ownPlan}</span></div>
      <div className={styles.sentinelHeroGrid}>
        <div className={styles.copy}>
          <span className={styles.tag}><i/>{c.sentinelTag}</span>
          <h2>{c.sentinelLine1}</h2>
          <p>{c.sentinelText}</p>
          <div className={styles.sentinelBrokerBrands} aria-label="IQ Option e Exnova">
            <span className={styles.sentinelIq}>IQ <b>OPTION</b></span>
            <span className={styles.sentinelExnova}>EXNOVA</span>
          </div>
          <div className={styles.sentinelOffer}>
            <div>
              <small>{c.sentinelAccess}</small>
              <strong>{intl?'US$ 60':'R$ 289'}</strong>
            </div>
            <span>{c.sentinelCycle}</span>
          </div>
          <div className={styles.actions}>
            <a className={styles.primary} href={sentinelCheckout} rel="noopener noreferrer">{c.sentinelBuy} <span aria-hidden="true">↗</span></a>
            <a className={styles.secondary} href="/sentinel">{c.sentinelPrimary}</a>
          </div>
        </div>
        <aside className={styles.sentinelPreview} aria-label={c.sentinelPreview}>
          <div className={styles.sentinelPreviewTop}>
            <span className={styles.sentinelPreviewPulse} aria-hidden="true"/>
            <div><strong>DEVINX · SENTINEL</strong><small>{c.sentinelPreviewTitle}</small></div>
            <span className={styles.sentinelDemoBadge}>{c.sentinelPreview}</span>
          </div>
          <div className={styles.sentinelPreviewChart} aria-hidden="true">
            <svg viewBox="0 0 480 210" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="sentinelChartFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e3c374" stopOpacity=".26"/>
                  <stop offset="100%" stopColor="#e3c374" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <g stroke="#b9d8c9" strokeOpacity=".1" strokeWidth="1">
                <path d="M0 42H480 M0 84H480 M0 126H480 M0 168H480 M80 0V210 M160 0V210 M240 0V210 M320 0V210 M400 0V210"/>
              </g>
              <path d="M0 175L34 159L67 168L102 128L137 145L172 122L205 131L239 92L271 103L302 74L339 94L365 60L397 71L432 37L480 49V210H0Z" fill="url(#sentinelChartFill)"/>
              <path className={styles.sentinelChartLine} d="M0 175L34 159L67 168L102 128L137 145L172 122L205 131L239 92L271 103L302 74L339 94L365 60L397 71L432 37L480 49" fill="none" stroke="#e6c474" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="432" cy="37" r="5" fill="#f5db93"/>
              <circle className={styles.sentinelChartHalo} cx="432" cy="37" r="12" fill="none" stroke="#f5db93" strokeWidth="2"/>
            </svg>
          </div>
          <div className={styles.sentinelPreviewFoot}>
            <div><span className={styles.sentinelPreviewSymbol}>↗</span><strong>CALL <span>/</span> PUT</strong><small>{c.sentinelPreviewDetail}</small></div>
            <span className={styles.sentinelPreviewBar} aria-hidden="true"><i/><i/><i/><i/><i/></span>
          </div>
          <span className={styles.sentinelPreviewNote}>{c.sentinelPreview}</span>
        </aside>
      </div>
      <FeatureGrid title={c.sentinelFeaturesTitle} items={SENTINEL_FEATURES[activeLocale]}/>
      <p className={styles.sentinelRisk}>{locale==='pt-BR'?'O bot pode enviar ordens automaticamente quando ativado pelo usuário. Não há garantia de acertos ou lucros; operações envolvem risco de perdas.': 'When enabled, the bot can place orders automatically. Accuracy and profits are not guaranteed; trading involves risk of loss.'}</p>
    </section>

    <section className={`${styles.products} ${(!showStore||!financeVisible)?styles.financeOnly:""}`} aria-label={intl?c.intlChoose:c.choose}>
      {financeVisible&&<article id="financeiro" className={`${styles.product} ${styles.financeProduct}`}>
        <div className={styles.productGlow}></div>
        <div className={styles.independent}><b>{c.independent}</b><span>{c.ownPlan}</span></div>
        <div className={styles.copy}>
          <span className={styles.tag}><i></i>{c.financeTag}</span>
          <h2>{c.financeLine1}<br/><em>{c.financeLine2}</em></h2>
          <p>{c.financeText}</p>
          <div className={styles.financeOffer}>
            <span>{c.financeCycle}</span>
            <strong>{financePriceLabel}</strong>
          </div>
          <div className={styles.actions}>
            <a className={`${styles.primary} ${styles.trialPrimary}`} href={financeCheckout} rel="noopener noreferrer">{c.financePrimary} ↗</a>
            <a className={styles.secondary} href="/financeiro">{c.financeSecondary}</a>
          </div>
          <a className={styles.accessButton} href="/entrar">{c.financeLogin} →</a>
        </div>
        <FeatureGrid title={c.financeFeaturesTitle} items={financeFeatures}/>
      </article>}

      {showStore&&<>
      {financeVisible&&<div className={styles.or} aria-hidden="true">{c.or}</div>}

      <article id="loja" className={`${styles.product} ${styles.storeProduct}`}>
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
