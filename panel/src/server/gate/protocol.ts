/**
 * O mínimo do protocolo do Minecraft Java para o portão: VarInt, texto, UUID, NBT de rede e
 * o enquadramento dos pacotes (com e sem compressão). Nada de mundo: o portão só conversa com
 * o jogador até a senha e depois repassa os bytes sem abrir.
 */

import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { deflateSync, inflateSync } from 'node:zlib';

/** Maior pacote aceito antes do login: nada que o portão recebe nessa fase chega perto disso. */
export const MAX_PRE_AUTH_PACKET = 64 * 1024;

export class ProtocolError extends Error {}

// --- Escrita --------------------------------------------------------------------------------------

export function varInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return Buffer.from(bytes);
}

export function mcString(text: string): Buffer {
  const data = Buffer.from(text, 'utf8');
  return Buffer.concat([varInt(data.length), data]);
}

export function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

export function int64(value: bigint): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigInt64BE(value);
  return out;
}

/** Corpo do pacote (ID + dados), sem o enquadramento. */
export function packet(id: number, ...fields: Buffer[]): Buffer {
  return Buffer.concat([varInt(id), ...fields]);
}

/**
 * Enquadra um corpo de pacote. Com compressão ligada (threshold >= 0), corpos a partir do limite
 * vão comprimidos com zlib e os menores vão com "tamanho descompactado" 0.
 */
export function frame(body: Buffer, threshold: number): Buffer {
  if (threshold < 0) return Buffer.concat([varInt(body.length), body]);
  if (body.length < threshold) {
    const inner = Buffer.concat([varInt(0), body]);
    return Buffer.concat([varInt(inner.length), inner]);
  }
  const inner = Buffer.concat([varInt(body.length), deflateSync(body)]);
  return Buffer.concat([varInt(inner.length), inner]);
}

// --- Leitura --------------------------------------------------------------------------------------

export class Reader {
  offset = 0;
  readonly buffer: Buffer;
  constructor(buffer: Buffer) {
    this.buffer = buffer;
  }

  get remaining(): number {
    return this.buffer.length - this.offset;
  }

  varInt(): number {
    let result = 0;
    for (let shift = 0; shift < 35; shift += 7) {
      if (this.offset >= this.buffer.length) throw new ProtocolError('VarInt incompleto');
      const byte = this.buffer[this.offset++]!;
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
    }
    throw new ProtocolError('VarInt grande demais');
  }

  bytes(length: number): Buffer {
    if (length < 0 || this.offset + length > this.buffer.length) throw new ProtocolError('pacote incompleto');
    const out = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return out;
  }

  string(maxChars: number): string {
    const length = this.varInt();
    if (length > maxChars * 3) throw new ProtocolError('texto grande demais');
    const text = this.bytes(length).toString('utf8');
    if (text.length > maxChars) throw new ProtocolError('texto grande demais');
    return text;
  }

  uint16(): number {
    const value = this.bytes(2).readUInt16BE(0);
    return value;
  }

  uuid(): string {
    const hex = this.bytes(16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  bool(): boolean {
    return this.bytes(1)[0] !== 0;
  }
}

/** Um pacote lido do fluxo: o corpo já descompactado e os bytes exatos que chegaram. */
export interface IncomingPacket {
  id: number;
  data: Reader;
  raw: Buffer;
}

/**
 * Junta os pedaços que chegam do socket e separa pacotes inteiros, sem copiar além do necessário.
 * `threshold` negativo = sem compressão (antes do Set Compression).
 */
export class PacketStream {
  private pending: Buffer = Buffer.alloc(0);
  threshold = -1;
  maxPacket: number;

  constructor(maxPacket: number) {
    this.maxPacket = maxPacket;
  }

  push(chunk: Buffer): void {
    this.pending = this.pending.length === 0 ? chunk : Buffer.concat([this.pending, chunk]);
  }

  /** O que sobrou no buffer (bytes que chegaram depois do último pacote lido). */
  drain(): Buffer {
    const rest = this.pending;
    this.pending = Buffer.alloc(0);
    return rest;
  }

  next(): IncomingPacket | null {
    const header = new Reader(this.pending);
    let length: number;
    try {
      length = header.varInt();
    } catch (err) {
      if (this.pending.length >= 5) throw err;
      return null;
    }
    if (length <= 0 || length > this.maxPacket) throw new ProtocolError('tamanho de pacote inválido');
    if (header.remaining < length) return null;
    const raw = this.pending.subarray(0, header.offset + length);
    let body = this.pending.subarray(header.offset, header.offset + length);
    this.pending = this.pending.subarray(header.offset + length);

    if (this.threshold >= 0) {
      const inner = new Reader(body);
      const dataLength = inner.varInt();
      if (dataLength === 0) body = body.subarray(inner.offset);
      else {
        if (dataLength > this.maxPacket) throw new ProtocolError('pacote descompactado grande demais');
        body = inflateSync(body.subarray(inner.offset), { maxOutputLength: this.maxPacket });
        if (body.length !== dataLength) throw new ProtocolError('tamanho descompactado não confere');
      }
    }
    const data = new Reader(body);
    const id = data.varInt();
    return { id, data, raw: Buffer.from(raw) };
  }
}

// --- NBT de rede (raiz sem nome) ------------------------------------------------------------------

export type NbtValue = string | number | boolean | NbtValue[] | { [key: string]: NbtValue } | NbtByte | NbtInt;
/** Força o tipo numérico no NBT (número solto vira int). */
export class NbtByte {
  readonly value: number;
  constructor(value: number) {
    this.value = value;
  }
}
export class NbtInt {
  readonly value: number;
  constructor(value: number) {
    this.value = value;
  }
}

const TAG = { end: 0, byte: 1, int: 3, string: 8, list: 9, compound: 10 } as const;

function tagOf(value: NbtValue): number {
  if (value instanceof NbtByte || typeof value === 'boolean') return TAG.byte;
  if (value instanceof NbtInt || typeof value === 'number') return TAG.int;
  if (typeof value === 'string') return TAG.string;
  if (Array.isArray(value)) return TAG.list;
  return TAG.compound;
}

function nbtString(text: string): Buffer {
  const data = Buffer.from(text, 'utf8');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(data.length);
  return Buffer.concat([length, data]);
}

function nbtPayload(value: NbtValue): Buffer {
  if (value instanceof NbtByte) return Buffer.from([value.value & 0xff]);
  if (typeof value === 'boolean') return Buffer.from([value ? 1 : 0]);
  if (value instanceof NbtInt || typeof value === 'number') {
    const out = Buffer.alloc(4);
    out.writeInt32BE(value instanceof NbtInt ? value.value : value);
    return out;
  }
  if (typeof value === 'string') return nbtString(value);
  if (Array.isArray(value)) {
    const type = value.length > 0 ? tagOf(value[0]!) : TAG.end;
    const count = Buffer.alloc(4);
    count.writeInt32BE(value.length);
    return Buffer.concat([Buffer.from([type]), count, ...value.map(nbtPayload)]);
  }
  const parts: Buffer[] = [];
  for (const [key, child] of Object.entries(value)) {
    parts.push(Buffer.from([tagOf(child)]), nbtString(key), nbtPayload(child));
  }
  parts.push(Buffer.from([TAG.end]));
  return Buffer.concat(parts);
}

/** NBT "anônimo" de rede: tipo da raiz e o conteúdo, sem nome. */
export function networkNbt(value: NbtValue): Buffer {
  return Buffer.concat([Buffer.from([tagOf(value)]), nbtPayload(value)]);
}

/**
 * Lê um NBT de rede e devolve só o que o portão usa: textos dentro de compounds.
 * Tipos numéricos e listas são pulados; profundidade e tamanho são limitados.
 */
export function readNetworkNbt(reader: Reader, depth = 0): unknown {
  const type = reader.bytes(1)[0]!;
  return readPayload(reader, type, depth);
}

function readPayload(reader: Reader, type: number, depth: number): unknown {
  if (depth > 16) throw new ProtocolError('NBT fundo demais');
  switch (type) {
    case 0:
      return null;
    case 1:
      return reader.bytes(1).readInt8(0);
    case 2:
      return reader.bytes(2).readInt16BE(0);
    case 3:
      return reader.bytes(4).readInt32BE(0);
    case 4:
      return reader.bytes(8).readBigInt64BE(0);
    case 5:
      return reader.bytes(4).readFloatBE(0);
    case 6:
      return reader.bytes(8).readDoubleBE(0);
    case 7: {
      const length = reader.bytes(4).readInt32BE(0);
      return reader.bytes(length);
    }
    case 8: {
      const length = reader.uint16();
      return reader.bytes(length).toString('utf8');
    }
    case 9: {
      const itemType = reader.bytes(1)[0]!;
      const length = reader.bytes(4).readInt32BE(0);
      if (length > 1024) throw new ProtocolError('lista NBT grande demais');
      const items: unknown[] = [];
      for (let i = 0; i < length; i++) items.push(readPayload(reader, itemType, depth + 1));
      return items;
    }
    case 10: {
      const out: Record<string, unknown> = {};
      for (let i = 0; i < 256; i++) {
        const childType = reader.bytes(1)[0]!;
        if (childType === 0) return out;
        const name = reader.bytes(reader.uint16()).toString('utf8');
        out[name] = readPayload(reader, childType, depth + 1);
      }
      throw new ProtocolError('compound NBT grande demais');
    }
    case 11: {
      const length = reader.bytes(4).readInt32BE(0);
      reader.bytes(length * 4);
      return null;
    }
    case 12: {
      const length = reader.bytes(4).readInt32BE(0);
      reader.bytes(length * 8);
      return null;
    }
    default:
      throw new ProtocolError(`tipo NBT desconhecido ${type}`);
  }
}

// --- Jogador offline ------------------------------------------------------------------------------

/** UUID offline, igual ao que Paper, Fabric, NeoForge e Vanilla calculam: v3 de "OfflinePlayer:<nick>". */
export function offlineUuid(name: string): string {
  const hash = createHash('md5').update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x30;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Nick que Paper, Vanilla e o portão aceitam: letras, números e _, até 16. */
export const PLAYER_NAME = /^[A-Za-z0-9_]{3,16}$/;

// --- PROXY protocol (playit.gg e outros túneis) ---------------------------------------------------

const PROXY_V2_SIGNATURE = Buffer.from([0x0d, 0x0a, 0x0d, 0x0a, 0x00, 0x0d, 0x0a, 0x51, 0x55, 0x49, 0x54, 0x0a]);
const PROXY_V1_PREFIX = Buffer.from('PROXY ', 'ascii');

export interface ProxyHeader {
  /** Bytes do cabeçalho; 0 quando a conexão começa direto com o jogo. */
  consumed: number;
  /** IP real de quem conectou no túnel. */
  address?: string;
}

/**
 * Lê o cabeçalho PROXY (v1 em texto ou v2 binário) que túneis como o playit.gg mandam antes do
 * jogo, com o IP real do jogador. Devolve null enquanto faltam bytes. Não confunde com o jogo:
 * um handshake do Minecraft nunca começa com "PROXY " nem com a assinatura da v2.
 */
export function parseProxyHeader(data: Buffer): ProxyHeader | null {
  const v2 = data.subarray(0, PROXY_V2_SIGNATURE.length);
  if (PROXY_V2_SIGNATURE.subarray(0, v2.length).equals(v2)) {
    if (data.length < 16) return null;
    if (data[12]! >> 4 !== 2) throw new ProtocolError('cabeçalho PROXY v2 com versão inválida');
    const length = data.readUInt16BE(14);
    if (length > 512) throw new ProtocolError('cabeçalho PROXY v2 grande demais');
    if (data.length < 16 + length) return null;
    const proxied = (data[12]! & 0x0f) === 1;
    const family = data[13]! >> 4;
    let address: string | undefined;
    if (proxied && family === 1 && length >= 12) address = [...data.subarray(16, 20)].join('.');
    if (proxied && family === 2 && length >= 36) {
      const groups: string[] = [];
      for (let i = 0; i < 16; i += 2) groups.push(data.readUInt16BE(16 + i).toString(16));
      address = groups.join(':');
    }
    return { consumed: 16 + length, address };
  }

  const v1 = data.subarray(0, PROXY_V1_PREFIX.length);
  if (PROXY_V1_PREFIX.subarray(0, v1.length).equals(v1)) {
    const end = data.indexOf('\r\n');
    if (end === -1) {
      // O maior cabeçalho v1 possível tem 107 bytes.
      if (data.length > 107) throw new ProtocolError('cabeçalho PROXY v1 sem fim');
      return null;
    }
    const [, family, source] = data.subarray(0, end).toString('ascii').split(' ');
    const address = (family === 'TCP4' || family === 'TCP6') && source && isIP(source) ? source : undefined;
    return { consumed: end + 2, address };
  }
  return { consumed: 0 };
}
