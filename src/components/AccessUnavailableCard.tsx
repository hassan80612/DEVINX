'use client';

import Link from 'next/link';
import {useI18n} from '@/i18n/provider';
import {BrandLogo} from './BrandLogo';
import {LanguageMenu} from './LanguageMenu';

const messages={
  "pt-BR": {
    "title": "Não foi possível verificar seu acesso agora",
    "desc": "O serviço de autenticação ou assinatura está temporariamente indisponível. Isso não significa que sua assinatura expirou. Não compre outro plano para resolver este erro.",
    "retry": "Tentar novamente",
    "home": "Voltar ao início"
  },
  "en": {
    "title": "Your access could not be verified right now",
    "desc": "The sign-in or subscription service is temporarily unavailable. This does not mean your subscription expired. Do not buy another plan to fix this error.",
    "retry": "Try again",
    "home": "Back to home"
  },
  "es": {
    "title": "No se pudo verificar tu acceso ahora",
    "desc": "El servicio de acceso o suscripción no está disponible temporalmente. Esto no significa que tu suscripción haya vencido. No compres otro plan por este error.",
    "retry": "Reintentar",
    "home": "Volver al inicio"
  },
  "fr": {
    "title": "Impossible de vérifier votre accès",
    "desc": "Le service de connexion ou d’abonnement est temporairement indisponible. Cela ne signifie pas que votre abonnement a expiré. N’achetez pas un autre forfait pour résoudre cette erreur.",
    "retry": "Réessayer",
    "home": "Retour à l'accueil"
  },
  "de": {
    "title": "Dein Zugang konnte nicht geprüft werden",
    "desc": "Der Anmelde- oder Abodienst ist vorübergehend nicht verfügbar. Das bedeutet nicht, dass dein Abo abgelaufen ist. Bitte keinen neuen Plan kaufen.",
    "retry": "Erneut versuchen",
    "home": "Zur Startseite"
  },
  "ar": {
    "title": "تعذر التحقق من وصولك الآن",
    "desc": "خدمة تسجيل الدخول أو الاشتراك غير متاحة مؤقتًا. هذا لا يعني انتهاء اشتراكك. لا تشترِ خطة أخرى بسبب هذا الخطأ.",
    "retry": "إعادة المحاولة",
    "home": "العودة للرئيسية"
  }
} as const;

/** Fail closed without misrepresenting backend failures as expired subscriptions. */
export function AccessUnavailableCard(){
  const {locale}=useI18n();
  const message=messages[locale]??messages.en;

  return <main className="financeApp">
    <header className="financeHeader">
      <Link className="brand" href="/"><BrandLogo/></Link>
      <div className="financeHeaderTools"><LanguageMenu/></div>
    </header>
    <section className="paywallCard" role="alert" aria-live="polite">
      <span className="goldPill">DEVINX</span>
      <h1>{message.title}</h1>
      <p>{message.desc}</p>
      <button type="button" className="primary goldButton" onClick={()=>window.location.reload()}>{message.retry}</button>
      <Link href="/" className="secondary">{message.home}</Link>
    </section>
  </main>;
}
