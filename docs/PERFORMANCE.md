# Desempenho

Ordem de impacto, do maior para o menor.

## 1. Pré-gerar o mundo

Gerar chunks novos é o que mais pesa quando jogadores exploram. Com o Chunky (já
na lista padrão), gere uma área antes de abrir o servidor:

```
worldborder center 0 0
worldborder set 10000          # borda de 5.000 blocos a partir do centro
chunky center 0 0
chunky radius 5000
chunky start                   # acompanhe com: chunky progress
```

Rode pelo **Console** do painel. Em uma CPU moderna, um raio de 5.000 leva de
dezenas de minutos a poucas horas e ocupa alguns GB.

## 2. Distância de simulação e de visão

| Configuração | Padrão minetune | O que custa |
|---|---|---|
| `SIMULATION_DISTANCE` | 6 | **CPU**: mobs, redstone e plantações ativos |
| `VIEW_DISTANCE` | 10 | **RAM e banda**: chunks enviados ao cliente |

Servidor sofrendo? Reduza primeiro a simulação (5 ou 4). Os jogadores quase
não percebem, e o ganho de TPS é grande.

## 3. Memória

- `MEMORY` (heap) **menor** que `MC_MEMORY_LIMIT`, com 1–1.5 GB de folga. A JVM
  usa memória fora da heap; sem folga, o kernel mata o container (OOM). O painel valida isso.
- Mais heap nem sempre ajuda: pausas de GC crescem. 4–8 GB atende a maioria dos servidores.
- Flags Aikar (`USE_AIKAR_FLAGS=true`) já vêm ligadas.
  As MeowIce (`USE_MEOWICE_FLAGS`) derrubaram a JVM em ARM64 nos nossos testes; em x86, teste antes de adotar.

## 4. Software

**Paper** é significativamente mais rápido que o vanilla e mantém a jogabilidade.
**Purpur** é Paper com mais opções. Em **Fabric**, a lista padrão inclui Lithium
e FerriteCore, otimizações server-side que não mudam mecânicas.

## 5. Patches do Paper (`APPLY_PAPER_OPTIMIZATIONS`)

`config/patches/paper/paper-world-defaults.json` aplica:

| Ajuste | Valor | Efeito na jogabilidade |
|---|---|---|
| `environment.optimize-explosions` | true | nenhum visível |
| `misc.redstone-implementation` | ALTERNATE_CURRENT | redstone muito mais leve; ordem de atualização difere do vanilla em contraptions extremamente sensíveis |
| `collisions.max-entity-collisions` | 2 | fazendas de mobs por esmagamento ficam um pouco menos eficientes |
| `tick-rates.mob-spawner` | 2 | spawners verificam a cada 2 ticks |
| `chunks.prevent-moving-into-unloaded-chunks` | true | evita lag de jogadores rápidos (elytra) |
| `chunks.max-auto-save-chunks-per-tick` | 8 | autosave mais distribuído, menos picos |
| `chunks.entity-per-chunk-save-limit.*` | 8–16 | limita flechas/orbes/bolas de neve salvos por chunk |

Servidor técnico de redstone? Desligue o toggle ou remova a linha do Alternate Current.

## 6. Diagnosticar antes de otimizar

O Paper inclui o **spark**. Quando o TPS cair:

```
spark profiler start
# espere o lag acontecer (1–5 min)
spark profiler stop
```

Ele gera um link com o relatório: mostra exatamente qual plugin, entidade ou
chunk está consumindo o tick. Otimize o que o relatório mostrar, não o que um
guia genérico sugere.

Outros comandos úteis: `spark tps`, `spark health`, `mspt`.

## 7. Infraestrutura

- **Disco:** SSD/NVMe. HDD causa travadas no salvamento de chunks.
- **CPU:** clock por núcleo > quantidade de núcleos.
- **Rede:** para jogadores no Brasil, hospede no Brasil (São Paulo). Cada 100 ms
  de latência é perceptível em PvP.
- **Backups:** `RESTIC_LIMIT_UPLOAD` (KiB/s) no container de backup limita o
  upload se ele competir com o jogo na banda de casa.
