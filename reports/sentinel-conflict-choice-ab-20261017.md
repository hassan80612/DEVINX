# Conflito entre leitura estrutural e projeção — experimento de 2026-10-17

## Decisão

Não publicar a candidata. A versão 13.9.35 atualmente publicada permanece como referência. O experimento não demonstrou melhoria reproduzível no vídeo disponível ou nas sequências adicionais. Nenhuma promessa de ganho de assertividade ao vivo é sustentada por estes resultados.

## Candidata testada

A escolha publicada entre projeções foi mantida. Uma regra adicional poderia substituí-la pela leitura estrutural somente em conflitos de reversão de faixa ou analogia de trajetória, depois de resultados observados de 30 segundos favorecerem essa leitura naquele tipo de conflito.

Regra definida antes dos resultados: no mínimo seis vencimentos não sobrepostos, amostrados a cada 30 segundos; probabilidade suavizada (acertos+2)/(amostras+4) de pelo menos 0,70; até 40 resultados por tipo; descarte de resultados com mais de 30 minutos. O número 0,70 é um limiar experimental, não uma estimativa validada de assertividade futura. A coleta não bloqueia a decisão existente nem acrescenta uma espera de entrada. A memória de aprendizado é local e limitada. A versão publicada não recebeu essa regra.

## Resultados

| Conjunto | Atual | Candidata | Observação |
| --- | --- | --- | --- |
| Vídeo, extração fina | 11 acertos / 3 erros | 11 / 3 | Uma entrada sem vencimento coberto, excluída; mesmas entradas |
| Mesmo vídeo, extração mais grossa | 10 / 3 | 10 / 3 | Uma entrada sem vencimento coberto; não é outra sessão independente |
| 20 cenários artificiais iniciais | 454 / 111 | 456 / 109 | Duas perdas corrigidas apenas no passeio aleatório de semente 2026101752; outros 19 cenários iguais |
| 4 novas sequências de passeio aleatório | 60 / 55 | 60 / 55 | Sementes 2026101753–2026101756, regra intacta; ganho não se repetiu |

No único cenário alterado, a maior sequência de perdas caiu de quatro para três. Nos 24 cenários artificiais, a pior sequência permaneceu em cinco. Não houve sessão com mais perdas ou pior sequência na amostra, mas a candidata foi inativa em 23 dos 24 cenários; isso limita fortemente o que o teste permite concluir.

Os cenários iniciais cobrem tendência, retrações, faixas regulares e variáveis, viradas bruscas, troca de tendência, saltos com retorno, faixa ruidosa, passeio aleatório e troca de volatilidade. São trajetórias geradas, algumas fáceis por construção, e não representam a assertividade real do produto ou do usuário. As quatro novas sementes foram escolhidas após o ganho isolado para verificar sua repetição, sem ajustar a regra.

## Diagnóstico que corrige a hipótese inicial

Nos horários fixos das 14 entradas com resultado coberto na extração fina, escolher sempre a leitura estrutural em lugar da decisão publicada produziria 9 acertos e 5 erros. Corrigiria duas perdas e estragaria quatro acertos. Em uma perda ambas as leituras estavam erradas.

Essa comparação é contrafactual em horários fixos. Não equivale à execução completa de uma política que desse prioridade permanente à estrutura, pois outra política pode mudar os horários de entrada. Ela já basta para mostrar que uma leitura descartada não é necessariamente a leitura correta, e que o problema não se resolve por inversão geral de prioridade.

## Validação e limites

- Dois testes passaram: preços futuros anexados à entrada não alteram decisões/evidências já disponíveis; a troca de ativo/provedor limpa o aprendizado e equivale a uma instância nova.
- Foram verificadas 1.464 entradas entre as duas versões nos conjuntos: duração exata de 30 segundos e nenhuma sobreposição de entradas.
- O comparativo executa o gate de validação e o ciclo de liberação/vencimento reais, incluindo alterações de horário que a candidata pudesse provocar.
- As 100 velas dos cenários artificiais são OHLC concluídos e coerentes com a mesma trajetória; o vídeo não contém esse histórico verificado e não recebeu velas inventadas.
- Apenas observações recebidas até a avaliação entram na análise. Dados posteriores servem exclusivamente ao avaliador de resultados.
- Não foram simulados escalonamento do Windows, contenção assíncrona completa do worker, clique manual ou liquidação de ordens da corretora.
- O vídeo já foi usado no desenvolvimento. Os dois extratos não fornecem validação independente.
- Os testes não demonstram que a piora relatada na sessão atual seja impossível.

## Reprodução

    node --test tests/sentinel-conflict-choice-causality.test.mjs
    node scripts/sentinel-conflict-choice-ab-20261017.mjs
    SENTINEL_CONFLICT_SEEDS=2026101753,2026101754,2026101755,2026101756 SENTINEL_CONFLICT_FAMILIES=random-walk SENTINEL_CONFLICT_LABEL=holdout node scripts/sentinel-conflict-choice-ab-20261017.mjs
    node scripts/sentinel-conflict-entry-diagnostic-20261017.mjs

Referência de produção: 406c8f6b7ffa6fa90cad6575c0903ba78205b697. O módulo experimental é instalado somente pelo script de comparação; não há alteração do construtor de produção, download ou deploy.
