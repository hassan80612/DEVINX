"use client";

import {useEffect,useState} from "react";
import {LanguageMenu} from "@/components/LanguageMenu";
import {useI18n} from "@/i18n/provider";
import {createClient} from "@/lib/supabase/client";
import styles from "./LaserLanding.module.css";

const AGENT="https://github.com/hassan80612/DEVINX/releases/download/laser-agent-v1.0.31/DevinX-Laser-Agent-1.0.31.exe";

const BR={
  heroTag:"DEVINX LASER CONTROL · LIGHTBURN REMOTO",hero1:"Seu LightBurn.",hero2:"Onde você estiver.",
  intro:"Acompanhe a tela ao vivo, use os principais comandos, edite com toque, mouse e teclado e atenda alunos à distância sem transformar o processo em uma instalação complicada.",
  access:"Entrar no Laser Control",guide:"Guia completo",agent:"Baixar Agent 1.0.31",
  capabilities:"DO COMPUTADOR PARA A SUA MÃO",capabilityLead:"Um painel criado para operar o LightBurn à distância sem esconder o que realmente importa.",
  features:[
    ["◉","Tela ao vivo","Veja a janela do LightBurn em tempo real e acompanhe o estado do computador e da máquina."],
    ["⌁","Controle remoto","Toque, mouse, clique direito, duplo clique e teclado DevinX direto sobre a transmissão."],
    ["⌖","Comandos de trabalho","Frame, Iniciar, Pausar e Parar ficam próximos da visualização para reduzir passos."],
    ["⛶","Tela e navegação","Zoom, pan, tela cheia e orientação Auto, Horizontal ou Vertical."],
    ["✦","Ferramentas LightBurn","Salvar, desfazer, refazer, importar, Preview, rotativo, rastrear e ajustar imagem."],
    ["◎","Sessões protegidas","Acesso e permissões são validados pelo servidor; a sessão remota não libera o sistema fora do plano."]
  ],
  remoteTag:"CONTROLE",remoteTitle:"Você controla de onde quiser.",remoteText:"Deixe o LightBurn aberto no computador ligado à máquina e use outro dispositivo para acompanhar e operar. O computador continua sendo a origem; o celular ou outro PC vira o seu painel remoto.",
  mentorTag:"MENTORIA",mentorTitle:"Professor de um lado. Aluno do outro. O LightBurn no meio.",mentorText:"O aluno abre o DevinX Mentoria no computador onde está o LightBurn, recebe um código temporário e envia ao professor. O professor conecta pelo Laser Control sem substituir o Agent permanente do aluno.",
  mentorFacts:["Código válido por 30 minutos para conectar","Sessão temporária de até 6 horas","10 sessões incluídas no plano Mentor","Sessão Extra adiciona mais 10 sessões de mentoria","1 atendimento ativo por vez","LightBurn precisa estar aberto no PC do aluno/origem"],
  how:"COMO FUNCIONA",steps:[
    ["01","Instale o Agent","No seu computador principal, baixe o EXE, execute e faça o vínculo uma vez."],
    ["02","Abra o LightBurn","O Agent identifica o aplicativo e mantém o computador disponível no seu Laser Control."],
    ["03","Controle","Abra o painel no celular ou em outro PC, escolha o computador e inicie a tela ao vivo."]
  ],
  plansTag:"PLANOS BRASIL",plansTitle:"Escolha o acesso que combina com o seu uso.",period:"/mês",
  purchaseTitle:"Como você ativa depois da compra",
  purchaseSteps:["Escolha o plano e conclua o pagamento na Kiwify.","Use na sua conta DevinX o mesmo e-mail informado na compra.","Na página de confirmação, toque em Entrar no Laser Control. Se ainda não tiver conta, crie uma com esse mesmo e-mail.","O acesso é reconhecido automaticamente pelo pagamento aprovado."],
  plans:[
    ["CONTROL","R$ 29,90","Controle remoto do seu LightBurn","1 PC · uso próprio","https://pay.kiwify.com.br/YghizRi","Assinar Control"],
    ["MENTOR","R$ 59,90","Controle próprio + mentoria remota","1 PC · 10 sessões por ciclo","https://pay.kiwify.com.br/qVRSFCL","Assinar Mentor"],
    ["SESSÃO EXTRA","R$ 9,90","Adicione mais 10 sessões de mentoria","Somente para Mentor ativo · expiram junto com o período atual","/laser-control/extra?market=br","Comprar +10 sessões"]
  ],
  support:"Suporte por e-mail",home:"Voltar ao DevinX",already:"Já tenho acesso"
} as const;

const INTL={
  heroTag:"DEVINX LASER CONTROL · REMOTE LIGHTBURN",hero1:"Your LightBurn.",hero2:"Wherever you are.",
  intro:"See the live screen, use essential commands, edit with touch, mouse and the DevinX keyboard, and mentor students remotely without turning setup into a technical obstacle.",
  access:"Open Laser Control",guide:"Complete guide",agent:"Download Agent 1.0.31",
  capabilities:"FROM THE LASER PC TO YOUR HAND",capabilityLead:"A remote workspace built around the controls that matter when operating LightBurn.",
  features:[
    ["◉","Live screen","See the LightBurn window in real time and follow computer and machine status."],
    ["⌁","Remote control","Touch, mouse, right click, double click and the DevinX keyboard directly on the stream."],
    ["⌖","Job commands","Frame, Start, Pause and Stop stay close to the live view."],
    ["⛶","View controls","Zoom, pan, fullscreen and Auto, Landscape or Portrait orientation."],
    ["✦","LightBurn tools","Save, undo, redo, import, Preview, rotary, trace and image adjustment tools."],
    ["◎","Protected sessions","Server-side access and permissions keep remote control tied to the active entitlement."]
  ],
  remoteTag:"REMOTE CONTROL",remoteTitle:"Control it from wherever you are.",remoteText:"Keep LightBurn open on the computer connected to the machine and use another device as your remote panel. The source PC stays in control of the laser connection while your phone or another computer becomes the interface.",
  mentorTag:"MENTORING",mentorTitle:"Teacher on one side. Student on the other. LightBurn in between.",mentorText:"The student opens DevinX Mentoring on the computer running LightBurn, receives a temporary code and sends it to the teacher. The teacher connects through Laser Control without replacing the student's permanent Agent.",
  mentorFacts:["Code valid for 30 minutes to connect","Temporary session up to 6 hours","10 sessions included with Mentor","Extra Session adds 10 more mentoring sessions","1 active mentoring session at a time","LightBurn must be open on the student/source PC"],
  how:"HOW IT WORKS",steps:[
    ["01","Install the Agent","On your main computer, download the EXE, run it and pair the computer once."],
    ["02","Open LightBurn","The Agent detects the app and keeps the computer available in Laser Control."],
    ["03","Take control","Open the panel on your phone or another computer, select the PC and start the live view."]
  ],
  plansTag:"INTERNATIONAL ACCESS",plansTitle:"Choose the access that fits your workflow.",period:"/30 days",
  purchaseTitle:"How access is activated after purchase",
  purchaseSteps:["Choose a plan and complete payment on Kiwify.","Use the same purchase email for your DevinX account.","On the confirmation page, open Laser Control. If you do not have an account yet, create one with that same email.","Approved purchases are recognized automatically."],
  plans:[
    ["CONTROL","US$ 8.90","Remote access to your LightBurn","1 PC · 30 days","https://pay.kiwify.com/nuY5IsV","Get Control"],
    ["MENTOR","US$ 17.90","Personal control + remote mentoring","1 PC · 30 days · 10 sessions","https://pay.kiwify.com/aIbUTmG","Get Mentor"],
    ["EXTRA SESSION","US$ 7.50","Add 10 more mentoring sessions","Active Mentor only · expire with the current access period","/laser-control/extra?market=intl","Buy +10 sessions"]
  ],
  support:"Email support",home:"Back to DevinX",already:"I already have access"
} as const;

export function LaserLanding(){
  const{locale}=useI18n();
  const intl=locale!=="pt-BR";
  const[loggedIn,setLoggedIn]=useState(false);
  const[accessNotice,setAccessNotice]=useState(false);

  useEffect(()=>{
    const supabase=createClient();
    void supabase.auth.getSession().then((result:{data:{session:unknown|null}})=>setLoggedIn(Boolean(result.data.session)));
    try{setAccessNotice(new URLSearchParams(window.location.search).get("acesso")==="necessario")}catch{}
  },[]);

  async function signOutAndSwitch(){
    await createClient().auth.signOut();
    window.location.assign("/entrar?next=/laser-control");
  }
  const c=intl?INTL:BR;
  const supportBody=intl?"Agent version:%0ALightBurn version:%0AWindows:%0AIssue:%0A":"Vers%C3%A3o%20do%20Agent:%0AVers%C3%A3o%20do%20LightBurn:%0AWindows:%0AProblema:%0A";
  return <main className={styles.page} lang={intl?"en":"pt-BR"}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}><b>DX</b><span>DEVINX <em>LASER CONTROL</em></span></a>
      <nav>
        <a href="/">{c.home}</a>
        <a href="/laser-control/guia">{c.guide}</a>
        {loggedIn&&<button className={styles.accountButton} type="button" onClick={()=>void signOutAndSwitch()}>{intl?"Sign out / Switch account":"Sair / Trocar conta"}</button>}
        <LanguageMenu/>
      </nav>
    </header>
    {accessNotice&&<section className={styles.accessNotice}>
      <div>
        <b>{intl?"This account does not have Laser Control access yet.":"Esta conta ainda não tem acesso ao Laser Control."}</b>
        <p>{intl?"Choose a plan below or sign out to enter with another account.":"Escolha um plano abaixo ou saia para entrar com outra conta."}</p>
      </div>
      <button type="button" onClick={()=>void signOutAndSwitch()}>{intl?"Sign out / Switch account":"Sair / Trocar conta"}</button>
    </section>}
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.tag}>{c.heroTag}</span><h1>{c.hero1}<br/><em>{c.hero2}</em></h1><p>{c.intro}</p>
        <div className={styles.heroActions}>
          <a className={styles.gold} href="/entrar?next=/laser-control">{c.access}</a>
          <a className={styles.dark} href="/laser-control/guia">{c.guide}</a>
          <a className={styles.dark} href={AGENT}>{c.agent}</a>
        </div>
      </div>
      <div className={styles.screen} aria-hidden="true">
        <div className={styles.screenBar}><i/><i/><i/><span>DEVINX · LIVE</span></div>
        <div className={styles.screenBody}>
          <aside><b>PC OFICINA</b><span>● online</span><span>LightBurn conectado</span><span>Máquina pronta</span></aside>
          <div className={styles.mockLive}><small>LIGHTBURN · LIVE VIEW</small><div className={styles.mockCanvas}><span>LASER</span><b>CONTROL</b></div><div className={styles.mockButtons}><i>Frame</i><i>Start</i><i>Pause</i><i>Stop</i></div></div>
        </div>
      </div>
    </section>
    <section className={styles.featureSection}>
      <div className={styles.sectionHead}><small>{c.capabilities}</small><h2>{c.capabilityLead}</h2></div>
      <div className={styles.features}>{c.features.map(([icon,title,text])=><article key={title}><i>{icon}</i><b>{title}</b><p>{text}</p></article>)}</div>
    </section>
    <section className={styles.split}>
      <article className={styles.story}><small>{c.remoteTag}</small><h2>{c.remoteTitle}</h2><p>{c.remoteText}</p><div className={styles.storyMetric}><b>LIVE</b><span>LightBurn screen + commands + input</span></div></article>
      <article className={styles.story+" "+styles.mentor}><small>{c.mentorTag}</small><h2>{c.mentorTitle}</h2><p>{c.mentorText}</p><div className={styles.factGrid}>{c.mentorFacts.map(item=><span key={item}>◆ {item}</span>)}</div></article>
    </section>
    <section className={styles.how}><div className={styles.sectionHead}><small>{c.how}</small></div><div className={styles.steps}>{c.steps.map(([n,title,text])=><article key={n}><span>{n}</span><b>{title}</b><p>{text}</p></article>)}</div></section>
    <section className={styles.pricing} id="planos">
      <div className={styles.sectionHead}><small>{c.plansTag}</small><h2>{c.plansTitle}</h2></div>
      <div className={styles.purchaseFlow}>
        <b>{c.purchaseTitle}</b>
        <div>{c.purchaseSteps.map((step,index)=><span key={step}><i>{index+1}</i>{step}</span>)}</div>
      </div>
      <div className={styles.planGrid}>{c.plans.map(([name,price,desc,detail,href,cta],index)=><article key={name} className={index===1?styles.featuredPlan:""}>{index===1&&<small className={styles.best}>{intl?"PROFESSIONAL":"MAIS COMPLETO"}</small>}<span>{name}</span><h3>{price}<em>{index===2?"":c.period}</em></h3><b>{desc}</b><p>{detail}</p><a href={href} target={index===2?undefined:"_blank"} rel={index===2?undefined:"noreferrer"}>{cta}</a></article>)}</div>
    </section>
    <section className={styles.bottom}>
      <div><small>DEVINX LASER CONTROL</small><h2>{intl?"Ready when your LightBurn is.":"Pronto quando seu LightBurn estiver."}</h2></div>
      <div className={styles.bottomActions}><a href="/entrar?next=/laser-control">{c.already}</a><a href={"mailto:vetorizeai.1@gmail.com?subject=DevinX%20Laser%20Control%20Support&body="+supportBody}>{c.support}</a><a href="/laser-control/guia">{c.guide}</a></div>
    </section>
  </main>;
}
