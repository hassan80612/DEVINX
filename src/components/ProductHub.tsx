"use client";

import {useEffect,useMemo,useState} from "react";
import {useI18n} from "@/i18n/provider";
import {SubscriptionPlans} from "@/components/SubscriptionPlans";
import styles from "./ProductHub.module.css";

type ProductKey="finance"|"store"|"complete";
type StorePlan={id:string;name:string;priceCents:number;products:number;photos:number;links:number;collaborators:number;whatsappContacts:number};

const COPY={
  "pt-BR":{
    eyebrow:"DEVINX PARA VOCÊ E PARA O SEU NEGÓCIO",title:"Escolha o que você quer organizar.",text:"Financeiro e Loja são produtos independentes. Você contrata somente o que precisa.",
    finance:"Financeiro",financeText:"Contas, cartões, metas, reservas, jornadas e planejamento financeiro.",financeCta:"Conhecer Financeiro",
    store:"Loja",storeText:"Vitrine pública, produtos, estoque, custos, vendas e atendimento pelo WhatsApp.",storeCta:"Conhecer Loja",
    complete:"Completo",completeText:"Financeiro + Loja em uma contratação única.",soon:"Em breve",
    plansTitle:"Planos sem mistura",plansText:"Troque de produto para ver somente os planos correspondentes.",loading:"Carregando planos da Loja...",
    unavailable:"Planos da Loja temporariamente indisponíveis.",perMonth:"/mês",choose:"Escolher",products:"produtos",photos:"fotos",links:"links/vídeos",team:"colaborador(es)",whatsapp:"WhatsApp",noCommission:"Sem comissão por venda",
    completeTitle:"DevinX Completo está preparado, mas ainda não está à venda.",completeBody:"O Combo só será ativado quando os checkouts oficiais e a liberação automática dos dois produtos estiverem configurados. Até lá, nenhuma cobrança combinada será exibida."
  },
  en:{eyebrow:"DEVINX FOR YOU AND YOUR BUSINESS",title:"Choose what you want to organize.",text:"Finance and Store are independent products. Subscribe only to what you need.",finance:"Finance",financeText:"Bills, cards, goals, savings, work sessions and financial planning.",financeCta:"Explore Finance",store:"Store",storeText:"Public storefront, products, stock, costs, sales and WhatsApp service.",storeCta:"Explore Store",complete:"Complete",completeText:"Finance + Store in one subscription.",soon:"Coming soon",plansTitle:"Plans kept separate",plansText:"Switch products to see only the matching plans.",loading:"Loading Store plans...",unavailable:"Store plans are temporarily unavailable.",perMonth:"/month",choose:"Choose",products:"products",photos:"photos",links:"links/videos",team:"team member(s)",whatsapp:"WhatsApp",noCommission:"No sales commission",completeTitle:"DevinX Complete is prepared, but not on sale yet.",completeBody:"The bundle will only be enabled after official checkout links and automatic activation for both products are configured."},
  es:{eyebrow:"DEVINX PARA TI Y TU NEGOCIO",title:"Elige qué quieres organizar.",text:"Finanzas y Tienda son productos independientes. Contrata solo lo que necesitas.",finance:"Finanzas",financeText:"Cuentas, tarjetas, metas, reservas, jornadas y planificación financiera.",financeCta:"Conocer Finanzas",store:"Tienda",storeText:"Vitrina pública, productos, stock, costos, ventas y atención por WhatsApp.",storeCta:"Conocer Tienda",complete:"Completo",completeText:"Finanzas + Tienda en una sola contratación.",soon:"Próximamente",plansTitle:"Planes sin mezclar",plansText:"Cambia de producto para ver solo sus planes.",loading:"Cargando planes de Tienda...",unavailable:"Planes de Tienda temporalmente no disponibles.",perMonth:"/mes",choose:"Elegir",products:"productos",photos:"fotos",links:"enlaces/videos",team:"colaborador(es)",whatsapp:"WhatsApp",noCommission:"Sin comisión por venta",completeTitle:"DevinX Completo está preparado, pero todavía no está a la venta.",completeBody:"El combo se activará solo cuando existan checkouts oficiales y activación automática de ambos productos."},
  fr:{eyebrow:"DEVINX POUR VOUS ET VOTRE ACTIVITÉ",title:"Choisissez ce que vous voulez organiser.",text:"Finance et Boutique sont deux produits indépendants.",finance:"Finance",financeText:"Factures, cartes, objectifs, réserves, travail et planification.",financeCta:"Découvrir Finance",store:"Boutique",storeText:"Vitrine publique, produits, stock, coûts, ventes et WhatsApp.",storeCta:"Découvrir Boutique",complete:"Complet",completeText:"Finance + Boutique dans une seule offre.",soon:"Bientôt",plansTitle:"Des offres bien séparées",plansText:"Changez de produit pour voir uniquement les offres correspondantes.",loading:"Chargement des offres Boutique...",unavailable:"Offres Boutique temporairement indisponibles.",perMonth:"/mois",choose:"Choisir",products:"produits",photos:"photos",links:"liens/vidéos",team:"collaborateur(s)",whatsapp:"WhatsApp",noCommission:"Aucune commission sur les ventes",completeTitle:"DevinX Complet est prêt dans l’interface, mais pas encore commercialisé.",completeBody:"Le pack sera activé uniquement lorsque les paiements officiels et l’activation automatique des deux produits seront configurés."},
  de:{eyebrow:"DEVINX FÜR DICH UND DEIN GESCHÄFT",title:"Wähle, was du organisieren möchtest.",text:"Finanzen und Shop sind unabhängige Produkte.",finance:"Finanzen",financeText:"Rechnungen, Karten, Ziele, Rücklagen, Arbeit und Finanzplanung.",financeCta:"Finanzen ansehen",store:"Shop",storeText:"Öffentliche Shop-Seite, Produkte, Bestand, Kosten, Verkäufe und WhatsApp.",storeCta:"Shop ansehen",complete:"Komplett",completeText:"Finanzen + Shop in einem Paket.",soon:"Demnächst",plansTitle:"Getrennte Tarife",plansText:"Wechsle das Produkt, um nur die passenden Tarife zu sehen.",loading:"Shop-Tarife werden geladen...",unavailable:"Shop-Tarife sind vorübergehend nicht verfügbar.",perMonth:"/Monat",choose:"Wählen",products:"Produkte",photos:"Fotos",links:"Links/Videos",team:"Mitarbeiter",whatsapp:"WhatsApp",noCommission:"Keine Verkaufsprovision",completeTitle:"DevinX Komplett ist vorbereitet, aber noch nicht buchbar.",completeBody:"Das Paket wird erst aktiviert, wenn offizielle Checkouts und die automatische Freischaltung beider Produkte eingerichtet sind."},
  ar:{eyebrow:"DEVINX لك ولنشاطك",title:"اختر ما تريد تنظيمه.",text:"المالي والمتجر منتجان مستقلان. اشترك فقط بما تحتاجه.",finance:"المالي",financeText:"الفواتير والبطاقات والأهداف والاحتياطي والعمل والتخطيط المالي.",financeCta:"عرض المالي",store:"المتجر",storeText:"واجهة متجر عامة ومنتجات ومخزون وتكاليف ومبيعات وواتساب.",storeCta:"عرض المتجر",complete:"الكامل",completeText:"المالي + المتجر في اشتراك واحد.",soon:"قريباً",plansTitle:"خطط منفصلة وواضحة",plansText:"بدّل المنتج لرؤية خططه فقط.",loading:"جارٍ تحميل خطط المتجر...",unavailable:"خطط المتجر غير متاحة مؤقتاً.",perMonth:"/شهر",choose:"اختيار",products:"منتجات",photos:"صور",links:"روابط/فيديو",team:"متعاون",whatsapp:"واتساب",noCommission:"بدون عمولة على المبيعات",completeTitle:"DevinX الكامل جاهز في الواجهة لكنه غير معروض للبيع بعد.",completeBody:"لن يتم تفعيل الباقة المجمعة إلا بعد إعداد الدفع الرسمي والتفعيل التلقائي للمنتجين."}
} as const;

function useProductCopy(){
  const{locale}=useI18n();
  return COPY[(locale in COPY?locale:"pt-BR") as keyof typeof COPY];
}

export function ProductOverview(){
  const c=useProductCopy();
  return <section className={styles.overview} id="produtos" aria-labelledby="devinx-products-title">
    <div className={styles.head}>
      <span>{c.eyebrow}</span>
      <h2 id="devinx-products-title">{c.title}</h2>
      <p>{c.text}</p>
    </div>
    <div className={styles.productGrid}>
      <article><small>01</small><h3>{c.finance}</h3><p>{c.financeText}</p><a href="#financeiro">{c.financeCta} →</a></article>
      <article><small>02</small><h3>{c.store}</h3><p>{c.storeText}</p><a href="/loja">{c.storeCta} →</a></article>
      <article className={styles.future}><small>03 · {c.soon}</small><h3>{c.complete}</h3><p>{c.completeText}</p><span>{c.soon}</span></article>
    </div>
  </section>;
}

export function ProductPlansHub(){
  const c=useProductCopy();
  const{locale}=useI18n();
  const[active,setActive]=useState<ProductKey>("finance");
  const[plans,setPlans]=useState<StorePlan[]|null>(null);
  const[failed,setFailed]=useState(false);

  useEffect(()=>{
    let mounted=true;
    fetch("/api/store-plans",{cache:"no-store"})
      .then(async r=>{if(!r.ok)throw new Error("store_plans");return r.json();})
      .then(data=>{if(mounted)setPlans(Array.isArray(data?.plans)?data.plans:[]);})
      .catch(()=>{if(mounted)setFailed(true);});
    return()=>{mounted=false;};
  },[]);

  const money=useMemo(()=>new Intl.NumberFormat(locale,{style:"currency",currency:"BRL"}),[locale]);

  return <section className={styles.plansHub} aria-labelledby="product-plans-title">
    <div className={styles.head}>
      <span>DEVINX</span><h2 id="product-plans-title">{c.plansTitle}</h2><p>{c.plansText}</p>
    </div>
    <div className={styles.tabs} role="tablist" aria-label={c.plansTitle}>
      <button type="button" role="tab" aria-selected={active==="finance"} onClick={()=>setActive("finance")}>{c.finance}</button>
      <button type="button" role="tab" aria-selected={active==="store"} onClick={()=>setActive("store")}>{c.store}</button>
      <button type="button" role="tab" aria-selected={active==="complete"} onClick={()=>setActive("complete")}>{c.complete}<small>{c.soon}</small></button>
    </div>

    <div className={styles.planPanel}>
      {active==="finance"&&<SubscriptionPlans variant="compact"/>}
      {active==="store"&&<>
        {!plans&&!failed&&<div className={styles.state}>{c.loading}</div>}
        {failed&&<div className={styles.state}>{c.unavailable}</div>}
        {plans&&<div className={styles.storeGrid}>{plans.map(plan=><article key={plan.id} className={plan.id==="pro"?styles.featured:""}>
          <div className={styles.storeTop}><small>{c.store}</small><h3>{plan.name}</h3></div>
          <div className={styles.price}><strong>{money.format(plan.priceCents/100)}</strong><span>{c.perMonth}</span></div>
          <ul>
            <li>✓ {plan.products} {c.products}</li>
            <li>✓ {plan.photos} {c.photos}</li>
            <li>✓ {plan.links} {c.links}</li>
            <li>✓ {plan.collaborators} {c.team}</li>
            <li>✓ {plan.whatsappContacts} {c.whatsapp}</li>
            <li>✓ {c.noCommission}</li>
          </ul>
          <a href={`/loja/assinar/${plan.id}`} className={styles.choose}>{c.choose} {plan.name}</a>
        </article>)}</div>}
      </>}
      {active==="complete"&&<div className={styles.completeBox}><span>{c.soon}</span><h3>{c.completeTitle}</h3><p>{c.completeBody}</p></div>}
    </div>
  </section>;
}
