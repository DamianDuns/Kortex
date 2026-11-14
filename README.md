# Kortex

Bot de Discord integral para el ecosistema de Roblox: **20 herramientas simétricas** (`/roblox`), economía y juego **Kortex Tycoon** (`/tycoon`) con Tix, Vóxeles (`💠`), Fragmentos de Llave (`🧩`), Llaves Maestras (`🗝️`) y Cofres de Cerraduras, además de configuración persistente con sincronización web (`/config`).

🌐 **Documentación Oficial y Centro de Cuentas Web:** https://damianduns.github.io/Kortex/

## Comandos principales (Discord)

| Comando   | Descripción                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| `/roblox` | Panel interactivo con 4 categorías × 5 herramientas: Economía, Avatares 3D/2D, Juegos y Estadísticas/Estado    |
| `/tycoon` | Estudio Tycoon (Components V2): Producción, Perfil y Forja de Llaves, Tienda Unificada + Cofres y Misiones      |
| `/config` | Vinculación de cuentas Discord/Roblox, código web `KTX-XXXXXX`, prefijo, idioma y panel de propietario (VIP)    |
| `/help`   | Centro de ayuda interactivo en Español e Inglés sobre todos los comandos del bot                                |
| `/ping`   | Latencia WebSocket/API de Discord, uptime y telemetría de memoria RAM del contenedor                            |

## Requisitos

- [Node.js](https://nodejs.org/) 18.17 o superior (recomendado: 20 LTS o 22 LTS)
- Una aplicación de bot en el [Discord Developer Portal](https://discord.com/developers/applications)
- Un proyecto en [Supabase](https://supabase.com/) con las tablas definidas en `supabase_migration.sql` y `supabase_tycoon_schema.sql`

## Instalación local

```bash
git clone https://github.com/DamianDuns/Kortex.git
cd Kortex
npm install
cp .env.example .env   # y completá tus valores reales
```

## Scripts de ejecución

| Script           | Qué hace                                                         |
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

## Estructura

```
commands/       Comandos slash (/roblox, /tycoon, /config, /help, /ping)
docs/           Sitio web oficial en GitHub Pages (documentación, simulador y cuentas)
events/         Eventos de Discord (ready, interactionCreate, messageCreate, etc.)
interactions/   Botones, menús y modales (ruteados por prefijo de customId)
services/       Motores de Tycoon (llaves, cofres, loot) y rastreo de precios en segundo plano
src/            Módulos de /roblox, i18n, fastLink y gestión de rendimiento/RAM
utils/          Cliente HTTP, UI Components V2, gráficas e helpers de Roblox API
db.js           Cliente de Supabase con respaldo resiliente
index.js        Punto de entrada
```
