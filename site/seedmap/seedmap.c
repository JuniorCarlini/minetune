// Ponte entre o cubiomes e o mapa de seeds do site (compilado para WebAssembly).
//
// Cada worker da página guarda um gerador: sm_init troca seed, versão e dimensão, e
// as outras funções respondem sobre esse mundo. Os resultados saem em buffers de int
// que o JavaScript lê direto da memória do WebAssembly.

#include "finders.h"
#include "generator.h"
#include "terrainnoise.h"
#include "util.h"

#include <emscripten/emscripten.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>

static Generator g;
static int mc = MC_UNDEF;
static int dim = DIM_OVERWORLD;
static uint64_t seed;
static int *cache;
static size_t cacheLen;
static unsigned char colors[256][3];
static TerrainNoise terrain;
static int hasTerrain;

// Divisão arredondada para baixo: regiões com coordenada negativa começam em -1, não em 0.
static int regionFloor(int a, int b)
{
    return a >= 0 ? a / b : -((-a + b - 1) / b);
}

/** Prepara o gerador. Devolve 0 se a versão não for reconhecida. */
EMSCRIPTEN_KEEPALIVE
int sm_init(const char *version, int dimension, uint64_t worldSeed)
{
    int v = str2mc(version);
    if (v == MC_UNDEF)
        return 0;
    mc = v;
    dim = dimension;
    seed = worldSeed;
    // Zera antes de preparar de novo: o setup do cubiomes empilha splines num buffer fixo
    // sem reiniciar o contador, e a segunda troca de seed escrevia fora dele.
    memset(&g, 0, sizeof g);
    setupGenerator(&g, mc, 0);
    applySeed(&g, dim, seed);
    // Altura do terreno só no mundo normal da geração nova (1.18+), que é o que o fork calcula.
    hasTerrain = dim == DIM_OVERWORLD && mc >= MC_1_18;
    if (hasTerrain)
    {
        memset(&terrain, 0, sizeof terrain);
        setupTerrainNoise(&terrain, mc, 0);
        initTerrainNoise(&terrain, seed, DIM_OVERWORLD);
    }
    return mc;
}

/** Biomas de uma área (x, z e tamanho na escala pedida), linha a linha no eixo Z. */
EMSCRIPTEN_KEEPALIVE
int *sm_biomes(int scale, int x, int z, int sx, int sz, int y)
{
    Range r = {scale, x, z, sx, sz, y, 1};
    size_t need = getMinCacheSize(&g, scale, sx, 1, sz);
    if (need > cacheLen)
    {
        free(cache);
        cache = malloc(need * sizeof(int));
        cacheLen = cache ? need : 0;
    }
    if (!cache || genBiomes(&g, cache, r) != 0)
        return NULL;
    return cache;
}

/** Paleta RGB dos biomas (256 x 3 bytes), a mesma do cubiomes-viewer. */
EMSCRIPTEN_KEEPALIVE
unsigned char *sm_colors(void)
{
    initBiomeColors(colors);
    return colors[0];
}

EMSCRIPTEN_KEEPALIVE
const char *sm_biome_name(int id)
{
    return biome2str(mc, id);
}

/** Número interno da estrutura a partir do nome ("village"), ou -1. */
EMSCRIPTEN_KEEPALIVE
int sm_struct_lookup(const char *name)
{
    for (int t = 0; t < FEATURE_NUM; t++)
    {
        const char *s = struct2str(t);
        if (s && strcmp(s, name) == 0)
            return t;
    }
    return -1;
}

/** Tamanho da região da estrutura em chunks; 0 se ela não existe nesta versão ou dimensão. */
EMSCRIPTEN_KEEPALIVE
int sm_struct_region(int type)
{
    StructureConfig sc;
    if (type < 0 || !getStructureConfig(type, mc, &sc) || sc.dim != dim)
        return 0;
    return sc.regionSize;
}

/**
 * Estruturas que o jogo gera dentro do retângulo de blocos (limites inclusivos).
 * Grava pares x,z em out e devolve quantas achou (pode passar de max), ou -1.
 */
EMSCRIPTEN_KEEPALIVE
int sm_structures(int type, int x0, int z0, int x1, int z1, int *out, int max)
{
    int region = sm_struct_region(type);
    if (!region)
        return -1;
    int size = region * 16;
    int n = 0;
    for (int rz = regionFloor(z0, size); rz <= regionFloor(z1, size); rz++)
    {
        for (int rx = regionFloor(x0, size); rx <= regionFloor(x1, size); rx++)
        {
            Pos p;
            if (!getStructurePos(type, mc, seed, rx, rz, &p))
                continue;
            if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1)
                continue;
            if (!isViableStructurePos(type, &g, p.x, p.z, 0))
                continue;
            if (n < max)
            {
                out[2 * n] = p.x;
                out[2 * n + 1] = p.z;
            }
            n++;
        }
    }
    return n;
}

/** Todas as fortalezas (strongholds) do mundo normal, em pares x,z. */
EMSCRIPTEN_KEEPALIVE
int sm_strongholds(int *out, int max)
{
    if (dim != DIM_OVERWORLD)
        return 0;
    StrongholdIter sh;
    initFirstStronghold(&sh, mc, seed);
    // O jogo gera 128 fortalezas (3 antes da 1.9); o iterador devolvia uma a mais no fim.
    if (max > (mc >= MC_1_9 ? 128 : 3))
        max = mc >= MC_1_9 ? 128 : 3;
    int n = 0;
    while (n < max)
    {
        int more = nextStronghold(&sh, &g);
        out[2 * n] = sh.pos.x;
        out[2 * n + 1] = sh.pos.z;
        n++;
        if (more <= 0)
            break;
    }
    return n;
}

EMSCRIPTEN_KEEPALIVE
int sm_spawn(int *out)
{
    if (dim != DIM_OVERWORLD)
        return 0;
    Pos p = getSpawn(&g);
    out[0] = p.x;
    out[1] = p.z;
    return 1;
}

/**
 * Y do primeiro bloco de ar acima do terreno (sem água, árvores nem construções).
 * Conferido contra os heightmaps de um servidor 26.1.2: 92% dos pontos a até 2 blocos.
 * Devolve INT_MIN quando não há cálculo (Nether, End ou versão antes da 1.18).
 */
EMSCRIPTEN_KEEPALIVE
int sm_surface(int x, int z)
{
    if (!hasTerrain)
        return INT_MIN;
    double c00[49], c01[49], c10[49], c11[49];
    int cx = x >> 2;
    int cz = z >> 2;
    sampleNoiseColumn(&terrain, cx, cz, 0, 48, c00);
    sampleNoiseColumn(&terrain, cx, cz + 1, 0, 48, c01);
    sampleNoiseColumn(&terrain, cx + 1, cz, 0, 48, c10);
    sampleNoiseColumn(&terrain, cx + 1, cz + 1, 0, 48, c11);
    double px = ((x % 4) + 4) % 4 / 4.0;
    double pz = ((z % 4) + 4) % 4 / 4.0;
    return generateColumn(NULL, c00, c01, c10, c11, 0, 48, 8, px, pz, INTERP_1_18, -64, 1);
}
