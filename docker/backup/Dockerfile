# syntax=docker/dockerfile:1
#
# Agendador de backups do Minetune para plataformas sem o código-fonte (EasyPanel, Umbrel):
# a imagem itzg/mc-backup com o entrypoint que lê config/backup.env salvo pelo painel.
#
# Construir a partir da raiz do repositório:
#   docker build -f docker/backup/Dockerfile -t minetune-backup .

ARG MC_BACKUP_IMAGE_TAG=latest
FROM itzg/mc-backup:${MC_BACKUP_IMAGE_TAG}

COPY docker/backup/entrypoint.sh /minetune/bin/entrypoint.sh

ENTRYPOINT ["bash", "/minetune/bin/entrypoint.sh"]
CMD ["loop"]
