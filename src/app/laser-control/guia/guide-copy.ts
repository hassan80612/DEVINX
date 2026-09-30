import type {Locale} from '@/i18n/catalogs';

export type GuideItem={title:string;text:string};
export type GuideSection={title:string;lead?:string;items:GuideItem[]};
export type GuideCopy={
  eyebrow:string;title:string;lead:string;version:string;download:string;open:string;language:string;
  warning:string;sections:GuideSection[];footer:string;
};

export const guideCopy:Record<Locale,GuideCopy>={
  "pt-BR":{
    eyebrow:"DEVINX LASER CONTROL",
    title:"Guia completo do Laser Control",
    lead:"Instale o Agent, conecte o LightBurn e controle a tela pelo celular ou por outro computador com o fluxo correto, sem adivinhação.",
    version:"Atualizado para o DevinX Laser Agent 1.1.6",
    download:"Baixar Agent 1.1.6 para Windows",
    open:"Abrir Laser Control",
    language:"Idioma do guia",
    warning:"O DevinX envia comandos ao LightBurn, mas não substitui supervisão física, intertravamentos, tampa, exaustão nem botão de emergência.",
    sections:[
      {title:"1. Instalação e primeiro vínculo",lead:"Faça isso uma vez no computador que fica ligado à máquina.",items:[
        {title:"Baixe o EXE",text:"Use Windows 10 ou 11 de 64 bits e baixe DevinX-Laser-Agent-1.1.6.exe pelo botão acima."},
        {title:"Abra o EXE",text:"Dê dois cliques em DevinX-Laser-Agent-1.1.6.exe. A instalação começa pelo próprio arquivo."},
        {title:"Instalação automática",text:"O próprio EXE instala ou atualiza o Agent no seu usuário do Windows e configura a inicialização automática."},
        {title:"Vincule o computador",text:"Na primeira execução o navegador abre o DevinX. Confirme o vínculo uma única vez. Atualizações futuras preservam esse vínculo."},
        {title:"Abra o LightBurn",text:"Deixe o LightBurn aberto normalmente. O Agent detecta o aplicativo e acompanha o estado da conexão com a máquina."},
        {title:"Confirme o status",text:"No Laser Control, o computador deve aparecer online. A tela ao vivo começa quando você abre uma sessão remota."}
      ]},
      {title:"2. Uso diário da tela ao vivo",lead:"Os controles principais ficam ao redor da própria imagem do LightBurn.",items:[
        {title:"Controle ligado",text:"Ative Controle para enviar toque, mouse e teclado ao LightBurn. No 1.1.6 ele continua ativo ao entrar e sair da tela cheia."},
        {title:"Tela cheia",text:"Tela cheia amplia somente a imagem remota. Auto, Horizontal e Vertical controlam a orientação quando o navegador permite."},
        {title:"Setas",text:"As setas ↑ ← → ↓ ficam junto da imagem e movem a seleção no workspace do LightBurn. O botão ⊙ de recentralizar fica na barra superior do projeto."},
        {title:"Projeto e visualização",text:"Os botões compactos no topo permitem Salvar, Desfazer, Refazer, Importar/Abrir e abrir o Preview."},
        {title:"Estado em tempo real",text:"O Agent envia presença, conexão do LightBurn e da máquina e estado do trabalho. O vídeo é transmitido apenas durante a sessão remota."}
      ]},
      {title:"3. Toque, zoom e teclado",lead:"Os gestos do celular são separados da edição do LightBurn.",items:[
        {title:"Toque simples",text:"Um toque envia um clique único ao LightBurn. Funciona na tela normal e na tela cheia quando Controle está ligado."},
        {title:"Duplo toque",text:"Use dois toques rápidos quando o LightBurn exigir duplo clique para abrir um editor ou uma configuração."},
        {title:"Zoom",text:"Use − / 100% / + ou pinça com dois dedos. O zoom altera apenas a visualização remota, não o projeto."},
        {title:"Mover a imagem ampliada",text:"Com zoom acima de 100%, arraste com um dedo para navegar pela imagem ampliada sem mover a arte."},
        {title:"Teclado DevinX",text:"Primeiro foque o campo desejado e toque em Teclado. O teclado compacto do DevinX abre abaixo da transmissão e o teclado nativo do celular não deve aparecer. O envio não pressiona Enter automaticamente."},
        {title:"Editar na tela",text:"Quando uma versão do LightBurn não expõe valores pela acessibilidade, use Editar na tela e trabalhe diretamente na interface transmitida."}
      ]},
      {title:"4. Frame, Iniciar, Pausar e Parar",lead:"Comandos de máquina ficam separados das ferramentas de edição.",items:[
        {title:"Frame / Encerrar",text:"Em Galvo, o Agent usa Live Framing por F1. Em Diodo, procura o botão Frame da janela Laser. Supervisione a máquina."},
        {title:"Iniciar",text:"Iniciar pede confirmação. Confira material, foco, origem, potência e área antes de confirmar."},
        {title:"Pausar",text:"Pausar envia o comando correspondente. Verifique na tela e fisicamente se a máquina realmente pausou."},
        {title:"Parar",text:"Parar envia o comando de interrupção. Em emergência real, use o botão físico de emergência."},
        {title:"Confirmação do Agent",text:"A confirmação significa que o comando chegou ao Windows/LightBurn; não é garantia física de movimento, laser ou resultado."}
      ]},
      {title:"5. Ferramentas do LightBurn",lead:"Sem funções repetidas: cada ferramenta aparece uma vez.",items:[
        {title:"Rotativo",text:"Configurar rotativo abre a configuração correspondente no LightBurn. Ajuste os campos na própria tela remota quando necessário."},
        {title:"Rastrear imagem",text:"Selecione a imagem no LightBurn e abra a ferramenta de vetorização do próprio LightBurn."},
        {title:"Ajustar imagem",text:"Abre o ajuste de imagem do LightBurn para a imagem selecionada."},
        {title:"Mais ferramentas",text:"Reúne funções menos frequentes, como Selecionar tudo, Espelhar horizontal/vertical e Editar na tela."},
        {title:"Compatibilidade",text:"Versões do LightBurn expõem controles de formas diferentes. O DevinX usa API local quando disponível e automação/acessibilidade do Windows como fallback."}
      ]},
      {title:"6. Mentoria e acesso temporário",lead:"Para professor, suporte ou assistência sem substituir o vínculo permanente.",items:[
        {title:"Modo Mentoria",text:"O aluno abre o link recebido por e-mail e baixa DevinX-Mentoria-1.1.6.exe. O modo temporário é separado do Agent permanente e não instala inicialização automática. Antes de enviar o código, o PC do aluno/origem precisa estar com o LightBurn aberto."},
        {title:"Código de acesso",text:"O aluno envia ao professor o código de 8 caracteres. O código vale 30 minutos para ser usado."},{title:"Sessões de mentoria",text:"O plano Mentor inclui 10 sessões por período ativo. Cada nova conexão usa uma sessão. O pacote extra adiciona mais 5 sessões de mentoria e só pode ser comprado por quem já tem Mentor ativo. As 5 sessões expiram junto com o período atual do plano Mentor."},
        {title:"Duração da sessão",text:"Depois da conexão, a sessão temporária pode permanecer ativa por até 6 horas ou até ser encerrada."},
        {title:"Encerramento",text:"Ao encerrar a mentoria, o acesso temporário é revogado. Uma nova sessão exige um novo código."}
      ]},
      {title:"7. Atualizar e desinstalar",lead:"O vínculo fica salvo entre versões.",items:[
        {title:"Atualizar o Agent",text:"Baixe o EXE da versão nova e execute. Ele atualiza a instalação existente e preserva o vínculo."},
        {title:"Ver a versão",text:"O Laser Control mostra a versão reportada pelo computador. Para os recursos deste guia, use o Agent 1.1.6."},
        {title:"Desinstalar",text:"Abra o ícone do DevinX Laser Agent perto do relógio do Windows e escolha Desinstalar DevinX Laser Agent."},
        {title:"O que é removido",text:"A desinstalação remove inicialização automática, vínculo e chaves locais e os arquivos instalados do usuário."}
      ]},
      {title:"8. Privacidade, Windows e segurança",items:[
        {title:"Transmissão da tela",text:"A janela do LightBurn é transmitida durante a sessão remota. Os quadros ao vivo não são gravados no banco como histórico."},
        {title:"Acesso temporário",text:"As sessões usam tokens temporários e o controle remoto precisa estar habilitado para aceitar entrada."},
        {title:"Aviso do Windows",text:"Como a distribuição direta pode não ter certificado pago, Windows/SmartScreen pode mostrar Editor desconhecido. O Agent não precisa de administrador."},
        {title:"Segurança da máquina",text:"Nunca dependa só da tela remota. Mantenha alguém próximo à máquina durante Frame, testes e gravações."}
      ]},
      {title:"9. Se algo não responder",lead:"Verifique isso antes de reinstalar ou refazer vínculo.",items:[
        {title:"Agent offline",text:"Confirme se o ícone do Agent está ativo perto do relógio, se há internet e aguarde alguns segundos pelo próximo heartbeat."},
        {title:"LightBurn offline",text:"Abra o LightBurn e confirme que a máquina está conectada dentro do próprio LightBurn."},
        {title:"Tela sem controle",text:"Confirme que Controle está ligado. Sair da tela cheia não deve desligar o controle no Agent 1.1.6."},
        {title:"Toque fora do ponto",text:"Volte o zoom para 100%, confirme que a imagem está atualizando e tente novamente."},
        {title:"Campo não edita",text:"Foque o campo na tela primeiro e só depois abra o Teclado do DevinX. Algumas janelas exigem duplo clique."}
      ]}
    ],
    footer:"Se a sua versão do LightBurn se comportar de forma diferente, use a tela ao vivo como referência e não force um comando de máquina sem confirmação visual."
  },
  "en":{
    eyebrow:"DEVINX LASER CONTROL",title:"Complete Laser Control guide",lead:"Install the Agent, connect LightBurn and control the screen from a phone or another computer with a clear workflow.",version:"Updated for DevinX Laser Agent 1.1.6",download:"Download Agent 1.1.6 for Windows",open:"Open Laser Control",language:"Guide language",warning:"DevinX sends commands to LightBurn, but it does not replace physical supervision, interlocks, enclosure, extraction or an emergency stop.",
    sections:[
      {title:"1. Installation and first pairing",lead:"Do this once on the computer connected to the laser.",items:[
        {title:"Download the EXE",text:"Use 64-bit Windows 10 or 11 and download DevinX-Laser-Agent-1.1.6.exe."},{title:"Open the EXE",text:"Double-click the downloaded file. No archive, extraction step or command line is required."},{title:"Automatic setup",text:"The EXE installs or updates the Agent in your Windows user profile and configures automatic startup."},{title:"Pair the computer",text:"On first run, DevinX opens in the browser. Confirm the computer once; future updates keep this pairing."},{title:"Open LightBurn",text:"Keep LightBurn open normally. The Agent detects the application and machine connection."},{title:"Check status",text:"The computer should appear online in Laser Control. Live view starts when a remote session opens."}
      ]},
      {title:"2. Daily live-view use",lead:"Main controls stay around the LightBurn image.",items:[
        {title:"Control on",text:"Enable Control to send touch, mouse and keyboard input. In 1.1.6 it remains enabled when entering or leaving fullscreen."},{title:"Fullscreen",text:"Fullscreen enlarges only the remote image. Auto, Landscape and Portrait control orientation when supported."},{title:"Arrow pad",text:"The ↑ ← → ↓ pad next to the image moves the current LightBurn workspace selection. The ⊙ recenter control is in the top project toolbar."},{title:"Project actions",text:"Compact top buttons provide Save, Undo, Redo, Import/Open and Preview."},{title:"Live status",text:"The Agent reports presence, LightBurn/machine connection and job state. Video streams only during a remote session."}
      ]},
      {title:"3. Touch, zoom and keyboard",lead:"Phone gestures are separated from LightBurn editing.",items:[
        {title:"Single tap",text:"A single tap sends one click to LightBurn. It works in normal view and fullscreen while Control is enabled."},{title:"Double tap",text:"Use two quick taps where LightBurn requires a double-click."},{title:"Zoom",text:"Use − / 100% / + or pinch with two fingers. This changes only the remote view."},{title:"Pan while zoomed",text:"Above 100%, drag with one finger to move around the enlarged image without moving artwork."},{title:"DevinX keyboard",text:"Focus the target field first, then press Keyboard. The compact DevinX keyboard opens below the live view; the phone's native keyboard should not appear. Sending text does not automatically press Enter."},{title:"Edit on screen",text:"When LightBurn does not expose a field through accessibility, interact directly with the streamed interface."}
      ]},
      {title:"4. Frame, Start, Pause and Stop",lead:"Machine commands are separate from editing tools.",items:[
        {title:"Frame / End",text:"For Galvo, the Agent uses Live Framing through F1. For diode, it looks for the Frame button in the Laser window. Always supervise the machine."},{title:"Start",text:"Start requires confirmation. Check material, focus, origin, power and work area first."},{title:"Pause",text:"Pause sends the matching LightBurn command. Verify on-screen and physically that the machine paused."},{title:"Stop",text:"Stop sends the interruption command. In a real emergency, use the physical emergency stop."},{title:"Agent confirmation",text:"A successful response means the command reached Windows/LightBurn; it does not guarantee physical motion, laser emission or final result."}
      ]},
      {title:"5. LightBurn tools",lead:"No duplicated commands: each tool appears once.",items:[
        {title:"Rotary",text:"Rotary setup opens the corresponding LightBurn configuration. Edit fields on the remote screen when needed."},{title:"Trace image",text:"Select the image and open LightBurn's own tracing tool."},{title:"Adjust image",text:"Opens LightBurn image adjustment for the selected image."},{title:"More tools",text:"Contains less frequent actions such as Select all, Flip horizontal/vertical and Edit on screen."},{title:"Compatibility",text:"LightBurn versions expose controls differently. DevinX uses the local API when available and Windows automation/accessibility as fallback."}
      ]},
      {title:"6. Mentoring and temporary access",lead:"For teachers or support without replacing the permanent pairing.",items:[
        {title:"Mentor mode",text:"The student opens the email link and downloads DevinX-Mentoria-1.1.6.exe. Temporary mode is separate from the permanent Agent and does not install startup. Before sending the code, the student/source PC must have LightBurn open."},{title:"Access code",text:"The student sends the teacher the 8-character code. It is valid for 30 minutes."},{title:"Mentoring sessions",text:"Mentor includes 10 sessions per active period. The extra pack adds 5 mentoring sessions and is available only with an active Mentor plan. The 5 sessions expire with the current Mentor access period."},{title:"Session duration",text:"After connection, the temporary session can remain active for up to 6 hours or until ended."},{title:"End access",text:"Ending mentorship revokes temporary access. A new session requires a new code."}
      ]},
      {title:"7. Update and uninstall",lead:"Pairing is preserved between versions.",items:[
        {title:"Update Agent",text:"Download and run the new EXE. It updates the existing installation and preserves pairing."},{title:"Check version",text:"Laser Control shows the version reported by the computer. Use Agent 1.1.6 for this guide."},{title:"Uninstall",text:"Open the DevinX Laser Agent tray icon near the Windows clock and choose Uninstall DevinX Laser Agent."},{title:"What is removed",text:"Uninstall removes automatic startup, local pairing/keys and installed user files."}
      ]},
      {title:"8. Privacy, Windows and safety",items:[
        {title:"Screen streaming",text:"The LightBurn window is streamed during the remote session. Live frames are not stored in the database as history."},{title:"Temporary access",text:"Sessions use temporary tokens and remote control must be enabled before input is accepted."},{title:"Windows warning",text:"Direct distribution may show Unknown publisher/SmartScreen. The Agent does not require administrator privileges."},{title:"Machine safety",text:"Never rely on the remote screen alone. Keep someone near the machine during framing, tests and engraving."}
      ]},
      {title:"9. If something does not respond",lead:"Check these items before reinstalling or pairing again.",items:[
        {title:"Agent offline",text:"Check that the tray Agent is running, internet is available and wait a few seconds for the next heartbeat."},{title:"LightBurn offline",text:"Open LightBurn and confirm the machine is connected inside LightBurn."},{title:"Screen has no control",text:"Confirm Control is enabled. Leaving fullscreen should not disable control in Agent 1.1.6."},{title:"Tap lands incorrectly",text:"Reset zoom to 100%, confirm the image is updating and retry."},{title:"Field will not edit",text:"Focus the field first, then open the DevinX Keyboard. Some LightBurn windows require a double-click."}
      ]}
    ],
    footer:"If your LightBurn version behaves differently, use the live screen as the source of truth and do not force a machine command without visual confirmation."
  },
  "es":{
    eyebrow:"DEVINX LASER CONTROL",title:"Guía completa de Laser Control",lead:"Instala el Agent, conecta LightBurn y controla la pantalla desde el móvil u otro ordenador con un flujo claro.",version:"Actualizada para DevinX Laser Agent 1.1.6",download:"Descargar Agent 1.1.6 para Windows",open:"Abrir Laser Control",language:"Idioma de la guía",warning:"DevinX envía comandos a LightBurn, pero no sustituye la supervisión física, los enclavamientos, la cubierta, la extracción ni el paro de emergencia.",
    sections:[
      {title:"1. Instalación y primer vínculo",lead:"Hazlo una sola vez en el ordenador conectado al láser.",items:[
        {title:"Descarga el EXE",text:"Usa Windows 10 u 11 de 64 bits y descarga DevinX-Laser-Agent-1.1.6.exe."},{title:"Abre el EXE",text:"Haz doble clic en el archivo descargado. No necesitas extraer archivos ni usar comandos."},{title:"Instalación automática",text:"El EXE instala o actualiza el Agent y configura el inicio automático."},{title:"Vincula el ordenador",text:"En la primera ejecución se abre DevinX. Confirma el vínculo una vez; las actualizaciones lo conservan."},{title:"Abre LightBurn",text:"Mantén LightBurn abierto normalmente. El Agent detecta la aplicación y la conexión de la máquina."},{title:"Comprueba el estado",text:"El ordenador debe aparecer online en Laser Control. La vista en vivo comienza al abrir una sesión remota."}
      ]},
      {title:"2. Uso diario de la vista en vivo",lead:"Los controles principales quedan alrededor de la imagen de LightBurn.",items:[
        {title:"Control activado",text:"Activa Control para enviar toque, ratón y teclado. En 1.1.6 permanece activo al entrar o salir de pantalla completa."},{title:"Pantalla completa",text:"Amplía solo la imagen remota. Auto, Horizontal y Vertical controlan la orientación cuando el navegador lo permite."},{title:"Flechas",text:"Las flechas ↑ ← → ↓ junto a la imagen mueven la selección actual. El control ⊙ para recentrar está en la barra superior del proyecto."},{title:"Proyecto y Preview",text:"Los botones compactos ofrecen Guardar, Deshacer, Rehacer, Importar/Abrir y Preview."},{title:"Estado en vivo",text:"El Agent informa presencia, conexión LightBurn/máquina y estado del trabajo. El vídeo se transmite solo durante la sesión remota."}
      ]},
      {title:"3. Toque, zoom y teclado",lead:"Los gestos del móvil están separados de la edición.",items:[
        {title:"Toque simple",text:"Un toque envía un solo clic a LightBurn y funciona en vista normal y pantalla completa con Control activo."},{title:"Doble toque",text:"Usa dos toques rápidos cuando LightBurn necesite doble clic."},{title:"Zoom",text:"Usa − / 100% / + o pellizca con dos dedos. Solo cambia la vista remota."},{title:"Mover la vista ampliada",text:"Por encima de 100%, arrastra con un dedo para recorrer la imagen sin mover el diseño."},{title:"Teclado del móvil",text:"Enfoca primero el campo, luego pulsa Teclado, escribe y envía. Enviar texto no pulsa Enter automáticamente."},{title:"Editar en pantalla",text:"Si LightBurn no expone un campo por accesibilidad, trabaja directamente sobre la interfaz transmitida."}
      ]},
      {title:"4. Frame, Iniciar, Pausar y Parar",lead:"Los comandos de máquina están separados de las herramientas de edición.",items:[
        {title:"Frame / Finalizar",text:"En Galvo usa Live Framing mediante F1. En diodo busca el botón Frame de la ventana Laser. Supervisa siempre la máquina."},{title:"Iniciar",text:"Pide confirmación. Revisa material, foco, origen, potencia y área antes de confirmar."},{title:"Pausar",text:"Envía el comando correspondiente; verifica visual y físicamente que la máquina se haya pausado."},{title:"Parar",text:"Envía la interrupción. En una emergencia real usa el paro físico de emergencia."},{title:"Confirmación del Agent",text:"Confirma entrega a Windows/LightBurn, no garantiza movimiento físico, emisión láser ni resultado."}
      ]},
      {title:"5. Herramientas de LightBurn",lead:"Sin comandos repetidos: cada función aparece una vez.",items:[
        {title:"Rotativo",text:"Abre la configuración rotativa de LightBurn. Ajusta los campos en la pantalla remota cuando sea necesario."},{title:"Trazar imagen",text:"Selecciona la imagen y abre la herramienta de trazado propia de LightBurn."},{title:"Ajustar imagen",text:"Abre los ajustes de imagen de LightBurn para la imagen seleccionada."},{title:"Más herramientas",text:"Incluye Seleccionar todo, Voltear horizontal/vertical y Editar en pantalla."},{title:"Compatibilidad",text:"Las versiones de LightBurn exponen controles de manera distinta. DevinX usa API local cuando existe y automatización/accesibilidad de Windows como alternativa."}
      ]},
      {title:"6. Mentoría y acceso temporal",lead:"Para profesor o soporte sin cambiar el vínculo permanente.",items:[
        {title:"Modo Mentoría",text:"El alumno abre el enlace recibido por correo y descarga DevinX-Mentoria-1.1.6.exe. El modo temporal no cambia el Agent permanente."},{title:"Código",text:"El alumno envía el código de 8 caracteres al profesor. Es válido durante 30 minutos."},{title:"Sesiones de mentoría",text:"Mentor incluye 10 sesiones por período activo. El paquete extra añade 5 sesiones de mentoría y solo está disponible con Mentor activo. Las 5 sesiones vencen junto con el período actual de Mentor."},{title:"Duración",text:"Tras conectar, la sesión puede durar hasta 6 horas o hasta que se cierre."},{title:"Finalizar",text:"Al cerrar la mentoría se revoca el acceso temporal. Una nueva sesión necesita un código nuevo."}
      ]},
      {title:"7. Actualizar y desinstalar",lead:"El vínculo se conserva entre versiones.",items:[
        {title:"Actualizar",text:"Descarga y ejecuta el EXE nuevo. Actualiza la instalación y conserva el vínculo."},{title:"Versión",text:"Laser Control muestra la versión reportada por el ordenador. Para esta guía usa 1.1.6."},{title:"Desinstalar",text:"Abre el icono del Agent junto al reloj y elige Desinstalar DevinX Laser Agent."},{title:"Qué elimina",text:"Quita inicio automático, vínculo/claves locales y archivos instalados del usuario."}
      ]},
      {title:"8. Privacidad, Windows y seguridad",items:[
        {title:"Transmisión",text:"La ventana de LightBurn se transmite durante la sesión; los fotogramas en vivo no se guardan como historial."},{title:"Acceso temporal",text:"Las sesiones usan tokens temporales y el control debe estar activado para aceptar entrada."},{title:"Aviso de Windows",text:"La distribución directa puede mostrar Editor desconocido/SmartScreen. El Agent no necesita privilegios de administrador."},{title:"Seguridad",text:"No dependas solo de la pantalla remota. Mantén a alguien cerca durante Frame, pruebas y grabado."}
      ]},
      {title:"9. Si algo no responde",lead:"Comprueba esto antes de reinstalar.",items:[
        {title:"Agent offline",text:"Comprueba el icono del Agent, internet y espera unos segundos al siguiente heartbeat."},{title:"LightBurn offline",text:"Abre LightBurn y confirma la conexión de la máquina dentro de LightBurn."},{title:"Sin control",text:"Confirma que Control esté activado. Salir de pantalla completa no debe desactivarlo en 1.1.6."},{title:"Toque desalineado",text:"Vuelve el zoom a 100%, confirma que la imagen se actualiza y prueba de nuevo."},{title:"Campo no editable",text:"Enfoca primero el campo y después abre Teclado. Algunas ventanas requieren doble clic."}
      ]}
    ],
    footer:"Si tu versión de LightBurn se comporta de otra forma, usa la pantalla en vivo como referencia y no fuerces comandos de máquina sin confirmación visual."
  },
  "fr":{
    eyebrow:"DEVINX LASER CONTROL",title:"Guide complet de Laser Control",lead:"Installez l'Agent, connectez LightBurn et contrôlez l'écran depuis un téléphone ou un autre ordinateur avec un flux clair.",version:"Mis à jour pour DevinX Laser Agent 1.1.6",download:"Télécharger Agent 1.1.6 pour Windows",open:"Ouvrir Laser Control",language:"Langue du guide",warning:"DevinX envoie des commandes à LightBurn, mais ne remplace pas la surveillance physique, les sécurités, le capot, l'extraction ni l'arrêt d'urgence.",
    sections:[
      {title:"1. Installation et premier appairage",lead:"À faire une seule fois sur le PC connecté au laser.",items:[
        {title:"Télécharger l’EXE",text:"Utilisez Windows 10 ou 11 64 bits et téléchargez DevinX-Laser-Agent-1.1.6.exe."},{title:"Ouvrir l’EXE",text:"Double-cliquez sur le fichier téléchargé. Aucune extraction ni ligne de commande n’est nécessaire."},{title:"Installation automatique",text:"L’EXE installe ou met à jour l’Agent et configure le démarrage automatique."},{title:"Appairer le PC",text:"Au premier lancement, DevinX s'ouvre. Confirmez une fois; les mises à jour conservent cet appairage."},{title:"Ouvrir LightBurn",text:"Laissez LightBurn ouvert normalement. L'Agent détecte l'application et la connexion machine."},{title:"Vérifier le statut",text:"Le PC doit apparaître en ligne dans Laser Control. La vue en direct démarre lorsqu'une session distante est ouverte."}
      ]},
      {title:"2. Utilisation quotidienne",lead:"Les commandes principales restent autour de l'image LightBurn.",items:[
        {title:"Contrôle activé",text:"Activez Contrôle pour envoyer toucher, souris et clavier. En 1.1.6 il reste actif en entrant ou sortant du plein écran."},{title:"Plein écran",text:"Agrandit uniquement l'image distante. Auto, Horizontal et Vertical règlent l'orientation si le navigateur l'autorise."},{title:"Flèches",text:"Les flèches ↑ ← → ↓ près de l'image déplacent la sélection courante. Le contrôle ⊙ de recentrage se trouve dans la barre supérieure du projet."},{title:"Projet et Preview",text:"Les boutons compacts donnent accès à Enregistrer, Annuler, Rétablir, Importer/Ouvrir et Preview."},{title:"État en direct",text:"L'Agent transmet présence, connexion LightBurn/machine et état du travail. La vidéo n'est diffusée que pendant la session distante."}
      ]},
      {title:"3. Toucher, zoom et clavier",lead:"Les gestes sont séparés pour éviter les conflits avec LightBurn.",items:[
        {title:"Toucher simple",text:"Un toucher envoie un seul clic à LightBurn, en vue normale comme en plein écran lorsque Contrôle est actif."},{title:"Double toucher",text:"Utilisez deux touchers rapides quand LightBurn exige un double-clic."},{title:"Zoom",text:"Utilisez − / 100% / + ou pincez à deux doigts. Seule la vue distante change."},{title:"Déplacer la vue zoomée",text:"Au-dessus de 100%, faites glisser un doigt pour parcourir l'image agrandie sans déplacer le dessin."},{title:"Clavier DevinX",text:"Focalisez d'abord le champ puis ouvrez Clavier. Le clavier compact DevinX apparaît sous le flux et ne doit pas ouvrir le clavier natif du téléphone. L'envoi de texte n'appuie pas automatiquement sur Entrée."},{title:"Modifier à l'écran",text:"Si LightBurn n'expose pas un champ via l'accessibilité, interagissez directement avec l'interface diffusée."}
      ]},
      {title:"4. Frame, Démarrer, Pause et Arrêter",lead:"Les commandes machine sont séparées des outils d'édition.",items:[
        {title:"Frame / Terminer",text:"Galvo utilise Live Framing via F1. Pour diode, l'Agent cherche le bouton Frame de la fenêtre Laser. Surveillez toujours la machine."},{title:"Démarrer",text:"Demande confirmation. Vérifiez matériau, mise au point, origine, puissance et zone."},{title:"Pause",text:"Envoie la commande correspondante; vérifiez à l'écran et physiquement que la machine s'est arrêtée."},{title:"Arrêter",text:"Envoie l'interruption. En urgence réelle, utilisez l'arrêt d'urgence physique."},{title:"Confirmation Agent",text:"Elle confirme la transmission à Windows/LightBurn, pas le mouvement physique ni l'émission du laser."}
      ]},
      {title:"5. Outils LightBurn",lead:"Pas de doublons: chaque fonction n'apparaît qu'une fois.",items:[
        {title:"Rotatif",text:"Ouvre la configuration rotative LightBurn. Modifiez les champs dans la vue distante si nécessaire."},{title:"Tracer l'image",text:"Sélectionnez l'image et ouvrez l'outil de vectorisation de LightBurn."},{title:"Ajuster l'image",text:"Ouvre les réglages d'image LightBurn pour l'image sélectionnée."},{title:"Plus d'outils",text:"Contient Tout sélectionner, Miroir horizontal/vertical et Modifier à l'écran."},{title:"Compatibilité",text:"Les versions LightBurn exposent leurs contrôles différemment. DevinX utilise l'API locale si disponible puis l'automatisation/accessibilité Windows."}
      ]},
      {title:"6. Mentorat et accès temporaire",lead:"Pour enseignant ou support sans modifier l'appairage permanent.",items:[
        {title:"Mode mentorat",text:"L’élève ouvre le lien reçu par e-mail et télécharge DevinX-Mentoria-1.1.6.exe. Le mode temporaire ne modifie pas l’Agent permanent."},{title:"Code",text:"L'élève envoie le code de 8 caractères au professeur. Il reste valable 30 minutes."},{title:"Sessions de mentorat",text:"Mentor inclut 10 sessions par période active. Le pack supplémentaire ajoute 5 sessions de mentorat et n'est disponible qu'avec Mentor actif. Les 5 sessions expirent avec la période Mentor en cours."},{title:"Durée",text:"Après connexion, la session peut durer jusqu'à 6 heures ou jusqu'à sa fermeture."},{title:"Fin",text:"Fermer la session révoque l'accès temporaire. Une nouvelle session demande un nouveau code."}
      ]},
      {title:"7. Mise à jour et désinstallation",lead:"L'appairage est conservé entre les versions.",items:[
        {title:"Mettre à jour",text:"Téléchargez et exécutez le nouvel EXE. Il met à jour l’installation et conserve l’appairage."},{title:"Version",text:"Laser Control affiche la version signalée par le PC. Utilisez 1.1.6 pour ce guide."},{title:"Désinstaller",text:"Ouvrez l'icône Agent près de l'horloge Windows et choisissez Désinstaller DevinX Laser Agent."},{title:"Suppression",text:"Le démarrage automatique, l'appairage/les clés locales et les fichiers installés sont supprimés."}
      ]},
      {title:"8. Confidentialité, Windows et sécurité",items:[
        {title:"Diffusion",text:"La fenêtre LightBurn est diffusée pendant la session; les images live ne sont pas enregistrées comme historique."},{title:"Accès temporaire",text:"Les sessions utilisent des jetons temporaires et le contrôle doit être activé pour accepter les entrées."},{title:"Avertissement Windows",text:"La distribution directe peut afficher Éditeur inconnu/SmartScreen. L'Agent ne demande pas de privilèges administrateur."},{title:"Sécurité",text:"Ne dépendez jamais uniquement de l'écran distant. Gardez quelqu'un près de la machine pendant Frame, tests et gravure."}
      ]},
      {title:"9. Si quelque chose ne répond pas",lead:"Vérifiez ces points avant de réinstaller.",items:[
        {title:"Agent hors ligne",text:"Vérifiez l'icône Agent, Internet et attendez quelques secondes le prochain heartbeat."},{title:"LightBurn hors ligne",text:"Ouvrez LightBurn et vérifiez la connexion machine dans LightBurn."},{title:"Pas de contrôle",text:"Vérifiez que Contrôle est activé. Sortir du plein écran ne doit pas le désactiver en 1.1.6."},{title:"Toucher décalé",text:"Revenez à 100%, vérifiez que l'image se met à jour et réessayez."},{title:"Champ non modifiable",text:"Focalisez d'abord le champ puis ouvrez Clavier. Certaines fenêtres nécessitent un double-clic."}
      ]}
    ],
    footer:"Si votre version de LightBurn se comporte différemment, prenez la vue en direct comme référence et ne forcez pas une commande machine sans confirmation visuelle."
  },
  "de":{
    eyebrow:"DEVINX LASER CONTROL",title:"Vollständige Laser-Control-Anleitung",lead:"Agent installieren, LightBurn verbinden und den Bildschirm vom Handy oder einem anderen Computer aus klar steuern.",version:"Aktualisiert für DevinX Laser Agent 1.1.6",download:"Agent 1.1.6 für Windows herunterladen",open:"Laser Control öffnen",language:"Sprache der Anleitung",warning:"DevinX sendet Befehle an LightBurn, ersetzt aber keine physische Aufsicht, Verriegelungen, Einhausung, Absaugung oder den Not-Aus.",
    sections:[
      {title:"1. Installation und erste Verbindung",lead:"Einmal auf dem Computer durchführen, der mit dem Laser verbunden ist.",items:[
        {title:"EXE herunterladen",text:"Windows 10 oder 11 64-Bit verwenden und DevinX-Laser-Agent-1.1.6.exe herunterladen."},{title:"EXE öffnen",text:"Die heruntergeladene Datei doppelklicken. Entpacken oder Kommandozeilenbefehle sind nicht erforderlich."},{title:"Automatische Installation",text:"Die EXE installiert oder aktualisiert den Agent und richtet Autostart ein."},{title:"Computer verbinden",text:"Beim ersten Start öffnet sich DevinX. Die Verbindung einmal bestätigen; spätere Updates behalten sie."},{title:"LightBurn öffnen",text:"LightBurn normal geöffnet lassen. Der Agent erkennt Anwendung und Maschinenverbindung."},{title:"Status prüfen",text:"Der Computer muss in Laser Control online erscheinen. Live-Ansicht startet mit einer Remote-Sitzung."}
      ]},
      {title:"2. Tägliche Live-Nutzung",lead:"Die wichtigsten Bedienelemente bleiben direkt an der LightBurn-Ansicht.",items:[
        {title:"Steuerung an",text:"Steuerung aktivieren, um Touch, Maus und Tastatur zu senden. In 1.1.6 bleibt sie beim Ein- und Ausstieg aus Vollbild aktiv."},{title:"Vollbild",text:"Vergrößert nur das Remote-Bild. Auto, Horizontal und Vertikal steuern die Ausrichtung, wenn der Browser es erlaubt."},{title:"Pfeile",text:"↑ ← → ↓ neben dem Bild verschieben die aktuelle Auswahl. Die Taste ⊙ zum Zentrieren befindet sich oben in der Projektleiste."},{title:"Projektaktionen",text:"Kompakte Schaltflächen bieten Speichern, Rückgängig, Wiederholen, Importieren/Öffnen und Preview."},{title:"Live-Status",text:"Der Agent meldet Anwesenheit, LightBurn-/Maschinenverbindung und Jobstatus. Video wird nur während der Remote-Sitzung gestreamt."}
      ]},
      {title:"3. Touch, Zoom und Tastatur",lead:"Gesten sind getrennt, damit Handy-Navigation und LightBurn nicht kollidieren.",items:[
        {title:"Einfach tippen",text:"Ein Tipp sendet genau einen Klick und funktioniert in Normal- und Vollbildansicht bei aktiver Steuerung."},{title:"Doppelt tippen",text:"Zweimal schnell tippen, wenn LightBurn einen Doppelklick benötigt."},{title:"Zoom",text:"− / 100% / + oder Zwei-Finger-Pinch verwenden. Nur die Remote-Ansicht wird verändert."},{title:"Gezoomtes Bild verschieben",text:"Über 100% mit einem Finger ziehen, ohne das Motiv zu verschieben."},{title:"DevinX-Tastatur",text:"Zuerst das Feld fokussieren und dann Tastatur öffnen. Die kompakte DevinX-Tastatur erscheint unter dem Stream und soll die native Handy-Tastatur nicht öffnen. Textversand drückt nicht automatisch Enter."},{title:"Auf dem Bildschirm bearbeiten",text:"Wenn LightBurn ein Feld nicht per Accessibility bereitstellt, direkt in der übertragenen Oberfläche arbeiten."}
      ]},
      {title:"4. Frame, Start, Pause und Stopp",lead:"Maschinenbefehle sind von Bearbeitungswerkzeugen getrennt.",items:[
        {title:"Frame / Beenden",text:"Bei Galvo läuft Live Framing über F1. Bei Diode sucht der Agent den Frame-Button im Laser-Fenster. Maschine immer beaufsichtigen."},{title:"Start",text:"Verlangt Bestätigung. Material, Fokus, Ursprung, Leistung und Arbeitsbereich vorher prüfen."},{title:"Pause",text:"Sendet den entsprechenden Befehl; Bildschirm und Maschine kontrollieren."},{title:"Stopp",text:"Sendet den Abbruch. Im echten Notfall den physischen Not-Aus benutzen."},{title:"Agent-Bestätigung",text:"Bestätigt die Übermittlung an Windows/LightBurn, nicht die physische Bewegung oder Laseremission."}
      ]},
      {title:"5. LightBurn-Werkzeuge",lead:"Keine doppelten Befehle: jede Funktion erscheint einmal.",items:[
        {title:"Rotativ",text:"Öffnet die LightBurn-Rotativkonfiguration. Felder bei Bedarf direkt in der Remote-Ansicht bearbeiten."},{title:"Bild nachzeichnen",text:"Bild auswählen und das LightBurn-eigene Trace-Werkzeug öffnen."},{title:"Bild anpassen",text:"Öffnet die LightBurn-Bildanpassung für das ausgewählte Bild."},{title:"Weitere Werkzeuge",text:"Enthält Alles auswählen, Horizontal/Vertikal spiegeln und Auf dem Bildschirm bearbeiten."},{title:"Kompatibilität",text:"LightBurn-Versionen stellen Bedienelemente unterschiedlich bereit. DevinX nutzt lokale API, wenn verfügbar, sonst Windows-Automation/Accessibility."}
      ]},
      {title:"6. Mentoring und temporärer Zugriff",lead:"Für Lehrer oder Support ohne die dauerhafte Verbindung zu verändern.",items:[
        {title:"Mentor-Modus",text:"Der Schüler öffnet den E-Mail-Link und lädt DevinX-Mentoria-1.1.6.exe herunter. Der temporäre Modus ändert den permanenten Agent nicht. Bevor der Code gesendet wird, muss LightBurn auf dem Schüler-/Quell-PC geöffnet sein."},{title:"Code",text:"Der Schüler sendet den 8-stelligen Code an den Lehrer. Er ist 30 Minuten gültig."},{title:"Mentoring-Sitzungen",text:"Mentor enthält 10 Sitzungen pro aktivem Zeitraum. Das Zusatzpaket fügt 5 Mentoring-Sitzungen hinzu und ist nur mit aktivem Mentor verfügbar. Die 5 Sitzungen laufen mit dem aktuellen Mentor-Zeitraum ab."},{title:"Dauer",text:"Nach der Verbindung kann die Sitzung bis zu 6 Stunden laufen oder bis sie beendet wird."},{title:"Beenden",text:"Das Beenden widerruft den temporären Zugriff. Eine neue Sitzung benötigt einen neuen Code."}
      ]},
      {title:"7. Aktualisieren und deinstallieren",lead:"Die Verbindung bleibt zwischen Versionen erhalten.",items:[
        {title:"Aktualisieren",text:"Neue EXE herunterladen und starten. Sie aktualisiert die Installation und behält die Verbindung."},{title:"Version",text:"Laser Control zeigt die vom PC gemeldete Version. Für diese Anleitung 1.1.6 verwenden."},{title:"Deinstallieren",text:"Agent-Symbol neben der Windows-Uhr öffnen und DevinX Laser Agent deinstallieren wählen."},{title:"Was entfernt wird",text:"Autostart, lokale Verbindung/Schlüssel und installierte Benutzerdateien werden entfernt."}
      ]},
      {title:"8. Datenschutz, Windows und Sicherheit",items:[
        {title:"Bildübertragung",text:"Das LightBurn-Fenster wird während der Sitzung übertragen; Live-Frames werden nicht als Verlauf gespeichert."},{title:"Temporärer Zugriff",text:"Sitzungen verwenden temporäre Tokens; die Fernsteuerung muss für Eingaben aktiviert sein."},{title:"Windows-Hinweis",text:"Direkte Verteilung kann Unbekannter Herausgeber/SmartScreen anzeigen. Der Agent benötigt keine Administratorrechte."},{title:"Maschinensicherheit",text:"Nie nur auf den Remote-Bildschirm verlassen. Bei Frame, Tests und Gravur jemanden an der Maschine lassen."}
      ]},
      {title:"9. Wenn etwas nicht reagiert",lead:"Vor Neuinstallation diese Punkte prüfen.",items:[
        {title:"Agent offline",text:"Tray-Symbol, Internet prüfen und einige Sekunden auf den nächsten Heartbeat warten."},{title:"LightBurn offline",text:"LightBurn öffnen und Maschinenverbindung in LightBurn selbst prüfen."},{title:"Keine Steuerung",text:"Prüfen, ob Steuerung aktiv ist. Vollbild verlassen darf sie in 1.1.6 nicht ausschalten."},{title:"Touch versetzt",text:"Zoom auf 100% zurücksetzen, Bildaktualisierung prüfen und erneut versuchen."},{title:"Feld nicht editierbar",text:"Feld zuerst fokussieren und dann Tastatur öffnen. Manche Fenster benötigen Doppelklick."}
      ]}
    ],
    footer:"Wenn sich Ihre LightBurn-Version anders verhält, verwenden Sie die Live-Ansicht als Referenz und erzwingen Sie keine Maschinenbefehle ohne visuelle Bestätigung."
  },
  "ar":{
    eyebrow:"DEVINX LASER CONTROL",title:"الدليل الكامل للتحكم بالليزر",lead:"ثبّت Agent واربط LightBurn وتحكم بالشاشة من الهاتف أو من كمبيوتر آخر بخطوات واضحة.",version:"محدّث لـ DevinX Laser Agent 1.1.6",download:"تنزيل Agent 1.1.6 لويندوز",open:"فتح Laser Control",language:"لغة الدليل",warning:"يرسل DevinX الأوامر إلى LightBurn لكنه لا يستبدل المراقبة الفعلية أو وسائل الأمان أو الغطاء أو سحب الدخان أو زر الإيقاف الطارئ.",
    sections:[
      {title:"1. التثبيت والربط الأول",lead:"نفّذ هذه الخطوات مرة واحدة على الكمبيوتر المتصل بالليزر.",items:[
        {title:"نزّل ملف EXE",text:"استخدم Windows 10 أو 11 بنظام 64 بت ونزّل DevinX-Laser-Agent-1.1.6.exe."},{title:"افتح ملف EXE",text:"انقر مرتين على الملف الذي تم تنزيله. لا تحتاج إلى فك ملفات أو كتابة أوامر."},{title:"تثبيت تلقائي",text:"يقوم ملف EXE بتثبيت Agent أو تحديثه ويضبط التشغيل التلقائي."},{title:"اربط الكمبيوتر",text:"في أول تشغيل يفتح DevinX. أكّد الربط مرة واحدة؛ التحديثات اللاحقة تحافظ عليه."},{title:"افتح LightBurn",text:"اترك LightBurn مفتوحاً بشكل طبيعي. يكتشف Agent البرنامج واتصال الآلة."},{title:"تحقق من الحالة",text:"يجب أن يظهر الكمبيوتر متصلاً في Laser Control. تبدأ الشاشة المباشرة عند فتح جلسة بعيدة."}
      ]},
      {title:"2. الاستخدام اليومي للشاشة المباشرة",lead:"تبقى أدوات التحكم الأساسية حول صورة LightBurn نفسها.",items:[
        {title:"تشغيل التحكم",text:"فعّل التحكم لإرسال اللمس والماوس ولوحة المفاتيح. في 1.1.6 يبقى فعالاً عند الدخول إلى ملء الشاشة أو الخروج منه."},{title:"ملء الشاشة",text:"يكبّر الصورة البعيدة فقط. Auto وHorizontal وVertical تتحكم بالاتجاه عندما يسمح المتصفح."},{title:"الأسهم",text:"الأسهم ↑ ← → ↓ قرب الصورة تحرك التحديد الحالي. زر ⊙ لإعادة التمركز موجود في شريط المشروع العلوي."},{title:"المشروع والمعاينة",text:"الأزرار المدمجة توفر حفظ وتراجع وإعادة واستيراد/فتح وPreview."},{title:"الحالة المباشرة",text:"يرسل Agent حالة الاتصال بـ LightBurn والآلة وحالة العمل. يتم بث الفيديو فقط أثناء الجلسة البعيدة."}
      ]},
      {title:"3. اللمس والتكبير ولوحة المفاتيح",lead:"تم فصل الإيماءات حتى لا تتعارض حركة الهاتف مع LightBurn.",items:[
        {title:"لمسة واحدة",text:"ترسل نقرة واحدة إلى LightBurn وتعمل في العرض العادي وملء الشاشة عندما يكون التحكم مفعلاً."},{title:"لمستان سريعان",text:"استخدم لمستين سريعتين عندما يحتاج LightBurn إلى نقرتين."},{title:"التكبير",text:"استخدم − / 100% / + أو إصبعين. يتغير العرض البعيد فقط."},{title:"تحريك الصورة المكبرة",text:"فوق 100% اسحب بإصبع واحد للتنقل داخل الصورة من دون تحريك التصميم."},{title:"لوحة مفاتيح DevinX",text:"ركّز الحقل أولاً ثم افتح لوحة المفاتيح. تظهر لوحة DevinX المدمجة أسفل البث ولا يفترض أن تفتح لوحة مفاتيح الهاتف الأصلية. إرسال النص لا يضغط Enter تلقائياً."},{title:"التعديل على الشاشة",text:"إذا لم يعرض LightBurn حقلاً عبر إمكانية الوصول، تفاعل مباشرة مع الواجهة المنقولة."}
      ]},
      {title:"4. Frame وبدء وإيقاف مؤقت وإيقاف",lead:"أوامر الآلة منفصلة عن أدوات التحرير.",items:[
        {title:"Frame / إنهاء",text:"في Galvo يستخدم Live Framing عبر F1. في الدايود يبحث Agent عن زر Frame في نافذة Laser. راقب الآلة دائماً."},{title:"بدء",text:"يطلب تأكيداً. افحص المادة والتركيز ونقطة الأصل والطاقة ومنطقة العمل قبل التأكيد."},{title:"إيقاف مؤقت",text:"يرسل الأمر الموافق؛ تحقق من الشاشة ومن الآلة فعلياً."},{title:"إيقاف",text:"يرسل أمر التوقف. في الطوارئ الحقيقية استخدم زر الإيقاف الفيزيائي."},{title:"تأكيد Agent",text:"يعني أن الأمر وصل إلى Windows/LightBurn، ولا يضمن الحركة الفعلية أو انبعاث الليزر."}
      ]},
      {title:"5. أدوات LightBurn",lead:"من دون تكرار: كل وظيفة تظهر مرة واحدة.",items:[
        {title:"الروتاري",text:"يفتح إعداد الروتاري في LightBurn. عدّل الحقول من الشاشة البعيدة عند الحاجة."},{title:"تتبع الصورة",text:"حدد الصورة وافتح أداة التتبع الخاصة بـ LightBurn."},{title:"ضبط الصورة",text:"يفتح إعدادات الصورة في LightBurn للصورة المحددة."},{title:"أدوات إضافية",text:"تضم تحديد الكل والعكس الأفقي/العمودي والتعديل على الشاشة."},{title:"التوافق",text:"تختلف طريقة عرض عناصر التحكم بين إصدارات LightBurn. يستخدم DevinX الـ API المحلي عند توفره ثم أتمتة/إمكانية الوصول في ويندوز."}
      ]},
      {title:"6. التعليم والوصول المؤقت",lead:"للمعلم أو الدعم من دون تغيير الربط الدائم.",items:[
        {title:"وضع التعليم",text:"يفتح الطالب رابط البريد وينزّل DevinX-Mentoria-1.1.6.exe. الوضع المؤقت منفصل ولا يغيّر Agent الدائم. قبل إرسال الرمز يجب أن يكون LightBurn مفتوحاً على كمبيوتر الطالب/المصدر."},{title:"رمز الوصول",text:"يرسل الطالب الرمز المكوّن من 8 أحرف للمعلم. صلاحيته 30 دقيقة."},{title:"جلسات التعليم",text:"تتضمن خطة Mentor عشر جلسات في كل فترة فعالة. تضيف الحزمة الإضافية 5 جلسات تعليم، وهي متاحة فقط مع خطة Mentor فعالة. تنتهي الجلسات الخمس مع نهاية فترة Mentor الحالية."},{title:"مدة الجلسة",text:"بعد الاتصال يمكن أن تستمر الجلسة حتى 6 ساعات أو حتى إنهائها."},{title:"إنهاء الوصول",text:"إنهاء الجلسة يلغي الوصول المؤقت. الجلسة الجديدة تحتاج رمزاً جديداً."}
      ]},
      {title:"7. التحديث وإلغاء التثبيت",lead:"يبقى الربط محفوظاً بين الإصدارات.",items:[
        {title:"تحديث Agent",text:"نزّل ملف EXE الجديد وشغّله. يحدّث التثبيت ويحافظ على الربط."},{title:"النسخة",text:"يعرض Laser Control النسخة التي يبلغ عنها الكمبيوتر. استخدم 1.1.6 مع هذا الدليل."},{title:"إلغاء التثبيت",text:"افتح أيقونة Agent قرب ساعة ويندوز واختر إلغاء تثبيت DevinX Laser Agent."},{title:"ما الذي يُحذف",text:"يتم حذف التشغيل التلقائي والربط/المفاتيح المحلية وملفات المستخدم المثبتة."}
      ]},
      {title:"8. الخصوصية وويندوز والأمان",items:[
        {title:"بث الشاشة",text:"يتم بث نافذة LightBurn أثناء الجلسة فقط، ولا تحفظ الإطارات المباشرة كسجل في قاعدة البيانات."},{title:"وصول مؤقت",text:"تستخدم الجلسات رموزاً مؤقتة ويجب تفعيل التحكم لقبول الإدخال."},{title:"تحذير ويندوز",text:"قد يظهر Unknown publisher/SmartScreen في التوزيع المباشر. لا يحتاج Agent إلى صلاحيات مدير النظام."},{title:"أمان الآلة",text:"لا تعتمد على الشاشة البعيدة وحدها. أبقِ شخصاً قرب الآلة أثناء Frame والاختبارات والحفر."}
      ]},
      {title:"9. إذا لم يستجب شيء",lead:"تحقق من هذه النقاط قبل إعادة التثبيت.",items:[
        {title:"Agent غير متصل",text:"تحقق من أيقونة Agent والإنترنت وانتظر بضع ثوانٍ للـ heartbeat التالي."},{title:"LightBurn غير متصل",text:"افتح LightBurn وتحقق من اتصال الآلة داخله."},{title:"لا يوجد تحكم",text:"تأكد أن التحكم مفعّل. الخروج من ملء الشاشة لا يجب أن يوقفه في 1.1.6."},{title:"اللمس غير مطابق",text:"أعد التكبير إلى 100% وتأكد أن الصورة تتحدث ثم جرّب مجدداً."},{title:"الحقل لا يقبل التعديل",text:"ركّز الحقل أولاً ثم افتح لوحة المفاتيح. بعض النوافذ تحتاج نقرتين."}
      ]}
    ],
    footer:"إذا تصرف إصدار LightBurn لديك بشكل مختلف، اعتبر الشاشة المباشرة المرجع ولا تجبر أي أمر للآلة من دون تأكيد بصري."
  }
};
