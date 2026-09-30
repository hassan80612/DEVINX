# DevinX Laser Agent 1.0.36

Agent Windows do DevinX Laser Control.

## Instalação simples

1. Baixe **DevinX-Laser-Agent-1.0.36.exe**.
2. Dê dois cliques.
3. O Agent instala ou atualiza automaticamente no perfil do usuário do Windows.
4. Na primeira instalação, o navegador abre o DevinX já com o vínculo preparado.
5. Confirme **Vincular este computador** uma vez.
6. Depois disso o Agent fica na bandeja do Windows e inicia automaticamente.

Não é necessário ZIP, extrair pasta, abrir CMD nem copiar código no uso normal.

## Binários separados

A partir da 1.0.36, o **DevinX Laser Agent** e o **DevinX Mentoria** são publicados por builds diferentes. O modo é definido na compilação, não pelo nome do arquivo. Renomear o EXE de Mentoria não o transforma no Agent permanente, e o Agent permanente não entra em modo Mentoria por argumento ou renomeação.

O download do Agent permanente fica apresentado somente dentro do Laser Control para contas autenticadas com acesso. O download de Mentoria continua público para o aluno, que não precisa criar conta.

## Mentoria temporária

O aluno recebe um link por e-mail e abre no computador conectado ao LightBurn.

1. Na página de mentoria, baixa **DevinX-Mentoria-1.0.36.exe**.
2. Dá dois cliques.
3. O executável reconhece automaticamente o modo Mentoria; não instala e não entra na inicialização do Windows.
4. Uma janela mostra um código temporário de 8 caracteres.
5. O aluno envia o código ao professor.
6. O professor conecta no DevinX.
7. O código vale 30 minutos para ser usado; a sessão conectada pode durar até 6 horas.
8. Quando o professor encerra, o acesso é revogado e o modo temporário fecha.

O vínculo permanente do computador, se existir, não é alterado.

## LightBurn

Abra o LightBurn normalmente. O Agent detecta o aplicativo e envia o estado do LightBurn e da máquina, além da visualização da janela somente durante uma sessão remota.

A transmissão usa canal temporário e não grava cada quadro da tela como histórico.

## Controle remoto

- Frame, Iniciar, Pausar e Parar;
- toque, mouse e teclado restritos à janela do LightBurn;
- tela ao vivo, zoom, pan e setas;
- controle permanece ativo ao entrar e sair da tela cheia;
- supervisão física, intertravamentos e botão de emergência continuam obrigatórios.

## Bandeja e desinstalação

No ícone do DevinX Laser Agent perto do relógio é possível abrir o Laser Control, atualizar o estado, sair e desinstalar.

A desinstalação remove inicialização automática, vínculo/chaves locais e arquivos instalados do usuário.

## Diagnóstico técnico

Opções técnicas continuam disponíveis para suporte, mas não fazem parte do fluxo normal:
- `--pair-devinx`
- `--pair-rest`
- `--heartbeat-once`
- `--json-status`
- `--reset-local-state --confirm-reset`


## Controles avançados do LightBurn
O Agent 1.0.16 combina a API local do LightBurn com a árvore de acessibilidade do Windows. As camadas e os valores de corte são lidos pela API sempre que disponível; a automação do Windows fica responsável por campos editáveis e diálogos que exigem interação.


## 1.0.15 — isolamento dos controles avançados
A leitura/escrita de parâmetros do LightBurn roda fora do loop Realtime. Um painel de camada que demore ou trave não pode bloquear Frame, Iniciar, Parar, transmissão ou controle remoto. A leitura tem timeout de 3 segundos e apenas uma operação avançada é executada por vez.


## 1.0.16 — comandos e diálogos remotos
- Frame/Iniciar/Pausar/Parar não dependem do estado em cache da interface; o Agent e o LightBurn dão a resposta real.
- Confirmação de comando tem retry para não deixar um comando preso como entregue sem ACK.
- Camadas são lidas pela API local do LightBurn quando disponível.
- Rotativo, camada e outros diálogos podem expor campos editáveis no painel DevinX, com ações de aplicar, cancelar e fechar.
- A release publicada é imutável: a mesma versão não é sobrescrita por novos builds.


## 1.0.17 — autorização automática de leitura do LightBurn
Quando a API local do LightBurn estiver disponível e ainda não houver autorização salva, o Agent solicita a permissão de leitura automaticamente uma única vez. O usuário confirma no próprio LightBurn. Depois disso, a autorização fica protegida no Windows e o Agent passa a ler camadas e parâmetros pela API local, mantendo UDP como fallback para comandos e versões sem REST.


## 1.0.18 — LightBurn 1.7.x / Galvo
A leitura por acessibilidade agora reconhece C00/T00 também por dados legados do Qt, considera seleção/foco do MSAA e localiza editores numéricos dos dois lados do rótulo. Isso cobre o layout do LightBurn 1.7.08 em que os valores do rotativo ficam à esquerda de “passos por rotação”, “diâmetro”, “circunferência” e velocidades.


## 1.0.19 — mentoria móvel completa
- Duplo toque em um campo na tela remota abre o teclado do celular no DevinX; o texto/valor é enviado ao campo focado no LightBurn.
- Janelas abertas por Preview, Importar, Rastrear, Ajustar imagem e Rotativo ganham OK/Enter e Fechar/Esc no controle remoto e na tela cheia.
- Frame/Iniciar/Pausar/Parar têm recuperação automática de estado e não exigem atualizar a página se uma confirmação atrasar.
- A inspeção de camadas/campos usa também Raw UIA + Legacy/MSAA para widgets Qt owner-drawn do LightBurn 1.7.


## 1.0.20 — compatibilidade adaptativa de camadas
O Agent não depende de um número de versão específico do LightBurn. Ele tenta, nesta ordem: REST quando disponível, ControlView UIA, Raw UIA, Legacy/MSAA e, se a lista Cuts/Layers for owner-drawn, a Color Palette 00–29/T1/T2. A janela principal é inspecionada separadamente dos diálogos, então abrir Rotativo ou Cut Settings não faz a camada desaparecer. O seletor do DevinX permite escolher uma camada detectada; quando só a paleta estiver acessível, o Agent limpa a seleção de formas antes do clique para evitar reatribuir arte existente.


## 1.0.21 — teclado, diálogos e retorno de entrada
O Agent identifica respostas de atalhos pelo requestId, captura janelas do LightBurn fora da janela principal e mapeia o ponteiro para a mesma área. Quando LightBurn com REST abre depois do Agent, a autorização de leitura pode ser oferecida sem reiniciar. Frame Diodo procura e aciona explicitamente o botão Frame da janela Laser; Frame Galvo mantém F1. As teclas confirmam a entrega de entrada ao Windows, não o movimento físico ou o resultado do LightBurn.


## 1.0.22 — leitura de diálogos do LightBurn antigo
Quando o navegador assume o foco, a inspeção usa a mesma janela do LightBurn já capturada pela transmissão, inclusive a janela de rotativo. A leitura de nós UIA preserva nomes mesmo quando widgets Qt não oferecem geometria no formato esperado e reconhece células 00–29 na lista Cuts/Layers. Se o LightBurn ainda não expuser valores à acessibilidade, a interface permite ampliar a área e editar diretamente na imagem com o teclado do celular. A disponibilidade de cada controle depende da interface da versão instalada.


## 1.0.23 — foco do workspace e mentoria móvel
As setas do DevinX agora têm um caminho dedicado que ativa a janela principal do LightBurn e envia a tecla diretamente ao workspace, evitando que um campo ou diálogo capture o movimento. A tela ao vivo normal aceita toque, duplo toque envia duplo clique real e abre o teclado do celular, e a seleção de camada nunca é presumida quando a versão do LightBurn não expõe o estado ativo.


## 1.0.24 — setas reais e controle móvel limpo
As setas do D-pad agora passam pelo caminho real de teclado do Windows depois de ativar e focar a janela principal do LightBurn, evitando o PostMessage que builds Qt podem ignorar. A interface móvel mantém teclado manual, zoom com botões e gesto, pan local da imagem ampliada e elimina duplicações do painel.


## 1.0.26 — toque rápido fora da tela cheia
O controle remoto não é mais desligado automaticamente ao sair da tela cheia. O toque simples no celular é enviado como um único comando de clique ao Agent, que injeta pressionar/soltar em uma única operação no Windows, reduzindo a latência sem alterar as setas, o zoom ou a lógica de edição de texto.


## 1.0.27 — toque alinhado e zoom estável
O ponteiro remoto usa os limites exatos da última imagem transmitida para manter os botões das bordas, topo e lateral do LightBurn alinhados ao toque. O caminho de clique não adiciona espera fixa quando o LightBurn já está no ponto correto. No celular, a pinça usa variação incremental limitada, mantém origem central estável e ignora o dedo restante até os dois dedos serem levantados, eliminando saltos e arrastos involuntários após o zoom.


## 1.0.28 — EXE direto e mentoria sem CMD
O download normal passou a ser um único EXE. O instalador direto copia ou atualiza a versão instalada e relança o Agent automaticamente. A mentoria usa um segundo EXE direto que entra em modo temporário pelo próprio nome do arquivo, sem ZIP, sem extração e sem CMD.


## 1.0.36 — expiração local da sessão remota
O Agent encerra localmente a transmissão e o controle quando a validade curta emitida pelo servidor termina. Enquanto a assinatura e a sessão continuam válidas, o polling normal renova essa validade e o funcionamento permanece igual. Se a renovação deixar de ser autorizada, o canal remoto é fechado sem executar novos comandos.


## 1.0.36 — backoff de acesso inativo
Quando o servidor informa que o dispositivo está sem acesso ativo, o Agent mantém o LightBurn local intacto, encerra qualquer canal remoto e reduz as tentativas de rede para uma verificação a cada 5 minutos. Ao renovar o plano, o acesso volta na próxima verificação ou ao reiniciar o Agent.
