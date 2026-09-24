import '../hub.css';
import '../theme.css';
import type {Metadata} from 'next';
import {SeoLanding} from '@/components/SeoLanding';

export const metadata:Metadata={
  title:'Controle financeiro para motorista de aplicativo',
  description:'Organize ganhos, despesas, jornadas e metas diárias de Uber, 99 e entregas. Veja bruto, custos estimados, líquido por hora e por km no DevinX.',
  alternates:{canonical:'/controle-financeiro-motorista-app'},
  openGraph:{
    title:'Controle financeiro para motorista de aplicativo | DevinX',
    description:'Acompanhe ganhos, custos, jornadas e sua meta diária como motorista de aplicativo.',
    url:'/controle-financeiro-motorista-app',
    type:'website'
  }
};

export default function ControleFinanceiroMotoristaApp(){
  return <SeoLanding
    eyebrow="MOTORISTA DE APLICATIVO"
    title="Controle financeiro para Uber, 99 e entregas sem depender de planilhas"
    intro="O DevinX reúne sua vida financeira e sua rotina de trabalho. Registre jornadas, acompanhe o que entrou, estime custos e veja quanto ainda precisa produzir para cobrir seus compromissos."
    cards={[
      {title:'Bruto e líquido da jornada',text:'Registre o valor bruto da jornada e acompanhe os custos estimados para entender melhor o resultado do dia.'},
      {title:'Resultado por hora e por km',text:'Compare o desempenho das jornadas usando indicadores de líquido por hora e por quilômetro.'},
      {title:'Meta diária conectada às contas',text:'Suas contas e vencimentos ajudam a mostrar quanto precisa produzir por dia para cobrir os compromissos mais próximos.'}
    ]}
    sections={[
      {title:'Saiba se a jornada realmente compensou',text:'Faturamento sozinho não mostra o resultado completo. No DevinX, a jornada fica separada do saldo real: você enxerga bruto, custos estimados e líquido sem transformar estimativas em pagamentos que ainda não aconteceram.'},
      {title:'Junte trabalho e vida financeira',text:'Além das jornadas, você pode acompanhar entradas, gastos, cartões, contas, parcelas, reservas e objetivos. Assim, a meta de trabalho deixa de ser um número solto e passa a considerar sua situação financeira.'},
      {title:'Use no celular durante a rotina',text:'O DevinX funciona pela web e foi pensado para uso no celular, permitindo registrar informações e consultar a meta sem depender de uma planilha separada.'}
    ]}
    faq={[
      {question:'O DevinX serve para motorista de Uber e 99?',answer:'Sim. O DevinX possui recursos para registrar jornadas de trabalho e acompanhar bruto, custos estimados, líquido por hora e por quilômetro, além do controle financeiro geral.'},
      {question:'O custo estimado da jornada é descontado do meu saldo?',answer:'A jornada mostra bruto, custos estimados e líquido para análise. O saldo financeiro continua refletindo os lançamentos reais registrados no sistema.'},
      {question:'Posso testar antes de assinar?',answer:'Sim. O DevinX oferece 3 dias de teste grátis, sem cartão e sem cobrança automática.'}
    ]}
    related={[
      {href:'/meta-diaria-financeira',label:'Como calcular uma meta diária financeira'},
      {href:'/controle-financeiro-autonomo',label:'Controle financeiro para autônomo'},
      {href:'/',label:'Conhecer o DevinX'}
    ]}
  />;
}
