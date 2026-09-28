"use client";

import {useI18n} from "@/i18n/provider";
import styles from "./LaserHomeCard.module.css";

const BR={
  eyebrow:"DEVINX LASER CONTROL · LIGHTBURN REMOTO",
  title:"Seu LightBurn, onde você estiver.",
  text:"Veja a tela do LightBurn e controle seu computador pelo celular, tablet ou outro computador. Para uso próprio ou para professores que atendem alunos à distância.",
  guide:"Ver guia completo",
  login:"Já tenho acesso · Entrar",
  support:"Suporte por e-mail",
  period:"/mês",
  plans:[
    {name:"CONTROL",price:"R$ 29,90",detail:"1 PC · uso próprio",sub:"Controle remoto do seu LightBurn",href:"https://pay.kiwify.com.br/YghizRi",cta:"Assinar Control"},
    {name:"MENTOR",price:"R$ 59,90",detail:"1 PC · 10 sessões por ciclo",sub:"Controle próprio + mentoria temporária",href:"https://pay.kiwify.com.br/qVRSFCL",cta:"Assinar Mentor",featured:true},
    {name:"SESSÃO EXTRA",price:"R$ 9,90",detail:"+1 crédito de mentoria",sub:"Adicione uma sessão sem alterar seu plano",href:"https://pay.kiwify.com.br/2Td87KB",cta:"Comprar sessão"}
  ]
} as const;

const INTL={
  eyebrow:"DEVINX LASER CONTROL · REMOTE LIGHTBURN",
  title:"Your LightBurn, wherever you are.",
  text:"View LightBurn live and control your computer from a phone, tablet or another computer. Built for personal remote access and professional mentoring.",
  guide:"Open complete guide",
  login:"I already have access · Sign in",
  support:"Email support",
  period:"/30 days",
  plans:[
    {name:"CONTROL",price:"US$ 8.90",detail:"1 PC · 30 days",sub:"Remote access to your own LightBurn",href:"https://pay.kiwify.com/nuY5IsV",cta:"Get Control"},
    {name:"MENTOR",price:"US$ 17.90",detail:"1 PC · 30 days · 10 sessions",sub:"Personal control + temporary mentoring",href:"https://pay.kiwify.com/aIbUTmG",cta:"Get Mentor",featured:true},
    {name:"EXTRA SESSION",price:"US$ 7.50",detail:"+1 mentoring credit",sub:"Add one session without changing your access period",href:"https://pay.kiwify.com/2sFxGp1",cta:"Buy extra session"}
  ]
} as const;

export function LaserHomeCard(){
  const{locale}=useI18n();
  const intl=locale!=="pt-BR";
  const c=intl?INTL:BR;
  const supportBody=intl
    ?"Agent version:%0ALightBurn version:%0AWindows:%0AIssue:%0A"
    :"Vers%C3%A3o%20do%20Agent:%0AVers%C3%A3o%20do%20LightBurn:%0AWindows:%0AProblema:%0A";

  return <section className={styles.shell} lang={intl?"en":"pt-BR"} data-market={intl?"intl":"br"} aria-label="DevinX Laser Control">
    <div className={styles.head}>
      <span>{c.eyebrow}</span>
      <h2>{c.title}</h2>
      <p>{c.text}</p>
    </div>

    <div className={styles.plans}>
      {c.plans.map((plan)=><article key={plan.name} className={`${styles.plan} ${"featured" in plan&&plan.featured?styles.featured:""}`}>
        {"featured" in plan&&plan.featured&&<div className={styles.badge}>{intl?"BEST FOR PROFESSIONALS":"MAIS COMPLETO"}</div>}
        <small>{plan.name}</small>
        <div className={styles.price}>{plan.price}<em>{plan.name.includes("EXTRA")||plan.name.includes("SESSÃO")?"":c.period}</em></div>
        <strong>{plan.detail}</strong>
        <p>{plan.sub}</p>
        <a href={plan.href} target="_blank" rel="noreferrer">{plan.cta}</a>
      </article>)}
    </div>

    <div className={styles.links}>
      <a href="/laser-control/guia">{c.guide}</a>
      <a href="/entrar?next=/laser-control">{c.login}</a>
      <a href={`mailto:vetorizeai.1@gmail.com?subject=DevinX%20Laser%20Control%20Support&body=${supportBody}`}>{c.support}</a>
    </div>
  </section>;
}
