# Kortex

Bot de Discord para la economía de Roblox: **Price Sniper** con alertas en vivo (DM, canal o webhook) y **calculadoras financieras** (cashback de grupo, Roblox Plus, precios regionales).

## Requisitos

- [Node.js](https://nodejs.org/) 18.17 o superior (recomendado: 20 LTS o 22 LTS)
- Una aplicación de bot en el [Discord Developer Portal](https://discord.com/developers/applications)
- Un proyecto en [Supabase](https://supabase.com/) con las tablas `guilds` y `roblox_wishlist`

## Instalación local

```bash
git clone https://github.com/DamianDuns/Kortex.git
cd Kortex
npm install
cp .env.example .env   # y completá tus valores reales
```

## Comandos

| Comando          | Qué hace                                                         |
| ---------------- | ---------------------------------------------------------------- |
| `npm start`      | Inicia el bot                                                    |
| `npm run deploy` | Registra/actualiza los comandos slash en Discord e inicia el bot |
| `npm run dev`    | Inicia el bot y lo reinicia solo cuando guardás cambios          |

> Usá `npm run deploy` solo cuando agregues o cambies un comando slash (nombre, descripción u opciones). Para el resto, alcanza con `npm start`.

## Variables de entorno

| Variable                       | Obligatoria | Descripción                                     |
| ------------------------------ | ----------- | ----------------------------------------------- |
| `DISCORD_TOKEN`                | ✅          | Token del bot                                   |
| `CLIENT_ID`                    | ✅          | ID de la aplicación de Discord                  |
| `SUPABASE_URL`                 | ✅          | URL del proyecto de Supabase                    |
| `SUPABASE_SERVICE_ROLE_KEY`    | ✅ *        | Clave de servidor (*o `SUPABASE_KEY`)           |
| `SUPABASE_KEY`                 |             | Clave pública (se usa si no hay service role)   |
| `GUILD_ID`                     |             | ID de tu servidor de pruebas (reservado)        |
| `PRICE_CHECK_INTERVAL_MINUTES` |             | Minutos entre escaneos de precios (default `5`) |

> ⚠️ **Nunca subas el archivo `.env` a GitHub.** Ya está incluido en `.gitignore`.

## Despliegue en Railway

1. Conectá el repositorio de GitHub a un nuevo servicio en [Railway](https://railway.com/). La configuración de build y deploy ya está versionada en `railway.json` (Railpack, reinicio automático ante fallos).
2. En la pestaña **Variables** del servicio cargá las claves de `.env.example`: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `PRICE_CHECK_INTERVAL_MINUTES`.
3. El comando de inicio es `npm start` (definido en `railway.json`).
4. Para registrar los comandos slash, agregá `DEPLOY_COMMANDS=true` una sola vez, esperá a que el bot arranque y después sacá la variable.
5. Cada push a `main` redeploya el bot automáticamente.

> ⚠️ **Nunca subas secretos al repositorio.** Si alguna vez se commiteó un token o una clave (Discord, Supabase), regeneralo de inmediato: sacarlo del código no alcanza porque queda en el historial de Git.

## Estructura

```
commands/       Comandos slash (/help, /ping, /roblox)
events/         Eventos de Discord (ready, interactionCreate, etc.)
interactions/   Botones, menús y modales (ruteados por prefijo de customId)
services/       Monitoreo de precios en segundo plano
utils/          Cliente HTTP y helpers de la API de Roblox
db.js           Cliente de Supabase
index.js        Punto de entrada
```