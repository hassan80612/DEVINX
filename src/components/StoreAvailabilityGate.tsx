"use client";

import {useI18n} from "@/i18n/provider";
import {LanguageMenu} from "@/components/LanguageMenu";
import {BrandLogo} from "@/components/BrandLogo";
import styles from "@/app/loja/page.module.css";

const COPY={
  en:{title:"DevinX Store is currently available in Brazil.",text:"The Store product, billing and support are currently offered in Portuguese and BRL. DevinX Finance remains available internationally.",cta:"Go to DevinX Finance"},
  es:{title:"DevinX Tienda está disponible actualmente en Brasil.",text:"La Tienda, la facturación y el soporte están disponibles por ahora en portugués y BRL. DevinX Finanzas sigue disponible internacionalmente.",cta:"Ir a DevinX Finanzas"},
  fr:{title:"DevinX Boutique est actuellement disponible au Brésil.",text:"La Boutique, la facturation et l’assistance sont pour l’instant proposées en portugais et en BRL. DevinX Finance reste disponible à l’international.",cta:"Voir DevinX Finance"},
  de:{title:"DevinX Shop ist derzeit in Brasilien verfügbar.",text:"Shop, Abrechnung und Support werden derzeit auf Portugiesisch und in BRL angeboten. DevinX Finanzen bleibt international verfügbar.",cta:"Zu DevinX Finanzen"},
  ar:{title:"متجر DevinX متاح حالياً في البرازيل.",text:"المتجر والفوترة والدعم متاحة حالياً باللغة البرتغالية وبالريال البرازيلي. DevinX المالي متاح دولياً.",cta:"الانتقال إلى DevinX المالي"}
} as const;

export function StoreAvailabilityGate({children}:{children:React.ReactNode}){
  const{locale}=useI18n();
  if(locale==="pt-BR")return <>{children}</>;
  const c=COPY[(locale in COPY?locale:"en") as keyof typeof COPY];
  return <main className={styles.availabilityPage}>
    <header className={styles.header}>
      <a href="/" className={styles.brand} aria-label="DevinX"><BrandLogo/></a>
      <LanguageMenu/>
    </header>
    <section className={styles.availabilityCard}>
      <span>DEVINX LOJA · BRAZIL</span>
      <h1>{c.title}</h1>
      <p>{c.text}</p>
      <a className={styles.primary} href="/financeiro">{c.cta}</a>
    </section>
  </main>;
}
