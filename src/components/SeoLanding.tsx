import Link from 'next/link';
import {BrandLogo} from '@/components/BrandLogo';
import styles from './SeoLanding.module.css';

type SeoCard={title:string;text:string};
type SeoSection={title:string;text:string};
type SeoFaq={question:string;answer:string};
type RelatedLink={href:string;label:string};

export function SeoLanding({
  eyebrow,
  title,
  intro,
  cards,
  sections,
  faq,
  related
}:{
  eyebrow:string;
  title:string;
  intro:string;
  cards:SeoCard[];
  sections:SeoSection[];
  faq:SeoFaq[];
  related:RelatedLink[];
}){
  const faqJsonLd={
    '@context':'https://schema.org',
    '@type':'FAQPage',
    mainEntity:faq.map(item=>({
      '@type':'Question',
      name:item.question,
      acceptedAnswer:{
        '@type':'Answer',
        text:item.answer
      }
    }))
  };

  return <div className={styles.page}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(faqJsonLd)}}/>
    <header className={styles.header}>
      <Link href="/" aria-label="DevinX - início"><BrandLogo/></Link>
      <Link className={styles.homeLink} href="/">Voltar ao DevinX</Link>
    </header>
    <main className={styles.main}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>{eyebrow}</span>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href="/entrar?trial=1">Testar 3 dias grátis</Link>
          <Link className={styles.secondary} href="/#planos">Ver planos</Link>
        </div>
        <small className={styles.note}>Sem cartão e sem cobrança automática no teste grátis.</small>
      </section>

      <section className={styles.grid} aria-label="Recursos do DevinX">
        {cards.map(card=><article className={styles.card} key={card.title}>
          <h2>{card.title}</h2>
          <p>{card.text}</p>
        </article>)}
      </section>

      {sections.map(section=><section className={styles.section} key={section.title}>
        <h2>{section.title}</h2>
        <p>{section.text}</p>
      </section>)}

      <section className={styles.faqWrap} aria-labelledby="faq-title">
        <h2 id="faq-title">Perguntas frequentes</h2>
        {faq.map(item=><article className={styles.faq} key={item.question}>
          <h3>{item.question}</h3>
          <p>{item.answer}</p>
        </article>)}
      </section>

      <nav className={styles.links} aria-label="Conteúdos relacionados">
        {related.map(item=><Link href={item.href} key={item.href}>{item.label}</Link>)}
      </nav>

      <footer className={styles.footer}>DEVINX — controle financeiro, metas e rotina de renda em um só lugar.</footer>
    </main>
  </div>;
}
