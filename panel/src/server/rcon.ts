/**
 * Cliente RCON (protocolo Source RCON usado pelo Minecraft) com uma conexão
 * persistente, fila de comandos e reconexão automática.
 */

import net from 'node:net';

const TYPE_AUTH = 3;
const TYPE_COMMAND = 2;
/** O Minecraft fragmenta respostas maiores que isso em vários pacotes. */
const MAX_PAYLOAD = 4096;

export class RconError extends Error {}

/** Remove cores do Minecraft (§x) e sequências ANSI que o Paper inclui nas respostas. */
export function stripFormatting(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/§./g, '');
}

interface Pending {
  id: number;
  chunks: Buffer[];
  resolve: (body: string) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
  settle?: NodeJS.Timeout;
}

export interface RconOptions {
  host: string;
  port: number;
  password: string;
  timeoutMs?: number;
}

export class RconClient {
  private socket?: net.Socket;
  private connecting?: Promise<void>;
  private buffer = Buffer.alloc(0);
  private pending?: Pending;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;
  private readonly options: RconOptions;

  constructor(options: RconOptions) {
    this.options = options;
  }

  /** Executa um comando e retorna a resposta sem formatação de cores. */
  command(command: string): Promise<string> {
    const clean = command.replace(/[\r\n\0]+/g, ' ').trim();
    const run = this.queue.then(async () => {
      await this.ensureConnected();
      return stripFormatting(await this.send(TYPE_COMMAND, clean)).trim();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  close(): void {
    this.socket?.destroy();
    this.socket = undefined;
  }

  private ensureConnected(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    this.connecting ??= this.connect().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const socket = net.createConnection({ host: this.options.host, port: this.options.port });
    socket.setNoDelay(true);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new RconError(`Tempo esgotado conectando em ${this.options.host}:${this.options.port}`));
      }, this.timeoutMs);
      socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(new RconError(`Servidor indisponível via RCON: ${err.message}`));
      });
    });

    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('close', () => this.failPending(new RconError('Conexão RCON encerrada')));
    socket.on('error', () => socket.destroy());

    try {
      await this.send(TYPE_AUTH, this.options.password);
    } catch (err) {
      this.close();
      throw err;
    }
  }

  private get timeoutMs(): number {
    return this.options.timeoutMs ?? 10_000;
  }

  private send(type: number, body: string): Promise<string> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new RconError('RCON não conectado'));

    const id = this.nextId++ & 0x7fffffff || (this.nextId = 2) - 1;
    const payload = Buffer.from(body, 'utf8');
    const packet = Buffer.alloc(14 + payload.length);
    packet.writeInt32LE(10 + payload.length, 0);
    packet.writeInt32LE(id, 4);
    packet.writeInt32LE(type, 8);
    payload.copy(packet, 12);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending = undefined;
        socket.destroy();
        reject(new RconError('Tempo esgotado aguardando resposta RCON'));
      }, this.timeoutMs);

      this.pending = {
        id,
        chunks: [],
        timeout,
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      };
      socket.write(packet);
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const length = this.buffer.readInt32LE(0);
      if (this.buffer.length < 4 + length) return;

      const id = this.buffer.readInt32LE(4);
      const body = this.buffer.subarray(12, 4 + length - 2);
      this.buffer = this.buffer.subarray(4 + length);

      const pending = this.pending;
      if (!pending) continue;

      if (id === -1) {
        this.pending = undefined;
        pending.reject(new RconError('Senha RCON incorreta'));
        continue;
      }
      if (id !== pending.id) continue;

      pending.chunks.push(Buffer.from(body));
      clearTimeout(pending.settle);
      if (body.length < MAX_PAYLOAD - 100) {
        this.finish(pending);
      } else {
        // Resposta fragmentada: aguarda um pouco por mais pacotes.
        pending.settle = setTimeout(() => this.finish(pending), 150);
      }
    }
  }

  private finish(pending: Pending): void {
    if (this.pending !== pending) return;
    this.pending = undefined;
    clearTimeout(pending.settle);
    pending.resolve(Buffer.concat(pending.chunks).toString('utf8'));
  }

  private failPending(err: Error): void {
    const pending = this.pending;
    this.pending = undefined;
    this.socket = undefined;
    if (pending) {
      clearTimeout(pending.settle);
      pending.reject(err);
    }
  }
}
