# Sentinel 13.9.25 — entradas de 30s no relógio sincronizado

## Comportamento entregue

O usuário pediu que, **quando a opção Relógio sincronizado estiver escolhida**, as entradas válidas coincidam com :00 ou :30 da corretora, sem recuperar uma entrada vencida e sem atrasar o contador. O alinhamento novo aplica-se à duração selecionada de **30 segundos**. O relógio atual conserva a autorização imediata da 13.9.24; os outros prazos não receberam uma nova restrição de horário.

Antes, a escolha do relógio afetava a apresentação, mas não participava da autorização da entrada no motor atual. A correção liga a escolha explícita ao instante de emissão.

## Regras

- O relógio precisa vir do protocolo autenticado da corretora, estar verificado e recente. Uma leitura visual arredondada a segundos pode ser exibida, mas não fornece precisão para autorizar essa entrada alinhada.
- O motor é recalculado com o mercado já observado. A direção precisa estar válida na própria virada; não se guarda uma decisão prévia para liberá-la depois.
- Somente o segundo mostrado como :00 ou :30 é elegível. O limite de 1s é tolerância máxima de chegada/processamento, não uma espera programada. A cotação precisa pertencer à nova virada.
- Cálculo iniciado dentro do segundo elegível, mas concluído depois dele, não autoriza uma entrada atrasada. O tempo de processamento é considerado antes de confirmar o horário.
- Uma virada já sinalizada não pode ser repetida, mesmo se a referência da janela for limpa ou o relógio recuar.
- O vencimento é traduzido para o relógio local a partir da **próxima virada da corretora**. Não é recalculado como “agora + 30s” após cada processamento.
- Expiração fixa conhecida, recente e já vencida, ou diferente da próxima virada, não é apresentada como a opção correta de 30s. Contagem de compra não é tratada como vencimento.
- O sinal emitido permanece com a mesma direção até o vencimento. A análise seguinte continua enquanto ele está ativo.

## PC e celular

O mesmo prazo de validade do aviso ENTRADA AGORA acompanha o frame compacto para o celular. Um pacote recebido depois desse prazo mostra o sinal em andamento, sem ressuscitar a chamada de entrada. O temporizador local do PC também remove o aviso vencido sem precisar receber outro frame — esse caminho anteriormente podia manter o texto antigo enquanto a janela ainda estava ativa.

O contador usa o deadline fixo do agente, inclusive quando o relógio ao vivo fica indisponível após a emissão. Os horários de entrada e vencimento exibidos na opção sincronizada usam o horário da corretora. Os intervalos de atualização visual e do agendador de cotações foram conservados: não foi acrescentado outro contador ou espera por uma vela.

O alinhamento controla **o sinal e seu contador**. O analista não confirma que o usuário clicou uma operação e não altera o vencimento de uma posição real. Em uma opção de duração relativa, o instante do clique e a duração selecionada na corretora determinam o fechamento real; não se promete que um clique atrasado será compensado.

## Verificação

**223 testes obrigatórios passaram**, em 44 arquivos. Dez testes novos cobrem:

- limites exatos do segundo elegível e descarte da cotação anterior à virada;
- diferença entre o relógio do PC e o da corretora, sem aplicar tempo decorrido duas vezes;
- relógio desconhecido, vencido ou visualmente arredondado;
- expiração fixa incompatível ou vencida;
- funcionamento imediato da opção Relógio atual e exigência de evidência real na opção sincronizada;
- sinal único por virada, deadline fixo e próxima entrada;
- processamento que termina tarde;
- percurso runtime → snapshot → frame compacto → modelo móvel;
- execução da função real do temporizador do overlay, com frame antigo;
- renderização do componente React real com frame recebido tarde.

A projeção de direção da 13.9.24 não foi modificada. Seus testes continuam reproduzindo 10 favoráveis/4 desfavoráveis no replay em horários livres do vídeo. Essa taxa **não é transferida para os novos horários sincronizados**, que constituem outro conjunto de entradas, e não comprova a meta de 90%.

O instalador foi compilado com Go 1.24.9, com 2.662.400 bytes na compilação local. O pacote de produção é recriado pelo build remoto a partir da mesma release. É necessário atualizar o Agent Windows para 13.9.25 para que o novo controle de horário participe da decisão.
