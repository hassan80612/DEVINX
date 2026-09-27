# DevinX Laser Agent 1.0.11

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
