/**
 * Leitor mínimo de NBT, o formato binário do Minecraft. Serve para ler o level.dat
 * dos mundos (nome, versão do jogo, última vez jogado); não escreve nada.
 */

import { gunzipSync } from 'node:zlib';

export type NbtValue = number | bigint | string | Buffer | NbtValue[] | NbtCompound;
export interface NbtCompound {
  [key: string]: NbtValue;
}

export function readNbt(file: Buffer): NbtCompound {
  // level.dat vem compactado com gzip; outros .dat do jogo às vezes não.
  const data = file[0] === 0x1f && file[1] === 0x8b ? gunzipSync(file) : file;
  let pos = 0;

  const take = (bytes: number): number => {
    if (bytes < 0 || pos + bytes > data.length) throw new Error('NBT truncado ou corrompido');
    const start = pos;
    pos += bytes;
    return start;
  };
  const readString = (): string => {
    const length = data.readUInt16BE(take(2));
    const start = take(length);
    return data.toString('utf8', start, start + length);
  };

  const payload = (type: number): NbtValue => {
    switch (type) {
      case 1:
        return data.readInt8(take(1));
      case 2:
        return data.readInt16BE(take(2));
      case 3:
        return data.readInt32BE(take(4));
      case 4:
        return data.readBigInt64BE(take(8));
      case 5:
        return data.readFloatBE(take(4));
      case 6:
        return data.readDoubleBE(take(8));
      case 7: {
        const length = data.readInt32BE(take(4));
        const start = take(length);
        return data.subarray(start, start + length);
      }
      case 8:
        return readString();
      case 9: {
        const itemType = data.readUInt8(take(1));
        const length = data.readInt32BE(take(4));
        return Array.from({ length: Math.max(0, length) }, () => payload(itemType));
      }
      case 10: {
        const compound: NbtCompound = {};
        for (;;) {
          const tag = data.readUInt8(take(1));
          if (tag === 0) return compound;
          const name = readString();
          compound[name] = payload(tag);
        }
      }
      case 11: {
        const length = data.readInt32BE(take(4));
        return Array.from({ length: Math.max(0, length) }, () => data.readInt32BE(take(4)));
      }
      case 12: {
        const length = data.readInt32BE(take(4));
        return Array.from({ length: Math.max(0, length) }, () => data.readBigInt64BE(take(8)));
      }
      default:
        throw new Error(`Tipo de NBT desconhecido: ${type}`);
    }
  };

  if (data.length === 0 || data.readUInt8(take(1)) !== 10) throw new Error('Arquivo não é NBT (esperava um compound)');
  readString();
  return payload(10) as NbtCompound;
}
