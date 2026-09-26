# DevinX Laser Agent

Esta pasta é propositalmente independente do build Next.js/Vercel.

## Estado atual

O Agent está em **safe foundation**. Nenhum comando remoto de máquina é aceito.

Ele possui dois adaptadores locais:

### LightBurn 2.2 REST
- detecta a API oficial em `127.0.0.1:19520`;
- pareia localmente por `POST /api/connect`;
- solicita somente capacidades `state` e `project`;
- o próprio LightBurn exibe uma janela de consentimento no PC;
- o segredo retornado fica criptografado para o usuário atual do Windows via DPAPI;
- lê status, projeto e snapshot de estado;
- não expõe o segredo ao site DevinX.

Para solicitar o pareamento local:

```powershell
DevinXLaserAgent.exe --pair-rest
```

### LightBurn UDP legado
Se a REST API não estiver disponível:
- envia somente `PING` e `STATUS` para `127.0.0.1:19840`;
- escuta a resposta em `127.0.0.1:19841`;
- nenhum comando de execução é enviado.

## O que propositalmente não existe

- START remoto;
- STOP remoto;
- PAUSE remoto;
- FRAME remoto;
- controle de mouse ou teclado;
- shell / PowerShell / cmd;
- desktop remoto;
- acesso irrestrito a arquivos;
- porta inbound aberta no roteador.

A documentação pública atual da REST API 1.0 do LightBurn 2.2 oferece principalmente estado, projeto e upload/open de arquivos. O UDP documentado oferece START, mas não fornece um conjunto simétrico documentado de Stop/Pause/Frame. Por isso o Agent não habilita execução remota nesta fase.

## Segurança

O segredo REST do LightBurn nunca deve ser enviado ao DevinX. Ele autentica somente chamadas do Agent para o LightBurn em localhost.

A autenticação futura entre **Agent ↔ DevinX** será uma credencial separada, revogável e vinculada ao dispositivo.

## Build

Requer .NET 8 SDK no Windows:

```powershell
dotnet restore .\laser-agent\DevinXLaserAgent.csproj
dotnet run --project .\laser-agent\DevinXLaserAgent.csproj
```

O instalador, tray UI, atualização assinada e transporte remoto serão adicionados somente depois que o banco correto do DevinX e o fluxo de pareamento do produto estiverem validados.
