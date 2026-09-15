/**
 * Portão Minetune: fica na frente do servidor e só deixa passar quem digitou a senha do nick.
 *
 * Como funciona uma entrada:
 *   1. o jogo conecta no portão e manda Handshake + Login Start (nick);
 *   2. o portão responde como se fosse o servidor (Set Compression + Login Success) e o jogo
 *      entra na fase de configuração, onde ainda não existe mundo, inventário nem chat;
 *   3. ali o portão abre uma janela (dialog) pedindo a senha; sem a senha certa o jogador
 *      nunca chega ao servidor de verdade, então não dá para mexer em nada antes de autenticar;
 *   4. com a senha certa o portão faz o login no servidor com o mesmo nick, repete o que o jogo
 *      já tinha mandado (idioma, marca do cliente) e a partir daí só copia bytes nos dois sentidos.
 *
 * O portão não entende o jogo depois do passo 4, por isso funciona igual para Paper, Vanilla,
 * Fabric e NeoForge, sem plugin nem mod. Conexões de status (lista de servidores) vão direto.
 */

import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { connect, createServer, isIP, type Server, type Socket } from 'node:net';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { GATE_CONFIG_FILE, parseGateConfig } from '../../shared/gate.ts';
import { RconClient } from '../rcon.ts';
import { AccountStore, FailureLimiter, PASSWORD_MAX, PASSWORD_MIN } from './accounts.ts';
import { authDialog, gateLocale, gateTexts, LOGIN_ACTION, REGISTER_ACTION, type GateTexts } from './dialogs.ts';
import {
  frame,
  int64,
  MAX_PRE_AUTH_PACKET,
  mcString,
  networkNbt,
  offlineUuid,
  packet,
  PacketStream,
  parseProxyHeader,
  PLAYER_NAME,
  ProtocolError,
  readNetworkNbt,
  uuidBytes,
  varInt,
  type IncomingPacket,
  type NbtValue,
} from './protocol.ts';

/** Protocolo em que as janelas (dialogs) passaram a existir: Minecraft 1.21.6. */
const FIRST_DIALOG_PROTOCOL = 771;

/** Canal em que o Paper (com proxies.velocity ligado) pergunta o IP e o perfil reais do jogador. */
const VELOCITY_CHANNEL = 'velocity:player_info';

const ID = {
  handshake: 0x00,
  login: { disconnect: 0x00, encryption: 0x01, success: 0x02, compression: 0x03, customQuery: 0x04 },
  loginIn: { start: 0x00, customQueryAnswer: 0x02, acknowledged: 0x03 },
  config: { disconnect: 0x02, keepAlive: 0x04, clearDialog: 0x11, showDialog: 0x12 },
  configIn: { clientInformation: 0x00, customPayload: 0x02, keepAlive: 0x04, clickAction: 0x08 },
} as const;

export interface GateOptions {
  listenPort: number;
  backendHost: string;
  backendPort: number;
  /** Pasta com server.properties, banned-ips.json e banned-players.json do servidor. */
  dataDir: string;
  accountsDir: string;
  /** Pasta com gate.json (senha ligada ou não), gravado pelo painel. */
  configDir?: string;
  /** Segredo dividido com o Paper para ele confiar no IP real que o portão repassa. */
  forwardingSecretFile?: string;
  /** RCON do servidor: desfaz um /ban-ip que acertou o próprio portão (servidores sem encaminhamento). */
  rcon?: { host: string; port: number; password: string };
  /** De quanto em quanto tempo o portão confere se a senha foi ligada no painel. */
  configPollMs?: number;
  handshakeTimeoutMs?: number;
  passwordTimeoutMs?: number;
  attemptsPerConnection?: number;
  maxPendingPerIp?: number;
  maxPending?: number;
  log?: (line: string) => void;
}

/** Quem já está jogando pelo portão, e se entrou digitando a senha. */
interface PlayingSession {
  name: string;
  withPassword: boolean;
  /** Mensagem do kick, na língua do jogo da pessoa. */
  message: string;
  drop: () => void;
}

interface BackendInfo {
  protocol: number;
  version: string;
  checkedAt: number;
}

export class MinetuneGate {
  private readonly options: Required<Omit<GateOptions, 'rcon'>>;
  private readonly accounts: AccountStore;
  private readonly rcon: RconClient | undefined;
  private banTimer: NodeJS.Timeout | undefined;
  private configTimer: NodeJS.Timeout | undefined;
  private readonly playing = new Set<PlayingSession>();
  private lastRequirePassword: boolean | undefined;
  private lastRejectionLog = 0;
  /** Como o servidor faz: um UUID sorteado ao ligar, mandado no fim do login a partir do 26.2. */
  readonly sessionId = randomUUID();
  private readonly failures = new FailureLimiter(10, 10 * 60_000);
  /** Nicks entrando ou jogando pelo portão: o mesmo nick não entra duas vezes nem derruba quem está dentro. */
  private readonly names = new Set<string>();
  private readonly pendingByIp = new Map<string, number>();
  private pending = 0;
  private backend: BackendInfo | undefined;
  private server: Server | undefined;

  constructor(options: GateOptions) {
    const { rcon, ...rest } = options;
    this.options = {
      configDir: '/minetune/config',
      forwardingSecretFile: join(options.accountsDir, 'forwarding.secret'),
      configPollMs: 2000,
      handshakeTimeoutMs: 10_000,
      passwordTimeoutMs: 120_000,
      attemptsPerConnection: 3,
      maxPendingPerIp: 4,
      maxPending: 64,
      log: (line) => console.log(line),
      ...rest,
    };
    this.accounts = new AccountStore(options.accountsDir);
    this.rcon = rcon ? new RconClient(rcon) : undefined;
  }

  get accountStore(): AccountStore {
    return this.accounts;
  }

  async listen(): Promise<number> {
    // Cria o segredo já na subida: o servidor lê o mesmo arquivo quando liga.
    await this.forwardingSecret();
    if (this.rcon) this.watchGateBans();
    this.watchRequirePassword();
    return new Promise((resolve, reject) => {
      const server = createServer({ noDelay: true }, (socket) => this.accept(socket));
      server.once('error', reject);
      server.listen(this.options.listenPort, () => {
        this.server = server;
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : this.options.listenPort);
      });
    });
  }

  close(): Promise<void> {
    clearInterval(this.banTimer);
    clearInterval(this.configTimer);
    this.rcon?.close();
    return new Promise((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  private accept(client: Socket): void {
    const ip = (client.remoteAddress ?? '?').replace(/^::ffff:/, '');
    const perIp = this.pendingByIp.get(ip) ?? 0;
    // Atrás de túnel, Docker ou rede de casa todos chegam com o mesmo IP: limitar por IP cortaria
    // jogadores legítimos (o jogo mostrava "Connection reset"). Nesses endereços vale só o limite geral.
    const overIpLimit = !isSharedAddress(ip) && perIp >= this.options.maxPendingPerIp;
    if (overIpLimit || this.pending >= this.options.maxPending) {
      this.logRejection(overIpLimit ? `muitas conexões de ${ip}` : `limite de ${this.options.maxPending} conexões entrando ao mesmo tempo`);
      client.destroy();
      return;
    }
    this.pendingByIp.set(ip, perIp + 1);
    this.pending++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      this.pending--;
      const left = (this.pendingByIp.get(ip) ?? 1) - 1;
      if (left <= 0) this.pendingByIp.delete(ip);
      else this.pendingByIp.set(ip, left);
    };
    client.once('close', release);
    client.on('error', () => client.destroy());

    const session = new Session(this, client, ip, release);
    session.start();
  }

  // --- Usado pelas sessões ------------------------------------------------------------------------

  get opts(): Required<Omit<GateOptions, 'rcon'>> {
    return this.options;
  }

  get limiter(): FailureLimiter {
    return this.failures;
  }

  lockName(name: string): boolean {
    const key = name.toLowerCase();
    if (this.names.has(key)) return false;
    this.names.add(key);
    return true;
  }

  unlockName(name: string): void {
    this.names.delete(name.toLowerCase());
  }

  log(line: string): void {
    this.options.log(`[portão] ${line}`);
  }

  /** online-mode do server.properties (padrão do Minecraft: ligado). */
  async onlineMode(): Promise<boolean> {
    const properties = await readFile(join(this.options.dataDir, 'server.properties'), 'utf8').catch(() => '');
    const match = /^online-mode=(\w+)\s*$/m.exec(properties);
    return match ? match[1] !== 'false' : !properties.includes('online-mode=');
  }

  /** Limite de compressão do servidor: o portão precisa usar o mesmo para repassar bytes sem mexer. */
  async compressionThreshold(): Promise<number> {
    const properties = await readFile(join(this.options.dataDir, 'server.properties'), 'utf8').catch(() => '');
    const match = /^network-compression-threshold=(-?\d+)\s*$/m.exec(properties);
    return match ? Number(match[1]) : 256;
  }

  async banned(ip: string, name: string): Promise<boolean> {
    const now = Date.now();
    const active = (entry: { expires?: string }) => !entry.expires || entry.expires === 'forever' || Date.parse(entry.expires) > now;
    const ips = await readJsonList<{ ip?: string; expires?: string }>(join(this.options.dataDir, 'banned-ips.json'));
    if (ips.some((entry) => entry.ip === ip && active(entry))) return true;
    const players = await readJsonList<{ name?: string; expires?: string }>(join(this.options.dataDir, 'banned-players.json'));
    return players.some((entry) => entry.name?.toLowerCase() === name.toLowerCase() && active(entry));
  }

  /** Versão do servidor, perguntada pelo próprio protocolo de status (guardada por 30 s). */
  async backendInfo(): Promise<BackendInfo | undefined> {
    if (this.backend && Date.now() - this.backend.checkedAt < 30_000) return this.backend;
    const status = await pingBackend(this.options.backendHost, this.options.backendPort).catch(() => undefined);
    this.backend = status ? { ...status, checkedAt: Date.now() } : undefined;
    return this.backend;
  }

  connectBackend(): Socket {
    return connect({ host: this.options.backendHost, port: this.options.backendPort, noDelay: true });
  }

  /** Senha ligada ou não, pelo gate.json do painel. Lido a cada entrada: mudar no painel vale na hora. */
  async requirePassword(): Promise<boolean> {
    const text = await readFile(join(this.options.configDir, GATE_CONFIG_FILE), 'utf8').catch(() => '');
    return parseGateConfig(text).requirePassword;
  }

  /** Conexão recusada por limite: no máximo uma linha por minuto, para um ataque não encher o log. */
  private logRejection(reason: string): void {
    if (Date.now() - this.lastRejectionLog < 60_000) return;
    this.lastRejectionLog = Date.now();
    this.log(`conexão recusada: ${reason}`);
  }

  /** Registra quem acabou de entrar no servidor; a função devolvida tira da lista quando a pessoa sai. */
  trackPlayer(player: PlayingSession): () => void {
    // Entrou sem senha bem na hora em que a senha foi ligada: não fica.
    if (!player.withPassword && this.lastRequirePassword === true) {
      player.drop();
      return () => undefined;
    }
    this.playing.add(player);
    return () => this.playing.delete(player);
  }

  /**
   * Senha ligada no painel com gente jogando sem senha: essas pessoas saem na hora e, ao voltar,
   * criam ou digitam a senha. Quem entrou com senha continua jogando.
   */
  private watchRequirePassword(): void {
    const check = async () => {
      const required = await this.requirePassword();
      const turnedOn = required && this.lastRequirePassword === false;
      this.lastRequirePassword = required;
      if (!turnedOn) return;
      for (const player of [...this.playing]) {
        if (player.withPassword) continue;
        this.playing.delete(player);
        this.log(`${player.name} desconectado: entrou sem senha e a senha foi ligada`);
        // Kick pelo servidor mostra a mensagem no jogo; sem RCON, corta a conexão.
        const kicked = this.rcon ? await this.rcon.command(`kick ${player.name} ${player.message}`).then(() => true, () => false) : false;
        if (!kicked) player.drop();
      }
    };
    void check().catch(() => undefined);
    this.configTimer = setInterval(() => void check().catch(() => undefined), this.options.configPollMs);
    this.configTimer.unref();
  }

  /** Segredo do encaminhamento; criado na primeira vez por quem chegar antes (portão ou servidor). */
  async forwardingSecret(): Promise<string> {
    const file = this.options.forwardingSecretFile;
    const current = (await readFile(file, 'utf8').catch(() => '')).trim();
    if (current) return current;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, randomBytes(32).toString('base64url'), { flag: 'wx', mode: 0o600 }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'EEXIST') throw err;
    });
    return (await readFile(file, 'utf8')).trim();
  }

  /**
   * Sem encaminhamento (Vanilla, Fabric, NeoForge) o servidor vê todo mundo com o IP do portão,
   * e um /ban-ip <nick> baniria o portão, ou seja, todos. Quando isso acontece, desfaz na hora.
   */
  private watchGateBans(): void {
    const file = join(this.options.dataDir, 'banned-ips.json');
    let lastMtime = 0;
    const check = async () => {
      const info = await stat(file).catch(() => null);
      if (!info || info.mtimeMs === lastMtime) return;
      lastMtime = info.mtimeMs;
      const own = ownAddresses();
      for (const entry of await readJsonList<{ ip?: string }>(file)) {
        if (!entry.ip || !own.has(entry.ip)) continue;
        this.log(`o IP do portão (${entry.ip}) foi banido no servidor; desfazendo para não bloquear todos os jogadores`);
        await this.rcon?.command(`pardon-ip ${entry.ip}`).catch((err: Error) => this.log(`não consegui desfazer o ban do portão: ${err.message}`));
      }
    };
    this.banTimer = setInterval(() => void check().catch(() => undefined), 15_000);
    this.banTimer.unref();
  }
}

async function readJsonList<T>(file: string): Promise<T[]> {
  try {
    if ((await stat(file)).size > 8 * 1024 * 1024) return [];
    const data = JSON.parse(await readFile(file, 'utf8')) as unknown;
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

// --- Uma conexão --------------------------------------------------------------------------------

type Phase = 'handshake' | 'login' | 'config' | 'auth' | 'joining' | 'piped' | 'closed';

class Session {
  private phase: Phase = 'handshake';
  private firstChunk = true;
  private proxyHeaderChecked = false;
  private early: Buffer = Buffer.alloc(0);
  private readonly incoming = new PacketStream(MAX_PRE_AUTH_PACKET);
  private threshold = -1;
  private protocol = 0;
  private address = '';
  private name = '';
  private uuid = '';
  private lockedName = false;
  private texts: GateTexts = gateTexts('pt');
  private kind: 'register' | 'login' = 'login';
  private attempts = 0;
  private dialogShown = false;
  /** Digitou (ou criou) a senha certa nesta conexão. */
  private authenticated = false;
  /** Pacotes que o jogo mandou na configuração e que o servidor precisa receber depois. */
  private readonly replay: Buffer[] = [];
  private clientInfoSeen = false;
  private keepAliveTimer: NodeJS.Timeout | undefined;
  private keepAlivePending = false;
  private deadline: NodeJS.Timeout | undefined;
  private processing = Promise.resolve();
  private afterKeepAlive: (() => void) | undefined;
  private readonly gate: MinetuneGate;
  private readonly client: Socket;
  /** IP de quem conectou; troca pelo IP real quando um túnel local manda o cabeçalho PROXY. */
  private ip: string;
  private readonly releaseSlot: () => void;

  constructor(gate: MinetuneGate, client: Socket, ip: string, releaseSlot: () => void) {
    this.gate = gate;
    this.client = client;
    this.ip = ip;
    this.releaseSlot = releaseSlot;
  }

  /** Chave do limite de senhas erradas: o IP, ou IP + nick quando muita gente divide o mesmo IP. */
  private get failureKey(): string {
    return isSharedAddress(this.ip) ? `${this.ip}|${this.name.toLowerCase()}` : this.ip;
  }

  start(): void {
    this.setDeadline(this.gate.opts.handshakeTimeoutMs, () => this.client.destroy());
    this.client.on('data', this.onData);
    this.client.once('close', () => this.cleanup());
  }

  private readonly onData = (data: Buffer): void => {
    if (this.phase === 'piped' || this.phase === 'closed') return;
    const chunk = this.stripProxyHeader(data);
    if (!chunk) return;
    // Ping antigo (1.6 e antes) começa com 0xFE: só o servidor sabe responder.
    if (this.firstChunk && chunk[0] === 0xfe) {
      this.passThrough(chunk);
      return;
    }
    this.firstChunk = false;
    this.incoming.push(chunk);
    if (this.phase === 'joining') {
      this.drainKeepAlives();
      return;
    }
    // Um pacote por vez, na ordem: a verificação de senha é assíncrona.
    this.processing = this.processing.then(() => this.drainPackets()).catch((err) => this.fail(err));
  };

  /**
   * Túnel com PROXY protocol ligado (playit.gg): o IP real vem num cabeçalho antes do jogo.
   * Só é aceito de endereços locais, que é de onde o túnel conecta; de fora ninguém escolhe
   * o IP que o portão usa para bans e limites. Sem cabeçalho, segue como conexão normal.
   */
  private stripProxyHeader(data: Buffer): Buffer | undefined {
    if (this.proxyHeaderChecked) return data;
    if (!isSharedAddress(this.ip)) {
      this.proxyHeaderChecked = true;
      return data;
    }
    this.early = this.early.length === 0 ? data : Buffer.concat([this.early, data]);
    let header: ReturnType<typeof parseProxyHeader>;
    try {
      header = parseProxyHeader(this.early);
    } catch {
      this.client.destroy();
      return undefined;
    }
    if (!header) return undefined;
    this.proxyHeaderChecked = true;
    if (header.address) this.ip = header.address.replace(/^::ffff:/, '');
    const rest = this.early.subarray(header.consumed);
    this.early = Buffer.alloc(0);
    return rest.length > 0 ? rest : undefined;
  }

  private async drainPackets(): Promise<void> {
    for (;;) {
      if (this.phase === 'piped' || this.phase === 'closed' || this.phase === 'joining') return;
      const next = this.incoming.next();
      if (!next) return;
      await this.handle(next);
    }
  }

  private async handle(incoming: IncomingPacket): Promise<void> {
    switch (this.phase) {
      case 'handshake':
        return this.onHandshake(incoming);
      case 'login':
        return this.onLogin(incoming);
      case 'config':
      case 'auth':
        return this.onConfig(incoming);
      default:
        return;
    }
  }

  private async onHandshake({ id, data, raw }: IncomingPacket): Promise<void> {
    if (id !== ID.handshake) throw new ProtocolError('esperava handshake');
    this.protocol = data.varInt();
    this.address = data.string(255);
    data.uint16();
    const intent = data.varInt();
    if (intent === 1) {
      // Status (lista de servidores): repassa o handshake e o que vier depois.
      this.passThrough(Buffer.concat([raw, this.incoming.drain()]));
      return;
    }
    if (intent !== 2 && intent !== 3) throw new ProtocolError('intenção desconhecida');
    // Modo online: o Minecraft confere a conta original de cada um, então ninguém usa o nick de
    // outra pessoa. O portão só repassa; a senha por nick é para servidores em modo offline.
    if (await this.gate.onlineMode()) {
      this.passThrough(Buffer.concat([raw, this.incoming.drain()]));
      return;
    }
    // Servidor antes da 1.21.6: o jogo ainda não tem as janelas (dialogs) onde a senha é pedida.
    // O portão só repassa, como se não estivesse ali, em vez de deixar todo mundo de fora.
    const backend = await this.gate.backendInfo();
    if (backend && backend.protocol < FIRST_DIALOG_PROTOCOL) {
      this.passThrough(Buffer.concat([raw, this.incoming.drain()]));
      return;
    }
    this.phase = 'login';
  }

  private async onLogin({ id, data }: IncomingPacket): Promise<void> {
    if (this.name === '') {
      if (id !== ID.loginIn.start) throw new ProtocolError('esperava Login Start');
      this.name = data.string(16);
      data.uuid();

      const backend = await this.gate.backendInfo();
      // Antes da configuração o jogo ainda não disse o idioma: avisos desta fase saem em português.
      if (!backend) return this.kickLogin(this.texts.kickBackend);
      if (backend.protocol !== this.protocol) return this.kickLogin(this.texts.kickVersion(backend.version));
      if (backend.protocol < FIRST_DIALOG_PROTOCOL) return this.kickLogin(this.texts.kickError);

      this.uuid = offlineUuid(this.name);
      this.threshold = await this.gate.compressionThreshold();
      if (this.threshold >= 0) {
        this.sendRaw(frame(packet(ID.login.compression, varInt(this.threshold)), -1));
        this.incoming.threshold = this.threshold;
      }
      this.send(loginFinishedPacket(this.protocol, this.uuid, this.name, this.gate.sessionId));
      return;
    }
    if (id === ID.loginIn.acknowledged) {
      this.phase = 'config';
      this.setDeadline(this.gate.opts.passwordTimeoutMs, () => this.kick(this.texts.kickTimeout));
      this.keepAliveTimer = setInterval(() => this.sendKeepAlive(), 10_000);
      // O jogo manda o idioma logo em seguida; se não mandar, a janela abre em português mesmo.
      setTimeout(() => void this.openDialog().catch((err) => this.fail(err)), 1500).unref();
      return;
    }
    throw new ProtocolError(`pacote ${id} inesperado no login`);
  }

  private async onConfig({ id, data, raw }: IncomingPacket): Promise<void> {
    switch (id) {
      case ID.configIn.clientInformation: {
        this.texts = gateTexts(gateLocale(data.string(16)));
        this.replay.push(raw);
        if (!this.clientInfoSeen) {
          this.clientInfoSeen = true;
          await this.openDialog();
        }
        return;
      }
      case ID.configIn.customPayload:
        if (this.replay.length < 16) this.replay.push(raw);
        return;
      case ID.configIn.keepAlive:
        this.keepAlivePending = false;
        this.afterKeepAlive?.();
        return;
      case ID.configIn.clickAction:
        return this.onClick(data);
      default:
        // Outros pacotes da configuração (resposta de resource pack, cookies) não importam antes da senha.
        return;
    }
  }

  private async openDialog(): Promise<void> {
    if (this.phase !== 'config') return;
    this.phase = 'auth';
    if (!PLAYER_NAME.test(this.name)) return this.kick(this.texts.kickName);
    if (this.gate.limiter.blocked(this.failureKey)) return this.kick(this.texts.kickBlocked);
    if (await this.gate.banned(this.ip, this.name)) return this.kick(this.texts.kickBanned);
    if (!this.gate.lockName(this.name)) return this.kick(this.texts.kickOnline(this.name));
    this.lockedName = true;
    // Senha desligada no painel: o portão continua na frente (nick único, bans, IP real), só sem a janela.
    if (!(await this.gate.requirePassword())) return this.join();
    this.kind = (await this.gate.accountStore.find(this.name)) ? 'login' : 'register';
    this.showDialog();
  }

  private showDialog(error?: string): void {
    this.dialogShown = true;
    this.send(packet(ID.config.showDialog, networkNbt(authDialog(this.kind, this.name, this.texts, error))));
  }

  private async onClick(data: IncomingPacket['data']): Promise<void> {
    if (this.phase !== 'auth') return;
    const action = data.string(256);
    if (action !== REGISTER_ACTION && action !== LOGIN_ACTION) return;
    const payload = data.bool() ? readNetworkNbt(data) : undefined;
    const fields = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    const password = typeof fields.password === 'string' ? fields.password : '';
    const confirm = typeof fields.confirm === 'string' ? fields.confirm : '';

    if (this.kind === 'register') {
      if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return this.showDialog(this.texts.tooShort);
      if (password.toLowerCase() === this.name.toLowerCase()) return this.showDialog(this.texts.sameAsName);
      if (password !== confirm) return this.showDialog(this.texts.mismatch);
      const result = await this.gate.accountStore.register(this.name, password);
      if (result === 'exists') {
        // Alguém cadastrou este nick por outro caminho enquanto a janela estava aberta.
        this.kind = 'login';
        return this.showDialog();
      }
      this.gate.log(`${this.name} criou a senha (${this.ip})`);
      this.authenticated = true;
      return this.join();
    }

    if (await this.gate.accountStore.verify(this.name, password)) {
      this.gate.limiter.reset(this.failureKey);
      this.gate.log(`${this.name} entrou com senha (${this.ip})`);
      this.authenticated = true;
      return this.join();
    }
    this.attempts++;
    this.gate.limiter.fail(this.failureKey);
    this.gate.log(`${this.name} errou a senha (${this.ip}, tentativa ${this.attempts})`);
    const left = this.gate.opts.attemptsPerConnection - this.attempts;
    if (left <= 0 || this.gate.limiter.blocked(this.failureKey)) return this.kick(this.texts.kickWrong);
    this.showDialog(this.texts.wrong(left));
  }

  /** Senha certa: entra no servidor de verdade com o mesmo nick e emenda as duas conexões. */
  private async join(): Promise<void> {
    this.phase = 'joining';
    this.clearDeadline();
    clearInterval(this.keepAliveTimer);
    if (this.dialogShown) this.send(packet(ID.config.clearDialog));
    // Uma resposta de keep-alive nossa que chegasse no servidor derrubaria o jogador: espera ela antes.
    this.drainKeepAlives();
    if (this.keepAlivePending) {
      await new Promise<void>((resolve) => {
        this.afterKeepAlive = resolve;
        setTimeout(resolve, 5000).unref();
      });
    }
    this.client.pause();
    const secret = await this.gate.forwardingSecret().catch(() => '');

    const backend = this.gate.connectBackend();
    const stream = new PacketStream(8 * 1024 * 1024);
    let done = false;
    const abort = (message: string) => {
      if (done) return;
      done = true;
      backend.destroy();
      this.kick(message);
    };
    const timer = setTimeout(() => abort(this.texts.kickBackend), 15_000);
    backend.on('error', () => abort(this.texts.kickBackend));
    backend.once('close', () => abort(this.texts.kickBackend));
    backend.once('connect', () => {
      backend.write(
        frame(packet(ID.handshake, varInt(this.protocol), mcString(this.address || this.gate.opts.backendHost), port(this.gate.opts.backendPort), varInt(2)), -1),
      );
      backend.write(frame(packet(ID.loginIn.start, mcString(this.name), uuidBytes(this.uuid)), -1));
    });
    backend.on('data', (chunk: Buffer) => {
      if (done) return;
      stream.push(chunk);
      try {
        for (let next = stream.next(); next; next = stream.next()) {
          switch (next.id) {
            case ID.login.compression: {
              stream.threshold = next.data.varInt();
              if (stream.threshold !== this.threshold) {
                this.gate.log(`compressão do servidor (${stream.threshold}) diferente da esperada (${this.threshold})`);
                return abort(this.texts.kickError);
              }
              break;
            }
            case ID.login.customQuery: {
              const messageId = next.data.varInt();
              const channel = next.data.string(256);
              // Paper com encaminhamento pergunta quem é o jogador de verdade: responde com IP e perfil
              // assinados. Outras perguntas de mod/plugin recebem "não entendi", como um jogo sem o mod.
              const answer =
                channel === VELOCITY_CHANNEL && secret
                  ? Buffer.concat([Buffer.from([1]), forwardingAnswer(secret, this.ip, this.uuid, this.name)])
                  : Buffer.from([0]);
              backend.write(frame(packet(ID.loginIn.customQueryAnswer, varInt(messageId), answer), stream.threshold));
              break;
            }
            case ID.login.encryption:
              this.gate.log('o servidor está em modo online (online-mode=true); o portão precisa dele em modo offline');
              return abort(this.texts.kickError);
            case ID.login.disconnect:
              done = true;
              clearTimeout(timer);
              backend.destroy();
              return this.kick(textFromJson(next.data.string(262_144)));
            case ID.login.success: {
              if (stream.threshold !== this.threshold) return abort(this.texts.kickError);
              done = true;
              clearTimeout(timer);
              backend.write(frame(packet(ID.loginIn.acknowledged), this.threshold));
              this.drainKeepAlives();
              for (const raw of this.replay) backend.write(raw);
              this.pipe(backend, stream.drain());
              return;
            }
            default:
              return abort(this.texts.kickError);
          }
        }
      } catch {
        abort(this.texts.kickError);
      }
    });
  }

  private drainKeepAlives(): void {
    for (let next = this.incoming.next(); next; next = this.incoming.next()) {
      if (next.id === ID.configIn.keepAlive) {
        this.keepAlivePending = false;
        this.afterKeepAlive?.();
        continue;
      }
      if (next.id === ID.configIn.clientInformation || next.id === ID.configIn.customPayload) this.replay.push(next.raw);
    }
  }

  private pipe(backend: Socket, fromBackend: Buffer): void {
    this.phase = 'piped';
    this.releaseSlot();
    const untrack = this.gate.trackPlayer({
      name: this.name,
      withPassword: this.authenticated,
      message: this.texts.kickPasswordRequired,
      drop: () => this.client.destroy(),
    });
    this.client.once('close', untrack);
    this.client.removeListener('data', this.onData);
    backend.removeAllListeners('data');
    backend.removeAllListeners('close');
    backend.removeAllListeners('error');
    backend.on('error', () => backend.destroy());
    const leftover = this.incoming.drain();
    if (fromBackend.length > 0) this.client.write(fromBackend);
    if (leftover.length > 0) backend.write(leftover);
    this.client.pipe(backend);
    backend.pipe(this.client);
    this.client.once('close', () => backend.destroy());
    backend.once('close', () => this.client.destroy());
    this.client.resume();
  }

  private passThrough(first: Buffer): void {
    this.phase = 'piped';
    this.clearDeadline();
    this.client.removeListener('data', this.onData);
    this.client.pause();
    const backend = this.gate.connectBackend();
    backend.setTimeout(10_000, () => backend.destroy());
    backend.on('error', () => this.client.destroy());
    backend.once('connect', () => {
      backend.write(first);
      this.client.pipe(backend);
      backend.pipe(this.client);
      this.client.resume();
    });
    this.client.once('close', () => backend.destroy());
    backend.once('close', () => this.client.destroy());
  }

  private sendKeepAlive(): void {
    if (this.phase !== 'config' && this.phase !== 'auth') return;
    this.keepAlivePending = true;
    this.send(packet(ID.config.keepAlive, int64(BigInt(Date.now()))));
  }

  private send(body: Buffer): void {
    this.sendRaw(frame(body, this.threshold));
  }

  private sendRaw(bytes: Buffer): void {
    if (!this.client.destroyed) this.client.write(bytes);
  }

  private kickLogin(message: string): void {
    this.phase = 'closed';
    this.send(packet(ID.login.disconnect, mcString(JSON.stringify({ text: message }))));
    this.client.end();
  }

  private kick(message: string | NbtValue): void {
    this.phase = 'closed';
    const reason: NbtValue = typeof message === 'string' ? { text: message } : message;
    this.send(packet(ID.config.disconnect, networkNbt(reason)));
    this.client.end();
    setTimeout(() => this.client.destroy(), 2000).unref();
  }

  private fail(err: unknown): void {
    if (this.phase === 'closed' || this.phase === 'piped') return;
    if (!(err instanceof ProtocolError)) this.gate.log(`erro com ${this.name || this.ip}: ${(err as Error).message}`);
    if (this.phase === 'config' || this.phase === 'auth') this.kick(this.texts.kickError);
    else {
      this.phase = 'closed';
      this.client.destroy();
    }
  }

  private setDeadline(ms: number, onTimeout: () => void): void {
    this.clearDeadline();
    this.deadline = setTimeout(onTimeout, ms);
    this.deadline.unref();
  }

  private clearDeadline(): void {
    if (this.deadline) clearTimeout(this.deadline);
  }

  private cleanup(): void {
    this.phase = 'closed';
    this.clearDeadline();
    clearInterval(this.keepAliveTimer);
    if (this.lockedName) this.gate.unlockName(this.name);
    this.releaseSlot();
  }
}

/** Minecraft 26.2 (protocolo 776): o fim do login passou a levar o UUID da sessão do servidor. */
const SESSION_ID_PROTOCOL = 776;

/**
 * Fim do login (login_finished) no formato da versão do jogo: perfil (UUID, nick, nenhuma
 * propriedade) e, a partir do 26.2, o sessionId. Mandar o formato errado faz o jogo recusar
 * a conexão com "Failed to decode packet login_finished".
 */
export function loginFinishedPacket(protocol: number, uuid: string, name: string, sessionId: string): Buffer {
  const fields = [uuidBytes(uuid), mcString(name), varInt(0)];
  if (protocol >= SESSION_ID_PROTOCOL) fields.push(uuidBytes(sessionId));
  return packet(ID.login.success, ...fields);
}

/**
 * Resposta do encaminhamento moderno do Velocity (versão 1), o formato que o Paper aceita:
 * HMAC-SHA256 do conteúdo com o segredo, seguido de versão, IP, UUID, nick e propriedades (nenhuma).
 */
export function forwardingAnswer(secret: string, ip: string, uuid: string, name: string): Buffer {
  const payload = Buffer.concat([varInt(1), mcString(isIP(ip) ? ip : '127.0.0.1'), uuidBytes(uuid), mcString(name), varInt(0)]);
  const signature = createHmac('sha256', Buffer.from(secret, 'utf8')).update(payload).digest();
  return Buffer.concat([signature, payload]);
}

/**
 * Endereços que muitos jogadores podem dividir: a própria máquina, redes de casa e do Docker
 * (por onde chega o playit e o encaminhamento de porta do Docker Desktop) e CGNAT.
 */
export function isSharedAddress(ip: string): boolean {
  const v4 = ip.replace(/^::ffff:/, '');
  if (v4 === '::1' || v4.startsWith('127.') || v4.startsWith('10.') || v4.startsWith('192.168.')) return true;
  const second = /^(172|100)\.(\d+)\./.exec(v4);
  if (second) {
    const n = Number(second[2]);
    if (second[1] === '172' && n >= 16 && n <= 31) return true;
    if (second[1] === '100' && n >= 64 && n <= 127) return true;
  }
  return /^(fc|fd|fe80:)/i.test(v4);
}

function ownAddresses(): Set<string> {
  const addresses = new Set<string>();
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) addresses.add(entry.address);
  }
  return addresses;
}

function port(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16BE(value);
  return out;
}

/** Motivo de kick do servidor (texto JSON) no formato NBT que a fase de configuração usa. */
export function textFromJson(json: string): NbtValue {
  try {
    return toNbt(JSON.parse(json)) ?? json;
  } catch {
    return json;
  }
}

function toNbt(value: unknown, depth = 0): NbtValue | undefined {
  if (depth > 16) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Math.trunc(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => toNbt(item, depth + 1)).filter((item): item is NbtValue => item !== undefined);
    // Listas NBT têm um tipo só; componentes misturados viram compounds {text}.
    return items.map((item) => (typeof item === 'object' && !Array.isArray(item) ? item : { text: String(item) }));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, NbtValue> = {};
    for (const [key, child] of Object.entries(value)) {
      const converted = toNbt(child, depth + 1);
      if (converted !== undefined) out[key] = converted;
    }
    return out;
  }
  return undefined;
}

/** Pergunta versão e protocolo ao servidor pelo status, como a lista de servidores do jogo faz. */
export function pingBackend(host: string, backendPort: number, timeoutMs = 3000): Promise<{ protocol: number; version: string }> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: backendPort });
    const stream = new PacketStream(1024 * 1024);
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('sem resposta do servidor')));
    socket.once('error', reject);
    socket.once('close', () => reject(new Error('conexão fechada')));
    socket.once('connect', () => {
      socket.write(frame(packet(ID.handshake, varInt(-1), mcString(host), port(backendPort), varInt(1)), -1));
      socket.write(frame(packet(0x00), -1));
    });
    socket.on('data', (chunk: Buffer) => {
      stream.push(chunk);
      try {
        const next = stream.next();
        if (!next) return;
        const status = JSON.parse(next.data.string(1024 * 1024)) as { version?: { protocol?: number; name?: string } };
        socket.destroy();
        if (typeof status.version?.protocol !== 'number') return reject(new Error('status sem versão'));
        resolve({ protocol: status.version.protocol, version: status.version.name ?? String(status.version.protocol) });
      } catch (err) {
        socket.destroy();
        reject(err);
      }
    });
  });
}
