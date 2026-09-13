import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { joinAddress } from './join-address.ts';

describe('joinAddress', () => {
  it('usa o PUBLIC_ADDRESS quando configurado, como foi escrito', () => {
    assert.deepEqual(joinAddress({ publicAddress: ' nicely-core.tun.ply.gg ', port: 25565 }, '127.0.0.1'), {
      address: 'nicely-core.tun.ply.gg',
      scope: 'public',
    });
  });

  it('avisa que localhost e 127.x só funcionam nesta máquina', () => {
    assert.equal(joinAddress({ port: 25565 }, '127.0.0.1').scope, 'this-computer');
    assert.equal(joinAddress({ port: 25565 }, 'localhost').scope, 'this-computer');
    assert.equal(joinAddress({ port: 25565 }, '[::1]').scope, 'this-computer');
  });

  it('reconhece endereços da rede de casa', () => {
    assert.equal(joinAddress({ port: 25565 }, '192.168.0.20').scope, 'lan');
    assert.equal(joinAddress({ port: 25565 }, '172.20.1.5').scope, 'lan');
    assert.equal(joinAddress({ port: 25565 }, 'meu-pc.local').scope, 'lan');
  });

  it('omite a porta padrão e mantém as outras', () => {
    assert.equal(joinAddress({ port: 25565 }, 'mc.exemplo.com').address, 'mc.exemplo.com');
    assert.deepEqual(joinAddress({ port: 25570 }, 'mc.exemplo.com'), { address: 'mc.exemplo.com:25570', scope: 'public' });
  });
});
