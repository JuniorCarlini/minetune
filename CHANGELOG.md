# Changelog

Todas as mudanças relevantes do Minetune ficam registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

Tipos de mudança: **Adicionado** (novidades), **Alterado** (mudanças no que já
existia), **Obsoleto** (vai sair numa versão futura), **Removido**, **Corrigido**
(bugs) e **Segurança** (vulnerabilidades).

## [0.3.4] - 2026-09-15

### Corrigido

- Com o servidor numa versão anterior à 1.21.6, que não tem a janela de senha, o
  portão recusava todo mundo. Nessas versões ele agora só repassa as conexões, e a
  tela Jogadores avisa que ali não há senha por nick.
- EasyPanel e Umbrel usam uma imagem com Java 25 que não dá para trocar, e escolher
  uma versão que precisa de outro Java deixava o servidor sem ligar. O painel agora
  lê o Java de dentro do container e recusa essas versões, explicando o motivo.
- Com o limite de memória do container em 4 GB ou menos, a memória padrão de 4 GB
  não cabia e o servidor não ligava na primeira vez. A memória inicial agora se
  ajusta ao limite, deixando cerca de 1 GB livre.

## [0.3.3] - 2026-09-15

### Corrigido

- No EasyPanel, salvar o compose apagava o mundo: ele apaga e recria a pasta do
  serviço a cada vez que o compose é salvo, e o `deploy/compose.yaml` guardava mundo,
  configuração e backups em `./data`, `./config` e `./backups`, dentro dessa pasta.
  Agora eles ficam em volumes nomeados do Docker, que sobrevivem a salvar e reimplantar.

## [0.3.2] - 2026-09-15

### Corrigido

- No Minecraft 26.2 com o servidor em modo offline, o jogo recusava a entrada pelo
  portão com "Failed to decode packet login_finished": o 26.2 passou a mandar um dado a
  mais no fim do login. O portão agora usa o formato de cada versão.

## [0.3.1] - 2026-09-15

### Corrigido

- Numa instalação nova o servidor liga no modo online (contas originais) e o portão
  recusava todo mundo com "Algo deu errado". No modo online o portão agora só repassa
  as conexões, porque o próprio Minecraft já garante o nick de cada um; a senha por
  nick vale no modo offline. A tela Jogadores explica em qual dos dois o servidor está.

## [0.3.0] - 2026-09-15

Senha por nick dentro do jogo, vários mundos com envio e download, painel e site em
três línguas e tudo pronto para instalar pelo EasyPanel e pelo Umbrel.

### Adicionado

- **IP real dos jogadores atrás de túnel**: com "Proxy Protocol" ligado no playit.gg
  (ou no frp), o portão lê o IP de cada jogador, e bans e limites passam a valer por
  pessoa. Só aceita esse cabeçalho vindo da própria máquina ou da rede local.
- **playit.gg sem rede do host** (`compose.tunnel-bridge.yaml`), para Docker Desktop no
  Mac e no Windows, e guia de como abrir o servidor: port forward, túneis que funcionam
  para Minecraft Java e firewall de VPS na Oracle, Hetzner, Hostinger e Magalu Cloud.
- **Template do EasyPanel** gerado a partir do `deploy/compose.yaml`, com as senhas
  criadas na instalação, e app do Umbrel pronto para a loja da comunidade: uma senha
  derivada para cada uso, dados dentro da pasta do app e versão fixa das imagens.
- **Portão Minetune: senha por nick dentro do jogo**. Na primeira vez que alguém
  entra, uma janela do próprio Minecraft pede para criar uma senha, e depois ela é
  pedida a cada entrada. Ninguém entra com o nick de outra pessoa, derruba quem já
  está jogando ou mexe no mundo antes da senha. Funciona com Paper, Vanilla, Fabric
  e NeoForge a partir do Minecraft 1.21.6, sem plugin nem mod, e usa cerca de 30 MB
  de RAM. Em Jogadores dá para desligar a senha e resetar a de alguém. No Paper, o
  servidor passa a aceitar só quem chega pelo portão e continua vendo o IP real de
  cada jogador. A tela Início avisa se o portão parar, e ligar a senha com gente
  jogando desconecta só quem entrou sem senha.
- **Mapa de seeds no site**: digite uma seed e veja os biomas, as estruturas
  (vilas, fortalezas, mansões, cidades ancestrais, câmaras do desafio e mais) e o
  spawn, do Minecraft Java 1.18 ao 26.2, no mundo normal, no Nether e no End.
  O cálculo roda no navegador com o cubiomes compilado para WebAssembly e foi
  conferido contra um servidor 26.1.2 de verdade. Clicar num ponto ou numa
  estrutura abre as coordenadas com o comando de teleporte pronto, já com a
  altura do chão calculada.
- **Endereço público no painel**: `PUBLIC_ADDRESS` no `.env` define o que aparece
  em "Como entrar" (domínio ou endereço do túnel). Sem ele, o painel avisa quando o
  endereço mostrado só funciona no próprio computador ou na mesma rede.
- **Convidar pelo menu de quem está jogando**: "Adicionar aos convidados" (ou
  "Tirar dos convidados") junto de administrador, expulsar e banir.
- **Vários mundos**: crie, renomeie, apague e troque o mundo ligado pela tela
  Mundos. Cada mundo guarda a própria configuração, plugins e listas de
  convidados, administradores e banidos; um mundo novo começa sem pessoas.
- **Travas de compatibilidade**: o painel não deixa trocar um mundo salvo pelo
  Paper para Vanilla, Fabric ou NeoForge (o servidor caía ao ligar) nem voltar um
  mapa para uma versão mais antiga, e explica o motivo no campo.
- **Painel e site em inglês e espanhol**, além do português. A língua segue o
  navegador e pode ser trocada no login e em Aparência; o site ganhou `/en/` e `/es/`.
- **Cinco logos novos**: creeper com alavanca, rack de redstone, lâmpada de
  redstone, bloco de comando e creeper de redstone.
- **Imagens publicadas e deploy sem o código-fonte**: `minetune-panel`,
  `minetune-mc` e `minetune-backup` no GitHub Container Registry (amd64 e arm64),
  o `deploy/compose.yaml` para colar no EasyPanel e uma Community App Store para o Umbrel.
- **Explicação no "?" de todas as opções**: as 59 regras do jogo e todas as
  configurações dizem em uma frase o que mudam no jogo, nas três línguas.
- **Enviar, baixar e recuperar mundos**: suba um mundo em .zip pela tela Mundos, baixe
  qualquer mundo (o ligado sem desconectar ninguém) e recupere só um mundo de uma cópia
  de segurança. O envio confere o arquivo antes de extrair e explica o que está errado:
  programas e scripts, caminhos que saem da pasta, "zip bomb", mundos do Bedrock e
  arquivos que não são de mundo são recusados; da configuração do arquivo só entram as
  opções conhecidas do painel.

### Alterado

- No celular, o menu lateral abre como gaveta e os modais aparecem centralizados.
- Agente do playit.gg na versão 1.0.
- Memória do servidor em GB, só com números; o painel mostra o máximo que cabe na máquina.
- Mapa de seeds: bússola marcando o spawn, cursor de mira, destaque ao passar o
  mouse numa estrutura e marca no ponto clicado.
- Componentes Tucano na versão 0.33.
- Site com os prints do painel em inglês e espanhol e rodapé só com Início,
  Mapa de seeds, Changelog e GitHub.

### Corrigido

- Jogadores entrando pelo túnel (playit) ou por proxy eram recusados quando
  alguém tinha acabado de entrar: todos chegam com o mesmo IP e o Paper limitava
  uma conexão a cada 4 segundos por IP. O limite fica desligado.
- Um texto colado por engano no nome do mundo virava uma pasta com a frase inteira;
  agora nomes com cara de frase são recusados ao criar ou renomear.

## [0.2.0] - 2026-09-13

Painel pensado para quem não é técnico: todas as telas num padrão só, tela Início
com avisos, versões oficiais do Minecraft, destino dos backups pelo painel e
site oficial com SEO e GEO.

### Adicionado
- Site no GitHub Pages com página inicial e changelog, no mesmo visual do painel.
  O changelog do site é gerado a partir deste arquivo a cada push.
- Imagem de prévia (Open Graph, 1200×630) para links do site no WhatsApp,
  Discord, X e LinkedIn.
- SEO e GEO no site oficial: dados estruturados (software, autor, perguntas
  frequentes e caminho do changelog), `sitemap.xml`, `robots.txt` liberando
  buscadores e assistentes de IA, `llms.txt` com o resumo do projeto e seção de
  perguntas frequentes visível na página.
- Seletor de versões do Minecraft nas Configurações, com a lista oficial de cada
  software (Paper, Purpur, Fabric, NeoForge e Vanilla), mais recentes primeiro,
  opção de sempre usar a mais recente e versões de teste escondidas por padrão.
- Aviso quando a versão escolhida precisa de outra imagem de Java, com a troca
  exata do `MC_IMAGE_TAG`, e quando a troca volta para uma versão mais antiga
  que a do mundo.
- Destino dos backups configurável pelo painel (Backups → Onde guardar): disco local,
  Cloudflare R2, AWS S3, S3 próprio (RustFS/MinIO) ou repositório restic
  avançado, com frequência, retenção, pausa sem jogadores e limite de upload.
- Botão "Testar conexão", que confere o destino antes de salvar e explica em
  português credencial recusada, bucket inexistente, senha diferente ou endereço
  inacessível.
- Ao salvar, o repositório é criado se o destino estiver vazio e o agendador
  reinicia já com a nova configuração, sem `make up`.
- Tela Início com o estado do servidor em frase, "Como entrar no servidor" com
  endereço para copiar e "Precisa de atenção" juntando os avisos (servidor
  desligado, memória cheia, jogo travando, backup só local ou antigo) com o botão
  que resolve cada um.
- Uso do processador na tela Início, em porcentagem da capacidade total da
  máquina e com barra, junto de jogadores, memória e desempenho.
- Chave "Só convidados podem entrar" direto na página de Jogadores, aplicada na
  hora com o servidor ligado.
- "Opções avançadas": nomes técnicos e ajustes fáceis de quebrar ficam escondidos
  até a pessoa ligar a opção.

### Alterado
- Todas as telas seguem o mesmo padrão: caminho nas subpáginas, título com uma
  frase, ações da página à direita, avisos com o botão que resolve, cartões e
  barra de salvar só em formulários. Carregamento e erro aparecem no lugar do
  conteúdo, com "Tentar de novo", sem sumir com o título.
- Menu reorganizado pelo que a pessoa faz: Principal (Início, Jogadores, Regras
  do jogo), Servidor (Configurações, Plugins e mods, Backups) e Avançado (Console).
- Textos em linguagem de jogador: administradores em vez de op, lista de
  convidados em vez de whitelist, desempenho em vez de TPS, cópias de segurança
  em vez de snapshots.
- Jogadores: expulsar e banir ficam no menu "Mais" de cada pessoa.
- Regras do jogo: busca e categorias filtram dentro do próprio cartão.
- O container `backup` passa a carregar `config/backup.env` a cada início. O
  arquivo tem prioridade sobre o `.env`, é gravado com permissão 600 e fica fora
  do git. Sem ele, tudo continua vindo do `.env` como antes.
- Backups manuais respeitam o mesmo limite de upload do agendador.

### Corrigido
- Na página de Jogadores, o cartão de Operadores vazio deixava um espaço em
  branco embaixo; agora o aviso preenche o cartão como na Whitelist.
- O seletor de frequência dos backups fechava sozinho logo após abrir, sem dar
  tempo de escolher.
- Em monitores largos, o conteúdo do painel parava em 1240px colado à esquerda;
  agora acompanha a tela até 1680px e fica centralizado.

## [0.1.0] - 2026-09-12

Primeira versão: servidor, backups, painel web e documentação.

### Adicionado

#### Servidor
- Stack Docker Compose com os serviços `mc`, `backup`, `panel` e `docker-proxy`.
- Servidor sobre `itzg/minecraft-server` com Java 25; Paper 26.2 por padrão e
  opção de Purpur, Fabric, NeoForge ou Vanilla.
- Configuração do jogo em `config/server.env`, carregada a cada start: basta
  reiniciar para aplicar.
- Plugins e mods declarados por loader em `config/modrinth/<loader>.txt`.
- Patches de desempenho do Paper (explosões, redstone Alternate Current, limites
  de entidades) e Chunky para pré-gerar o mundo.
- Flags de GC Aikar ativadas por padrão.
- Crossplay com Bedrock via Geyser e Floodgate, desligado por padrão.
- `make init` gera o `.env` com segredos aleatórios e permissão `600`.
- Comandos `make` para subir, parar, reiniciar, logs, console, backup, restore,
  update e verificação.

#### Backups
- Backups com restic: incrementais, deduplicados e criptografados.
- Destinos: disco local, AWS S3, Cloudflare R2 ou RustFS (overlay
  `compose.s3-local.yaml`).
- Backups agendados, manuais e automáticos antes de restore e de update, com
  retenção configurável e pausa quando o servidor está vazio.
- Restore seguro: guarda o mundo atual e desfaz a troca se algo falhar.

#### Painel
- Login com senha, sessão assinada (HMAC), limite de tentativas e proteção nas
  ações que alteram estado.
- Visão geral com status, ligar/parar/reiniciar e gráficos de jogadores,
  memória, CPU e TPS.
- Console com log ao vivo e comandos via RCON.
- Jogadores: whitelist, operadores, expulsar, banir e desbanir.
- Configurações do servidor com validação, agrupadas por assunto.
- Regras do jogo detectadas na versão em execução e aplicadas em todas as dimensões.
- Plugins e mods com busca no Modrinth.
- Backups: backup na hora, lista de snapshots e restore.
- CLI do painel para backup, snapshots e restore.

#### Interface
- Visual em blocos com os componentes Tucano: cantos retos, botões com bisel e
  paleta do Minecraft com verde `#5CEC01`.
- Tema claro, escuro ou seguindo o sistema.
- Fonte pixelada Monocraft em todo o texto e ícones pixelados RuneIcons.
- Três logos em pixel art (rack de grama, creeper servidor, bloco ligado), com
  seletor no menu.
- Nome "Minetune" em dourado no estilo dos títulos do Minecraft.
- Login dividido ao meio com capa ilustrada e crédito do autor com link para o GitHub.
- Toggles no estilo do jogo, animação de carregamento com bloco de grama e
  transição suave entre páginas.
- Notificações centralizadas na parte de baixo e confirmação antes de sair.
- Layout responsivo: no celular o menu vira uma barra de ícones.

#### Deploy e documentação
- Guias de deploy local, em VPS e no EasyPanel, e de acesso pela internet
  (port forward, playit.gg, VPS como ponte).
- Overlay `compose.tunnel.yaml` para o túnel playit.gg.
- Documentação de arquitetura, backups e desempenho.
- README com banner, prints das telas e guia completo.

### Segurança
- Painel escuta só em `127.0.0.1` por padrão.
- RCON restrito à rede interna do compose.
- Acesso ao Docker por proxy com lista de permissões: só leitura de status e
  logs e ligar, parar ou reiniciar containers.

[0.3.4]: https://github.com/JuniorCarlini/minetune/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/JuniorCarlini/minetune/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/JuniorCarlini/minetune/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/JuniorCarlini/minetune/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/JuniorCarlini/minetune/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/JuniorCarlini/minetune/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JuniorCarlini/minetune/releases/tag/v0.1.0
