# Deploy e exposição à internet

## Requisitos

| Jogadores simultâneos | RAM do container | Heap (`MEMORY`) | CPU |
|---|---|---|---|
| até 5 | 3 GB | 2G | 2 vCPU |
| 5–20 | 6 GB | 4–5G | 4 vCPU |
| 20–50 | 10 GB | 8G | 4+ vCPU rápidas |

Minecraft é majoritariamente **single-thread**: clock alto por núcleo importa
mais que muitos núcleos. Use SSD/NVMe. Mais detalhes em [PERFORMANCE.md](PERFORMANCE.md).

## Local (PC / servidor de casa)

```bash
make init
make up
```

Para mudar portas, limites ou destino de backup: `.env` → `make up`.
Para mudar o jogo: painel ou `config/server.env` → `make restart`.

## VPS (Hetzner, Oracle, Contabo, AWS...)

1. Instale Docker: `curl -fsSL https://get.docker.com | sh`
2. Clone o repositório, `make init`, ajuste `.env` (backup externo!), `make up`
3. Firewall: libere **25565/tcp** (e **19132/udp** se usar crossplay). **Não** libere 8080.
4. Acesse o painel por túnel SSH, sem expor a porta:

   ```bash
   ssh -L 8080:127.0.0.1:8080 usuario@sua-vps
   # abra http://localhost:8080
   ```

   Ou coloque um proxy reverso com HTTPS (Caddy/Traefik/Nginx) apontando para
   `127.0.0.1:8080`.

A Oracle Cloud Free Tier (ARM Ampere) roda bem. O projeto foi testado em ARM64.

## EasyPanel

O EasyPanel roda stacks Docker Compose e dá domínio com HTTPS para serviços **HTTP**.
Minecraft não é HTTP, então a exposição tem duas partes:

1. Crie um serviço do tipo **Compose** de um destes jeitos:
   - **Com o repositório (Git):** aponte para este repositório; vale o `compose.yaml` da raiz, que monta os scripts de `docker/`.
   - **Sem o repositório:** cole o [`deploy/compose.yaml`](../deploy/compose.yaml). Ele usa as imagens
     publicadas `ghcr.io/juniorcarlini/minetune-panel`, `minetune-mc` e `minetune-backup` (amd64 e arm64), que já trazem
     os scripts e a configuração inicial do jogo: na primeira subida o servidor preenche a pasta de config sozinho.
     Fixe uma versão com `MINETUNE_VERSION` (ex.: `0.3.0`) em vez de `latest`.
2. Defina as variáveis na aba de ambiente do serviço. Obrigatórias: `RCON_PASSWORD`, `PANEL_PASSWORD`,
   `PANEL_SESSION_SECRET` e `RESTIC_PASSWORD` (gere com `openssl rand -base64 32` e guarde a do restic fora do servidor).
3. **Painel:** configure um domínio no EasyPanel apontando para o serviço `panel`, porta `8080`.
   O EasyPanel termina o TLS e o cookie de sessão fica `Secure` automaticamente.
   Como o proxy do EasyPanel acessa o container pela rede interna, deixe `PANEL_BIND=127.0.0.1`.
4. **Jogo:** a porta `25565` precisa ser **publicada diretamente no host**, como já está no
   `compose.yaml` (`MC_PORT`, no serviço `gate`). Libere-a no firewall do servidor. Domínios HTTP do EasyPanel não servem para o jogo.
5. **Volumes:** confirme onde os bind mounts relativos (`./data`, `./config`, `./backups`) ficam
   no host do EasyPanel. Se preferir caminhos absolutos, use `DATA_DIR`, `CONFIG_DIR` e `BACKUP_LOCAL_DIR`.

Checklist pós-deploy: `docker ps` mostra os 5 containers `healthy`/`running`; o painel abre pelo
domínio; `nc -vz <ip> 25565` conecta de fora.

### Template do EasyPanel

A pasta [`easypanel/minetune/`](../easypanel/minetune/) é o template no formato do
[repositório oficial](https://github.com/easypanel-io/templates): um serviço Compose com o `deploy/compose.yaml`
dentro, as quatro senhas geradas na instalação (`randomPassword()`) e o domínio do EasyPanel apontando para o
painel. Ela é gerada, não editada à mão:

```bash
node scripts/build-easypanel.mjs   # depois de mudar o deploy/compose.yaml ou a versão
```

Para enviar: copie a pasta para `templates/minetune` num fork de `easypanel-io/templates`, rode
`npm run build-templates` e teste num EasyPanel de verdade ("Create from JSON" no playground) antes do PR.
Confira que os containers mantêm os labels `minetune.instance`/`minetune.role`, que o painel usa para achar o
servidor.

## Portão Minetune (senha por nick)

Os jogadores não conectam direto no servidor: a porta do jogo é do serviço `gate`, que pede a senha de cada nick
numa janela do próprio Minecraft (1.21.6 ou mais novo) e só então liga o jogador ao `mc`, que fica sem porta no host.
Funciona com Paper, Vanilla, Fabric e NeoForge, sem plugin nem mod, e usa ~30 MB de RAM.

- **Senhas:** hash scrypt em `data/minetune-gate/accounts.json`, dentro dos backups. Em **Jogadores** dá para
  desligar a senha (`config/gate.json`) e resetar a senha de alguém.
- **Paper:** com `MINETUNE_GATE=true` o servidor liga o encaminhamento do Velocity com um segredo em
  `data/minetune-gate/forwarding.secret`. Ele passa a recusar quem não vem pelo portão e vê o IP real de cada
  jogador, então `/ban-ip` funciona normalmente. Vale a partir do segundo boot de um servidor novo, quando o
  `paper-global.yml` já existe.
- **Vanilla, Fabric e NeoForge:** o servidor vê todos com o IP do portão. O portão aplica o `banned-ips.json`
  sozinho e, se um `/ban-ip <nick>` acertar o IP dele, desfaz na hora pelo RCON. Para banir por IP, use o IP real.
- **Bedrock (Geyser):** a porta UDP vai direto ao servidor e não passa pelo portão.
- **Túneis e Docker Desktop:** atrás do playit ou do Docker Desktop no Mac/Windows, o portão pode ver o mesmo IP
  para todos. Em endereços de rede local, Docker e CGNAT ele não limita conexões por IP e conta as senhas erradas
  por nick, para um jogador não bloquear os outros.

## Umbrel

A pasta [`umbrel/`](../umbrel/) é uma **Community App Store** pronta, com o app `minetune-server` no formato do Umbrel
(usa as mesmas imagens publicadas do `deploy/compose.yaml`).

1. Copie o conteúdo de `umbrel/` para a raiz de um repositório próprio (ex.: `minetune-umbrel`): o Umbrel lê a loja pela raiz.
2. No Umbrel: **App Store → Community App Stores**, cole a URL desse repositório e instale o Minetune.
3. **Painel:** abre pelo próprio Umbrel. A senha de login é a que o Umbrel mostra na tela do app (`deterministicPassword`).
4. **Jogo:** porta `25565` do Umbrel, com senha por nick pelo [Portão Minetune](#portão-minetune-senha-por-nick). Para jogar de fora de casa, faça port forward no roteador ou use o playit.gg
   (atrás de CGNAT, só o túnel funciona).
5. **Backups:** os dados ficam em `${APP_DATA_DIR}/data` (`server`, `config`, `backups`), que o Umbrel inclui
   nos backups dele. Cada senha interna (RCON, sessão do painel, restic) é derivada separadamente em `exports.sh`;
   para restaurar em outra máquina, configure antes um destino externo e anote a senha em Backups → Destino.

**Loja oficial do Umbrel:** ainda não. A loja oficial recusa apps que acessam o `docker.sock`, e o painel usa esse
acesso (pelo `docker-proxy`) para ligar, desligar e reiniciar o servidor. Por isso o app fica na Community App Store
até o painel controlar o servidor sem Docker.

**Memória:** o app vem pensado para Umbrel com **8 GB de RAM** (o próprio umbrelOS usa ~1,5 GB): o servidor tem
limite de 4 GB e começa com heap de 3G (`MINETUNE_INITIAL_MEMORY`, aplicado só na primeira subida). Com mais RAM,
aumente `mem_limit` no `docker-compose.yml` e a memória em Configurações → Desempenho, sempre ~1 GB abaixo do limite.

Pontos para conferir num Umbrel de verdade antes de publicar: nome do container em `APP_HOST`
(`minetune-server_panel_1`) e acesso ao `docker.sock` pelo `docker-proxy`.

## Publicar as imagens

O workflow [`images.yml`](../.github/workflows/images.yml) constrói e publica as três imagens no GitHub Container
Registry para amd64 e arm64. Ele roda ao criar uma tag de versão (`git tag v0.3.0 && git push --tags`) ou manualmente
em **Actions → Imagens**. Na primeira publicação, deixe os pacotes públicos em **GitHub → Packages** para que
EasyPanel e Umbrel consigam baixar sem login.

## Como abrir o servidor para a internet

| Onde o servidor roda | Caminho recomendado |
|---|---|
| PC em casa **com IP público** | [Port forward no roteador](#pc-em-casa-com-ip-público-port-forward) + DDNS |
| PC em casa **atrás de CGNAT** (comum em fibra no Brasil) | [Túnel playit.gg](#pc-em-casa-atrás-de-cgnat-playitgg) |
| **VPS** | [Porta direta + firewall do provedor](#vps-porta-direta) |
| Só um grupo fechado de amigos | Tailscale, ZeroTier ou Radmin VPN (cada amigo instala o app) |

**Não funcionam** para Minecraft Java sem instalar nada no computador do jogador: Cloudflare Tunnel,
Tailscale Funnel (só portas HTTPS), zrok (compartilhamento TCP é privado) e ngrok grátis (endereço muda
a cada reinício e cai após 5 minutos parado).

### PC em casa com IP público: port forward

1. IP fixo local para a máquina (reserva DHCP no roteador)
2. Roteador → redirecionamento de portas: `25565/TCP` → IP da máquina (e `19132/UDP` para Bedrock)
3. IP dinâmico? Use DDNS (DuckDNS, No-IP, Cloudflare + `ddclient`)

É o caminho com menor ping e o servidor vê o IP real de cada jogador, sem intermediário.

**Seu provedor usa CGNAT?** Compare o IP WAN mostrado no roteador com o de <https://ifconfig.me>.
Se forem diferentes, ou o WAN começar com `100.64–100.127`, port forwarding **não funciona**. Peça IP
público ao provedor (às vezes grátis, às vezes pago) ou use o playit.gg.

### PC em casa atrás de CGNAT: playit.gg

Grátis, sem abrir portas e sem nada para o jogador instalar. O endereço é um `xxxx.joinmc.link` com
registro SRV: o jogador digita só o nome, sem porta.

**Linux** (rede do host):

```env
COMPOSE_FILE=compose.yaml:compose.tunnel.yaml
PLAYIT_SECRET_KEY=<chave gerada em playit.gg>
```

No dashboard do playit, crie um túnel *Minecraft Java* → `127.0.0.1:25565`
(e *Minecraft Bedrock* → `127.0.0.1:19132`).

**Mac e Windows (Docker Desktop)**, ou sem dar a rede do host ao agente:

```env
COMPOSE_FILE=compose.yaml:compose.tunnel-bridge.yaml
PLAYIT_SECRET_KEY=<chave gerada em playit.gg>
```

O túnel *Minecraft Java* aponta para `172.31.250.10:25565`, o IP fixo do portão numa rede só dele e do
agente (o agente do playit não resolve nomes).

- **IP real dos jogadores:** no dashboard, abra o túnel e ligue **Proxy Protocol v2**. O Portão Minetune
  entende o cabeçalho sozinho e passa o IP real ao Paper; sem isso, todos aparecem com o IP do túnel e
  um `/ban-ip` pegaria todo mundo. O portão só aceita o cabeçalho vindo da própria máquina ou da rede
  local, então ninguém de fora consegue fingir outro IP.
- **Ping:** o plano grátis usa uma rota global. O Premium (US$ 3/mês) tem **região América do Sul**,
  domínio próprio e UDP (Bedrock, chat de voz).
- **Umbrel ou outro PC:** o agente pode rodar em qualquer máquina da casa; o túnel aponta para o IP da
  máquina do Minetune, porta `25565`.

**Outros túneis que funcionam** (pagos, o jogador digita `endereço:porta`): localtonet (~US$ 2/mês por
túnel, tem Brasil), Pinggy Pro (~US$ 3/mês, tem Brasil) e ngrok (US$ 10/mês, região São Paulo).

### VPS: porta direta

A porta `25565` já sai publicada pelo portão; falta liberar nos **dois** firewalls, o do provedor e o do
sistema (`sudo ufw allow 25565/tcp`, e `19132/udp` para Bedrock).

| Provedor | Onde liberar TCP 25565 |
|---|---|
| **Oracle Cloud** | VCN → Security List (ou NSG) → regra de entrada TCP 25565. Nas imagens Ubuntu, também `sudo iptables -I INPUT 5 -p tcp --dport 25565 -j ACCEPT` e `sudo netfilter-persistent save`. |
| **Hetzner Cloud** | Firewalls → regra de entrada TCP 25565 (e 22 para SSH). Um firewall aplicado bloqueia tudo que não tem regra. |
| **Hostinger VPS** | hPanel → Segurança → Firewall → aceitar TCP 25565. O grupo novo começa com uma regra "drop". |
| **Magalu Cloud** | Security Group → regra de entrada TCP 25565, origem `0.0.0.0/0` → associar à VM. |

Com domínio, crie um registro `A` apontando para o IP da VPS; se a porta não for `25565`, use um SRV (abaixo).

### VPS como ponte para o PC de casa (frp)

Melhor ping e IP fixo com o servidor em casa: uma VPS barata perto dos jogadores recebe as conexões e
repassa para o seu PC.

- `frps` na VPS (liberando `25565/tcp` e a porta do frp no firewall) e `frpc` em casa, com um proxy TCP
  para `127.0.0.1:25565`.
- Para o IP real, adicione `transport.proxyProtocolVersion = "v2"` no proxy do `frpc`: o portão entende.
- A Oracle Cloud grátis serve de ponte (10 TB/mês de saída), mas pode recuperar instâncias paradas por
  7 dias com uso muito baixo.

### Opção 4 — Hospedar na VPS

Mais simples e sem depender da internet de casa. Veja a seção VPS.

### Domínio próprio

Registro DNS apontando para o IP (ou para o endereço do túnel):

```
mc.seudominio.com.   A     203.0.113.10
```

Porta diferente de 25565? Use um registro SRV, e o jogador digita só `mc.seudominio.com`:

```
_minecraft._tcp.mc.seudominio.com.  SRV  0 5 25570 mc.seudominio.com.
```

Na Cloudflare, o registro do jogo deve ficar **"DNS only" (nuvem cinza)**: o proxy
laranja não encaminha tráfego de Minecraft.

## Segurança (checklist)

- [ ] `ONLINE_MODE=true` (padrão). Desligado, qualquer um entra como qualquer nick, inclusive como admin.
- [ ] Whitelist ligada se o servidor for privado
- [ ] Painel **nunca** exposto sem HTTPS; de preferência só via VPN/túnel SSH
- [ ] RCON (25575) nunca publicado; o compose já não publica
- [ ] `.env` com permissão `600`; o `make init` já aplica
- [ ] Backup externo configurado e **um restore testado**
