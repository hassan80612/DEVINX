import type {Locale} from '@/i18n/catalogs';

type LaserCopy={
  eyebrow:string;title:string;accent:string;lead:string;viewPlans:string;howItWorks:string;online:string;lightburn:string;agent:string;
  currentFile:string;ready:string;frame:string;start:string;pause:string;stop:string;protectedStart:string;localArm:string;
  architectureTitle:string;architectureLead:string;phone:string;cloud:string;pc:string;machine:string;
  securityTitle:string;securityLead:string;s1:string;s2:string;s3:string;s4:string;s5:string;s6:string;
  pricingTitle:string;pricingLead:string;month:string;trial:string;starter:string;pro:string;workshop:string;
  pcs:string;machines:string;phones:string;operators:string;checkoutSoon:string;note:string;footer:string;
};

export const LASER_COPY:Record<Locale,LaserCopy>={
  'pt-BR':{
    eyebrow:'CONTROLE DE LASER PELO CELULAR',title:'Seu LightBurn no PC.',accent:'O controle na sua mão.',
    lead:'Um painel móvel próprio para acompanhar e controlar sua produção sem transformar o celular em uma cópia apertada do desktop.',
    viewPlans:'Ver planos',howItWorks:'Como funciona',online:'ONLINE',lightburn:'LightBurn conectado',agent:'Agent conectado',
    currentFile:'Arquivo atual',ready:'Pronto para produzir',frame:'FRAME',start:'INICIAR',pause:'PAUSAR',stop:'PARAR',
    protectedStart:'Início protegido',localArm:'O START só é liberado quando o operador autoriza localmente no PC.',
    architectureTitle:'Simples para usar. Separado por dentro.',architectureLead:'Celular e PC usam a mesma conta. O Agent conversa apenas com o LightBurn local e o servidor valida plano, dispositivo e permissão.',
    phone:'Celular',cloud:'Conexão segura',pc:'Agent no PC',machine:'LightBurn + laser',
    securityTitle:'Segurança faz parte do produto',securityLead:'Nada de acesso remoto genérico ao Windows. O Agent nasce com funções limitadas e uma lista fechada de ações.',
    s1:'Sem abrir portas do roteador',s2:'Sem controle de mouse ou teclado',s3:'Pareamento temporário por dispositivo',s4:'Limite de PCs e celulares por plano',s5:'Registro de comandos e sessões',s6:'START com autorização local temporária',
    pricingTitle:'Planos simples e controláveis',pricingLead:'Preços ficam centralizados e podem mudar sem espalhar valores pelo código.',
    month:'/mês',trial:'7 dias grátis',starter:'Starter',pro:'Pro',workshop:'Oficina',pcs:'PCs',machines:'máquinas',phones:'celulares',operators:'operadores ativos',
    checkoutSoon:'Checkout será conectado antes do lançamento',note:'Valores iniciais para validação comercial. Nenhuma cobrança está ativa nesta versão.',footer:'DevinX Laser Control · fundação independente do Financeiro'
  },
  en:{
    eyebrow:'LASER CONTROL FROM YOUR PHONE',title:'LightBurn stays on your PC.',accent:'Control stays in your hand.',
    lead:'A mobile-first production panel built for touch instead of squeezing the desktop interface onto a phone.',
    viewPlans:'View plans',howItWorks:'How it works',online:'ONLINE',lightburn:'LightBurn connected',agent:'Agent connected',
    currentFile:'Current file',ready:'Ready for production',frame:'FRAME',start:'START',pause:'PAUSE',stop:'STOP',
    protectedStart:'Protected start',localArm:'START is available only after the operator enables it locally on the PC.',
    architectureTitle:'Simple to use. Separated underneath.',architectureLead:'Phone and PC use the same account. The Agent talks only to local LightBurn and the server validates plan, device and permissions.',
    phone:'Phone',cloud:'Secure connection',pc:'PC Agent',machine:'LightBurn + laser',
    securityTitle:'Security is part of the product',securityLead:'No generic Windows remote access. The Agent is intentionally limited to a closed allowlist of actions.',
    s1:'No router ports exposed',s2:'No mouse or keyboard control',s3:'Temporary device pairing',s4:'Plan-based PC and phone limits',s5:'Command and session audit trail',s6:'START requires temporary local authorization',
    pricingTitle:'Simple, enforceable plans',pricingLead:'Prices live in one configuration layer so they can change without scattering values through the codebase.',
    month:'/month',trial:'7-day free trial',starter:'Starter',pro:'Pro',workshop:'Workshop',pcs:'PCs',machines:'machines',phones:'phones',operators:'active operators',
    checkoutSoon:'Checkout will be connected before launch',note:'Initial validation prices. Billing is not enabled in this build.',footer:'DevinX Laser Control · independent from Finance'
  },
  es:{
    eyebrow:'CONTROL DEL LÁSER DESDE EL MÓVIL',title:'LightBurn queda en tu PC.',accent:'El control queda en tu mano.',
    lead:'Un panel móvil pensado para producción y toque, sin comprimir la interfaz de escritorio en el teléfono.',
    viewPlans:'Ver planes',howItWorks:'Cómo funciona',online:'EN LÍNEA',lightburn:'LightBurn conectado',agent:'Agent conectado',
    currentFile:'Archivo actual',ready:'Listo para producir',frame:'FRAME',start:'INICIAR',pause:'PAUSAR',stop:'PARAR',
    protectedStart:'Inicio protegido',localArm:'INICIAR solo se libera cuando el operador lo autoriza localmente en el PC.',
    architectureTitle:'Simple por fuera. Separado por dentro.',architectureLead:'Móvil y PC usan la misma cuenta. El Agent habla solo con LightBurn local y el servidor valida plan, dispositivo y permisos.',
    phone:'Móvil',cloud:'Conexión segura',pc:'Agent en PC',machine:'LightBurn + láser',
    securityTitle:'La seguridad forma parte del producto',securityLead:'Sin acceso remoto genérico a Windows. El Agent nace limitado a una lista cerrada de acciones.',
    s1:'Sin abrir puertos del router',s2:'Sin control de ratón o teclado',s3:'Emparejamiento temporal por dispositivo',s4:'Límites por plan',s5:'Registro de comandos y sesiones',s6:'INICIAR requiere autorización local temporal',
    pricingTitle:'Planes simples y controlables',pricingLead:'Los precios quedan centralizados para poder cambiarlos sin ensuciar el código.',
    month:'/mes',trial:'7 días gratis',starter:'Starter',pro:'Pro',workshop:'Taller',pcs:'PCs',machines:'máquinas',phones:'móviles',operators:'operadores activos',
    checkoutSoon:'El checkout se conectará antes del lanzamiento',note:'Precios iniciales para validación. No hay cobros activos en esta versión.',footer:'DevinX Laser Control · independiente de Finanzas'
  },
  fr:{
    eyebrow:'CONTRÔLE DU LASER DEPUIS LE MOBILE',title:'LightBurn reste sur le PC.',accent:'Le contrôle reste dans votre main.',
    lead:'Un panneau mobile conçu pour la production tactile, sans réduire l’interface de bureau sur un téléphone.',
    viewPlans:'Voir les offres',howItWorks:'Fonctionnement',online:'EN LIGNE',lightburn:'LightBurn connecté',agent:'Agent connecté',
    currentFile:'Fichier actuel',ready:'Prêt à produire',frame:'CADRER',start:'DÉMARRER',pause:'PAUSE',stop:'ARRÊTER',
    protectedStart:'Démarrage protégé',localArm:'Le DÉMARRAGE n’est disponible qu’après autorisation locale sur le PC.',
    architectureTitle:'Simple à utiliser. Séparé techniquement.',architectureLead:'Mobile et PC utilisent le même compte. L’Agent communique uniquement avec LightBurn local et le serveur valide les droits.',
    phone:'Mobile',cloud:'Connexion sécurisée',pc:'Agent PC',machine:'LightBurn + laser',
    securityTitle:'La sécurité fait partie du produit',securityLead:'Aucun accès distant générique à Windows. L’Agent est limité à une liste fermée d’actions.',
    s1:'Aucun port routeur exposé',s2:'Aucun contrôle souris ou clavier',s3:'Appairage temporaire',s4:'Limites selon l’offre',s5:'Journal des commandes et sessions',s6:'DÉMARRER exige une autorisation locale temporaire',
    pricingTitle:'Des offres simples',pricingLead:'Les prix sont centralisés afin de pouvoir évoluer sans disperser les valeurs dans le code.',
    month:'/mois',trial:'7 jours gratuits',starter:'Starter',pro:'Pro',workshop:'Atelier',pcs:'PC',machines:'machines',phones:'mobiles',operators:'opérateurs actifs',
    checkoutSoon:'Le paiement sera connecté avant le lancement',note:'Prix initiaux de validation. Aucun paiement actif dans cette version.',footer:'DevinX Laser Control · indépendant de Finance'
  },
  de:{
    eyebrow:'LASERSTEUERUNG VOM SMARTPHONE',title:'LightBurn bleibt auf dem PC.',accent:'Die Kontrolle bleibt in deiner Hand.',
    lead:'Ein mobiles Produktionspanel für Touch-Bedienung statt einer verkleinerten Desktop-Oberfläche.',
    viewPlans:'Tarife ansehen',howItWorks:'So funktioniert es',online:'ONLINE',lightburn:'LightBurn verbunden',agent:'Agent verbunden',
    currentFile:'Aktuelle Datei',ready:'Produktionsbereit',frame:'RAHMEN',start:'START',pause:'PAUSE',stop:'STOPP',
    protectedStart:'Geschützter Start',localArm:'START wird erst nach lokaler Freigabe am PC verfügbar.',
    architectureTitle:'Einfach zu bedienen. Technisch getrennt.',architectureLead:'Smartphone und PC verwenden dasselbe Konto. Der Agent spricht nur mit lokalem LightBurn; der Server prüft Tarif, Gerät und Rechte.',
    phone:'Smartphone',cloud:'Sichere Verbindung',pc:'PC-Agent',machine:'LightBurn + Laser',
    securityTitle:'Sicherheit gehört zum Produkt',securityLead:'Kein allgemeiner Windows-Fernzugriff. Der Agent ist auf eine feste Liste erlaubter Aktionen begrenzt.',
    s1:'Keine offenen Router-Ports',s2:'Keine Maus- oder Tastatursteuerung',s3:'Temporäre Geräte-Kopplung',s4:'Gerätelimits je Tarif',s5:'Protokoll für Befehle und Sitzungen',s6:'START braucht temporäre lokale Freigabe',
    pricingTitle:'Einfache Tarife',pricingLead:'Preise liegen zentral in der Konfiguration und können ohne Code-Chaos geändert werden.',
    month:'/Monat',trial:'7 Tage kostenlos',starter:'Starter',pro:'Pro',workshop:'Werkstatt',pcs:'PCs',machines:'Maschinen',phones:'Smartphones',operators:'aktive Bediener',
    checkoutSoon:'Checkout wird vor dem Start verbunden',note:'Startpreise zur Validierung. In diesem Build ist keine Abrechnung aktiv.',footer:'DevinX Laser Control · unabhängig von Finanzen'
  },
  ar:{
    eyebrow:'التحكم بالليزر من الهاتف',title:'LightBurn يبقى على الكمبيوتر.',accent:'والتحكم يبقى في يدك.',
    lead:'لوحة إنتاج مخصصة للهاتف واللمس بدلاً من ضغط واجهة الكمبيوتر داخل شاشة صغيرة.',
    viewPlans:'عرض الخطط',howItWorks:'كيف يعمل',online:'متصل',lightburn:'LightBurn متصل',agent:'Agent متصل',
    currentFile:'الملف الحالي',ready:'جاهز للإنتاج',frame:'تحديد الإطار',start:'بدء',pause:'إيقاف مؤقت',stop:'إيقاف',
    protectedStart:'بدء محمي',localArm:'لا يتاح البدء إلا بعد أن يسمح المشغل بذلك محلياً من الكمبيوتر.',
    architectureTitle:'بسيط في الاستخدام. منفصل من الداخل.',architectureLead:'الهاتف والكمبيوتر يستخدمان الحساب نفسه. الـ Agent يتواصل فقط مع LightBurn المحلي والخادم يتحقق من الخطة والجهاز والصلاحيات.',
    phone:'الهاتف',cloud:'اتصال آمن',pc:'Agent على الكمبيوتر',machine:'LightBurn + الليزر',
    securityTitle:'الأمان جزء من المنتج',securityLead:'لا يوجد وصول عام إلى Windows. الـ Agent محدود بقائمة مغلقة من الأوامر المسموح بها.',
    s1:'بدون فتح منافذ الراوتر',s2:'بدون تحكم بالماوس أو لوحة المفاتيح',s3:'ربط مؤقت لكل جهاز',s4:'حدود أجهزة حسب الخطة',s5:'سجل للأوامر والجلسات',s6:'البدء يحتاج إذناً محلياً مؤقتاً',
    pricingTitle:'خطط بسيطة وواضحة',pricingLead:'الأسعار في إعداد مركزي ويمكن تغييرها من دون نشر القيم داخل الكود.',
    month:'/شهرياً',trial:'7 أيام مجاناً',starter:'Starter',pro:'Pro',workshop:'ورشة',pcs:'أجهزة PC',machines:'آلات',phones:'هواتف',operators:'مشغلون نشطون',
    checkoutSoon:'سيتم ربط الدفع قبل الإطلاق',note:'أسعار أولية للاختبار التجاري. الدفع غير مفعّل في هذه النسخة.',footer:'DevinX Laser Control · مستقل عن القسم المالي'
  }
};
