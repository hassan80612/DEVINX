# DevinX Laser Agent

O Agent roda localmente no Windows e faz a ponte segura entre o DevinX e o LightBurn.

## Uso normal

O usuário não precisa de PowerShell.

1. Dê dois cliques em `DevinXLaserAgent.exe`.
2. Na primeira vez, o Agent abre o DevinX e pede apenas **Vincular este PC**.
3. Depois do vínculo, o Agent fica na bandeja do Windows.
4. O Agent registra inicialização automática para o usuário atual do Windows.
5. O LightBurn é monitorado localmente e o estado é enviado ao DevinX apenas quando muda ou em keep-alive periódico.

Se o Agent já estiver rodando e o usuário abrir o EXE novamente, o painel `https://devinx.com.br/laser-control` é aberto em vez de criar outra instância.

## Bandeja do Windows

O menu da bandeja oferece:
- **Abrir Laser Control**
- **Atualizar agora**
- **Sair**

Fechar a janela do navegador não encerra o Agent. O Agent continua em segundo plano até o usuário escolher **Sair** ou encerrar a sessão do Windows.

## LightBurn

### REST compatível
Quando houver REST API compatível e autorização local salva:
- usa `127.0.0.1:19520`;
- lê estado/projeto;
- o segredo fica protegido por DPAPI no Windows;
- o segredo nunca é enviado ao DevinX.

Pareamento REST técnico:
```powershell
DevinXLaserAgent.exe --pair-rest
```

### UDP legado
Quando REST não estiver disponível:
- usa apenas `PING` e `STATUS` em localhost;
- nunca envia comando físico;
- resposta ambígua `!` é tratada como **unknown**, não como “gravando”.

## Frequência

- leitura local aproximada: 15 s;
- envio imediato quando um estado relevante muda, respeitando limite mínimo;
- keep-alive: 60 s;
- nova tentativa após erro de rede: 30 s.

Isso mantém o card online sem criar polling agressivo na Vercel.

## Segurança

Continuam inexistentes nesta versão:
- START remoto;
- STOP remoto;
- PAUSE remoto;
- FRAME remoto;
- mouse/teclado;
- shell;
- desktop remoto;
- porta inbound no roteador.

O Agent usa identidade criptográfica própria por dispositivo e heartbeats assinados.

## Modo técnico

Mantido apenas para suporte/desenvolvimento:
```powershell
DevinXLaserAgent.exe --pair-devinx
DevinXLaserAgent.exe --heartbeat-once
DevinXLaserAgent.exe --json-status
DevinXLaserAgent.exe --pair-rest
```

## Limpeza local

```powershell
DevinXLaserAgent.exe --reset-local-state --confirm-reset
```

A limpeza remove o estado em `%LOCALAPPDATA%\DevinXLaserAgent` e também o registro de inicialização automática do Agent.
