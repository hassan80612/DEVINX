# Sentinel 13.9.41 — execução apenas CALL/PUT

O bot não ligava quando o campo de valor da corretora não era reconhecido. A mensagem genérica também citava duração, embora a duração já não fosse inspecionada. O bloqueio foi reproduzido em Chromium com botões ACIMA/ABAIXO e sem campo de valor.

Agora o executor localiza somente os botões de direção e clica uma vez no sinal final do analista. Não lê nem altera valor, duração, saldo ou modo da conta. O usuário deve ajustar na corretora o mesmo valor indicado no bot e a duração do analista; o painel explica isso. Saldo e payout informados são usados somente no cálculo local. O intervalo continua pulando sinais e os limites programados continuam disponíveis.

A execução não aguarda confirmação de ordem pela rede. Um clique concluído é registrado com identificador local, sem alegar confirmação da corretora. O resultado é uma estimativa pelas cotações já recebidas; uma corretora pode rejeitar um clique sem que esse cálculo local detecte a rejeição. O vencimento segue o horário final do analista, sem acrescentar o atraso do clique.

Um painel anterior com versão de estrutura 13.9.35 podia manter ouvintes antigos após receber novos controles. A estrutura 13.9.41 recria esse painel uma vez e preserva a posição salva. A instalação da ligação com o Agent só é marcada como concluída depois de sucesso e pode ser tentada novamente após falha. Mensagens de ação/erro aparecem dentro do painel do bot.

## Validação

- 357 regressões existentes e cinco novas regressões passaram (362 no total).
- Chromium local, para IQ Option e Exnova: apenas botões, ligação pelo driver real, painel legado migrado, uma chamada de iniciar, CALL/PUT sem confirmação de rede, intervalo alternado, estimativas de ganho/perda e erro visível no painel. Nenhuma conta real foi conectada.
- Motor do analista, leitor de mercado, relay, launcher e instalador PowerShell permanecem byte a byte iguais à versão anterior. Nenhuma mudança no Supabase, consulta adicional ou assinatura adicional.
- EXE Windows gerado com Go 1.24.9 verificado; não foi executado em Windows nem em uma sessão real da corretora.

## Identidade e rollback

Versão: 13.9.41. Build: 13.9.41-analyst-call-put-only.
EXE SHA256: `29b2accf6eb5edfbf3f97501a05de7fd2e0904a4a02c908065ee0f2f5a52d665`.
Payload SHA256: `68a0421dfbcc53039561645fe3445f6ec10d37c49038ad5fb8d19f9cd5526863`.

Original 13.9.38 preservado no commit `3d9317181686a5b14bdb57834560d984d9ea375c`, branch `backup/sentinel-13.9.38-original-20261018`, deployment `dpl_8krxzDhKBrVr8BxqJWUj3UdBqJkm` e arquivo independente já salvo. Nenhuma alteração nesses recursos.
