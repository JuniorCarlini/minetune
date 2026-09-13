import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compareVersions, compatibility, imageTagFor, javaFromImage, neoforgeToMinecraft, requiredJava } from './versions.ts';

describe('compareVersions', () => {
  it('ordena a numeração nova (26.x) acima da 1.x', () => {
    const sorted = ['1.21.4', '26.2', '1.21.11', '26.1.2', '1.20.6'].sort((a, b) => compareVersions(b, a));
    assert.deepEqual(sorted, ['26.2', '26.1.2', '1.21.11', '1.21.4', '1.20.6']);
  });

  it('coloca a release acima de pre-release e rc da mesma base', () => {
    assert.ok(compareVersions('26.3', '26.3-rc-2') > 0);
    assert.ok(compareVersions('26.3-rc-2', '26.3-rc-1') > 0);
    assert.equal(compareVersions('1.21', '1.21.0'), 0);
  });
});

describe('requiredJava', () => {
  // Valores conferidos no campo javaVersion dos manifestos oficiais da Mojang.
  const cases: [string, number | null][] = [
    ['26.2', 25],
    ['26.3-rc-2', 25],
    ['1.21.4', 21],
    ['1.20.5', 21],
    ['1.20.4', 17],
    ['1.18', 17],
    ['1.17.1', 16],
    ['1.16.5', 8],
    ['LATEST', null],
  ];
  for (const [version, java] of cases) {
    it(`${version} -> ${java}`, () => assert.equal(requiredJava(version), java));
  }
});

describe('compatibility', () => {
  it('aceita versões que pedem Java igual ou menor que o da imagem', () => {
    assert.equal(compatibility(25, 25), 'ok');
    assert.equal(compatibility(17, 25), 'ok');
  });

  it('pede imagem mais nova quando a versão exige Java acima do da imagem', () => {
    assert.equal(compatibility(25, 21), 'needs-newer-java');
  });

  it('pede a imagem java8 para versões antigas numa JVM moderna', () => {
    assert.equal(compatibility(8, 25), 'needs-legacy-java');
    assert.equal(compatibility(8, 8), 'ok');
  });

  it('não bloqueia quando não sabe o Java', () => {
    assert.equal(compatibility(null, 25), 'ok');
    assert.equal(compatibility(21, null), 'ok');
  });
});

describe('imagem', () => {
  it('lê o Java da tag da imagem', () => {
    assert.equal(javaFromImage('itzg/minecraft-server:java25'), 25);
    assert.equal(javaFromImage('itzg/minecraft-server:java21-graalvm'), 21);
    assert.equal(javaFromImage('itzg/minecraft-server:latest'), null);
    assert.equal(javaFromImage(undefined), null);
  });

  it('indica a tag certa para cada Java', () => {
    assert.equal(imageTagFor(25), 'java25');
    assert.equal(imageTagFor(21), 'java21');
    assert.equal(imageTagFor(16), 'java17');
    assert.equal(imageTagFor(8), 'java8');
  });
});

describe('neoforgeToMinecraft', () => {
  it('converte a numeração do NeoForge na versão do jogo', () => {
    assert.deepEqual(neoforgeToMinecraft('21.4.156'), { minecraft: '1.21.4', stable: true });
    assert.deepEqual(neoforgeToMinecraft('21.0.167'), { minecraft: '1.21', stable: true });
    assert.deepEqual(neoforgeToMinecraft('20.2.3-beta'), { minecraft: '1.20.2', stable: false });
    assert.deepEqual(neoforgeToMinecraft('26.2.0.87'), { minecraft: '26.2', stable: true });
  });

  it('ignora builds especiais', () => {
    assert.equal(neoforgeToMinecraft('0.25w14craftmine.3-beta'), null);
  });
});
