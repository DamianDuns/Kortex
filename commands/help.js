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
const { obtenerUrlBasePublica } = require('../src/utils/fastLink');

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
                '### 🪞 2.1 Estudio de Outfits y Presupuesto 3D\n' +
                '> Cotizá la ropa de cualquier avatar, armá presupuestos con cashback del 40% y fijá metas de precio.\n\n' +
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
        sub_status: {
            titulo: '📊 `/roblox` — Categoría 4: Estadísticas y Análisis de Roblox',
            color: 0x06B6D4,
            contenido:
                '### 📡 4.1 Estado de Servidores de Roblox en Tiempo Real\n' +
                '> Consultá en vivo si los servidores de Roblox están prendidos, su diagnóstico de red y la salud de cada subsistema.\n\n' +
                '### 📈 4.2 Rendimiento por Plataforma y Red de Roblox\n' +
                '> Analizá la latencia, carga de uso y estabilidad en Móvil, PC, Consola, CDN 3D, Voz/Chat y Roblox Cloud.\n\n' +
                '### 🕵️ 4.3 Inspector y Estadísticas de Perfil de Usuario\n' +
                '> Analizá cualquier cuenta de Roblox: antigüedad, seguidores, amigos, grupos y tarjeta visual.\n\n' +
                '### 💎 4.4 Radar de Limiteds y Oportunidades de Mercado\n' +
                '> Compará el mejor precio actual de coleccionables Limited frente a su valor promedio y demanda.\n\n' +
                '### ⚔️ 4.5 Comparador de Experiencias (Juego vs. Juego)\n' +
                '> Compará dos juegos de Roblox cara a cara en jugadores activos, visitas, favoritos y capacidad.'
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
                '### 🪞 2.1 3D Outfit Studio & Budget Breakdown\n' +
                '> Price any avatar outfit, plan custom budgets with 40% cashback, and track item targets.\n\n' +
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
        sub_status: {
            titulo: '📊 `/roblox` — Category 4: Roblox Analytics & Status',
            color: 0x06B6D4,
            contenido:
                '### 📡 4.1 Real-Time Roblox Server Status\n' +
                '> Check in real time whether Roblox servers are online, inspect network diagnostics, and view subsystem health.\n\n' +
                '### 📈 4.2 Global Platform & Network Performance\n' +
                '> Inspect live ping, traffic load, and stability across Mobile, PC, Console, 3D CDN, Voice/Chat, and Roblox Cloud.\n\n' +
                '### 🕵️ 4.3 User Profile Inspector & Analytics\n' +
                '> Inspect any Roblox account: account age, followers, friends, groups, and visual profile card.\n\n' +
                '### 💎 4.4 Limiteds & Market Opportunity Radar\n' +
                '> Compare featured Limited collectibles by best current price vs. average value and demand.\n\n' +
                '### ⚔️ 4.5 Experience Comparator (Game vs. Game)\n' +
                '> Compare two Roblox games head-to-head on active players, visits, favorites, and server capacity.'
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
            titulo: '🏠 Resumen de Comandos',
            color: COLORES.primario,
            contenido:
                '### 🎮 `/roblox` o mención `@Kortex`\n' +
                '> Acceso directo al conjunto de herramientas de Roblox: Economía y Precios, Avatares 3D y 2D, Servidores y Juegos, y Estado de Servidores en vivo.\n\n' +
                '### 🏭 `/tycoon`\n' +
                '> Tu Estudio Tycoon en 3D: Colector de Tix, Cristales Kortex, Misiones Semanales, Tienda, Taller UGC con 70% de regalías, Bóveda de Limiteds y Comercio P2P.\n\n' +
                '### ⚙️ `/config`\n' +
                '> Vinculá tus cuentas de Discord y Roblox, configurá tu prefijo personalizado de comandos, idioma y preferencias de uso.\n\n' +
                '### 🏓 `/ping`\n' +
                '> Medición de latencia y velocidad de respuesta con Discord en tiempo real, tiempo activo del bot y consumo de memoria.'
        },
        cmd_tycoon: {
            titulo: '🏭 Comando `/tycoon` — Estudio Roblox Tycoon',
            color: 0x22C55E,
            contenido:
                '### 🏗️ 1. Mi Estudio y Producción\n' +
                '> Mapa 3D isométrico con tu avatar, cinta transportadora, Colector de Tix, Racha Diaria y Rebirth.\n\n' +
                '### 🎒 2. Tienda, Ítems y Taller UGC\n' +
                '> Comprá ítems con Tix o Cristales Kortex, equipá hasta 3 ítems y publicá accesorios UGC con 70% de regalías.\n\n' +
                '### 👑 3. Cofres, Limiteds e Intercambios\n' +
                '> Abrí cofres con llaves de Rebirth, conseguí ítems Limited U seriados y comerciá P2P.\n\n' +
                '### 💠 4. Misiones, Pociones y Ranking\n' +
                '> Completá misiones semanales para ganar Cristales gratis, activá pociones temporales y competí en el ranking de estudios.'
        },
        cmd_config: {
            titulo: '⚙️ Comando `/config` — Configuración',
            color: 0x5865F2,
            contenido:
                '### 🔗 1. Cuentas y Datos Guardados\n' +
                '> Vinculá tus cuentas de Discord y Roblox, generá tu código para iniciar sesión en la web y consultá tu resumen guardado.\n\n' +
                '### ⚡ 2. Prefijo, Idioma y Preferencias\n' +
                '> Personalizá tu prefijo de comandos para el chat, cambiá el idioma entre Español e Inglés y configurá tus alertas por mensaje directo.'
        }
    },
    en: {
        cmd_overview: {
            titulo: '🏠 Main Commands Overview',
            color: COLORES.primario,
            contenido:
                '### 🎮 `/roblox` or mention `@Kortex`\n' +
                '> Direct access to the Roblox toolkit: Economy & Pricing, 3D/2D Avatars, Games & Servers, and Live Server Status.\n\n' +
                '### 🏭 `/tycoon`\n' +
                '> Your 3D Tycoon Studio: Tix Collector, Kortex Crystals, Weekly Quests, Shop, UGC Workshop with 70% royalties, Limiteds Vault, and P2P Trading.\n\n' +
                '### ⚙️ `/config`\n' +
                '> Link your Discord and Roblox accounts, set your custom command prefix, language, and preferences.\n\n' +
                '### 🏓 `/ping`\n' +
                '> Real-time latency and Discord response time measurement, bot uptime, and memory usage.'
        },
        cmd_tycoon: {
            titulo: '🏭 Command `/tycoon` — Tycoon Studio',
            color: 0x22C55E,
            contenido:
                '### 🏗️ 1. Studio & Production\n' +
                '> 3D isometric studio map with your avatar, conveyor belt, Tix Collector, Daily Streak, and Rebirth.\n\n' +
                '### 🎒 2. Shop, Items & UGC Workshop\n' +
                '> Buy items with Tix or Kortex Crystals, equip up to 3 items, and publish UGC items with 70% royalties.\n\n' +
                '### 👑 3. Chests, Limiteds & P2P Trading\n' +
                '> Unbox chests with Rebirth keys, collect serialized Limited U drops, and trade P2P.\n\n' +
                '### 💠 4. Quests, Potions & Leaderboard\n' +
                '> Complete weekly quests to earn free Crystals, activate temporary potions, and climb the studio leaderboard.'
        },
        cmd_config: {
            titulo: '⚙️ Command `/config` — Settings',
            color: 0x5865F2,
            contenido:
                '### 🔗 1. Accounts & Saved Data\n' +
                '> Link your Discord and Roblox accounts, generate your web login code, and inspect your saved summary.\n\n' +
                '### ⚡ 2. Prefix, Language & Preferences\n' +
                '> Customize your chat command prefix, toggle between Spanish and English, and configure personal DM notifications.'
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
    } else if (mainCategory === 'cat_status') {
        mainCategory = 'cmd_roblox';
        robloxSubCategory = 'sub_status';
    }

    const validMainKeys = ['cmd_overview', 'cmd_roblox', 'cmd_tycoon', 'cmd_config'];
    const activeMain = validMainKeys.includes(mainCategory) ? mainCategory : 'cmd_overview';

    const validSubKeys = ['sub_economy', 'sub_avatar', 'sub_games', 'sub_status', 'sub_account'];
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
                        ? 'Linked accounts, custom prefix, and preferences'
                        : 'Cuentas vinculadas, prefijo personalizado y preferencias'
                )
                .setValue('cmd_config')
                .setEmoji('⚙️')
                .setDefault(activeMain === 'cmd_config')
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
                            ? 'Category 4: Analytics & Roblox Status'
                            : 'Categoría 4: Estadísticas y Estado de Roblox'
                    )
                    .setDescription(
                        isEn
                            ? 'Server Status, Trending Games, Profiles, Limiteds & Comparator'
                            : 'Estado de Servidores, Tendencias, Perfiles, Limiteds y Comparador'
                    )
                    .setValue('sub_status')
                    .setEmoji('📊')
                    .setDefault(activeSub === 'sub_status'),
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
                .setURL(obtenerUrlBasePublica())
        )
    );

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer(isEn ? 'Commands: /roblox • /tycoon • /config • /ping' : 'Comandos: /roblox • /tycoon • /config • /ping')
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
        .setDescription('Muestra la guía interactiva de comandos y herramientas del bot.'),

    construirPanelHelp,

    async execute(interaction) {
        const lang = obtenerIdiomaUsuario(interaction.user?.id);
        await interaction.reply(construirPanelHelp('cmd_overview', 'sub_economy', lang));
    }
};
