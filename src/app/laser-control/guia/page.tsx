import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {getPublicSiteVisibility} from '@/features/site-visibility/server';
import {getLaserMasterAccess} from '@/features/laser-control/server/master-access';
import styles from './page.module.css';

export const dynamic='force-dynamic';

export const metadata:Metadata={
  title:'Laser Control | DevinX',
  description:'Controle e monitoramento do LightBurn com o DevinX Laser Agent.'
};

export default async function LaserGuidePage(){
  const visibility=await getPublicSiteVisibility();
  if(!visibility.laser){
    const access=await getLaserMasterAccess();
    if(!access.allowed)notFound();
  }

  return <main className={styles.page}>
    <section className={styles.hero}>
      <small>DEVINX LASER CONTROL</small>
      <h1>Seu LightBurn conectado ao DevinX.</h1>
      <p>Veja a janela do LightBurn em tempo real, acompanhe a máquina e use controles remotos a partir do celular ou de outro computador.</p>
      <div className={styles.actions}>
        <a className={styles.primary} href="https://github.com/hassan80612/DEVINX/releases/download/laser-agent-v1.0.7/DevinX-Laser-Agent-1.0.7.zip" download>Baixar Agent para Windows</a>
        <a className={styles.secondary} href="/laser-control">Abrir Laser Control</a>
      </div>
    </section>

    <section className={styles.block}>
      <h2>Instalação passo a passo</h2>
      <div className={styles.grid}>
        <article><b>1 · Baixe</b><p>Baixe o ZIP do Agent em um PC Windows 10/11 de 64 bits.</p></article>
        <article><b>2 · Extraia</b><p>Clique com o botão direito no ZIP e escolha <strong>Extrair tudo</strong>. Não execute o programa de dentro do ZIP.</p></article>
        <article><b>3 · Abra</b><p>Dê dois cliques em <strong>DevinXLaserAgent.exe</strong>. O Agent instala os arquivos no seu usuário do Windows e passa a iniciar automaticamente.</p></article>
        <article><b>4 · Vincule</b><p>O navegador abre o DevinX. Confirme o vínculo deste PC uma única vez. Depois disso o vínculo fica salvo.</p></article>
        <article><b>5 · Abra o LightBurn</b><p>Abra o LightBurn normalmente. O Agent detecta o programa, a máquina e o estado do trabalho.</p></article>
        <article><b>6 · Controle</b><p>Abra o Laser Control no celular ou em outro computador. A transmissão só existe enquanto uma sessão remota estiver aberta.</p></article>
      </div>
    </section>

    <section className={styles.block}>
      <h2>Como funciona o controle remoto</h2>
      <p>Na tela Ao vivo você pode usar zoom de 75% a 300%, alternar entre orientação automática, horizontal e vertical e entrar em tela cheia. O controle por toque, mouse e teclado só pode ser habilitado dentro da tela cheia e é limitado à janela do LightBurn. A aba Controle traz Frame seleção, Iniciar, Pausar e Parar.</p>
      <p>O botão Iniciar pede confirmação antes de executar. A supervisão da máquina, intertravamentos e botão de emergência continuam independentes do DevinX.</p>
    </section>

    <section className={styles.block}>
      <h2>Desinstalar</h2>
      <p>Clique na seta de ícones perto do relógio do Windows, abra o menu do <strong>DevinX Laser Agent</strong> e escolha <strong>Desinstalar DevinX Laser Agent</strong>. O Agent remove a inicialização automática, o vínculo local e os arquivos instalados.</p>
    </section>

    <section className={styles.block}>
      <h2>Aviso do Windows</h2>
      <p>O instalador comercial assinado pela Microsoft Store pode ser publicado sem comprar certificado. Enquanto o Agent estiver em distribuição direta e sem certificado pago, o Windows pode exibir um aviso de Editor desconhecido/SmartScreen. O Agent não exige privilégios de administrador.</p>
    </section>
  </main>;
}
