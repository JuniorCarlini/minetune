# syntax=docker/dockerfile:1
#
# Servidor Minecraft do Minetune pronto para plataformas sem o código-fonte (EasyPanel, Umbrel).
# É a imagem da itzg com o entrypoint do Minetune e a configuração inicial do jogo dentro.
# O compose.yaml da raiz continua usando a imagem da itzg com o script montado por volume.
#
# Construir a partir da raiz do repositório:
#   docker build -f docker/minecraft/Dockerfile -t minetune-mc .

ARG MC_IMAGE_TAG=java25
FROM itzg/minecraft-server:${MC_IMAGE_TAG}

COPY docker/minecraft/entrypoint.sh /minetune/bin/entrypoint.sh
# Padrões copiados para a pasta de configuração na primeira subida, sem sobrescrever nada.
COPY config/server.env /minetune/defaults/server.env
COPY config/modrinth /minetune/defaults/modrinth
COPY config/patches /minetune/defaults/patches

ENTRYPOINT ["bash", "/minetune/bin/entrypoint.sh"]
