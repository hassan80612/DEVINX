# Sentinel 13.9.29

Publicação autorizada pelo usuário após a pesquisa de movimentos rápidos: “Já lança tudo já”. Base: 13.9.28, commit `a83ac46f40e448595070dc21511d3f9739708dc8`. O relatório anterior de pesquisa registra o estado antes dessa autorização.

## Alterações integradas

- Retenção do histórico por tempo: preserva amostras reais de abertura, extremos e fechamento, o último tick e os metadados. Corrige a perda de contexto causada pelo corte fixo em 2.400 observações quando chegam muitas cotações. A compactação não espera um intervalo fechar nem consulta a página da corretora.
- Projeção do sincronizado para o mesmo deadline do contador. O aviso permanece em `:27` e o vencimento em `:00`; a projeção harmônica deixa de mirar `:57`. O modo de relógio atual mantém seu prazo normal de 30 segundos. O fallback estrutural continua disponível, sem nova espera pelo modelo harmônico.
- Seleção adaptativa entre o modelo publicado e a busca de períodos de 4–180s, usando resultados de previsões já concluídos. O modelo-base continua emitindo enquanto há poucos exemplos; os cinco exemplos mínimos não bloqueiam uma entrada. A margem de perda 0,1 e a atualização exponencial 0,2 são medidas internas de comparação, não probabilidade de acerto.
- As previsões de sombra são registradas a cada 5s, sem temporizador adicional. Quando existe alvo sincronizado explícito, o resultado é medido nesse alvo, incluindo os três segundos de aviso antecipado. Empates e observações recebidas mais de 1s depois do alvo não treinam a comparação. Cotação atrasada, repetida ou de outro contexto não pode treinar novamente a previsão.
- A comparação é reiniciada por corretora, ativo, duração e modo de relógio. Repetições da mesma cotação reutilizam o ajuste ampliado. O ciclo que já foi sinalizado continua com lado e vencimento fixos.

A alternativa de tendência local de 20s que piorou uma leitura do vídeo não foi integrada. A busca ampliada também não substitui o modelo-base incondicionalmente: sua direção precisa ter o suporte da comparação por resultados concluídos.

Preservados: aviso sincronizado em :27 sem leitura pesada do DOM, card PC/celular, retirada do preço ao vencer, acesso por conta sem limite antigo de PCs e demais mudanças da 13.9.28. Sem execução automática de operações, novas assinaturas de mercado, migração de banco ou alteração de autenticação/comercialização.

## Validação

**243 testes passaram em 48 arquivos.** A compilação completa Next.js passou, incluindo tipagem e geração das páginas. Os avisos CSS antigos sobre `end`/`start` permaneceram sem impedir a compilação.

Os testes novos comparam a implementação operacional com a candidata estudada, incluindo a sequência inteira de decisões, mesmas admissões e mesma direção durante cada janela. A ingestão do runtime continua reproduzindo os sinais do vídeo anterior. A busca ampliada no código operacional foi comparada diretamente com o algoritmo da pesquisa.

No mesmo vídeo, a leitura de seis casas continua em **10 acertos, 4 erros e 1 desconhecido (71,4%)**. A leitura de cinco casas continua em 10/3/1. Essas leituras pertencem ao mesmo vídeo e usam horários livres; não comprovam assertividade real atual nem a taxa do relógio sincronizado. As melhorias em reversões e oscilações geradas, com falhas ainda presentes nos ritmos variáveis, estão integralmente no relatório de pesquisa. **90% não foi comprovado.**

Medição local de ingestão mais `_signalValidationGate` real, com 100 cotações distintas após aquecimento: p50 7,971ms, p95 11,608ms, máximo 12,767ms. É custo Node local; não mede Windows, transporte ou a corretora. O agendador e os temporizadores de exibição mantêm suas cadências. O tempo efetivo de cálculo continua sendo descontado da tolerância para não liberar entrada sincronizada atrasada.

O instalador local foi compilado com Go 1.24.9, 2.664.960 bytes. Verificados o cabeçalho Windows, o ZIP embarcado, sua identidade SHA256 e a igualdade dos arquivos de runtime, seleção, retenção, projeção e driver com as fontes revisadas. O ZIP alternativo inclui o mesmo payload. O build remoto recria esses pacotes a partir do commit publicado; a conferência pública é feita após o deployment READY.

É necessário instalar o **Agent Windows 13.9.29**; o site sozinho não muda o motor que roda no computador. O preço de referência é o da emissão do sinal. O sistema não confirma o preço ou o vencimento de um clique manual posterior.
