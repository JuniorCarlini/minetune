# Changelog

Todas as mudanças relevantes do Minetune ficam registradas aqui.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto usa [Versionamento Semântico](https://semver.org/lang/pt-BR/).

Tipos de mudança: **Adicionado** (novidades), **Alterado** (mudanças no que já
existia), **Obsoleto** (vai sair numa versão futura), **Removido**, **Corrigido**
(bugs) e **Segurança** (vulnerabilidades).

## [Não lançado]

Nada ainda.

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

[Não lançado]: https://github.com/JuniorCarlini/minetune/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/JuniorCarlini/minetune/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JuniorCarlini/minetune/releases/tag/v0.1.0
