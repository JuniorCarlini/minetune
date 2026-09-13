import type { BaseConfig, PanelConfig } from './config.ts';
import { ConfigStore } from './config-store.ts';
import { DockerClient } from './docker.ts';
import { JobRunner, OperationLock } from './jobs.ts';
import { Operations } from './operations.ts';
import { RconClient } from './rcon.ts';
import { Restic } from './restic.ts';

/** Dependências compartilhadas (composition root). */
export interface Services {
  config: BaseConfig;
  docker: DockerClient;
  rcon: RconClient;
  restic: Restic;
  store: ConfigStore;
  operations: Operations;
  jobs: JobRunner;
}

export function createServices(config: BaseConfig | PanelConfig): Services {
  const docker = new DockerClient(config.DOCKER_API, config.INSTANCE_NAME);
  const rcon = new RconClient({ host: config.RCON_HOST, port: config.RCON_PORT, password: config.RCON_PASSWORD });
  const restic = new Restic(config);
  return {
    config,
    docker,
    rcon,
    restic,
    store: new ConfigStore(config.CONFIG_DIR),
    operations: new Operations(config, docker, rcon, restic),
    jobs: new JobRunner(new OperationLock(config.DATA_DIR)),
  };
}
