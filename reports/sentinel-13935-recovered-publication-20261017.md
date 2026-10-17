# Recuperação da 13.9.35 completa — 17/10/2026

Produção READY em https://trading.devinx.com.br. Commit `406c8f6b7ffa6fa90cad6575c0903ba78205b697`, árvore `cf3710f28b6088cc246bf72361c0c3181eff2604`, implantação `dpl_2V2umnmTKkRTJPUpzg9rcGaAVpPz`.

O usuário pediu a 35 preparada neste chat. A 35 publicada posteriormente em `b30bc8e5474b6cd3616341b0aae7efbd76bce7b6` tinha somente o limite do buffer do driver, sem a otimização de busca de extremos/pivôs e sem o limite equivalente na entrada do runtime. A recuperação parte do código aprovado da 34 (`fa0343e9df66511072d51efa7b39d5c40fca5443`) e restaura essas três alterações, a identificação de versão e os testes de carga.

As regras de direção, projeção, seleção inicial, mapa de níveis e estrutura histórica permanecem byte a byte iguais às da 34. A sequência de níveis indexa os extremos já confirmados em vez de repetir filtros para cada cotação de cada nível. O buffer descarta cotações com mais de cinco minutos, preservando as 100 velas de níveis separadamente. Não há nova coleta, espera artificial, arquivo de histórico, consulta ou escrita no Supabase.

Os quatro casos novos abrangem duas horas simuladas em IQ/Exnova, memória do runtime e equivalência exata em 40 trajetórias densas, lentas, espelhadas e com lacunas. Com os casos existentes de sequência e feed, 23 testes locais passaram. A compilação de produção executou a bateria completa de 276 testes e gerou os instaladores. O novo link inclui a identidade da compilação para distinguir esta 35 da outra publicação com o mesmo número.

Antes de promover, foram baixados o EXE e o ZIP do endereço da implantação e conferidos os oito módulos, versões, manifesto, SHA256, CRC e conteúdo embutido. Depois da promoção, os downloads do domínio canônico foram baixados e conferidos novamente. Os dois aliases de EXE têm bytes idênticos. O download parcial com cabeçalhos de navegador Windows/Edge retornou HTTP 206 e os bytes esperados. O instalador conserva a ação compartilhada de abrir o site após o sucesso.

O EXE validado também foi anexado à conversa: `libfile_63577a67ac1c8191a5166e0580c4a33e`. SHA256: `b9717ffafcf5985b947ea0ffb98a54a0d354fb72e0beef2744e75125293f7bd4`.

A causa do erro no Edge do usuário continua sem confirmação. As imagens mostram falha de download antes de executar o instalador; não provam bloqueio por antivírus ou SmartScreen. Os bytes do EXE da 34 servido anteriormente eram os mesmos do pacote original. O nome da branch de restauração de entrega 13.9.30 não significava que o executável fosse dessa versão. Não houve nova tentativa de trocar MIME, desligar proteções ou repetir a rota de API que já falhou.

Esta verificação confirma recuperação da versão, compilação e entrega dos bytes. Não confirma instalação/abertura nativa no Windows do usuário nem elimina todas as causas possíveis de lentidão ou erro de download no PC. Nenhuma melhoria nova de assertividade foi anunciada.
