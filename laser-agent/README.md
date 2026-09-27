# DevinX Laser Agent 1.0.16

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
