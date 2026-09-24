import '../hub.css';
import '../theme.css';
import type {Metadata} from 'next';
import {SeoLanding} from '@/components/SeoLanding';

export const metadata:Metadata={
  title:'Meta diária financeira: quanto preciso ganhar por dia?',
  description:'Descubra quanto precisa ganhar por dia considerando saldo, contas e vencimentos. Organize sua meta diária financeira com o DevinX.',
  alternates:{canonical:'/meta-diaria-financeira'},
  openGraph:{
    title:'Meta diária financeira: quanto preciso ganhar por dia? | DevinX',
    description:'Transforme contas e vencimentos em uma meta diária mais clara para sua rotina.',
    url:'/meta-diaria-financeira',
    type:'website'
  }
};

export default function MetaDiariaFinanceira(){
  return <SeoLanding
    eyebrow="META DIÁRIA"
    title="Quanto preciso ganhar por dia para colocar minhas contas em dia?"
    intro="Uma meta diária útil precisa considerar sua realidade: o dinheiro disponível, as contas que vencem primeiro e o valor que ainda falta cobrir. O DevinX organiza essas informações e atualiza a meta conforme sua rotina muda."
    cards={[
      {title:'Considere os vencimentos',text:'As contas mais próximas entram no planejamento para que a meta reflita o que precisa ser coberto primeiro.'},
      {title:'Atualize com entradas e gastos',text:'Quando você registra movimentações reais, sua visão financeira acompanha a mudança em vez de ficar presa a uma meta fixa.'},
      {title:'Veja um objetivo diário',text:'O valor que falta pode ser distribuído pelos dias disponíveis, ajudando a transformar uma obrigação maior em uma referência diária.'}
    ]}
    sections={[
      {title:'Por que uma meta fixa costuma falhar',text:'Definir um valor diário sem olhar saldo, gastos e datas de vencimento pode criar uma meta que não acompanha a realidade. Uma conta inesperada ou um recebimento muda o cenário e deveria mudar também o planejamento.'},
      {title:'Do valor total para uma ação de hoje',text:'Ao organizar o que está disponível e o que vence nos próximos dias, fica mais fácil enxergar a diferença que precisa ser coberta e transformá-la em uma referência diária de produção.'},
      {title:'A meta é parte do controle financeiro',text:'No DevinX, a meta diária convive com contas, cartões, reservas, entradas, gastos e histórico. Isso evita separar o planejamento do restante da sua vida financeira.'}
    ]}
    faq={[
      {question:'Como saber quanto preciso ganhar por dia?',answer:'Você precisa comparar o valor disponível com os compromissos que precisam ser pagos e considerar quantos dias restam até os vencimentos. O DevinX organiza esses dados e apresenta uma meta diária baseada na situação registrada.'},
      {question:'A meta muda quando eu registro um gasto?',answer:'Sim. A proposta do DevinX é ajustar a visão financeira conforme novas entradas, gastos e compromissos são registrados.'},
      {question:'Preciso colocar cartão para testar?',answer:'Não. O teste de 3 dias do DevinX não exige cartão e não possui cobrança automática.'}
    ]}
    related={[
      {href:'/controle-financeiro-motorista-app',label:'Controle financeiro para motorista de aplicativo'},
      {href:'/controle-financeiro-autonomo',label:'Controle financeiro para autônomo'},
      {href:'/',label:'Conhecer o DevinX'}
    ]}
  />;
}
