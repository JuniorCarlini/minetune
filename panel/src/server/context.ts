import { BackupConfig } from './backup-config.ts';
import type { BaseConfig, PanelConfig } from './config.ts';
import { ConfigStore } from './config-store.ts';
import { DockerClient } from './docker.ts';
import { JobRunner, OperationLock } from './jobs.ts';
import { Operations } from './operations.ts';
import { RconClient } from './rcon.ts';
import { Restic } from './restic.ts';
import { WorldProfiles } from './world-profile.ts';
import { WorldStore } from './worlds.ts';

/** Dependências compartilhadas (composition root). */
export interface Services {
  config: BaseConfig;
  docker: DockerClient;
  rcon: RconClient;
  restic: Restic;
  backupConfig: BackupConfig;
  store: ConfigStore;
  operations: Operations;
  jobs: JobRunner;
  worlds: WorldStore;
  profiles: WorldProfiles;
}

export function createServices(config: BaseConfig | PanelConfig): Services {
  const docker = new DockerClient(config.DOCKER_API, config.INSTANCE_NAME);
  const rcon = new RconClient({ host: config.RCON_HOST, port: config.RCON_PORT, password: config.RCON_PASSWORD });
  const backupConfig = new BackupConfig(config.CONFIG_DIR, config);
  const restic = new Restic(config, async () => (await backupConfig.effective()).env);
  const worlds = new WorldStore(config.DATA_DIR);
  return {
    config,
    docker,
    rcon,
    restic,
    backupConfig,
    store: new ConfigStore(config.CONFIG_DIR),
    operations: new Operations(config, docker, rcon, restic),
    jobs: new JobRunner(new OperationLock(config.DATA_DIR)),
    worlds,
    profiles: new WorldProfiles(config, worlds),
  };
}
