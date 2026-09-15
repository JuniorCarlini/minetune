/**
 * level.dat mínimo para os testes, na forma dos mundos 26.x (Data.Version.Name,
 * DataVersion, LastPlayed). Só os tipos de NBT que o painel lê.
 */

import { deflateSync, gzipSync } from 'node:zlib';

type Tagged = ['byte', number] | ['int', number] | ['long', bigint] | ['string', string] | ['compound', Record<string, Tagged>];

const TYPE_ID = { byte: 1, int: 3, long: 4, string: 8, compound: 10 } as const;

function encode(value: Tagged): Buffer {
  switch (value[0]) {
    case 'byte':
      return Buffer.from([value[1] & 0xff]);
    case 'int': {
      const out = Buffer.alloc(4);
      out.writeInt32BE(value[1]);
      return out;
    }
    case 'long': {
      const out = Buffer.alloc(8);
      out.writeBigInt64BE(value[1]);
      return out;
    }
    case 'string': {
      const text = Buffer.from(value[1], 'utf8');
      const length = Buffer.alloc(2);
      length.writeUInt16BE(text.length);
      return Buffer.concat([length, text]);
    }
    case 'compound':
      return Buffer.concat([
        ...Object.entries(value[1]).map(([name, child]) => Buffer.concat([Buffer.from([TYPE_ID[child[0]]]), encode(['string', name]), encode(child)])),
        Buffer.from([0]),
      ]);
  }
}

export function levelDat(options: { name?: string; version?: string; dataVersion?: number; lastPlayed?: number; paper?: boolean }): Buffer {
  const data: Record<string, Tagged> = {
    LevelName: ['string', options.name ?? 'world'],
    LastPlayed: ['long', BigInt(options.lastPlayed ?? 0)],
    hardcore: ['byte', 0],
  };
  // Marca que o Paper deixa no level.dat ao salvar.
  if (options.paper) data['Bukkit.Version'] = ['string', `${options.version ?? '26.2'}-R0.1-SNAPSHOT`];
  if (options.version) {
    data.Version = ['compound', { Name: ['string', options.version], Id: ['int', options.dataVersion ?? 0], Snapshot: ['byte', 0] }];
  }
  if (options.dataVersion) data.DataVersion = ['int', options.dataVersion];
  return gzipSync(Buffer.concat([Buffer.from([TYPE_ID.compound]), encode(['string', '']), encode(['compound', { Data: ['compound', data] }])]));
}

/** game_rules.dat das 26.x: cada regra como "minecraft:nome"; as de ligar/desligar em byte (0/1). */
export function gameRulesDat(values: Record<string, boolean | number>): Buffer {
  const data: Record<string, Tagged> = {};
  for (const [name, value] of Object.entries(values)) {
    data[`minecraft:${name}`] = typeof value === 'boolean' ? ['byte', value ? 1 : 0] : ['int', value];
  }
  return gzipSync(
    Buffer.concat([Buffer.from([TYPE_ID.compound]), encode(['string', '']), encode(['compound', { DataVersion: ['int', 4790], data: ['compound', data] }])]),
  );
}

/** Arquivo .mca com um chunk por DataVersion, comprimidos com zlib como o jogo grava. */
export function regionFile(dataVersions: number[]): Buffer {
  const header = Buffer.alloc(8192);
  const sectors: Buffer[] = [];
  let sector = 2;
  dataVersions.forEach((dataVersion, index) => {
    const chunk = Buffer.concat([
      Buffer.from([TYPE_ID.compound]),
      encode(['string', '']),
      encode(['compound', { DataVersion: ['int', dataVersion], Status: ['string', 'minecraft:full'] }]),
    ]);
    const compressed = deflateSync(chunk);
    const body = Buffer.alloc(Math.ceil((compressed.length + 5) / 4096) * 4096);
    body.writeUInt32BE(compressed.length + 1, 0);
    body[4] = 2;
    compressed.copy(body, 5);
    header.writeUIntBE(sector, index * 4, 3);
    header[index * 4 + 3] = body.length / 4096;
    sectors.push(body);
    sector += body.length / 4096;
  });
  return Buffer.concat([header, ...sectors]);
}
