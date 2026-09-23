import type {Metadata} from 'next';
import {SeoLanding} from '@/components/SeoLanding';

export const metadata:Metadata={
  title:'Controle financeiro para autônomo',
  description:'Controle entradas, gastos, contas, cartões, reservas e metas de renda como autônomo. Organize sua rotina financeira no DevinX.',
  alternates:{canonical:'/controle-financeiro-autonomo'},
  openGraph:{
    title:'Controle financeiro para autônomo | DevinX',
    description:'Organize renda variável, contas e metas diárias sem depender de planilhas.',
    url:'/controle-financeiro-autonomo',
    type:'website'
  }
};

export default function ControleFinanceiroAutonomo(){
  return <SeoLanding
    eyebrow="RENDA VARIÁVEL"
    title="Controle financeiro para autônomo com renda que muda de um dia para o outro"
    intro="Quem trabalha por conta própria precisa acompanhar dinheiro que entra em dias diferentes, contas com vencimentos fixos e metas que mudam junto com a rotina. O DevinX organiza tudo isso em um único lugar."
    cards={[
      {title:'Entradas e gastos organizados',text:'Registre movimentações, use categorias próprias e consulte o histórico para entender melhor seu dinheiro.'},
      {title:'Contas, parcelas e cartões',text:'Acompanhe vencimentos, pagamentos parciais, compras parceladas, fechamento e vencimento dos cartões.'},
      {title:'Metas ligadas à realidade',text:'Use seus compromissos financeiros para enxergar quanto ainda precisa produzir e acompanhar objetivos de renda.'}
    ]}
    sections={[
      {title:'Renda variável pede planejamento variável',text:'Para quem não recebe sempre o mesmo salário no mesmo dia, uma planilha fixa pode perder rapidamente o contexto. O DevinX permite registrar a realidade conforme ela acontece e acompanhar o impacto nas metas.'},
      {title:'Separe dinheiro para objetivos',text:'Reservas ajudam a separar valores destinados a planos específicos. Você acompanha quanto já guardou e quanto ainda falta para atingir o objetivo.'},
      {title:'Tenha histórico para tomar decisões',text:'Movimentações, contas e jornadas registradas formam um histórico que ajuda a comparar períodos e entender como a sua rotina financeira está evoluindo.'}
    ]}
    faq={[
      {question:'O DevinX funciona para quem não tem salário fixo?',answer:'Sim. Ele permite registrar diferentes tipos de entrada e organizar contas e metas mesmo quando a renda varia ao longo do mês.'},
      {question:'Posso controlar cartão de crédito?',answer:'Sim. O DevinX permite acompanhar limite, fechamento, vencimento e compras parceladas dos cartões cadastrados.'},
      {question:'Existe teste grátis?',answer:'Sim. Novos usuários podem testar o DevinX por 3 dias sem cartão e sem cobrança automática.'}
    ]}
    related={[
      {href:'/meta-diaria-financeira',label:'Como calcular uma meta diária financeira'},
      {href:'/controle-financeiro-motorista-app',label:'Controle financeiro para motorista de aplicativo'},
      {href:'/',label:'Conhecer o DevinX'}
    ]}
  />;
}
