// ==========================================
// ARCHIVO: commands/help.js
// Centro de Ayuda Interactiva de Comandos, Herramientas y Mecánicas (/help)
// Soporta Español ('es') e Inglés ('en') sin mencionar /help dentro de sí mismo.
// ==========================================

const {
    SlashCommandBuilder,
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags
} = require('discord.js');
const { COLORES, footer, separador } = require('../utils/ui');
const { obtenerIdiomaUsuario } = require('../src/utils/i18n');

const DOCS_URL = process.env.DOCS_URL || process.env.PUBLIC_GUIDE_URL || process.env.APP_URL || 'https://ais-dev-dmpwse4jqkfkz4vfkzt6pu-494677195769.us-west1.run.app';

const DETALLE_SUBCATEGORIAS_ROBLOX = {
    es: {
        sub_economy: {
            titulo: '💰 `/roblox` — Categoría 1: Economía y Precios',
            color: COLORES.primario,
            contenido:
                '### 🎯 1.1 Seguimiento de Precios y Mi Lista\n' +
                '> Monitoreá hasta 5 objetos del catálogo, pases o plugins con gráficas y alertas por mensaje directo.\n\n' +
                '### 🧮 1.2 Calculadora de Economía\n' +
                '> Calculá descuentos de grupo, Roblox Plus y precios regionales.\n\n' +
                '### 📉 1.3 Pisos de Precio del Catálogo\n' +
                '> Consultá los precios mínimos actuales por categoría de accesorios.\n\n' +
                '### ⏳ 1.4 Agenda de Robux Pendientes\n' +
                '> Registrá tus ventas y recibí un aviso cuando se liberen tus Robux.\n\n' +
                '### 🏛️ 1.5 Auditor y Catálogo de Grupos\n' +
                '> Explorá cualquier grupo de Roblox, sus estadísticas y su tienda de ropa.'
        },
        sub_avatar: {
            titulo: '👕 `/roblox` — Categoría 2: Avatares y Estudio 3D/2D',
            color: 0x8B5CF6,
            contenido:
                '### 🧪 2.1 Probador de Ropa en Vivo\n' +
                '> Probate hasta 5 objetos en tu avatar o cotizá el precio total de tu conjunto actual.\n\n' +
                '### 🔍 2.2 Buscador de Clones y Similares\n' +
                '> Encontrá alternativas económicas e ítems parecidos en el catálogo.\n\n' +
                '### 🧬 2.3 Extractor de Texturas y Maniquí 2D\n' +
                '> Descargá la plantilla `.PNG` de cualquier camisa o pantalón y probala en un maniquí.\n\n' +
                '### 📦 2.4 Exportador de Modelos 3D\n' +
                '> Descargá el render PNG y el paquete `.ZIP` con el modelo 3D de cualquier avatar o accesorio.\n\n' +
                '### 🎨 2.5 Combinador por Color\n' +
                '> Extraé los colores principales de tu avatar o prenda y buscá accesorios que combinen.'
        },
        sub_games: {
            titulo: '🎮 `/roblox` — Categoría 3: Juegos y Servidores',
            color: 0x10B981,
            contenido:
                '### 👻 3.1 Buscador de Servidores Vacíos\n' +
                '> Encontrá servidores públicos con pocos jugadores y enlaces de unión directa.\n\n' +
                '### 🎟️ 3.2 Buscador de Pases de Juego\n' +
                '> Consultá y ordená por precio todos los pases de cualquier experiencia.\n\n' +
                '### 🎁 3.3 Bóveda de Códigos Activos\n' +
                '> Consultá códigos promocionales y marcá los que ya canjeaste.\n\n' +
                '### 🔔 3.4 Alertas de Actualizaciones\n' +
                '> Seguí hasta 3 juegos favoritos y recibí un aviso cuando se actualicen.\n\n' +
                '### 🗺️ 3.5 Explorador de Mapas Conectados\n' +
                '> Descubrí los sub-lugares y mundos secundarios dentro de cualquier juego.'
        },
        sub_account: {
            titulo: '🎮 `/roblox` — Cuenta de Roblox',
            color: 0x23A55A,
            contenido:
                '### 🔗 Vincular tu Cuenta de Roblox\n' +
                '> Al pie de `/roblox` o desde `/config` podés conectar tu cuenta de Roblox para cargar automáticamente tu avatar en el Probador de Ropa, el Exportador 3D y el Combinador por Color.'
        }
    },
    en: {
        sub_economy: {
            titulo: '💰 `/roblox` — Category 1: Economy & Pricing',
            color: COLORES.primario,
            contenido:
                '### 🎯 1.1 Price Tracker & Watchlist\n' +
                '> Track up to 5 catalog items, gamepasses, or plugins with price charts and DM alerts.\n\n' +
                '### 🧮 1.2 Economy Calculator\n' +
                '> Calculate group discounts, Roblox Plus, and regional pricing.\n\n' +
                '### 📉 1.3 Catalog Price Floors\n' +
                '> Check current minimum prices across accessory categories.\n\n' +
                '### ⏳ 1.4 Pending Robux Schedule\n' +
                '> Log your sales and get notified when your Robux are released.\n\n' +
                '### 🏛️ 1.5 Group Auditor & Catalog\n' +
                '> Explore any Roblox group, its stats, and its clothing store.'
        },
        sub_avatar: {
            titulo: '👕 `/roblox` — Category 2: Avatars & 3D/2D Studio',
            color: 0x8B5CF6,
            contenido:
                '### 🧪 2.1 Live Outfit Sandbox\n' +
                '> Try up to 5 items on your avatar or price your currently worn outfit.\n\n' +
                '### 🔍 2.2 Clones & Similar Items Finder\n' +
                '> Find affordable alternatives and similar items in the catalog.\n\n' +
                '### 🧬 2.3 Texture Extractor & 2D Mannequin\n' +
                '> Download the `.PNG` template of any shirt or pants and preview it on a mannequin.\n\n' +
                '### 📦 2.4 3D Model Exporter\n' +
                '> Download the PNG render and `.ZIP` package with the 3D model of any avatar or item.\n\n' +
                '### 🎨 2.5 Color-Match Finder\n' +
                '> Extract dominant colors from your avatar or garment and find matching accessories.'
        },
        sub_games: {
            titulo: '🎮 `/roblox` — Category 3: Games & Servers',
            color: 0x10B981,
            contenido:
                '### 👻 3.1 Empty Servers Finder\n' +
                '> Find quiet public servers with direct join links.\n\n' +
                '### 🎟️ 3.2 Gamepass Finder\n' +
                '> Browse and sort by price all gamepasses of any experience.\n\n' +
                '### 🎁 3.3 Active Promo Codes Vault\n' +
                '> Check promo codes and mark the ones you already redeemed.\n\n' +
                '### 🔔 3.4 Game Update Alerts\n' +
                '> Follow up to 3 favorite games and get notified when they update.\n\n' +
                '### 🗺️ 3.5 Connected Maps Explorer\n' +
                '> Discover sub-places and secondary worlds inside any game.'
        },
        sub_account: {
            titulo: '🎮 `/roblox` — Roblox Account',
            color: 0x23A55A,
            contenido:
                '### 🔗 Link Your Roblox Account\n' +
                '> At the bottom of `/roblox` or inside `/config`, you can link your Roblox account to automatically load your avatar in the Outfit Sandbox, 3D Exporter, and Color-Match tools.'
        }
    }
};

const SECCIONES_PRINCIPALES_HELP = {
    es: {
        cmd_overview: {
            titulo: '🏠 Comandos Principales',
            color: COLORES.primario,
            contenido:
                '### 🎮 `/roblox` *(o mencionar `@Kortex`)*\n' +
                '> Abre el panel de herramientas de Roblox dividido en **Economía**, **Avatares 3D/2D** y **Juegos y Servidores**.\n\n' +
                '### 🏭 `/tycoon`\n' +
                '> Abrí tu **Estudio Roblox Tycoon en 3ra persona**: Colector de Tix (`🎟️`), Tienda Normal, Taller UGC con regalías del 70%, Bóveda Limited / Limited U numerados, Trading P2P y Pociones.\n\n' +
                '### ⚙️ `/config`\n' +
                '> Configurá tus cuentas vinculadas (Discord y Roblox), tus datos guardados, el **idioma** (**Español / English**) y tu región de precios.\n\n' +
                '### 🏓 `/ping`\n' +
                '> Muestra la latencia de conexión, el tiempo en línea y el estado del bot.'
        },
        cmd_tycoon: {
            titulo: '🏭 Comando `/tycoon` — Estudio Roblox Tycoon',
            color: 0x22C55E,
            contenido:
                '### 🏗️ 1. Mi Estudio Tycoon y Colector de Tix\n' +
                '> • Vista gráfica en 3ra persona de tu estudio con tu avatar de Roblox, cinta transportadora, Droppers y placa verde de recolección.\n' +
                '> • Construí los 6 Pads hasta la Torre Central y hacé **Rebirth** para ganar `+35%` permanente y Llaves de Cofre de Ascensión.\n\n' +
                '### 🛒 2. Tienda Normal y Equipamiento\n' +
                '> • Comprá ítems clásicos de Roblox (`+5%` a `+12%` Tix/min) y equipá cualquier accesorio de tu inventario sobre tu avatar.\n\n' +
                '### 🎨 3. Taller y Mercado UGC\n' +
                '> • Diseñá y publicá hasta 2 ítems `[🎨 UGC]` propios (`200–1,500 Tix`, bono fijo `+10%`) y cobrá el **70% de regalías** en cada venta.\n\n' +
                '### 👑 4. Bóveda Limited / Limited U y Trading P2P\n' +
                '> • Abrí Cofres de Ascensión, reclamá Drops Limited U con número de serie (`#01/15`) e intercambiá en el **Tablero Público** o por **Trade Directo**.\n\n' +
                '### 🧪 5. Pociones y Beneficios VIP de Comunidad\n' +
                '> • Activá pociones de 30 minutos y sincronizá **Discord Server Boost (`+50%`)** y **YouTube VIP (`+35%`)**.'
        },
        cmd_config: {
            titulo: '⚙️ Comando `/config` — Configuración',
            color: 0x5865F2,
            contenido:
                '### 🔗 1. Cuentas y Datos Guardados\n' +
                '> • Vinculá tus cuentas de **Discord** y **Roblox** con los botones a la derecha de cada sección.\n' +
                '> • Consultá de un vistazo el resumen de tu lista de precios, Robux pendientes, alertas y códigos.\n\n' +
                '### 🌐 2. Idioma y Preferencias\n' +
                '> • Cambiá en cualquier momento entre **🇪🇸 Español** y **🇺🇸 English**.\n' +
                '> • Elegí tu región de precios predeterminada para la calculadora.'
        },
        cmd_ping: {
            titulo: '🏓 Comando `/ping` — Estado y Latencia',
            color: 0x10B981,
            contenido:
                '### ⚡ Estado en Tiempo Real\n' +
                '> • **Respuesta y WebSocket:** Muestra la velocidad de conexión actual con Discord.\n' +
                '> • **Uptime y Memoria:** Indica el tiempo activo del bot, la cantidad de servidores y el uso de memoria.'
        }
    },
    en: {
        cmd_overview: {
            titulo: '🏠 Main Commands',
            color: COLORES.primario,
            contenido:
                '### 🎮 `/roblox` *(or mention `@Kortex`)*\n' +
                '> Opens the Roblox toolkit organized into **Economy**, **3D/2D Avatars**, and **Games & Servers**.\n\n' +
                '### 🏭 `/tycoon`\n' +
                '> Open your **3rd-person Roblox Tycoon Studio**: Tix Collector (`🎟️`), Normal Shop, UGC Workshop with 70% royalties, serialized Limited / Limited U Vault, P2P Trading, and Potions.\n\n' +
                '### ⚙️ `/config`\n' +
                '> Manage your linked accounts (Discord & Roblox), saved data, **language** (**Español / English**), and pricing region.\n\n' +
                '### 🏓 `/ping`\n' +
                '> Displays connection latency, uptime, and bot status.'
        },
        cmd_tycoon: {
            titulo: '🏭 Command `/tycoon` — Roblox Tycoon Studio',
            color: 0x22C55E,
            contenido:
                '### 🏗️ 1. My Tycoon Studio & Tix Collector\n' +
                '> • Live 3rd-person graphic snapshot of your studio with your Roblox avatar, conveyor belt, Droppers, and green Collector Pad.\n' +
                '> • Build all 6 Purchase Pads up to the Developer Tower and **Rebirth** for a permanent `+35%` multiplier and Ascension Chest Keys.\n\n' +
                '### 🛒 2. Normal Shop & Equipment\n' +
                '> • Buy classic Roblox items (`+5%` to `+12%` Tix/min) and equip any owned item on your avatar.\n\n' +
                '### 🎨 3. UGC Workshop & Marketplace\n' +
                '> • Design and publish up to 2 custom `[🎨 UGC]` items (`200–1,500 Tix`, fixed `+10%` boost) and earn **70% royalties** on every sale.\n\n' +
                '### 👑 4. Limited / Limited U Vault & P2P Trading\n' +
                '> • Unbox Ascension Chests, mint serialized Limited U drops (`#01/15`), and trade on the **Public Board** or via **Direct Trade**.\n\n' +
                '### 🧪 5. Potions & Community VIP Perks\n' +
                '> • Activate 30-minute potions and sync **Discord Server Boost (`+50%`)** and **YouTube VIP (`+35%`)**.'
        },
        cmd_config: {
            titulo: '⚙️ Command `/config` — Settings',
            color: 0x5865F2,
            contenido:
                '### 🔗 1. Accounts & Saved Data\n' +
                '> • Link your **Discord** and **Roblox** accounts using the buttons on the right of each section.\n' +
                '> • View a quick summary of your watchlist, pending Robux, alerts, and codes.\n\n' +
                '### 🌐 2. Language & Preferences\n' +
                '> • Switch anytime between **🇪🇸 Español** and **🇺🇸 English**.\n' +
                '> • Select your default pricing region for the calculator.'
        },
        cmd_ping: {
            titulo: '🏓 Command `/ping` — Status & Latency',
            color: 0x10B981,
            contenido:
                '### ⚡ Live Status\n' +
                '> • **Response & WebSocket:** Shows current connection speed with Discord.\n' +
                '> • **Uptime & Memory:** Displays bot uptime, server count, and memory usage.'
        }
    }
};

/**
 * Construye el panel interactivo de /help en el idioma del usuario ('es' o 'en'),
 * sin autorreferenciar el propio comando /help.
 */
function construirPanelHelp(mainCategory = 'cmd_overview', robloxSubCategory = 'sub_economy', lang = 'es') {
    const isEn = lang === 'en';
    const langKey = isEn ? 'en' : 'es';

    if (mainCategory === 'cat_economy') {
        mainCategory = 'cmd_roblox';
        robloxSubCategory = 'sub_economy';
    } else if (mainCategory === 'cat_avatar') {
        mainCategory = 'cmd_roblox';
        robloxSubCategory = 'sub_avatar';
    } else if (mainCategory === 'cat_games') {
        mainCategory = 'cmd_roblox';
        robloxSubCategory = 'sub_games';
    }

    const validMainKeys = ['cmd_overview', 'cmd_roblox', 'cmd_tycoon', 'cmd_config', 'cmd_ping'];
    const activeMain = validMainKeys.includes(mainCategory) ? mainCategory : 'cmd_overview';

    const validSubKeys = ['sub_economy', 'sub_avatar', 'sub_games', 'sub_account'];
    const activeSub = validSubKeys.includes(robloxSubCategory) ? robloxSubCategory : 'sub_economy';

    const vistaActual = activeMain === 'cmd_roblox'
        ? DETALLE_SUBCATEGORIAS_ROBLOX[langKey][activeSub]
        : SECCIONES_PRINCIPALES_HELP[langKey][activeMain];

    const container = new ContainerBuilder().setAccentColor(vistaActual.color);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        isEn
            ? '# 📚 Help Center — Kortex\n' +
              'Select a command below to view its tools and options.'
            : '# 📚 Centro de Ayuda — Kortex\n' +
              'Seleccioná un comando abajo para ver sus herramientas y opciones.'
    ));

    const selectMainHelp = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder(
            isEn
                ? '📂 Select a command...'
                : '📂 Seleccioná un comando...'
        )
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Main Commands Overview' : 'Resumen de Comandos')
                .setDescription(
                    isEn
                        ? 'Overview of /roblox, /tycoon, /config, and /ping'
                        : 'Vista general de /roblox, /tycoon, /config y /ping'
                )
                .setValue('cmd_overview')
                .setEmoji('🏠')
                .setDefault(activeMain === 'cmd_overview'),
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    isEn
                        ? 'Command /roblox — Tools & Categories'
                        : 'Comando /roblox — Herramientas y Categorías'
                )
                .setDescription(
                    isEn
                        ? 'Economy, 3D/2D Avatars, Games & Roblox Account'
                        : 'Economía, Avatares 3D/2D, Juegos y Cuenta de Roblox'
                )
                .setValue('cmd_roblox')
                .setEmoji('🎮')
                .setDefault(activeMain === 'cmd_roblox'),
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    isEn
                        ? 'Command /tycoon — 3rd-Person Tycoon Studio'
                        : 'Comando /tycoon — Estudio Roblox Tycoon'
                )
                .setDescription(
                    isEn
                        ? 'Collector Pad, Normal Shop, UGC Workshop, Limited U & P2P Trading'
                        : 'Colector de Tix, Tienda, Taller UGC, Limited U y Trading P2P'
                )
                .setValue('cmd_tycoon')
                .setEmoji('🏭')
                .setDefault(activeMain === 'cmd_tycoon'),
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    isEn
                        ? 'Command /config — Accounts & Language'
                        : 'Comando /config — Cuentas e Idioma'
                )
                .setDescription(
                    isEn
                        ? 'Linked accounts, saved data, and language (Español/English)'
                        : 'Cuentas vinculadas, datos guardados e idioma (Español/Inglés)'
                )
                .setValue('cmd_config')
                .setEmoji('⚙️')
                .setDefault(activeMain === 'cmd_config'),
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    isEn
                        ? 'Command /ping — Status & Latency'
                        : 'Comando /ping — Estado y Latencia'
                )
                .setDescription(
                    isEn
                        ? 'Connection latency, uptime, and memory usage'
                        : 'Latencia de conexión, tiempo activo y memoria'
                )
                .setValue('cmd_ping')
                .setEmoji('🏓')
                .setDefault(activeMain === 'cmd_ping')
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMainHelp));

    if (activeMain === 'cmd_roblox') {
        const selectRobloxSub = new StringSelectMenuBuilder()
            .setCustomId('help_roblox_subcat_select')
            .setPlaceholder(
                isEn
                    ? '🎮 Select a /roblox category...'
                    : '🎮 Seleccioná una categoría de /roblox...'
            )
            .addOptions([
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        isEn
                            ? 'Category 1: Economy & Pricing'
                            : 'Categoría 1: Economía y Precios'
                    )
                    .setDescription(
                        isEn
                            ? 'Price Tracker, Calculator, Price Floors, Pending Robux & Groups'
                            : 'Precios y Mi Lista, Calculadora, Pisos, Robux Pendientes y Grupos'
                    )
                    .setValue('sub_economy')
                    .setEmoji('💰')
                    .setDefault(activeSub === 'sub_economy'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        isEn
                            ? 'Category 2: Avatars & 3D/2D Studio'
                            : 'Categoría 2: Avatares y Estudio 3D/2D'
                    )
                    .setDescription(
                        isEn
                            ? 'Sandbox, Clones, 2D Textures, 3D Exporter & Color-Match'
                            : 'Probador, Clones, Texturas 2D, Exportador 3D y Color-Match'
                    )
                    .setValue('sub_avatar')
                    .setEmoji('👕')
                    .setDefault(activeSub === 'sub_avatar'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        isEn
                            ? 'Category 3: Games & Servers'
                            : 'Categoría 3: Juegos y Servidores'
                    )
                    .setDescription(
                        isEn
                            ? 'Empty Servers, Gamepasses, Codes, Update Alerts & Maps'
                            : 'Servidores Vacíos, Pases, Códigos, Alertas y Mapas'
                    )
                    .setValue('sub_games')
                    .setEmoji('🎮')
                    .setDefault(activeSub === 'sub_games'),
                new StringSelectMenuOptionBuilder()
                    .setLabel(
                        isEn
                            ? 'Roblox Account'
                            : 'Cuenta de Roblox'
                    )
                    .setDescription(
                        isEn
                            ? 'How to link your Roblox account'
                            : 'Cómo vincular tu cuenta de Roblox'
                    )
                    .setValue('sub_account')
                    .setEmoji('🔗')
                    .setDefault(activeSub === 'sub_account')
            ]);

        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectRobloxSub));
    }

    container.addSeparatorComponents(separador(true));

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `## ${vistaActual.titulo}\n\n${vistaActual.contenido}`
    ));

    container.addSeparatorComponents(separador(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(isEn ? 'Web Guide' : 'Guía Web')
                .setEmoji('🌐')
                .setStyle(ButtonStyle.Link)
                .setURL(DOCS_URL)
        )
    );

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer(isEn ? 'Commands: /roblox • /config • /ping' : 'Comandos: /roblox • /config • /ping')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Muestra la guía interactiva de comandos (/roblox, /config, /ping) y herramientas del bot.'),

    construirPanelHelp,

    async execute(interaction) {
        const lang = obtenerIdiomaUsuario(interaction.user?.id);
        await interaction.reply(construirPanelHelp('cmd_overview', 'sub_economy', lang));
    }
};
