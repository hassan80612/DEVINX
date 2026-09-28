'use client';

import {LanguageMenu} from '@/components/LanguageMenu';
import {useI18n} from '@/i18n/provider';
import type {Locale} from '@/i18n/catalogs';
import styles from './page.module.css';

const DOWNLOAD='https://github.com/hassan80612/DEVINX/releases/download/laser-agent-v1.0.31/DevinX-Mentoria-1.0.31.exe';

const copy:Record<Locale,{
  eyebrow:string;title:string;lead:string;step1:string;step2:string;step3:string;
  button:string;note:string;security:string;version:string;language:string;
}>={
  'pt-BR':{
    eyebrow:'DEVINX · ACESSO TEMPORÁRIO',
    title:'Conecte seu computador ao professor',
    lead:'Abra esta página no computador que está ligado ao LightBurn. Você não precisa criar conta nem instalar nada permanente.',
    step1:'Baixe o acesso temporário.',
    step2:'Dê dois cliques no arquivo baixado.',
    step3:'Envie ao professor o código de 8 caracteres que aparecer.',
    button:'Baixar acesso temporário',
    note:'O acesso não entra na inicialização do Windows e termina quando a sessão for encerrada.',
    security:'O professor só consegue conectar depois que você abrir o programa e compartilhar o código temporário.',
    version:'DevinX Mentoria 1.0.31 · Windows 10/11 64 bits',
    language:'Idioma'
  },
  en:{
    eyebrow:'DEVINX · TEMPORARY ACCESS',
    title:'Connect your computer to the instructor',
    lead:'Open this page on the computer connected to LightBurn. No account or permanent installation is required.',
    step1:'Download temporary access.',
    step2:'Double-click the downloaded file.',
    step3:'Send the instructor the 8-character code shown on screen.',
    button:'Download temporary access',
    note:'It does not start with Windows and ends when the temporary session is closed.',
    security:'The instructor can only connect after you open the program and share the temporary code.',
    version:'DevinX Mentoring 1.0.31 · Windows 10/11 64-bit',
    language:'Language'
  },
  es:{
    eyebrow:'DEVINX · ACCESO TEMPORAL',
    title:'Conecta tu ordenador con el profesor',
    lead:'Abre esta página en el ordenador conectado a LightBurn. No necesitas cuenta ni instalación permanente.',
    step1:'Descarga el acceso temporal.',
    step2:'Haz doble clic en el archivo descargado.',
    step3:'Envía al profesor el código de 8 caracteres que aparecerá.',
    button:'Descargar acceso temporal',
    note:'No inicia con Windows y termina cuando se cierra la sesión temporal.',
    security:'El profesor solo puede conectarse después de que abras el programa y compartas el código temporal.',
    version:'DevinX Mentoría 1.0.31 · Windows 10/11 64 bits',
    language:'Idioma'
  },
  fr:{
    eyebrow:'DEVINX · ACCÈS TEMPORAIRE',
    title:'Connectez votre ordinateur au formateur',
    lead:'Ouvrez cette page sur le PC connecté à LightBurn. Aucun compte ni installation permanente n’est nécessaire.',
    step1:'Téléchargez l’accès temporaire.',
    step2:'Double-cliquez sur le fichier téléchargé.',
    step3:'Envoyez au formateur le code de 8 caractères affiché.',
    button:'Télécharger l’accès temporaire',
    note:'Il ne démarre pas avec Windows et s’arrête à la fin de la session temporaire.',
    security:'Le formateur ne peut se connecter qu’après l’ouverture du programme et le partage du code temporaire.',
    version:'DevinX Mentorat 1.0.31 · Windows 10/11 64 bits',
    language:'Langue'
  },
  de:{
    eyebrow:'DEVINX · TEMPORÄRER ZUGRIFF',
    title:'Computer mit dem Lehrer verbinden',
    lead:'Öffnen Sie diese Seite auf dem Computer, der mit LightBurn verbunden ist. Kein Konto und keine dauerhafte Installation nötig.',
    step1:'Temporären Zugriff herunterladen.',
    step2:'Die heruntergeladene Datei doppelklicken.',
    step3:'Den angezeigten 8-stelligen Code an den Lehrer senden.',
    button:'Temporären Zugriff herunterladen',
    note:'Das Programm startet nicht mit Windows und endet mit der temporären Sitzung.',
    security:'Der Lehrer kann sich erst verbinden, nachdem das Programm geöffnet und der temporäre Code geteilt wurde.',
    version:'DevinX Mentoring 1.0.31 · Windows 10/11 64 Bit',
    language:'Sprache'
  },
  ar:{
    eyebrow:'DEVINX · وصول مؤقت',
    title:'اربط الكمبيوتر بالمدرّس',
    lead:'افتح هذه الصفحة على الكمبيوتر المتصل بـ LightBurn. لا تحتاج إلى حساب أو تثبيت دائم.',
    step1:'نزّل برنامج الوصول المؤقت.',
    step2:'انقر مرتين على الملف الذي تم تنزيله.',
    step3:'أرسل للمدرّس الرمز المكوّن من 8 أحرف.',
    button:'تنزيل الوصول المؤقت',
    note:'لا يعمل تلقائياً مع بدء ويندوز وينتهي عند إنهاء الجلسة المؤقتة.',
    security:'لا يستطيع المدرّس الاتصال إلا بعد فتح البرنامج ومشاركة الرمز المؤقت.',
    version:'DevinX Mentoria 1.0.31 · Windows 10/11 64-bit',
    language:'اللغة'
  }
};

export function MentorDownloadPage(){
  const{locale}=useI18n();
  const c=copy[locale];
  return <main className={styles.page}>
    <section className={styles.card}>
      <div className={styles.top}>
        <div><small>{c.eyebrow}</small><span>{c.version}</span></div>
        <div className={styles.language}><em>{c.language}</em><LanguageMenu/></div>
      </div>
      <h1>{c.title}</h1>
      <p className={styles.lead}>{c.lead}</p>
      <div className={styles.steps}>
        {[c.step1,c.step2,c.step3].map((text,index)=><article key={text}>
          <b>{index+1}</b><span>{text}</span>
        </article>)}
      </div>
      <a className={styles.download} href={DOWNLOAD} download>{c.button}</a>
      <p className={styles.note}>{c.note}</p>
      <div className={styles.security}>🔒 {c.security}</div>
    </section>
  </main>;
}
