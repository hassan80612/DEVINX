"use client";

import {createClient} from "@/lib/supabase/client";
import {useI18n} from "@/i18n/provider";
import styles from "./LaserAccessGate.module.css";

export function LaserAccessGate(){
  const{locale}=useI18n();
  const pt=locale==="pt-BR";

  async function signOut(){
    await createClient().auth.signOut();
    window.location.replace("/entrar?next=/laser-control");
  }

  return <section className={styles.wrap}>
    <div className={styles.card}>
      <span className={styles.eyebrow}>DEVINX LASER CONTROL</span>
      <h1>{pt?"Sua conta está conectada, mas sem acesso ao Laser Control.":"Your account is connected, but it does not have Laser Control access."}</h1>
      <p>{pt
        ?"Você pode ver os planos, voltar para a apresentação do Laser Control ou sair desta conta para entrar com outra."
        :"You can view plans, return to the Laser Control presentation, or sign out and use another account."}</p>

      <div className={styles.actions}>
        <a className={styles.primary} href="/laser-control/conhecer#planos">{pt?"Ver planos do Laser Control":"View Laser Control plans"}</a>
        <a className={styles.secondary} href="/laser-control/conhecer">{pt?"Conhecer Laser Control":"Explore Laser Control"}</a>
        <button className={styles.secondary} type="button" onClick={()=>void signOut()}>{pt?"Sair desta conta":"Sign out"}</button>
      </div>

      <div className={styles.links}>
        <a href="/">{pt?"Home DevinX":"DevinX home"}</a>
        <a href="/laser-control/guia">{pt?"Guia completo":"Complete guide"}</a>
      </div>
    </div>
  </section>;
}
