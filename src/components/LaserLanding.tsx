"use client";

import {useEffect,useState} from "react";
import {LanguageMenu} from "@/components/LanguageMenu";
import {useI18n} from "@/i18n/provider";
import {createClient} from "@/lib/supabase/client";
import styles from "./LaserLanding.module.css";

const BR={
  heroTag:"DEVINX LASER CONTROL · LIGHTBURN REMOTO",hero1:"Seu LightBurn.",hero2:"Onde você estiver.",
  intro:"Acompanhe a tela ao vivo, use os principais comandos, edite com toque, mouse e teclado e atenda alunos à distância sem transformar o processo em uma instalação complicada.",
  access:"Entrar no Laser Control",guide:"Guia completo",agent:"Acesso do aluno",
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
  mentorFacts:["Código válido por 30 minutos para conectar","Sessão temporária de até 6 horas","10 sessões incluídas no plano Mentor","Pacote extra de +5 sessões disponível somente dentro do plano Mentor","1 atendimento ativo por vez","LightBurn precisa estar aberto no PC do aluno/origem"],
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
    ["MENTOR","R$ 59,90","Controle próprio + mentoria remota","1 PC · 10 sessões por ciclo","https://pay.kiwify.com.br/qVRSFCL","Assinar Mentor"]
  ],
  support:"Suporte por e-mail",home:"Voltar ao DevinX",already:"Já tenho acesso"
} as const;

const INTL={
  heroTag:"DEVINX LASER CONTROL · REMOTE LIGHTBURN",hero1:"Your LightBurn.",hero2:"Wherever you are.",
  intro:"See the live screen, use essential commands, edit with touch, mouse and the DevinX keyboard, and mentor students remotely without turning setup into a technical obstacle.",
  access:"Open Laser Control",guide:"Complete guide",agent:"Student access",
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
  mentorFacts:["Code valid for 30 minutes to connect","Temporary session up to 6 hours","10 sessions included with Mentor","A +5 session pack is available only inside the Mentor plan","1 active mentoring session at a time","LightBurn must be open on the student/source PC"],
  how:"HOW IT WORKS",steps:[
    ["01","Install the Agent","On your main computer, download the EXE, run it and pair the computer once."],
    ["02","Open LightBurn","The Agent detects the app and keeps the computer available in Laser Control."],
    ["03","Take control","Open the panel on your phone or another computer, select the PC and start the live view."]
  ],
  plansTag:"INTERNATIONAL ACCESS",plansTitle:"Choose the access that fits your workflow.",period:"/30 days",
  purchaseTitle:"How access is activated after purchase",
  purchaseSteps:["Choose a plan and complete payment on Kiwify.","Use the same purchase email for your DevinX account.","On the confirmation page, open Laser Control. If you do not have an account yet, create one with that same email.","Approved purchases are recognized automatically."],
  plans:[
    ["CONTROL","US$ 8.90","Remote access to your LightBurn","1 PC · 30 days","https://pay.kiwify.com/nuY5IsV?region=intl","Get Control"],
    ["MENTOR","US$ 17.90","Personal control + remote mentoring","1 PC · 30 days · 10 sessions","https://pay.kiwify.com/aIbUTmG?region=intl","Get Mentor"]
  ],
  support:"Email support",home:"Back to DevinX",already:"I already have access"
} as const;


const ES={
  heroTag:"DEVINX LASER CONTROL · LIGHTBURN REMOTO",hero1:"Tu LightBurn.",hero2:"Donde estés.",
  intro:"Mira la pantalla en vivo, usa los comandos principales, edita con toque, ratón y teclado y atiende alumnos a distancia sin convertir el proceso en una instalación complicada.",
  access:"Abrir Laser Control",guide:"Guía completa",agent:"Acceso del alumno",
  capabilities:"DEL PC DEL LÁSER A TU MANO",capabilityLead:"Un panel remoto creado alrededor de los controles que realmente importan al operar LightBurn.",
  features:[
    ["◉","Pantalla en vivo","Mira la ventana de LightBurn en tiempo real y sigue el estado del ordenador y de la máquina."],
    ["⌁","Control remoto","Toque, ratón, clic derecho, doble clic y teclado DevinX directamente sobre la transmisión."],
    ["⌖","Comandos de trabajo","Frame, Iniciar, Pausar y Parar permanecen cerca de la visualización."],
    ["⛶","Pantalla y navegación","Zoom, desplazamiento, pantalla completa y orientación Auto, Horizontal o Vertical."],
    ["✦","Herramientas LightBurn","Guardar, deshacer, rehacer, importar, Preview, rotativo, rastrear y ajustar imagen."],
    ["◎","Sesiones protegidas","El servidor valida acceso y permisos para mantener el control remoto ligado al plan activo."]
  ],
  remoteTag:"CONTROL REMOTO",remoteTitle:"Controla desde donde quieras.",remoteText:"Deja LightBurn abierto en el ordenador conectado a la máquina y usa otro dispositivo como panel remoto. El PC de origen conserva la conexión con el láser mientras tu móvil u otro ordenador se convierte en la interfaz.",
  mentorTag:"MENTORÍA",mentorTitle:"Profesor de un lado. Alumno del otro. LightBurn en medio.",mentorText:"El alumno abre DevinX Mentoria en el ordenador donde está LightBurn, recibe un código temporal y se lo envía al profesor. El profesor se conecta por Laser Control sin sustituir el Agent permanente del alumno.",
  mentorFacts:["Código válido durante 30 minutos para conectar","Sesión temporal de hasta 6 horas","10 sesiones incluidas en el plan Mentor","Paquete extra de +5 sesiones disponible solo dentro del plan Mentor","1 sesión de mentoría activa a la vez","LightBurn debe estar abierto en el PC del alumno/origen"],
  how:"CÓMO FUNCIONA",steps:[
    ["01","Instala el Agent","En tu ordenador principal, descarga el EXE, ejecútalo y vincula el PC una sola vez."],
    ["02","Abre LightBurn","El Agent detecta la aplicación y mantiene el ordenador disponible en Laser Control."],
    ["03","Controla","Abre el panel en el móvil u otro PC, selecciona el ordenador e inicia la pantalla en vivo."]
  ],
  plansTag:"ACCESO INTERNACIONAL",plansTitle:"Elige el acceso que encaja con tu uso.",period:"/30 días",
  purchaseTitle:"Cómo se activa el acceso después de la compra",
  purchaseSteps:["Elige un plan y completa el pago en Kiwify.","Usa en tu cuenta DevinX el mismo correo utilizado en la compra.","En la página de confirmación, abre Laser Control. Si todavía no tienes cuenta, créala con ese mismo correo.","Las compras aprobadas se reconocen automáticamente."],
  plans:[
    ["CONTROL","US$ 8.90","Control remoto de tu LightBurn","1 PC · 30 días","https://pay.kiwify.com/nuY5IsV?region=intl","Obtener Control"],
    ["MENTOR","US$ 17.90","Control propio + mentoría remota","1 PC · 30 días · 10 sesiones","https://pay.kiwify.com/aIbUTmG?region=intl","Obtener Mentor"]
  ],
  support:"Soporte por correo",home:"Volver a DevinX",already:"Ya tengo acceso"
} as const;

const FR={
  heroTag:"DEVINX LASER CONTROL · LIGHTBURN À DISTANCE",hero1:"Votre LightBurn.",hero2:"Où que vous soyez.",
  intro:"Suivez l’écran en direct, utilisez les commandes principales, modifiez avec le tactile, la souris et le clavier, et accompagnez vos élèves à distance sans installation compliquée.",
  access:"Ouvrir Laser Control",guide:"Guide complet",agent:"Accès élève",
  capabilities:"DU PC LASER À VOTRE MAIN",capabilityLead:"Un espace distant conçu autour des commandes essentielles pour piloter LightBurn.",
  features:[
    ["◉","Écran en direct","Visualisez la fenêtre LightBurn en temps réel et suivez l’état de l’ordinateur et de la machine."],
    ["⌁","Contrôle à distance","Tactile, souris, clic droit, double clic et clavier DevinX directement sur le flux."],
    ["⌖","Commandes de travail","Frame, Démarrer, Pause et Arrêter restent proches de la vue en direct."],
    ["⛶","Affichage et navigation","Zoom, déplacement, plein écran et orientation Auto, Paysage ou Portrait."],
    ["✦","Outils LightBurn","Enregistrer, annuler, rétablir, importer, Preview, rotatif, vectoriser et ajuster l’image."],
    ["◎","Sessions protégées","Le serveur valide l’accès et les permissions pour lier le contrôle distant au plan actif."]
  ],
  remoteTag:"CONTRÔLE À DISTANCE",remoteTitle:"Contrôlez où que vous soyez.",remoteText:"Laissez LightBurn ouvert sur l’ordinateur connecté à la machine et utilisez un autre appareil comme panneau distant. Le PC source conserve la connexion au laser tandis que votre téléphone ou un autre ordinateur devient l’interface.",
  mentorTag:"MENTORAT",mentorTitle:"Le professeur d’un côté. L’élève de l’autre. LightBurn entre les deux.",mentorText:"L’élève ouvre DevinX Mentoria sur l’ordinateur où tourne LightBurn, reçoit un code temporaire et l’envoie au professeur. Le professeur se connecte via Laser Control sans remplacer l’Agent permanent de l’élève.",
  mentorFacts:["Code valable 30 minutes pour se connecter","Session temporaire jusqu’à 6 heures","10 sessions incluses avec Mentor","Pack supplémentaire de +5 sessions disponible uniquement avec Mentor","1 session de mentorat active à la fois","LightBurn doit être ouvert sur le PC élève/source"],
  how:"COMMENT ÇA MARCHE",steps:[
    ["01","Installez l’Agent","Sur votre ordinateur principal, téléchargez l’EXE, lancez-le et associez le PC une seule fois."],
    ["02","Ouvrez LightBurn","L’Agent détecte l’application et maintient l’ordinateur disponible dans Laser Control."],
    ["03","Contrôlez","Ouvrez le panneau sur votre téléphone ou un autre PC, choisissez l’ordinateur et lancez la vue en direct."]
  ],
  plansTag:"ACCÈS INTERNATIONAL",plansTitle:"Choisissez l’accès adapté à votre utilisation.",period:"/30 jours",
  purchaseTitle:"Activation après l’achat",
  purchaseSteps:["Choisissez un plan et terminez le paiement sur Kiwify.","Utilisez le même e-mail pour l’achat et votre compte DevinX.","Sur la page de confirmation, ouvrez Laser Control. Si vous n’avez pas encore de compte, créez-le avec ce même e-mail.","Les achats approuvés sont reconnus automatiquement."],
  plans:[
    ["CONTROL","US$ 8.90","Contrôle à distance de votre LightBurn","1 PC · 30 jours","https://pay.kiwify.com/nuY5IsV?region=intl","Obtenir Control"],
    ["MENTOR","US$ 17.90","Contrôle personnel + mentorat à distance","1 PC · 30 jours · 10 sessions","https://pay.kiwify.com/aIbUTmG?region=intl","Obtenir Mentor"]
  ],
  support:"Support par e-mail",home:"Retour à DevinX",already:"J’ai déjà accès"
} as const;

const DE={
  heroTag:"DEVINX LASER CONTROL · LIGHTBURN REMOTE",hero1:"Ihr LightBurn.",hero2:"Wo immer Sie sind.",
  intro:"Sehen Sie den Live-Bildschirm, nutzen Sie die wichtigsten Befehle, bearbeiten Sie per Touch, Maus und Tastatur und betreuen Sie Schüler aus der Ferne ohne komplizierte Einrichtung.",
  access:"Laser Control öffnen",guide:"Vollständige Anleitung",agent:"Schülerzugang",
  capabilities:"VOM LASER-PC IN IHRE HAND",capabilityLead:"Eine Remote-Oberfläche rund um die Bedienelemente, die bei LightBurn wirklich wichtig sind.",
  features:[
    ["◉","Live-Bildschirm","Sehen Sie das LightBurn-Fenster in Echtzeit und verfolgen Sie den Status von Computer und Maschine."],
    ["⌁","Fernsteuerung","Touch, Maus, Rechtsklick, Doppelklick und DevinX-Tastatur direkt auf dem Stream."],
    ["⌖","Arbeitsbefehle","Frame, Start, Pause und Stopp bleiben nah an der Live-Ansicht."],
    ["⛶","Ansicht und Navigation","Zoom, Verschieben, Vollbild und Ausrichtung Auto, Querformat oder Hochformat."],
    ["✦","LightBurn-Werkzeuge","Speichern, Rückgängig, Wiederholen, Importieren, Preview, Rotary, Nachzeichnen und Bildanpassung."],
    ["◎","Geschützte Sitzungen","Serverseitige Zugriffs- und Rechteprüfung bindet die Fernsteuerung an den aktiven Plan."]
  ],
  remoteTag:"FERNSTEUERUNG",remoteTitle:"Steuern Sie von überall.",remoteText:"Lassen Sie LightBurn auf dem mit der Maschine verbundenen Computer geöffnet und verwenden Sie ein anderes Gerät als Fernbedienung. Der Quell-PC behält die Laser-Verbindung, während Ihr Smartphone oder ein anderer Computer zur Oberfläche wird.",
  mentorTag:"MENTORING",mentorTitle:"Lehrer auf der einen Seite. Schüler auf der anderen. LightBurn dazwischen.",mentorText:"Der Schüler öffnet DevinX Mentoria auf dem LightBurn-PC, erhält einen temporären Code und sendet ihn an den Lehrer. Der Lehrer verbindet sich über Laser Control, ohne den permanenten Agent des Schülers zu ersetzen.",
  mentorFacts:["Code 30 Minuten lang zum Verbinden gültig","Temporäre Sitzung bis zu 6 Stunden","10 Sitzungen im Mentor-Plan enthalten","+5-Sitzungen-Paket nur innerhalb des Mentor-Plans verfügbar","1 aktive Mentor-Sitzung gleichzeitig","LightBurn muss auf dem Schüler-/Quell-PC geöffnet sein"],
  how:"SO FUNKTIONIERT ES",steps:[
    ["01","Agent installieren","Laden Sie auf Ihrem Hauptcomputer die EXE herunter, starten Sie sie und koppeln Sie den PC einmal."],
    ["02","LightBurn öffnen","Der Agent erkennt die Anwendung und hält den Computer in Laser Control verfügbar."],
    ["03","Steuern","Öffnen Sie das Panel auf dem Smartphone oder einem anderen PC, wählen Sie den Computer und starten Sie die Live-Ansicht."]
  ],
  plansTag:"INTERNATIONALER ZUGANG",plansTitle:"Wählen Sie den Zugang, der zu Ihrer Nutzung passt.",period:"/30 Tage",
  purchaseTitle:"So wird der Zugang nach dem Kauf aktiviert",
  purchaseSteps:["Wählen Sie einen Plan und schließen Sie die Zahlung bei Kiwify ab.","Verwenden Sie für Ihr DevinX-Konto dieselbe E-Mail-Adresse wie beim Kauf.","Öffnen Sie auf der Bestätigungsseite Laser Control. Falls Sie noch kein Konto haben, erstellen Sie eines mit derselben E-Mail-Adresse.","Genehmigte Käufe werden automatisch erkannt."],
  plans:[
    ["CONTROL","US$ 8.90","Fernzugriff auf Ihr LightBurn","1 PC · 30 Tage","https://pay.kiwify.com/nuY5IsV?region=intl","Control kaufen"],
    ["MENTOR","US$ 17.90","Eigene Steuerung + Remote-Mentoring","1 PC · 30 Tage · 10 Sitzungen","https://pay.kiwify.com/aIbUTmG?region=intl","Mentor kaufen"]
  ],
  support:"E-Mail-Support",home:"Zurück zu DevinX",already:"Ich habe bereits Zugang"
} as const;

const AR={
  heroTag:"DEVINX LASER CONTROL · LIGHTBURN عن بُعد",hero1:"LightBurn الخاص بك.",hero2:"أينما كنت.",
  intro:"شاهد الشاشة مباشرة، واستخدم الأوامر الأساسية، وعدّل باللمس والماوس ولوحة المفاتيح، ودرّب الطلاب عن بُعد من دون إعداد معقد.",
  access:"فتح Laser Control",guide:"الدليل الكامل",agent:"وصول الطالب",
  capabilities:"من كمبيوتر الليزر إلى يدك",capabilityLead:"لوحة تحكم عن بُعد مبنية حول الأدوات التي تحتاجها فعلاً عند تشغيل LightBurn.",
  features:[
    ["◉","شاشة مباشرة","شاهد نافذة LightBurn في الوقت الحقيقي وتابع حالة الكمبيوتر والآلة."],
    ["⌁","تحكم عن بُعد","اللمس والماوس والنقرة اليمنى والنقرة المزدوجة ولوحة مفاتيح DevinX مباشرة على البث."],
    ["⌖","أوامر العمل","تبقى أوامر Frame وStart وPause وStop قريبة من العرض المباشر."],
    ["⛶","العرض والتنقل","تكبير وتحريك وملء الشاشة واتجاه تلقائي أو أفقي أو عمودي."],
    ["✦","أدوات LightBurn","حفظ وتراجع وإعادة واستيراد وPreview والمحور الدوار والتتبع وضبط الصورة."],
    ["◎","جلسات محمية","يتحقق الخادم من الوصول والصلاحيات لربط التحكم عن بُعد بالخطة النشطة."]
  ],
  remoteTag:"التحكم عن بُعد",remoteTitle:"تحكم من أي مكان.",remoteText:"اترك LightBurn مفتوحاً على الكمبيوتر المتصل بالآلة واستخدم جهازاً آخر كلوحة تحكم عن بُعد. يبقى الكمبيوتر الأصلي مسؤولاً عن اتصال الليزر بينما يصبح هاتفك أو كمبيوتر آخر واجهة التحكم.",
  mentorTag:"الإرشاد",mentorTitle:"المدرّس في جهة. والطالب في جهة. وLightBurn بينهما.",mentorText:"يفتح الطالب DevinX Mentoria على الكمبيوتر الذي يعمل عليه LightBurn، ويحصل على رمز مؤقت ويرسله للمدرّس. يتصل المدرّس عبر Laser Control من دون استبدال Agent الدائم للطالب.",
  mentorFacts:["الرمز صالح لمدة 30 دقيقة للاتصال","جلسة مؤقتة حتى 6 ساعات","10 جلسات مشمولة في خطة Mentor","حزمة +5 جلسات إضافية متاحة فقط داخل خطة Mentor","جلسة إرشاد نشطة واحدة في الوقت نفسه","يجب أن يكون LightBurn مفتوحاً على كمبيوتر الطالب/المصدر"],
  how:"كيف يعمل",steps:[
    ["01","ثبّت Agent","على الكمبيوتر الرئيسي نزّل ملف EXE وشغّله واربط الكمبيوتر مرة واحدة."],
    ["02","افتح LightBurn","يتعرّف Agent على التطبيق ويبقي الكمبيوتر متاحاً داخل Laser Control."],
    ["03","ابدأ التحكم","افتح اللوحة على الهاتف أو كمبيوتر آخر، واختر الكمبيوتر وابدأ العرض المباشر."]
  ],
  plansTag:"الوصول الدولي",plansTitle:"اختر الوصول المناسب لاستخدامك.",period:"/30 يوماً",
  purchaseTitle:"كيف يتم تفعيل الوصول بعد الشراء",
  purchaseSteps:["اختر الخطة وأكمل الدفع عبر Kiwify.","استخدم في حساب DevinX البريد الإلكتروني نفسه المستخدم في الشراء.","في صفحة التأكيد افتح Laser Control. إذا لم يكن لديك حساب، أنشئه بالبريد نفسه.","يتم التعرف على عمليات الشراء المعتمدة تلقائياً."],
  plans:[
    ["CONTROL","US$ 8.90","تحكم عن بُعد في LightBurn","كمبيوتر واحد · 30 يوماً","https://pay.kiwify.com/nuY5IsV?region=intl","الحصول على Control"],
    ["MENTOR","US$ 17.90","تحكم شخصي + إرشاد عن بُعد","كمبيوتر واحد · 30 يوماً · 10 جلسات","https://pay.kiwify.com/aIbUTmG?region=intl","الحصول على Mentor"]
  ],
  support:"الدعم عبر البريد",home:"العودة إلى DevinX",already:"لدي وصول بالفعل"
} as const;

const LANDING_COPY={"pt-BR":BR,en:INTL,es:ES,fr:FR,de:DE,ar:AR} as const;
const AUX={
  "pt-BR":{signOut:"Sair / Trocar conta",noticeTitle:"Esta conta ainda não tem acesso ao Laser Control.",noticeText:"Escolha um plano abaixo ou saia para entrar com outra conta.",professional:"MAIS COMPLETO",bottom:"Pronto quando seu LightBurn estiver.",supportBody:"Versão do Agent:\nVersão do LightBurn:\nWindows:\nProblema:\n",mockPc:"PC OFICINA",mockOnline:"● online",mockConnected:"LightBurn conectado",mockMachine:"Máquina pronta",mockLive:"LIGHTBURN · AO VIVO",mockFrame:"Frame",mockStart:"Iniciar",mockPause:"Pausar",mockStop:"Parar"},
  en:{signOut:"Sign out / Switch account",noticeTitle:"This account does not have Laser Control access yet.",noticeText:"Choose a plan below or sign out to enter with another account.",professional:"PROFESSIONAL",bottom:"Ready when your LightBurn is.",supportBody:"Agent version:\nLightBurn version:\nWindows:\nIssue:\n",mockPc:"WORKSHOP PC",mockOnline:"● online",mockConnected:"LightBurn connected",mockMachine:"Machine ready",mockLive:"LIGHTBURN · LIVE VIEW",mockFrame:"Frame",mockStart:"Start",mockPause:"Pause",mockStop:"Stop"},
  es:{signOut:"Salir / Cambiar cuenta",noticeTitle:"Esta cuenta todavía no tiene acceso a Laser Control.",noticeText:"Elige un plan abajo o cierra sesión para entrar con otra cuenta.",professional:"PROFESIONAL",bottom:"Listo cuando tu LightBurn lo esté.",supportBody:"Versión del Agent:\nVersión de LightBurn:\nWindows:\nProblema:\n",mockPc:"PC TALLER",mockOnline:"● en línea",mockConnected:"LightBurn conectado",mockMachine:"Máquina lista",mockLive:"LIGHTBURN · EN VIVO",mockFrame:"Frame",mockStart:"Iniciar",mockPause:"Pausar",mockStop:"Parar"},
  fr:{signOut:"Déconnexion / Changer de compte",noticeTitle:"Ce compte n’a pas encore accès à Laser Control.",noticeText:"Choisissez un plan ci-dessous ou déconnectez-vous pour utiliser un autre compte.",professional:"PROFESSIONNEL",bottom:"Prêt dès que votre LightBurn l’est.",supportBody:"Version de l’Agent:\nVersion de LightBurn:\nWindows:\nProblème:\n",mockPc:"PC ATELIER",mockOnline:"● en ligne",mockConnected:"LightBurn connecté",mockMachine:"Machine prête",mockLive:"LIGHTBURN · EN DIRECT",mockFrame:"Frame",mockStart:"Démarrer",mockPause:"Pause",mockStop:"Arrêter"},
  de:{signOut:"Abmelden / Konto wechseln",noticeTitle:"Dieses Konto hat noch keinen Laser-Control-Zugang.",noticeText:"Wählen Sie unten einen Plan oder melden Sie sich ab, um ein anderes Konto zu verwenden.",professional:"PROFESSIONELL",bottom:"Bereit, sobald Ihr LightBurn bereit ist.",supportBody:"Agent-Version:\nLightBurn-Version:\nWindows:\nProblem:\n",mockPc:"WERKSTATT-PC",mockOnline:"● online",mockConnected:"LightBurn verbunden",mockMachine:"Maschine bereit",mockLive:"LIGHTBURN · LIVE",mockFrame:"Frame",mockStart:"Start",mockPause:"Pause",mockStop:"Stopp"},
  ar:{signOut:"تسجيل الخروج / تبديل الحساب",noticeTitle:"هذا الحساب لا يملك وصولاً إلى Laser Control بعد.",noticeText:"اختر خطة أدناه أو سجّل الخروج للدخول بحساب آخر.",professional:"احترافي",bottom:"جاهز عندما يكون LightBurn جاهزاً.",supportBody:"إصدار Agent:\nإصدار LightBurn:\nWindows:\nالمشكلة:\n",mockPc:"كمبيوتر الورشة",mockOnline:"● متصل",mockConnected:"LightBurn متصل",mockMachine:"الآلة جاهزة",mockLive:"LIGHTBURN · مباشر",mockFrame:"Frame",mockStart:"بدء",mockPause:"إيقاف مؤقت",mockStop:"إيقاف"}
} as const;

export function LaserLanding(){
  const{locale}=useI18n();
  const activeLocale=(locale in LANDING_COPY?locale:"pt-BR") as keyof typeof LANDING_COPY;
  const c=LANDING_COPY[activeLocale];
  const aux=AUX[activeLocale];
  const[loggedIn,setLoggedIn]=useState(false);
  const[accessNotice,setAccessNotice]=useState(false);\n  const[presentationOpen,setPresentationOpen]=useState(false);

  useEffect(()=>{
    const supabase=createClient();
    void supabase.auth.getSession().then((result:{data:{session:unknown|null}})=>setLoggedIn(Boolean(result.data.session)));
    try{setAccessNotice(new URLSearchParams(window.location.search).get("acesso")==="necessario")}catch{}
  },[]);

  async function signOutAndSwitch(){
    await createClient().auth.signOut();
    window.location.assign("/entrar?next=/laser-control");
  }
  const supportBody=encodeURIComponent(aux.supportBody);
  const presentationCopy=
    activeLocale==="pt-BR"?{button:"Apresentação",kind:"VÍDEO",close:"Fechar apresentação",aria:"Apresentação do Laser Control em português"}
    :activeLocale==="es"?{button:"Presentación",kind:"VÍDEO",close:"Cerrar presentación",aria:"Presentación de Laser Control en inglés"}
    :activeLocale==="fr"?{button:"Présentation",kind:"VIDÉO",close:"Fermer la présentation",aria:"Présentation de Laser Control en anglais"}
    :activeLocale==="de"?{button:"Präsentation",kind:"VIDEO",close:"Präsentation schließen",aria:"Laser Control Präsentation auf Englisch"}
    :activeLocale==="ar"?{button:"عرض تقديمي",kind:"فيديو",close:"إغلاق العرض",aria:"عرض Laser Control باللغة الإنجليزية"}
    :{button:"Presentation",kind:"VIDEO",close:"Close presentation",aria:"Laser Control presentation in English"};
  // The retained media filenames are historically inverted; this mapping matches the actual audio/content used by the Home card.
  const presentationVideo=activeLocale==="pt-BR"
    ?"/media/laser-control-presentation-intl.mp4"
    :"/media/laser-control-presentation-pt.mp4";
  return <main key={activeLocale} className={styles.page} lang={activeLocale}>
    <header className={styles.header}>
      <a href="/" className={styles.brand}><b>DX</b><span>DEVINX <em>LASER CONTROL</em></span></a>
      <nav>
        <a href="/">{c.home}</a>
        <a href="/laser-control/guia">{c.guide}</a>
        {loggedIn&&<button className={styles.accountButton} type="button" onClick={()=>void signOutAndSwitch()}>{aux.signOut}</button>}
        <LanguageMenu/>
      </nav>
    </header>
    {accessNotice&&<section className={styles.accessNotice}>
      <div>
        <b>{aux.noticeTitle}</b>
        <p>{aux.noticeText}</p>
      </div>
      <button type="button" onClick={()=>void signOutAndSwitch()}>{aux.signOut}</button>
    </section>}
    <section className={styles.hero}>
      <div className={styles.heroCopy}>
        <span className={styles.tag}>{c.heroTag}</span><h1>{c.hero1}<br/><em>{c.hero2}</em></h1><p>{c.intro}</p>
        <div className={styles.heroActions}>
          <a className={styles.gold} href="/entrar?next=/laser-control">{c.access}</a>
          <a className={styles.dark} href="/laser-control/guia">{c.guide}</a>
          <a className={styles.dark} href="/laser-control/mentoria">{c.agent}</a>
          <button
            type="button"
            className={styles.presentationToggle}
            aria-expanded={presentationOpen}
            onClick={()=>setPresentationOpen(open=>!open)}
          >
            <span className={styles.videoIcon}>▶</span>
            <span><b>{presentationOpen?presentationCopy.close:presentationCopy.button}</b><small>{presentationCopy.kind}</small></span>
            <em>{presentationOpen?"⌃":"⌄"}</em>
          </button>
        </div>
        {presentationOpen&&<div className={styles.inlinePresentation}>
          <video
            className={styles.presentationVideo}
            src={presentationVideo}
            controls
            playsInline
            preload="metadata"
            aria-label={presentationCopy.aria}
          />
        </div>}
      </div>
    </section>\n    <section className={styles.featureSection}>
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
      <div className={styles.planGrid}>{c.plans.map(([name,price,desc,detail,href,cta],index)=><article key={name} className={index===1?styles.featuredPlan:""}>{index===1&&<small className={styles.best}>{aux.professional}</small>}<span>{name}</span><h3>{price}<em>{index===2?"":c.period}</em></h3><b>{desc}</b><p>{detail}</p><a href={href} target="_blank" rel="noreferrer">{cta}</a></article>)}</div>
    </section>
    <section className={styles.bottom}>
      <div><small>DEVINX LASER CONTROL</small><h2>{aux.bottom}</h2></div>
      <div className={styles.bottomActions}><a href="/entrar?next=/laser-control">{c.already}</a><a href={"mailto:vetorizeai.1@gmail.com?subject=DevinX%20Laser%20Control%20Support&body="+supportBody}>{c.support}</a><a href="/laser-control/guia">{c.guide}</a></div>
    </section>
  </main>;
}
