# Distribuição do DevinX pela Microsoft Store

## Estado

Preparação de dois aplicativos MSIX x64, Windows 10 2004 ou superior / Windows 11:

- **DevinX Mentoria:** o aluno abre e recebe seu código; nenhuma inicialização automática.
- **DevinX Laser Agent:** vínculo permanente e inicialização pelo mecanismo do Windows; sem cópia do executável nem escrita de inicialização no Registro pela aplicação.

Os downloads EXE 1.0.31 existentes permanecem publicados. Não trocar os links até a aprovação da Store e teste real com LightBurn. O MSIX gerado aqui não é assinado: destina-se à submissão para assinatura da Microsoft, não a download direto por clientes. Não distribuir certificados de teste nem pedir ao cliente para desativar proteções.

## Cadastro que depende do titular

Entrar por https://storedeveloper.microsoft.com no fluxo gratuito. Selecionar o tipo de conta adequado à atividade (as instruções atuais da Microsoft direcionam atividades comerciais também de freelancers à conta Empresa). Concluir a verificação exigida e aceitar pessoalmente o contrato. Não inventar dados empresariais nem identidades de publicador.

Reservar o nome de cada aplicativo. Em Product management > Product identity, obter:

- Package/Identity/Name
- Package/Identity/Publisher
- Publisher display name

Cada produto tem sua própria identidade. Sem esses dados oficiais, o pacote gerado em CI serve apenas à validação e não está pronto para submissão.

## Build e validação

O workflow `Laser Agent Microsoft Store` compila o EXE tradicional, testa isolamento de dados/inicialização e empacota os dois aplicativos com validação semântica do Windows SDK e comparação do hash do executável extraído. Os artefatos de teste têm `VALIDATION-NOT-FOR-DISTRIBUTION` no nome.

Com as identidades oficiais, executar o mesmo workflow manualmente, selecionando Agent ou Mentoria e preenchendo os três dados e a versão. O último componente da versão da Store deve ser zero; incrementar a versão nas atualizações. O artefato `microsoft-store-submission` contém o MSIX, seu SHA-256 e o commit de origem. A Microsoft assina o pacote após certificação; nenhum certificado pago é usado.

## Adaptações e limites

`StoreDistribution=true` define `DEVINX_STORE`. Apenas esse build evita a instalação própria e usa pastas de estado separadas, sem apagar o vínculo do EXE tradicional. A opção de desinstalação revoga o vínculo e abre as Configurações do Windows, onde o usuário remove o aplicativo. A mentoria fecha a sessão, mas o aplicativo instalado pela Store permanece disponível até ser desinstalado.

O Agent declara uma tarefa de inicialização no manifesto. Antes do vínculo, a execução em segundo plano termina sem criar acesso. A decisão do usuário de desativar a inicialização nas Configurações é respeitada. Fechar o Agent tradicional antes de testar o Agent da Store: o mutex existente continua impedindo duas instâncias permanentes.

Não se solicita execução administrativa ou `uiAccess`. LightBurn e Agent devem executar como usuário normal. A compatibilidade da captura de tela, UI Automation, mouse, teclado, camadas e rede local deve ser confirmada em Windows real com LightBurn; a validação de pacote em CI não comprova essas funções.

## Antes de publicar

1. Submeter primeiro em audiência privada para testar a instalação assinada pela Store.
2. Instalar, abrir LightBurn, vincular e verificar controles, quadro ao vivo e encerramento/revogação da sessão.
3. Reiniciar: Agent vinculado pode iniciar; Mentoria não pode iniciar. Desativar inicialização pelo Windows e confirmar que é respeitada.
4. Atualizar pela Store sem perder vínculo. Desvincular/desinstalar e confirmar ausência de acesso remoto.
5. Finalizar classificação etária, política de privacidade pública correta, contato de suporte e capturas reais da interface. Revisar a política existente com relação ao agente antes de usá-la.
6. Após aprovação e teste, atualizar o botão no site para o Product ID real. A página de mentoria deve dizer "instalar e abrir", sem alegar que nada é instalado.

### Texto sugerido para o cadastro

**Mentoria:** Conecte o LightBurn ao seu professor pelo DevinX. Abra o aplicativo, compartilhe o código temporário com o professor e acompanhe a sessão. O professor precisa de acesso à plataforma DevinX. Requer LightBurn instalado e conexão à internet. O aplicativo permanece instalado para futuras sessões e não inicia com o Windows.

**Agent:** Conecte seu computador com LightBurn ao DevinX Laser Control para acompanhar o estado e usar as funções de controle remoto autorizadas. Requer LightBurn, internet e acesso ao serviço DevinX. O acesso ao serviço pode depender de plano pago; baixar o agente não inclui uma assinatura.

**Justificativa de runFullTrust para certificação:** Aplicativo desktop .NET/WinForms que integra o LightBurn local com o serviço DevinX. Usa APIs Win32 e UI Automation para localizar e controlar a janela do LightBurn e capturar sua visualização durante sessão remota autorizada. A versão Mentoria exige a abertura pelo aluno e compartilhamento de código temporário; a versão Agent exige vínculo com uma conta. Não solicita elevação administrativa, instalação de driver ou alteração de proteções do Windows. Validar esses comportamentos na revisão de certificação.

Referências oficiais: https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options e https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation
