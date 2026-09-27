# DevinX Laser Control — escopo aprovado

## Regra de produto
- Nenhum controle entra na interface sem caminho técnico real e testado.
- Nada de botões decorativos, automação frágil por coordenadas ou funções que só "parecem" funcionar.
- Manter Frame, Executar, transmissão e controle remoto já estabilizados.
- Mudanças devem ser coordenadas e publicadas em poucos deploys, com rollback simples.

## Controle comum — Fiber e Diodo
- Frame / encerrar Frame
- Iniciar, Pausar, Parar
- Camada ativa
- Ativar/desativar camada
- Velocidade
- Potência
- Número de passes
- Selecionar tudo
- Mover X/Y
- Largura/altura
- Manter proporção
- Girar 90°
- Espelhar horizontal/vertical
- Centralizar arte
- Abrir arquivo recente
- Salvar
- Presets
- Estado da máquina

## Fiber / Galvo
- Frequência
- Hatch ligado/desligado
- Intervalo do hatch
- Ângulo do hatch
- Cross-hatch
- Demais opções de hatch somente quando suportadas de modo confiável
- Rotativo: ativar/desativar, configuração, mm por rotação/circunferência, inverter direção, teste e retorno

## Diodo
- Velocidade
- Potência mínima/máxima quando suportada
- Passes
- Air Assist quando controlável
- Linha/preenchimento
- Intervalo de linhas
- Overscan quando suportado
- Origem/posição do trabalho
- Movimento X/Y/Z quando a máquina permitir

## Ajuste rápido
No celular e desktop, mostrar os principais valores da camada atual em controles grandes:
Velocidade | Potência | Frequência | Hatch | Ângulo.
A interface só deve mostrar campos realmente aplicáveis ao tipo de máquina.

## Presets
Presets reutilizáveis por material/uso, por exemplo:
- Copo preto Fiber
- Inox
- Foto Diodo
- Madeira
- Caneca
Aplicar parâmetros nunca inicia uma gravação automaticamente.

## Imagem
Fluxo aprovado para fotos:
celular/outro PC -> DevinX -> Agent -> clipboard do Windows -> LightBurn.
Também fazem parte do escopo:
- Enviar imagem
- Preview
- Ajustar imagem
- Rastrear imagem
SVG/DXF devem preservar vetor e serão tratados pelo caminho de importação apropriado.

## Mentoria
- O aluno não precisa criar conta.
- O aluno abre o modo temporário do Agent e recebe um código.
- O código é a autorização; não existe uma segunda tela de aprovação.
- O professor digita o código e recebe acesso completo à sessão.
- Se quiser apenas visualizar, basta não interagir.
- A sessão do aluno não vira PC permanente do professor.
- O professor pode encerrar a sessão; o acesso é revogado imediatamente.
- O Agent de mentoria não deve instalar inicialização automática.
- Estado e identidade temporários são separados do Agent permanente.
- Encerrada a sessão, o Agent temporário fecha e limpa seu estado.
- O vínculo permanente de um cliente não pode ser apagado pela mentoria.

## Licença e cobrança
- Possuir o EXE não concede acesso ao serviço.
- Agent permanente exige entitlement ativo no servidor.
- Mentoria é entitlement separado.
- Conexões de mentoria podem ser incluídas ou cobradas; preços serão definidos depois.
- O servidor registra billing_mode/billing_state por sessão.
- A conta Master pode operar sem cobrança.
- Código de mentoria é de uso único, curto e expira.
- Limites de tentativa e de sessões simultâneas devem impedir abuso.

## Desktop
Desktop não deve parecer versão esticada do celular.
- Layout amplo e profissional
- Tela do LightBurn dominante
- Mouse físico, scroll, clique direito, duplo clique e teclado reais
- Barra de controles pequena e clara
- Painel de parâmetros lateral
- Meus PCs e Mentoria separados
- Validar DPI, 1080p/2K/4K e, quando possível, múltiplos monitores

## Mobile
- Manter tela cheia para gestos de toque
- Melhorar precisão do toque sem alterar o caminho Realtime/Agent já estabilizado
- Zoom local por pinça
- Futuramente teclado móvel dedicado para campos de texto

## Interface visual
- Abandonar o visual apagado/rosa atual.
- Direção: metal/grafite/titânio, brilho controlado, alto contraste, detalhes elétricos vivos.
- Botões precisam ter profundidade, estados claros e feedback visual.
- Desktop grande; mobile reorganizado, não simplesmente comprimido.

## Idiomas
Preparar Laser Control para todos os idiomas existentes no DevinX:
- pt-BR
- en
- es
- fr
- ar (RTL)
- de

## Segurança operacional
- Stop sempre evidente.
- Mudança de parâmetro nunca inicia máquina.
- Estado Parado / Framing / Gravando / Pausado sempre visível.
- Não expor calibração profunda, lente, controladora ou configuração crítica sem necessidade.
