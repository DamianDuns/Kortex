# Kortex

Bot de Discord integral para el ecosistema de Roblox: **20 herramientas simétricas** (`/roblox`), economía y juego **Kortex Tycoon** (`/tycoon`) con Tix, Vóxeles (`💠`), Fragmentos de Llave (`🧩`), Llaves Maestras (`🗝️`) y Cofres de Cerraduras, además de configuración persistente con sincronización web (`/config`).

🌐 **Documentación Oficial y Centro de Cuentas Web:** https://damianduns.github.io/Kortex/
➕ **Invitar Kortex a tu servidor de Discord:** https://discord.com/oauth2/authorize?client_id=1041724988690018364&permissions=274878286912&integration_type=0&scope=bot+applications.commands

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

| Variable                       | Obligatoria | Descripción                                                                 |
| ------------------------------ | ----------- | --------------------------------------------------------------------------- |
| `DISCORD_TOKEN`                | ✅          | Token del bot de Discord                                                    |
| `CLIENT_ID`                    | ✅          | ID de la aplicación de Discord                                              |
| `SUPABASE_URL`                 | ✅          | URL de tu proyecto en Supabase (`https://<id>.supabase.co`)                 |
| `SUPABASE_KEY`                 | ✅          | Clave de Supabase (`anon` / `publishable` en GitHub Pages; o en el bot)     |
| `SUPABASE_SERVICE_ROLE_KEY`    | Opcional    | Clave administrativa exclusiva de servidor (nunca se expone al navegador)   |
| `GUILD_ID`                     | Opcional    | ID de servidor de pruebas                                                   |

> ⚠️ **Nunca subas el archivo `.env` a GitHub.** Ya está incluido en `.gitignore`.

## Sincronización en Tiempo Real en GitHub Pages

1. Ejecutá `supabase_migration.sql` en el **SQL Editor** de tu proyecto de Supabase para habilitar las funciones RPC y la publicación `supabase_realtime` (`kortex_realtime_signals`, `discord_configs`, `user_links`, `roblox_wishlist`, `pending_robux`, `tycoon_profiles` y `account_history`).
2. En tu repositorio de GitHub, entrá a **Settings → Secrets and variables → Actions** y agregá:
   - `SUPABASE_URL`: la URL de tu proyecto de Supabase.
   - `SUPABASE_KEY`: tu clave pública (`anon` / `publishable`) de Supabase.
3. En **Settings → Pages**, elegí **Source: GitHub Actions**. El flujo `.github/workflows/deploy-pages.yml` genera automáticamente `docs/supabase-config.js` en cada despliegue y conecta el portal web en tiempo real con el bot.

## Estructura

```
commands/       Comandos slash (/roblox, /tycoon, /config, /help, /ping)
docs/           Sitio web oficial en GitHub Pages (documentación, simulador y cuentas en tiempo real)
events/         Eventos de Discord (ready, interactionCreate, messageCreate, etc.)
interactions/   Botones, menús y modales (ruteados por prefijo de customId)
scripts/        Generador de configuración pública de Supabase para GitHub Pages
services/       Motores de Tycoon (llaves, cofres, loot) y rastreo de precios en segundo plano
src/            Módulos de /roblox, i18n, fastLink, servidor web y gestión de rendimiento/RAM
utils/          Cliente HTTP, UI Components V2, gráficas e helpers de Roblox API
db.js           Cliente de Supabase con sincronización Realtime y respaldo resiliente
index.js        Punto de entrada
```
