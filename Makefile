SHELL := /bin/bash
DC    := docker compose
CLI   := node src/server/cli.ts

.DEFAULT_GOAL := help
.PHONY: help init up down restart ps logs console backup snapshots restore update check panel-dev

help: ## Lista os comandos disponíveis
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

init: ## Cria o .env com segredos aleatórios
	@bash scripts/init.sh

up: ## Sobe a stack (compila o painel se necessário)
	$(DC) up -d --build

down: ## Para e remove os containers (dados ficam preservados)
	$(DC) down

restart: ## Reinicia o servidor Minecraft (aplica config/server.env)
	$(DC) restart mc

ps: ## Estado dos serviços
	$(DC) ps

logs: ## Acompanha logs (SERVICE=mc|backup|panel)
	$(DC) logs -f --tail=200 $(or $(SERVICE),mc)

console: ## Console RCON interativo do servidor
	$(DC) exec mc rcon-cli

backup: ## Backup imediato (TAG=manual)
	$(DC) exec panel $(CLI) backup --tag $(or $(TAG),manual)

snapshots: ## Lista os snapshots de backup
	$(DC) exec panel $(CLI) snapshots

restore: ## Restaura um snapshot: make restore SNAPSHOT=<id|latest>
	$(DC) run --rm panel $(CLI) restore $(or $(SNAPSHOT),latest) --yes

update: ## Backup de segurança, atualiza imagens e recria a stack
	$(MAKE) backup TAG=pre-update
	$(DC) pull --ignore-buildable
	$(DC) up -d --build

check: ## Valida o compose e o código do painel
	$(DC) config --quiet
	cd panel && npm run check

panel-dev: ## Painel em modo desenvolvimento (hot reload)
	cd panel && npm run dev
