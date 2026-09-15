import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateHasPasswordWindow } from './gate.ts';
import { imageAllowsJavaChange, javaFromEnv } from './versions.ts';

test('janela de senha só a partir do Minecraft 1.21.6', () => {
  for (const version of ['LATEST', 'SNAPSHOT', '26.2', '26.1.2', '1.21.6', '1.21.11', '1.22', undefined, '']) {
    assert.equal(gateHasPasswordWindow(version), true, String(version));
  }
  for (const version of ['1.21.5', '1.21', '1.20.4', '1.16.5']) {
    assert.equal(gateHasPasswordWindow(version), false, version);
  }
});

test('Java de dentro do container e imagem que troca de Java', () => {
  assert.equal(javaFromEnv(['PATH=/usr/bin', 'JAVA_VERSION=jdk-25.0.4+7']), 25);
  assert.equal(javaFromEnv(['JAVA_VERSION=jdk8u402-b06']), 8);
  assert.equal(javaFromEnv(['PATH=/usr/bin']), null);
  assert.equal(javaFromEnv(undefined), null);
  assert.equal(imageAllowsJavaChange('itzg/minecraft-server:java25'), true);
  assert.equal(imageAllowsJavaChange('docker.io/itzg/minecraft-server:java21'), true);
  assert.equal(imageAllowsJavaChange('ghcr.io/juniorcarlini/minetune-mc:0.3.3'), false);
  assert.equal(imageAllowsJavaChange(undefined), false);
});
