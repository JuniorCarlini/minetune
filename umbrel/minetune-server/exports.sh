# Senhas do Minetune derivadas da semente do Umbrel: uma para cada uso, estáveis entre
# reinstalações na mesma máquina. A de login do painel é o ${APP_PASSWORD} mostrado no app.
export APP_MINETUNE_RCON_PASSWORD="$(derive_entropy "env-${app_entropy_identifier}-RCON_PASSWORD" | head -c32)"
export APP_MINETUNE_SESSION_SECRET="$(derive_entropy "env-${app_entropy_identifier}-PANEL_SESSION_SECRET" | head -c64)"
export APP_MINETUNE_RESTIC_PASSWORD="$(derive_entropy "env-${app_entropy_identifier}-RESTIC_PASSWORD" | head -c32)"
