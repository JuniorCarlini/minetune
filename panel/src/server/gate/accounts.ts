/**
 * Cadastros do portão: um nick, uma senha. Guardados em <data>/minetune-gate/accounts.json,
 * fora de .minetune de propósito: assim entram nos backups junto com os mundos.
 *
 * A senha nunca é guardada: só o scrypt dela com um salt aleatório (N=2^15, r=8, p=1).
 * O nick é comparado sem diferenciar maiúsculas: "Junin" e "junin" são a mesma conta,
 * e ninguém cadastra uma variação do nick de outra pessoa.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Cada scrypt usa ~32 MB enquanto roda; no máximo dois por vez para o portão continuar leve
// mesmo se muita gente entrar junta.
const MAX_CONCURRENT_HASHES = 2;
let runningHashes = 0;
const waitingHashes: (() => void)[] = [];

async function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  if (runningHashes >= MAX_CONCURRENT_HASHES) await new Promise<void>((resume) => waitingHashes.push(resume));
  runningHashes++;
  try {
    return await new Promise((ok, fail) =>
      scryptCallback(password.normalize('NFKC'), salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? fail(err) : ok(key))),
    );
  } finally {
    runningHashes--;
    waitingHashes.shift()?.();
  }
}

export interface Account {
  name: string;
  hash: string;
  salt: string;
  createdAt: string;
  lastLoginAt?: string;
}

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;

export class AccountStore {
  private accounts = new Map<string, Account>();
  /** mtime do arquivo na última leitura: o painel e o portão gravam o mesmo arquivo. */
  private loadedMtime: number | undefined;
  private writing: Promise<void> = Promise.resolve();
  private readonly file: string;

  constructor(dir: string) {
    this.file = join(dir, 'accounts.json');
  }

  /** Relê o arquivo quando ele mudou desde a última leitura (ex.: senha resetada pelo painel). */
  private async load(): Promise<void> {
    await this.writing;
    const mtime = (await stat(this.file).catch(() => null))?.mtimeMs ?? 0;
    if (mtime === this.loadedMtime) return;
    const accounts = new Map<string, Account>();
    if (mtime !== 0) {
      const list = JSON.parse(await readFile(this.file, 'utf8')) as Account[];
      for (const account of list) accounts.set(account.name.toLowerCase(), account);
    }
    this.accounts = accounts;
    this.loadedMtime = mtime;
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify([...this.accounts.values()], null, 2);
    const run = this.writing.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp-${process.pid}`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, this.file);
      this.loadedMtime = (await stat(this.file)).mtimeMs;
    });
    this.writing = run.catch(() => undefined);
    return run;
  }

  async find(name: string): Promise<Account | undefined> {
    await this.load();
    return this.accounts.get(name.toLowerCase());
  }

  async register(name: string, password: string): Promise<'ok' | 'exists'> {
    await this.load();
    if (this.accounts.has(name.toLowerCase())) return 'exists';
    const salt = randomBytes(16);
    const hash = await scrypt(password, salt);
    this.accounts.set(name.toLowerCase(), { name, hash: hash.toString('base64'), salt: salt.toString('base64'), createdAt: new Date().toISOString() });
    await this.persist();
    return 'ok';
  }

  async verify(name: string, password: string): Promise<boolean> {
    const account = await this.find(name);
    // Sem conta, calcula mesmo assim: o tempo de resposta não revela se o nick tem cadastro.
    const salt = account ? Buffer.from(account.salt, 'base64') : randomBytes(16);
    const hash = await scrypt(password, salt);
    if (!account) return false;
    const expected = Buffer.from(account.hash, 'base64');
    const ok = expected.length === hash.length && timingSafeEqual(expected, hash);
    if (ok) {
      account.lastLoginAt = new Date().toISOString();
      await this.persist();
    }
    return ok;
  }

  async remove(name: string): Promise<boolean> {
    await this.load();
    const removed = this.accounts.delete(name.toLowerCase());
    if (removed) await this.persist();
    return removed;
  }

  async list(): Promise<Omit<Account, 'hash' | 'salt'>[]> {
    await this.load();
    return [...this.accounts.values()].map(({ name, createdAt, lastLoginAt }) => ({ name, createdAt, lastLoginAt }));
  }
}

/**
 * Freio contra adivinhar senha: erros por IP numa janela de tempo. Passou do limite, o IP espera.
 * Vale entre conexões (quem reconecta para tentar de novo continua contado).
 */
export class FailureLimiter {
  private readonly failures = new Map<string, { count: number; until: number }>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  blocked(key: string): boolean {
    const entry = this.failures.get(key);
    if (!entry) return false;
    if (entry.until < Date.now()) {
      this.failures.delete(key);
      return false;
    }
    return entry.count >= this.max;
  }

  fail(key: string): void {
    const entry = this.failures.get(key);
    if (!entry || entry.until < Date.now()) this.failures.set(key, { count: 1, until: Date.now() + this.windowMs });
    else entry.count++;
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
