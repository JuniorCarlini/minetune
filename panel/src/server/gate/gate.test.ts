import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, connect, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AccountStore, FailureLimiter } from './accounts.ts';
import { authDialog, gateTexts } from './dialogs.ts';
import { isSharedAddress, MinetuneGate, textFromJson } from './gate.ts';
import { frame, int64, mcString, networkNbt, offlineUuid, packet, PacketStream, parseProxyHeader, readNetworkNbt, Reader, uuidBytes, varInt, type IncomingPacket } from './protocol.ts';

test('VarInt e enquadramento com compressão vão e voltam', () => {
  for (const value of [0, 1, 127, 128, 255, 2097151, 2147483647, -1]) {
    assert.equal(new Reader(varInt(value)).varInt(), value | 0);
  }
  const small = packet(0x05, mcString('oi'));
  const big = packet(0x07, Buffer.alloc(4000, 7));
  const stream = new PacketStream(64 * 1024);
  stream.threshold = 256;
  stream.push(Buffer.concat([frame(small, 256), frame(big, 256)]));
  const first = stream.next()!;
  assert.equal(first.id, 0x05);
  assert.equal(first.data.string(10), 'oi');
  const second = stream.next()!;
  assert.equal(second.id, 0x07);
  assert.equal(second.data.remaining, 4000);
  assert.equal(stream.next(), null);
});

test('pacote gigante antes do login é recusado', () => {
  const stream = new PacketStream(1024);
  stream.push(varInt(10_000));
  assert.throws(() => stream.next());
});

test('UUID offline igual ao do servidor', () => {
  // Valor calculado pelo Paper para "Notch" em modo offline.
  assert.equal(offlineUuid('Notch'), 'b50ad385-829d-3141-a216-7e7d7539ba7f');
});

test('janela de senha vira NBT legível', () => {
  const nbt = networkNbt(authDialog('register', 'Junin', gateTexts('pt'), 'erro'));
  const dialog = readNetworkNbt(new Reader(nbt)) as Record<string, unknown>;
  assert.equal(dialog.type, 'minecraft:notice');
  assert.equal((dialog.inputs as unknown[]).length, 2);
  assert.equal((dialog.body as unknown[]).length, 2);
});

test('motivo de kick em JSON vira texto NBT', () => {
  assert.deepEqual(textFromJson('{"text":"banido","color":"red"}'), { text: 'banido', color: 'red' });
  assert.equal(textFromJson('não é json'), 'não é json');
});

test('senhas: cadastro, conferência e nick sem diferenciar maiúsculas', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gate-accounts-'));
  try {
    const store = new AccountStore(dir);
    assert.equal(await store.register('Junin', 'segredo1'), 'ok');
    assert.equal(await store.register('junin', 'outra123'), 'exists');
    assert.equal(await store.verify('JUNIN', 'segredo1'), true);
    assert.equal(await store.verify('Junin', 'errada12'), false);
    assert.equal(await store.verify('ninguem', 'segredo1'), false);
    const reloaded = new AccountStore(dir);
    assert.equal(await reloaded.verify('Junin', 'segredo1'), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('limite de erros por IP', () => {
  const limiter = new FailureLimiter(2, 60_000);
  limiter.fail('1.2.3.4');
  assert.equal(limiter.blocked('1.2.3.4'), false);
  limiter.fail('1.2.3.4');
  assert.equal(limiter.blocked('1.2.3.4'), true);
  limiter.reset('1.2.3.4');
  assert.equal(limiter.blocked('1.2.3.4'), false);
});

// --- Fluxo completo contra um servidor falso ---------------------------------------------------

const PROTOCOL = 775;
const THRESHOLD = 256;

/**
 * Lê pacotes de um socket sob demanda: cada `next()` separa um pacote só, então quem chama
 * pode ligar a compressão entre um pacote e outro, como o jogo faz.
 */
function packets(socket: Socket, stream: PacketStream) {
  let wake: (() => void) | undefined;
  socket.on('data', (chunk: Buffer) => {
    stream.push(chunk);
    wake?.();
  });
  return {
    next: async (): Promise<IncomingPacket> => {
      const deadline = Date.now() + 5000;
      for (;;) {
        const ready = stream.next();
        if (ready) return ready;
        if (Date.now() > deadline) throw new Error('sem pacote');
        await new Promise<void>((resolve) => {
          wake = resolve;
          setTimeout(resolve, 100);
        });
      }
    },
  };
}

interface FakeLogin {
  name: string;
  replayed: IncomingPacket[];
  forwardedIp?: string;
}

/** Servidor falso; com `secret`, pede o IP real como o Paper com o encaminhamento do Velocity ligado. */
async function fakeBackend(onLogin: (login: FakeLogin) => void, secret?: () => Promise<string>) {
  const server = createServer((socket) => {
    const stream = new PacketStream(1024 * 1024);
    const reader = packets(socket, stream);
    void (async () => {
      const handshake = await reader.next();
      handshake.data.varInt();
      handshake.data.string(255);
      handshake.data.uint16();
      if (handshake.data.varInt() === 1) {
        await reader.next();
        socket.end(frame(packet(0x00, mcString(JSON.stringify({ version: { name: '26.1.2', protocol: PROTOCOL } }))), -1));
        return;
      }
      const start = await reader.next();
      const name = start.data.string(16);
      let forwardedIp: string | undefined;
      if (secret) {
        // Igual ao Paper: pergunta antes da compressão, com o byte da versão máxima (4).
        socket.write(frame(packet(0x04, varInt(7), mcString('velocity:player_info'), Buffer.from([4])), -1));
        const answer = await reader.next();
        assert.equal(answer.id, 0x02);
        assert.equal(answer.data.varInt(), 7);
        assert.equal(answer.data.bool(), true);
        const signature = answer.data.bytes(32);
        const payload = answer.data.bytes(answer.data.remaining);
        assert.deepEqual(signature, createHmac('sha256', await secret()).update(payload).digest(), 'assinatura confere com o segredo');
        const info = new Reader(payload);
        assert.equal(info.varInt(), 1);
        forwardedIp = info.string(64);
        assert.equal(info.uuid(), offlineUuid(name));
        assert.equal(info.string(16), name);
        assert.equal(info.varInt(), 0);
      }
      socket.write(frame(packet(0x03, varInt(THRESHOLD)), -1));
      stream.threshold = THRESHOLD;
      socket.write(frame(packet(0x02, uuidBytes(offlineUuid(name)), mcString(name), varInt(0)), THRESHOLD));
      socket.write(frame(packet(0x0e, varInt(0)), THRESHOLD)); // já manda algo da configuração
      const ack = await reader.next();
      assert.equal(ack.id, 0x03);
      const replayed = [await reader.next(), await reader.next()];
      onLogin({ name, replayed, forwardedIp });
    })().catch(() => socket.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  return { server, port: typeof address === 'object' && address ? address.port : 0 };
}

async function joinGate(gatePort: number, name: string, proxyHeader?: Buffer) {
  const socket = connect({ host: '127.0.0.1', port: gatePort });
  await new Promise((resolve) => socket.once('connect', resolve));
  if (proxyHeader) socket.write(proxyHeader);
  const stream = new PacketStream(1024 * 1024);
  const reader = packets(socket, stream);
  socket.write(frame(packet(0x00, varInt(PROTOCOL), mcString('localhost'), Buffer.from([0x64, 0x82]), varInt(2)), -1));
  socket.write(frame(packet(0x00, mcString(name), uuidBytes(offlineUuid(name))), -1));
  const compression = await reader.next();
  assert.equal(compression.id, 0x03);
  stream.threshold = compression.data.varInt();
  const success = await reader.next();
  assert.equal(success.id, 0x02);
  const send = (body: Buffer) => socket.write(frame(body, stream.threshold));
  send(packet(0x03)); // Login Acknowledged
  send(packet(0x00, mcString('pt_br'), Buffer.from([10]), varInt(0), Buffer.from([1, 0x7f]), varInt(1), Buffer.from([0, 1]), varInt(0)));
  send(packet(0x02, mcString('minecraft:brand'), mcString('vanilla')));
  return { socket, reader, send };
}

const click = (id: string, fields: Record<string, string>) =>
  packet(0x08, mcString(id), Buffer.from([1]), networkNbt(fields));

test('portão: cadastra, recusa senha errada e emenda no servidor com o mesmo nick', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'gate-data-'));
  await writeFile(join(dataDir, 'server.properties'), `online-mode=false\nnetwork-compression-threshold=${THRESHOLD}\n`);
  const logins: FakeLogin[] = [];
  const backend = await fakeBackend((login) => logins.push(login), () => readFile(join(dataDir, 'forwarding.secret'), 'utf8'));
  const gate = new MinetuneGate({ listenPort: 0, backendHost: '127.0.0.1', backendPort: backend.port, dataDir, accountsDir: dataDir, configDir: dataDir, log: () => {} });
  const gatePort = await gate.listen();
  try {
    // Primeira vez: cadastro.
    const first = await joinGate(gatePort, 'Junin');
    const dialog = await first.reader.next();
    assert.equal(dialog.id, 0x12);
    first.send(click('minetune:register', { password: 'abc', confirm: 'abc' }));
    assert.equal((await first.reader.next()).id, 0x12, 'senha curta reabre a janela');
    first.send(click('minetune:register', { password: 'segredo1', confirm: 'segredo1' }));
    assert.equal((await first.reader.next()).id, 0x11, 'fecha a janela');
    const fromBackend = await first.reader.next();
    assert.equal(fromBackend.id, 0x0e, 'depois da senha os pacotes vêm do servidor');
    await waitFor(() => logins.length === 1);
    assert.equal(logins[0]!.name, 'Junin');
    assert.deepEqual(logins[0]!.replayed.map((p) => p.id), [0x00, 0x02], 'idioma e marca repassados');
    assert.ok(['127.0.0.1', '::1'].includes(logins[0]!.forwardedIp ?? ''), 'IP real repassado e assinado');

    // Mesmo nick enquanto o primeiro está dentro: recusado sem derrubar ninguém.
    const copy = await joinGate(gatePort, 'junin');
    const kick = await copy.reader.next();
    assert.equal(kick.id, 0x02);
    copy.socket.destroy();

    first.socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Segunda vez: login, errando uma vez.
    const second = await joinGate(gatePort, 'JUNIN');
    assert.equal((await second.reader.next()).id, 0x12);
    second.send(packet(0x04, int64(1n))); // keep-alive solto não pode quebrar nada
    second.send(click('minetune:login', { password: 'errada99' }));
    assert.equal((await second.reader.next()).id, 0x12);
    second.send(click('minetune:login', { password: 'segredo1' }));
    assert.equal((await second.reader.next()).id, 0x11);
    await waitFor(() => logins.length === 2);
    second.socket.destroy();
  } finally {
    await gate.close();
    backend.server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('portão com a senha desligada no painel: entra direto, sem janela', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'gate-open-'));
  await writeFile(join(dataDir, 'server.properties'), `online-mode=false\nnetwork-compression-threshold=${THRESHOLD}\n`);
  await writeFile(join(dataDir, 'gate.json'), JSON.stringify({ requirePassword: false }));
  const logins: FakeLogin[] = [];
  const backend = await fakeBackend((login) => logins.push(login));
  const gate = new MinetuneGate({
    listenPort: 0,
    backendHost: '127.0.0.1',
    backendPort: backend.port,
    dataDir,
    accountsDir: dataDir,
    configDir: dataDir,
    configPollMs: 30,
    log: () => {},
  });
  const gatePort = await gate.listen();
  try {
    const player = await joinGate(gatePort, 'Visitante');
    assert.equal((await player.reader.next()).id, 0x0e, 'o primeiro pacote já vem do servidor');
    await waitFor(() => logins.length === 1);

    // Senha ligada no painel com a pessoa jogando sem senha: ela é desconectada.
    let closed = false;
    player.socket.once('close', () => (closed = true));
    await writeFile(join(dataDir, 'gate.json'), JSON.stringify({ requirePassword: true }));
    await waitFor(() => closed);
  } finally {
    await gate.close();
    backend.server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

const proxyV2 = (ip: number[], port = 50000) => {
  const header = Buffer.alloc(28);
  Buffer.from([0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a]).copy(header);
  header[12] = 0x21; // versão 2, PROXY
  header[13] = 0x11; // TCP sobre IPv4
  header.writeUInt16BE(12, 14);
  Buffer.from(ip).copy(header, 16);
  Buffer.from([10, 0, 0, 1]).copy(header, 20);
  header.writeUInt16BE(port, 24);
  header.writeUInt16BE(25565, 26);
  return header;
};

test('cabeçalho PROXY: v1, v2, pedaços e conexão normal do jogo', () => {
  assert.deepEqual(parseProxyHeader(Buffer.from('PROXY TCP4 203.0.113.7 10.0.0.1 5555 25565\r\nresto')), { consumed: 44, address: '203.0.113.7' });
  assert.deepEqual(parseProxyHeader(Buffer.from('PROXY UNKNOWN\r\n')), { consumed: 15, address: undefined });
  assert.equal(parseProxyHeader(Buffer.from('PROXY TCP4 203.0')), null, 'espera o resto');
  assert.deepEqual(parseProxyHeader(Buffer.concat([proxyV2([198, 51, 100, 9]), Buffer.from([1, 2])])), { consumed: 28, address: '198.51.100.9' });
  assert.equal(parseProxyHeader(proxyV2([1, 2, 3, 4]).subarray(0, 20)), null, 'espera o resto da v2');
  // Handshake de verdade: 80 bytes de tamanho ("P") seguido do ID 0, nunca "R".
  const handshake = frame(packet(0x00, varInt(775), mcString('localhost'), Buffer.from([0x63, 0xdd]), varInt(2)), -1);
  assert.deepEqual(parseProxyHeader(handshake), { consumed: 0 });
  assert.deepEqual(parseProxyHeader(Buffer.from([0x50, 0x00, 0x87])), { consumed: 0 });
  assert.throws(() => parseProxyHeader(Buffer.concat([Buffer.from('PROXY '), Buffer.alloc(120, 0x41)])));
});

test('portão atrás do playit: usa o IP real do cabeçalho PROXY', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'gate-proxy-'));
  await writeFile(join(dataDir, 'server.properties'), `online-mode=false\nnetwork-compression-threshold=${THRESHOLD}\n`);
  await writeFile(join(dataDir, 'gate.json'), JSON.stringify({ requirePassword: false }));
  const logins: FakeLogin[] = [];
  const backend = await fakeBackend((login) => logins.push(login), () => readFile(join(dataDir, 'forwarding.secret'), 'utf8'));
  const gate = new MinetuneGate({ listenPort: 0, backendHost: '127.0.0.1', backendPort: backend.port, dataDir, accountsDir: dataDir, configDir: dataDir, log: () => {} });
  const gatePort = await gate.listen();
  try {
    const v1 = await joinGate(gatePort, 'Tunel', Buffer.from('PROXY TCP4 203.0.113.7 10.0.0.1 5555 25565\r\n'));
    assert.equal((await v1.reader.next()).id, 0x0e);
    await waitFor(() => logins.length === 1);
    assert.equal(logins[0]!.forwardedIp, '203.0.113.7');
    v1.socket.destroy();

    const v2 = await joinGate(gatePort, 'TunelDois', proxyV2([198, 51, 100, 9]));
    assert.equal((await v2.reader.next()).id, 0x0e);
    await waitFor(() => logins.length === 2);
    assert.equal(logins[1]!.forwardedIp, '198.51.100.9');
    v2.socket.destroy();
  } finally {
    await gate.close();
    backend.server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('endereços divididos por muitos jogadores (casa, Docker, túnel, CGNAT)', () => {
  for (const ip of ['127.0.0.1', '::1', '192.168.164.1', '10.0.0.5', '172.18.0.1', '100.72.1.1', '::ffff:192.168.1.2', 'fd00::1']) {
    assert.equal(isSharedAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '189.4.10.2', '2804:14c::1']) {
    assert.equal(isSharedAddress(ip), false, ip);
  }
});

test('várias conexões do mesmo IP local não são cortadas (jogadores atrás do playit)', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'gate-shared-'));
  const gate = new MinetuneGate({ listenPort: 0, backendHost: '127.0.0.1', backendPort: 1, dataDir, accountsDir: dataDir, configDir: dataDir, maxPendingPerIp: 2, log: () => {} });
  const gatePort = await gate.listen();
  const sockets: Socket[] = [];
  try {
    let closed = 0;
    for (let i = 0; i < 6; i++) {
      const socket = connect({ host: '127.0.0.1', port: gatePort });
      socket.on('error', () => undefined);
      socket.on('close', () => closed++);
      sockets.push(socket);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(closed, 0);
  } finally {
    sockets.forEach((socket) => socket.destroy());
    await gate.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

test('servidor em modo online: o portão só repassa, sem janela de senha', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'gate-online-'));
  await writeFile(join(dataDir, 'server.properties'), `online-mode=true\nnetwork-compression-threshold=${THRESHOLD}\n`);
  const logins: FakeLogin[] = [];
  const backend = await fakeBackend((login) => logins.push(login));
  const gate = new MinetuneGate({ listenPort: 0, backendHost: '127.0.0.1', backendPort: backend.port, dataDir, accountsDir: dataDir, configDir: dataDir, log: () => {} });
  const gatePort = await gate.listen();
  try {
    const player = await joinGate(gatePort, 'Original');
    assert.equal((await player.reader.next()).id, 0x0e, 'direto do servidor, sem janela do portão');
    await waitFor(() => logins.length === 1);
    assert.equal(logins[0]!.name, 'Original');
    assert.deepEqual(await gate.accountStore.list(), [], 'nenhuma senha criada');
    player.socket.destroy();
  } finally {
    await gate.close();
    backend.server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
});

async function waitFor(check: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(check());
}
