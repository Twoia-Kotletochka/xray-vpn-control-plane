SHELL := /bin/sh

.PHONY: install dev build lint format typecheck test docker-up docker-down db-generate db-migrate

install:
	npm install

dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

format:
	npm run format

typecheck:
	npm run typecheck

test:
	npm run test

docker-up:
	npm run docker:up

docker-down:
	npm run docker:down

db-generate:
	npm run db:generate

db-migrate:
	npm run db:migrate

