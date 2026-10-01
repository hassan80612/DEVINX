"use client";

import {useId,useState} from "react";
import {useI18n} from "@/i18n/provider";
import styles from "./LaserHomeCard.module.css";

const COPY={
  "pt-BR":{
    eyebrow:"DEVINX LASER CONTROL · CONTROLE REMOTO LIGHTBURN",
    title:"Controle seu LightBurn de onde quiser.",
    text:"Tela ao vivo, comandos remotos e mentoria em um ambiente criado para quem trabalha com laser. Use no celular, tablet ou em outro computador.",
    primary:"Conhecer Laser Control",secondary:"Já tenho acesso",guide:"Guia completo",
    independent:"PRODUTO INDEPENDENTE",sub:"Controle remoto + mentoria",
    featureTitle:"LASER CONTROL · CONTROLE, MENTORIA E FERRAMENTAS",
    features:["Tela do LightBurn ao vivo","Controle por celular ou computador","Toque, mouse e teclado DevinX","Frame, Iniciar, Pausar e Parar","Zoom, tela cheia e orientação","Salvar, Desfazer, Refazer e Importar","Preview e ferramentas de imagem","Rotativo e comandos do LightBurn","Mentoria professor e aluno","Código temporário de sessão","Agent Windows com inicialização automática","Sessão remota com controle de acesso"]
  },
  en:{
    eyebrow:"DEVINX LASER CONTROL · REMOTE LIGHTBURN",
    title:"Control your LightBurn from anywhere.",
    text:"Live view, remote commands and mentoring in one workspace built for laser professionals. Use it from your phone, tablet or another computer.",
    primary:"Explore Laser Control",secondary:"I already have access",guide:"Complete guide",
    independent:"INDEPENDENT PRODUCT",sub:"Remote control + mentoring",
    featureTitle:"LASER CONTROL · REMOTE CONTROL, MENTORING & TOOLS",
    features:["Live LightBurn screen","Control from phone or computer","Touch, mouse and DevinX keyboard","Frame, Start, Pause and Stop","Zoom, fullscreen and orientation","Save, Undo, Redo and Import","Preview and image tools","Rotary and LightBurn commands","Teacher-to-student mentoring","Temporary session code","Windows Agent with auto-start","Server-controlled remote access"]
  },
  es:{
    eyebrow:"DEVINX LASER CONTROL · LIGHTBURN REMOTO",
    title:"Controla tu LightBurn desde donde quieras.",
    text:"Pantalla en vivo, comandos remotos y mentoría en un solo espacio para quienes trabajan con láser. Úsalo desde el móvil, una tablet u otro ordenador.",
    primary:"Conocer Laser Control",secondary:"Ya tengo acceso",guide:"Guía completa",
    independent:"PRODUCTO INDEPENDIENTE",sub:"Control remoto + mentoría",
    featureTitle:"LASER CONTROL · CONTROL, MENTORÍA Y HERRAMIENTAS",
    features:["Pantalla de LightBurn en vivo","Control desde móvil u ordenador","Toque, ratón y teclado DevinX","Frame, Iniciar, Pausar y Parar","Zoom, pantalla completa y orientación","Guardar, Deshacer, Rehacer e Importar","Preview y herramientas de imagen","Rotativo y comandos de LightBurn","Mentoría profesor-alumno","Código temporal de sesión","Agent Windows con inicio automático","Acceso remoto controlado por el servidor"]
  },
  fr:{
    eyebrow:"DEVINX LASER CONTROL · LIGHTBURN À DISTANCE",
    title:"Contrôlez votre LightBurn où que vous soyez.",
    text:"Vue en direct, commandes distantes et mentorat dans un seul espace conçu pour les professionnels du laser. Utilisez-le sur téléphone, tablette ou autre ordinateur.",
    primary:"Découvrir Laser Control",secondary:"J’ai déjà accès",guide:"Guide complet",
    independent:"PRODUIT INDÉPENDANT",sub:"Contrôle à distance + mentorat",
    featureTitle:"LASER CONTROL · CONTRÔLE, MENTORAT ET OUTILS",
    features:["Écran LightBurn en direct","Contrôle depuis téléphone ou ordinateur","Tactile, souris et clavier DevinX","Frame, Démarrer, Pause et Arrêter","Zoom, plein écran et orientation","Enregistrer, Annuler, Rétablir et Importer","Preview et outils d’image","Rotatif et commandes LightBurn","Mentorat professeur-élève","Code de session temporaire","Agent Windows avec démarrage automatique","Accès distant contrôlé par le serveur"]
  },
  de:{
    eyebrow:"DEVINX LASER CONTROL · LIGHTBURN REMOTE",
    title:"Steuern Sie LightBurn von überall.",
    text:"Live-Ansicht, Fernbefehle und Mentoring in einer Oberfläche für Laser-Anwender. Nutzen Sie sie auf Smartphone, Tablet oder einem anderen Computer.",
    primary:"Laser Control ansehen",secondary:"Ich habe bereits Zugang",guide:"Vollständige Anleitung",
    independent:"EIGENSTÄNDIGES PRODUKT",sub:"Fernsteuerung + Mentoring",
    featureTitle:"LASER CONTROL · STEUERUNG, MENTORING UND WERKZEUGE",
    features:["Live-Bildschirm von LightBurn","Steuerung per Smartphone oder Computer","Touch, Maus und DevinX-Tastatur","Frame, Start, Pause und Stopp","Zoom, Vollbild und Ausrichtung","Speichern, Rückgängig, Wiederholen und Import","Preview und Bildwerkzeuge","Rotary und LightBurn-Befehle","Lehrer-Schüler-Mentoring","Temporärer Sitzungscode","Windows-Agent mit Autostart","Servergesteuerter Fernzugriff"]
  },
  ar:{
    eyebrow:"DEVINX LASER CONTROL · LIGHTBURN عن بُعد",
    title:"تحكم في LightBurn من أي مكان.",
    text:"عرض مباشر وأوامر عن بُعد وإرشاد في مساحة واحدة مصممة للعمل بالليزر. استخدمها من الهاتف أو الجهاز اللوحي أو كمبيوتر آخر.",
    primary:"التعرّف على Laser Control",secondary:"لدي وصول بالفعل",guide:"الدليل الكامل",
    independent:"منتج مستقل",sub:"تحكم عن بُعد + إرشاد",
    featureTitle:"LASER CONTROL · تحكم وإرشاد وأدوات",
    features:["شاشة LightBurn مباشرة","التحكم من الهاتف أو الكمبيوتر","اللمس والماوس ولوحة مفاتيح DevinX","Frame وStart وPause وStop","التكبير وملء الشاشة والاتجاه","حفظ وتراجع وإعادة واستيراد","Preview وأدوات الصور","المحور الدوار وأوامر LightBurn","إرشاد المدرّس والطالب","رمز جلسة مؤقت","Agent Windows مع تشغيل تلقائي","وصول عن بُعد يتحكم به الخادم"]
  }
} as const;

export function LaserHomeCard(){
  const{locale}=useI18n();
  const c=COPY[locale];
  const presentationId=useId();
  const[presentationOpen,setPresentationOpen]=useState(false);
  const isPortuguese=locale==="pt-BR";
  const presentation=isPortuguese
    ?{title:"Apresentação",expand:"Expandir",collapse:"Recolher",aria:"Apresentação do Laser Control em português"}
    :{title:"Presentation",expand:"Expand",collapse:"Collapse",aria:"Laser Control presentation in English"};
  const presentationVideo=isPortuguese
    ?"/media/laser-control-presentation-intl.mp4"
    :"/media/laser-control-presentation-pt.mp4";

  return <section id="laser-control" className={styles.shell} lang={locale} aria-label="DevinX Laser Control">
    <div className={styles.glow} aria-hidden="true"/>
    <div className={styles.topline}>
      <div className={styles.independent}>
        <b>{c.independent}</b>
        <span>{c.sub}</span>
      </div>
      <button
        type="button"
        className={styles.presentationToggle}
        aria-expanded={presentationOpen}
        aria-controls={presentationId}
        onClick={()=>setPresentationOpen(open=>!open)}
      >
        <span className={styles.presentationTitle}>▶ {presentation.title}</span>
        <span className={styles.presentationAction}>{presentationOpen?presentation.collapse:presentation.expand}</span>
      </button>
    </div>
    <div id={presentationId} className={styles.presentationPanel} hidden={!presentationOpen}>
      {presentationOpen&&<video
        className={styles.presentationVideo}
        src={presentationVideo}
        width="590"
        height="1280"
        controls
        playsInline
        preload="metadata"
        aria-label={presentation.aria}
      />}
    </div>
    <div className={styles.copy}>
      <span className={styles.tag}><i></i>{c.eyebrow}</span>
      <h2>{c.title}</h2>
      <p>{c.text}</p>
      <div className={styles.actions}>
        <a className={styles.primary} href="/laser-control/conhecer" aria-label={c.primary}>{c.primary}</a>
        <a className={styles.secondary} href="/entrar?next=/laser-control">{c.secondary}</a>
      </div>
      <a className={styles.accessButton} href="/laser-control/guia">{c.guide} →</a>
    </div>
    <section className={styles.featureSection}>
      <div className={styles.featureTitle}>{c.featureTitle}</div>
      <div className={styles.featureGrid}>
        {c.features.map(item=><div className={styles.featureLine} key={item}><i aria-hidden="true"></i><strong>{item}</strong></div>)}
      </div>
    </section>
  </section>;
}
