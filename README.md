# palworld-maport

Fast NestJS + Fastify API for local Palworld DataTable exports.

## What it serves

- Pals: `palId`, `name`, `description`, `icon`, `model`
- Items: `itemId`, `name`, `description`, `icon`
- PNG assets from the local `Game` folder

The API indexes the local JSON DataTables in memory at startup, so updating the exported folders updates the served data after restart or `POST /api/reload`.

## Run

```powershell
npm.cmd install
npm.cmd run build
npm.cmd run start:prod
```

Default URL:

```txt
http://localhost:3333/api
```

## Endpoints

```txt
GET  /api/stats
POST /api/reload
GET  /api/pals
GET  /api/pals/:palId
GET  /api/items
GET  /api/items/:itemId
GET  /api/assets/*
```

## Examples

```txt
GET /api/pals/Anubis
GET /api/items/Wood
```
