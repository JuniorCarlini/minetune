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

1. Crie um serviço do tipo **Compose** apontando para este repositório (Git) ou cole o `compose.yaml`.
2. Defina as variáveis do `.env` na aba de ambiente do serviço (gere as senhas com `openssl rand -base64 32`).
3. **Painel:** configure um domínio no EasyPanel apontando para o serviço `panel`, porta `8080`.
   O EasyPanel termina o TLS e o cookie de sessão fica `Secure` automaticamente.
   Como o proxy do EasyPanel acessa o container pela rede interna, deixe `PANEL_BIND=127.0.0.1`.
4. **Jogo:** a porta `25565` precisa ser **publicada diretamente no host**, como já está no
   `compose.yaml` (`MC_PORT`). Libere-a no firewall do servidor. Domínios HTTP do EasyPanel não servem para o jogo.
5. **Volumes:** confirme onde os bind mounts relativos (`./data`, `./config`, `./backups`) ficam
   no host do EasyPanel. Se preferir caminhos absolutos, use `DATA_DIR`, `CONFIG_DIR` e `BACKUP_LOCAL_DIR`.

Checklist pós-deploy: `docker ps` mostra os 4 containers `healthy`/`running`; o painel abre pelo
domínio; `nc -vz <ip> 25565` conecta de fora.

## Como abrir o servidor para a internet

### Opção 1 — Port forwarding (IP público em casa)

1. IP fixo local para a máquina (reserva DHCP no roteador)
2. Roteador → redirecionamento de portas: `25565/TCP` → IP da máquina (e `19132/UDP` para Bedrock)
3. IP dinâmico? Use DDNS (DuckDNS, No-IP, Cloudflare + `ddclient`)

**Seu provedor usa CGNAT?** É comum em fibra residencial no Brasil. Compare o IP WAN
mostrado no roteador com o de <https://ifconfig.me>. Se forem diferentes, ou o WAN
começar com `100.64–100.127`, port forwarding **não funciona**. Peça IP público ao
provedor (às vezes grátis, às vezes pago) ou use a opção 2 ou 3.

### Opção 2 — Túnel playit.gg (sem abrir portas, resolve CGNAT)

```env
COMPOSE_FILE=compose.yaml:compose.tunnel.yaml
PLAYIT_SECRET_KEY=<chave gerada em playit.gg>
```

No dashboard do playit, crie um túnel *Minecraft Java* → `127.0.0.1:25565`
(e *Minecraft Bedrock* → `127.0.0.1:19132`). Os jogadores recebem um endereço
`xxxx.joinmc.link`. Plano grátis tem latência razoável; o pago oferece regiões mais próximas.

### Opção 3 — VPS como ponte (melhor latência + IP fixo, servidor continua em casa)

Uma VPS barata perto dos jogadores recebe as conexões e encaminha pela VPN para sua casa:

- **Tailscale/WireGuard** entre casa e VPS + `iptables`/`socat` ou `nginx stream` na VPS
  encaminhando `25565` para o IP da VPN da máquina de casa
- **frp** (`frps` na VPS, `frpc` em casa) se preferir algo pronto

Útil quando o hardware de casa é bom mas a conexão não tem IP público.

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
