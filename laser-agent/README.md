# DevinX Laser Agent 1.0.22

Agent Windows do DevinX Laser Control.

## Uso normal

1. Extraia o ZIP em uma pasta.
2. Dê dois cliques em `DevinXLaserAgent.exe`.
3. Na primeira execução, o Agent copia seus arquivos para:
   `%LOCALAPPDATA%\Programs\DevinX Laser Agent`
4. O navegador abre o DevinX para vincular o PC.
5. Depois de vinculado, o Agent permanece na bandeja do Windows e inicia automaticamente com o usuário.

O vínculo fica salvo. Não é necessário repetir o pareamento a cada inicialização.

## LightBurn

Abra o LightBurn normalmente. O Agent detecta o aplicativo e envia:
- estado do LightBurn e da máquina;
- projeto/progresso quando a API local disponibiliza;
- visualização da janela somente enquanto existe uma sessão remota aberta no DevinX.

A transmissão ao vivo usa um canal temporário e não grava cada quadro no banco.

## Controle remoto

- Botões dedicados: Frame seleção, Iniciar, Pausar e Parar.
- Iniciar usa o comando local documentado pelo LightBurn.
- Frame/Pause/Stop usam os atalhos oficiais do LightBurn no Windows.
- O modo de mouse/toque/teclado só aceita entrada dentro da janela do LightBurn.
- O modo de toque é habilitado pelo dispositivo remoto em tela cheia e é desativado ao sair da sessão.

A supervisão física da máquina, intertravamentos e botão de emergência continuam obrigatórios.

## Bandeja do Windows

Clique no ícone do DevinX Laser Agent perto do relógio para:
- abrir o Laser Control;
- atualizar o estado;
- sair;
- desinstalar o Agent.

## Desinstalação

No ícone da bandeja escolha **Desinstalar DevinX Laser Agent**.

O Agent:
1. informa o DevinX;
2. remove a inicialização automática;
3. apaga o vínculo/chaves locais;
4. remove os arquivos instalados do usuário.

Não é necessário editar o Registro ou apagar pastas manualmente.

## Diagnóstico técnico

Opções de suporte continuam disponíveis:
- `--pair-devinx`
- `--pair-rest`
- `--heartbeat-once`
- `--json-status`
- `--reset-local-state --confirm-reset`

O modo normal não abre console.


## Mentoria temporária
No pacote existe **INICIAR-MENTORIA.cmd**. Este modo não instala o Agent, não entra na inicialização do Windows e usa identidade/estado separados do Agent permanente.

1. Extraia o ZIP.
2. Abra `INICIAR-MENTORIA.cmd`.
3. Envie ao professor o código de 8 caracteres exibido. O código vale 30 minutos e, após a conexão, a sessão pode durar até 6 horas.
4. Quando o professor encerrar a sessão, o acesso é revogado e o Agent temporário fecha.
5. O vínculo permanente do computador, se existir, não é alterado.


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
