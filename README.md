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

## Configuración de OAuth2 ("Continuar con Discord") y GitHub Pages

Para que el botón **"Continuar con Discord"** y la sincronización en tiempo real funcionen en el repositorio original (`https://damianduns.github.io/Kortex/`):

1. **Base de datos y Realtime en Supabase**:
   - Ejecutá `supabase_migration.sql` en el **SQL Editor** de tu proyecto de Supabase para habilitar las funciones RPC (`kortex_web_sync_discord_oauth`, `kortex_web_get_account_status`, etc.) y la publicación `supabase_realtime`.
2. **Discord Developer Portal → OAuth2 → Redirects**:
   - Agregá el callback de Supabase Auth de tu proyecto:
     `https://<tu-proyecto>.supabase.co/auth/v1/callback`
   - En **Supabase → Authentication → Providers → Discord**, activá el proveedor y cargá tu **Client ID** y **Client Secret** de Discord.
3. **Supabase → Authentication → URL Configuration**:
   - **Site URL**: `https://damianduns.github.io/Kortex/`
   - **Redirect URLs**: agregá `https://damianduns.github.io/Kortex/` y `https://damianduns.github.io/Kortex/**`
4. **GitHub → Settings → Secrets and variables → Actions** y **Pages**:
   - Creá dos **Repository secrets**:
     - `SUPABASE_URL`: `https://<tu-proyecto>.supabase.co`
     - `SUPABASE_KEY`: tu clave pública (`anon` / `publishable`) de Supabase.
   - En **Settings → Pages**, verificá que **Build and deployment → Source** esté en **GitHub Actions** (el workflow `.github/workflows/deploy-pages.yml` también lo habilita automáticamente e inyecta `docs/supabase-config.js` en cada push a `main` sin exponer claves en el código fuente).

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
