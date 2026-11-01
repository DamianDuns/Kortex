// ==========================================
// ARCHIVO: interactions/buttons/navigation.js
// Panel Principal Multicategoría (/roblox) + Seguimiento de Precios y Mi Lista
// ==========================================

const {
    ContainerBuilder,
    SectionBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags
} = require('discord.js');
const supabase = require('../../db');
const { obtenerMiniaturasBatch } = require('../../utils/roblox');
const {
    COLORES, EMOJI_TIPO, NOMBRE_TIPO,
    footer, separador, boton, formatearPrecio, formatearPrecioTexto
} = require('../../utils/ui');
const { obtenerCuentaVinculada, obtenerCuentaVinculadaSync } = require('../../src/utils/fastLink');
const { obtenerIdiomaUsuario, obtenerIdiomaActual } = require('../../src/utils/i18n');
const { obtenerConfigPropietario } = require('../../src/utils/performanceManager');

const ultimaCategoriaUsuario = new Map();

const DEFINICION_CATEGORIAS = {
    cat_economy: {
        titulo: '💰 Categoría 1: Economía y Precios',
        titulo_en: '💰 Category 1: Economy & Pricing',
        color: COLORES.primario,
        descripcion: 'Seguimiento de precios, calculadoras, pisos de mercado, Robux pendientes y grupos.',
        descripcion_en: 'Price tracking, calculators, market floors, pending Robux, and groups.',
        herramientas: [
            {
                titulo: '### 🎯 1.1 Seguimiento de Precios y Mi Lista',
                titulo_en: '### 🎯 1.1 Price Tracker & Watchlist',
                desc: 'Monitoreá ítems del catálogo, pases y plugins con gráficas y alertas.',
                desc_en: 'Track catalog items, passes, and plugins with charts and alerts.',
                btnId: 'btn_quick_sniper',
                emoji: '🎯',
                style: ButtonStyle.Primary
            },
            {
                titulo: '### 🧮 1.2 Calculadora de Economía',
                titulo_en: '### 🧮 1.2 Economy Calculator',
                desc: 'Calculá descuentos de grupo, Roblox Plus y precios regionales.',
                desc_en: 'Calculate group discounts, Roblox Plus, and regional pricing.',
                btnId: 'btn_quick_calc',
                emoji: '🧮',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 📉 1.3 Pisos de Precio del Catálogo',
                titulo_en: '### 📉 1.3 Catalog Price Floors',
                desc: 'Consultá los precios mínimos actuales por categoría de accesorios.',
                desc_en: 'Check current minimum prices across accessory categories.',
                btnId: 'btn_econ_floors',
                emoji: '📉',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### ⏳ 1.4 Agenda de Robux Pendientes',
                titulo_en: '### ⏳ 1.4 Pending Robux Schedule',
                desc: 'Registrá tus ventas y recibí un aviso cuando se liberen tus Robux.',
                desc_en: 'Log your sales and get notified when your Robux are released.',
                btnId: 'btn_econ_pending',
                emoji: '⏳',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🏛️ 1.5 Auditor y Catálogo de Grupos',
                titulo_en: '### 🏛️ 1.5 Group Auditor & Catalog',
                desc: 'Explorá cualquier grupo de Roblox y su tienda de ropa.',
                desc_en: 'Explore any Roblox group and its clothing store.',
                btnId: 'btn_econ_group',
                emoji: '🏛️',
                style: ButtonStyle.Secondary
            }
        ]
    },
    cat_avatar: {
        titulo: '👕 Categoría 2: Avatares y Estudio 3D/2D',
        titulo_en: '👕 Category 2: Avatars & 3D/2D Studio',
        color: 0x8B5CF6,
        descripcion: 'Probador de ropa, buscador de similares, plantillas 2D, modelos 3D y combinación por color.',
        descripcion_en: 'Outfit try-on, similar items finder, 2D templates, 3D models, and color matching.',
        herramientas: [
            {
                titulo: '### 🧪 2.1 Probador de Ropa en Vivo',
                titulo_en: '### 🧪 2.1 Live Outfit Sandbox',
                desc: 'Probate hasta 5 objetos en tu avatar o cotizá tu conjunto actual.',
                desc_en: 'Try up to 5 items on your avatar or price your current outfit.',
                btnId: 'btn_ava_sandbox',
                emoji: '🧪',
                style: ButtonStyle.Primary
            },
            {
                titulo: '### 🔍 2.2 Buscador de Clones y Similares',
                titulo_en: '### 🔍 2.2 Clones & Similar Items Finder',
                desc: 'Encontrá alternativas económicas e ítems parecidos en el catálogo.',
                desc_en: 'Find affordable alternatives and similar items in the catalog.',
                btnId: 'btn_ava_clones',
                emoji: '🔍',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🧬 2.3 Extractor de Texturas y Maniquí 2D',
                titulo_en: '### 🧬 2.3 Texture Extractor & 2D Mannequin',
                desc: 'Descargá la plantilla .PNG de cualquier prenda y probala en un maniquí.',
                desc_en: 'Download the .PNG template of any garment and preview it on a mannequin.',
                btnId: 'btn_ava_textures',
                emoji: '🧬',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 📦 2.4 Exportador de Modelos 3D',
                titulo_en: '### 📦 2.4 3D Model Exporter',
                desc: 'Descargá el render PNG y el paquete .ZIP con el modelo 3D.',
                desc_en: 'Download the PNG render and .ZIP package with the 3D model.',
                btnId: 'btn_ava_export3d',
                emoji: '📦',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🎨 2.5 Combinador por Color',
                titulo_en: '### 🎨 2.5 Color-Match Finder',
                desc: 'Extraé los colores de tu avatar o prenda y buscá accesorios que combinen.',
                desc_en: 'Extract colors from your avatar or garment and find matching accessories.',
                btnId: 'btn_ava_colormatch',
                emoji: '🎨',
                style: ButtonStyle.Secondary
            }
        ]
    },
    cat_games: {
        titulo: '🎮 Categoría 3: Juegos y Servidores',
        titulo_en: '🎮 Category 3: Games & Servers',
        color: 0x10B981,
        descripcion: 'Servidores vacíos, pases de juego, códigos promocionales, alertas de parches y mapas.',
        descripcion_en: 'Empty servers, gamepasses, promo codes, patch alerts, and maps.',
        herramientas: [
            {
                titulo: '### 👻 3.1 Buscador de Servidores Vacíos',
                titulo_en: '### 👻 3.1 Empty Servers Finder',
                desc: 'Encontrá servidores con pocos jugadores listos para entrar.',
                desc_en: 'Find servers with the fewest players ready to join.',
                btnId: 'btn_games_servers',
                emoji: '👻',
                style: ButtonStyle.Primary
            },
            {
                titulo: '### 🎟️ 3.2 Buscador de Pases de Juego',
                titulo_en: '### 🎟️ 3.2 Gamepass Finder',
                desc: 'Consultá y ordená por precio todos los pases de cualquier juego.',
                desc_en: 'Browse and sort by price all gamepasses of any game.',
                btnId: 'btn_games_passes',
                emoji: '🎟️',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🎁 3.3 Bóveda de Códigos Activos',
                titulo_en: '### 🎁 3.3 Active Promo Codes Vault',
                desc: 'Consultá códigos promocionales y marcá los que ya canjeaste.',
                desc_en: 'Check promo codes and mark the ones you already redeemed.',
                btnId: 'btn_games_codes',
                emoji: '🎁',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🔔 3.4 Alertas de Actualizaciones',
                titulo_en: '### 🔔 3.4 Game Update Alerts',
                desc: 'Recibí un aviso cuando tus juegos favoritos se actualicen.',
                desc_en: 'Get notified whenever your favorite games update.',
                btnId: 'btn_games_patches',
                emoji: '🔔',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🗺️ 3.5 Explorador de Mapas Conectados',
                titulo_en: '### 🗺️ 3.5 Connected Maps Explorer',
                desc: 'Descubrí los sub-lugares y mundos secundarios de cualquier juego.',
                desc_en: 'Discover sub-places and secondary worlds inside any game.',
                btnId: 'btn_games_mapper',
                emoji: '🗺️',
                style: ButtonStyle.Secondary
            }
        ]
    }
};

const NOMBRE_TIPO_EN = {
    catalog: 'Catalog / UGC / Limiteds',
    gamepass: 'Gamepass',
    plugin: 'Studio Plugin',
    paid_access: 'Paid Access',
    bundle: 'Bundle'
};

// ==========================================
// HUB PRINCIPAL (/roblox y @Kortex)
// ==========================================
function construirMenuPrincipal(userId, categoryKey = null, feedbackMsg = null) {
    const uid = String(userId || 'anon');
    const lang = obtenerIdiomaUsuario(uid) || obtenerIdiomaActual();
    const isEn = lang === 'en';
    const activeCatKey = (!categoryKey || categoryKey === 'main')
        ? (ultimaCategoriaUsuario.get(uid) || 'cat_economy')
        : categoryKey;
    ultimaCategoriaUsuario.set(uid, activeCatKey);

    const cat = DEFINICION_CATEGORIAS[activeCatKey] || DEFINICION_CATEGORIAS.cat_economy;
    const cuentaVinculada = obtenerCuentaVinculadaSync(uid);

    const container = new ContainerBuilder().setAccentColor(cat.color);

    const fastLinkLine = cuentaVinculada
        ? (isEn
            ? `\n-# 🎮 **Account:** \`@${cuentaVinculada.roblox_username}\``
            : `\n-# 🎮 **Cuenta:** \`@${cuentaVinculada.roblox_username}\``)
        : (isEn
            ? '\n-# 🎮 *No linked Roblox account*'
            : '\n-# 🎮 *Sin cuenta de Roblox vinculada*');

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        (isEn ? '# ⚡ Roblox Toolkit — Kortex\n' : '# ⚡ Herramientas de Roblox — Kortex\n') +
        `**${isEn ? cat.titulo_en : cat.titulo}**\n` +
        `${isEn ? cat.descripcion_en : cat.descripcion}` +
        fastLinkLine +
        (feedbackMsg ? `\n\n> ✅ ${feedbackMsg}` : '')
    ));

    // Selector de las 3 grandes categorías (customId: 'roblox_category_select')
    const selectCategoria = new StringSelectMenuBuilder()
        .setCustomId('roblox_category_select')
        .setPlaceholder(
            isEn
                ? '📂 Select a category...'
                : '📂 Seleccioná una categoría...'
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
                        : 'Seguimiento de Precios, Calculadora, Pisos, Robux Pendientes y Grupos'
                )
                .setValue('cat_economy')
                .setEmoji('💰')
                .setDefault(activeCatKey === 'cat_economy'),
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    isEn
                        ? 'Category 2: Avatars & 3D/2D Studio'
                        : 'Categoría 2: Avatares y Estudio 3D/2D'
                )
                .setDescription(
                    isEn
                        ? 'Outfit Sandbox, Similar Items, 2D Templates, 3D Exporter & Color-Match'
                        : 'Probador de Ropa, Similares, Plantillas 2D, Exportador 3D y Colores'
                )
                .setValue('cat_avatar')
                .setEmoji('👕')
                .setDefault(activeCatKey === 'cat_avatar'),
            new StringSelectMenuOptionBuilder()
                .setLabel(
                    isEn
                        ? 'Category 3: Games & Servers'
                        : 'Categoría 3: Juegos y Servidores'
                )
                .setDescription(
                    isEn
                        ? 'Empty Servers, Gamepasses, Promo Codes, Update Alerts & Maps'
                        : 'Servidores Vacíos, Pases de Juego, Códigos, Actualizaciones y Mapas'
                )
                .setValue('cat_games')
                .setEmoji('🎮')
                .setDefault(activeCatKey === 'cat_games')
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectCategoria));
    container.addSeparatorComponents(separador(true));

    // Las 5 herramientas de la categoría activa con su respectivo botón "Abrir" / "Open" a la derecha
    cat.herramientas.forEach((h, idx) => {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `${isEn ? h.titulo_en : h.titulo}\n${isEn ? h.desc_en : h.desc}`
                ))
                .setButtonAccessory(boton(h.btnId, isEn ? 'Open' : 'Abrir', h.emoji, h.style))
        );
        if (idx < cat.herramientas.length - 1) {
            container.addSeparatorComponents(separador());
        }
    });

    container.addSeparatorComponents(separador(true));

    const labelFastLink = cuentaVinculada
        ? (isEn ? `Roblox Account: @${cuentaVinculada.roblox_username}` : `Cuenta Roblox: @${cuentaVinculada.roblox_username}`)
        : (isEn ? 'Link Roblox Account' : 'Vincular Cuenta de Roblox');

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_fastlink_modal', labelFastLink, '🎮', cuentaVinculada ? ButtonStyle.Success : ButtonStyle.Primary)
        )
    );

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer(
            isEn
                ? 'Settings & Language: /config'
                : 'Configuración e Idioma: /config'
        )
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// SEGUIMIENTO DE PRECIOS: elegir categoría + acceso a Mi Lista
// ==========================================
function construirMenuSniper(lang = null) {
    const isEn = (lang || obtenerIdiomaActual()) === 'en';
    const container = new ContainerBuilder().setAccentColor(COLORES.sniper);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        isEn
            ? '## 🎯 Price Tracker & Alerts\n' +
              'Add a new item in 3 steps:\n' +
              '> **1.** Choose the item category in the dropdown menu.\n' +
              '> **2.** Paste the Roblox **ID** or **URL**.\n' +
              '> **3.** Set a target price *(optional)* and where to receive alerts.'
            : '## 🎯 Seguimiento de Precios\n' +
              'Añadí un objeto nuevo en 3 pasos:\n' +
              '> **1.** Elegí la categoría en el menú desplegable.\n' +
              '> **2.** Pegá el **ID** o el **enlace** de Roblox.\n' +
              '> **3.** Definí una meta de precio *(opcional)* y dónde recibir las alertas.'
    ));

    const selectTipo = new StringSelectMenuBuilder()
        .setCustomId('select_sniper_type')
        .setPlaceholder(
            isEn
                ? '➕ Choose a category to add an item...'
                : '➕ Elegí una categoría para añadir un objeto...'
        )
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Catalog / UGC / Limiteds' : 'Catálogo / UGC / Limiteds')
                .setDescription(isEn ? 'Clothing, accessories, and collectibles (Robux)' : 'Ropa, accesorios y coleccionables (Robux)')
                .setValue('catalog')
                .setEmoji(EMOJI_TIPO.catalog),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Gamepass' : 'Pase de Juego (Gamepass)')
                .setDescription(isEn ? 'Experience passes (Robux)' : 'Pases de experiencias (Robux)')
                .setValue('gamepass')
                .setEmoji(EMOJI_TIPO.gamepass),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Studio Plugin' : 'Plugin de Studio')
                .setDescription(isEn ? 'Creator Store tools (USD)' : 'Herramientas de la tienda de creadores (USD)')
                .setValue('plugin')
                .setEmoji(EMOJI_TIPO.plugin),
            new StringSelectMenuOptionBuilder()
                .setLabel(isEn ? 'Paid Access Experience' : 'Acceso Pago a Experiencia')
                .setDescription(isEn ? 'Games with paid entry (Robux)' : 'Experiencias con entrada paga (Robux)')
                .setValue('paid_access')
                .setEmoji(EMOJI_TIPO.paid_access)
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectTipo));

    container.addSeparatorComponents(separador(true));

    // Mi Lista integrada dentro de la categoría Seguimiento de Precios
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                isEn
                    ? '### 📋 My Watchlist\n' +
                      `Review your tracked items (max ${MAX_WISHLIST_ITEMS}), check their **price charts**, or configure your alerts.`
                    : '### 📋 Mi Lista de Monitoreo\n' +
                      `Revisá tus objetos en seguimiento (máx. ${MAX_WISHLIST_ITEMS}), consultá sus **gráficas de precios** o configurá tus alertas.`
            ))
            .setButtonAccessory(boton('btn_nav_wishlist', isEn ? 'View Watchlist' : 'Ver Mi Lista', '📋', ButtonStyle.Success))
    );

    container.addSeparatorComponents(separador());

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_nav_cat:cat_economy', isEn ? 'Go Back' : 'Volver Atrás', '⬅️')
        )
    );

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// MI LISTA DE MONITOREO (dentro de Seguimiento de Precios)
// ==========================================
function construirListaVacia(lang = null) {
    const isEn = (lang || obtenerIdiomaActual()) === 'en';
    const container = new ContainerBuilder()
        .setAccentColor(COLORES.neutro)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            isEn
                ? '## 📋 Your Watchlist\n' +
                  'You are not tracking any items yet.\n\n' +
                  '> Go back to **Price Tracker** and choose a category above to add your first item. 🎯'
                : '## 📋 Tu Lista de Monitoreo\n' +
                  'Todavía no estás siguiendo ningún objeto.\n\n' +
                  '> Volvé atrás a **Seguimiento de Precios** y elegí una categoría arriba para añadir tu primer objeto. 🎯'
        ))
        .addSeparatorComponents(separador())
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_nav_sniper', isEn ? 'Go Back' : 'Volver Atrás', '⬅️', ButtonStyle.Secondary)
            )
        );

    return { components: [container], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
}

function construirLista(items, miniaturas, lang = null) {
    const isEn = (lang || obtenerIdiomaActual()) === 'en';
    const maxItems = Number(obtenerConfigPropietario().maxWishlistItems || 5);
    const activos = items.filter(i => !i.is_paused).length;
    const pausados = items.length - activos;

    const container = new ContainerBuilder().setAccentColor(COLORES.lista);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        isEn
            ? `# 📋 Your Watchlist  \`${items.length}/${maxItems}\`\n` +
              `-# ⚡ **${activos}** active  •  ⏸️ **${pausados}** paused`
            : `# 📋 Tu Lista de Monitoreo  \`${items.length}/${maxItems}\`\n` +
              `-# ⚡ **${activos}** activo(s)  •  ⏸️ **${pausados}** en pausa`
    ));
    container.addSeparatorComponents(separador(true));

    const selectOptions = [];

    items.forEach((item, index) => {
        const type = (item.item_type || 'catalog').toLowerCase();
        const esUSD = type === 'plugin';
        const nombreObj = item.item_name || (isEn ? 'Unnamed item' : 'Objeto sin nombre');
        const tieneMeta = item.target_price !== null && item.target_price !== undefined;
        const metaAlcanzada = tieneMeta && Number(item.last_price) <= Number(item.target_price);

        const fmtActual = formatearPrecio(item.last_price, esUSD);
        const fmtActualPlano = formatearPrecioTexto(item.last_price, esUSD);
        const fmtMeta = tieneMeta
            ? `${formatearPrecio(item.target_price, esUSD)}${metaAlcanzada ? '  ✅' : ''}`
            : (isEn ? '`No target`' : '`Sin meta`');
        const estado = item.is_paused
            ? (isEn ? '⏸️ Paused' : '⏸️ En pausa')
            : (isEn ? '🟢 Active' : '🟢 Activo');
        const tipoLabel = isEn
            ? (NOMBRE_TIPO_EN[type] || type)
            : (NOMBRE_TIPO[type] || type);

        const detalle = new TextDisplayBuilder().setContent(
            `## ${EMOJI_TIPO[type] || '📦'} __**${nombreObj}**__\n` +
            `🏷️ **${isEn ? 'Price' : 'Precio'}:** ${fmtActual}  •  🎯 **${isEn ? 'Target' : 'Meta'}:** ${fmtMeta}\n` +
            `-# ${estado}  •  ${tipoLabel}  •  ID ${item.id_objet}`
        );

        const rawImg = miniaturas.get(String(item.id_objet));
        const imgUrl = rawImg && /^https?:\/\//i.test(String(rawImg)) ? String(rawImg) : null;
        if (imgUrl) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(detalle)
                    .setThumbnailAccessory(thumb => thumb.setURL(imgUrl))
            );
        } else {
            container.addTextDisplayComponents(detalle);
        }

        if (index < items.length - 1) {
            container.addSeparatorComponents(separador());
        }

        const safeOptionVal = String(item.id ?? `${item.id_objet || 'item'}_${index}`);
        selectOptions.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(`${index + 1}. ${nombreObj}`.substring(0, 100))
                .setDescription(`${fmtActualPlano}  •  ${item.is_paused ? (isEn ? 'Paused' : 'En pausa') : (isEn ? 'Active' : 'Activo')}`.substring(0, 100))
                .setValue(safeOptionVal)
                .setEmoji(item.is_paused ? '⏸️' : (EMOJI_TIPO[type] || '⚡'))
        );
    });

    container.addSeparatorComponents(separador(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_manage_item')
                .setPlaceholder(
                    isEn
                        ? '📈 Select an item to view its price chart or configure alerts...'
                        : '📈 Elegí un objeto para ver su gráfica o configurar alertas...'
                )
                .addOptions(selectOptions)
        )
    );

    const botonesNav = [];
    if (items.length < maxItems) {
        botonesNav.push(boton('btn_quick_sniper', isEn ? 'Add Item' : 'Añadir Objeto', '➕', ButtonStyle.Primary));
    }
    botonesNav.push(
        boton('btn_nav_wishlist', isEn ? 'Refresh' : 'Actualizar', '🔄'),
        boton('btn_nav_sniper', isEn ? 'Go Back' : 'Volver Atrás', '⬅️')
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(botonesNav));

    return { components: [container], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
}

module.exports = {
    customIdPrefix: 'btn_nav_',
    DEFINICION_CATEGORIAS,
    construirMenuPrincipal,
    construirMenuSniper,
    construirLista,
    construirListaVacia,

    async execute(interaction) {
        try {
            const action = interaction.customId.replace('btn_nav_', '');
            const lang = obtenerIdiomaUsuario(interaction.user.id);

            if (action === 'main_menu' || action.startsWith('cat:')) {
                const targetCategory = action.startsWith('cat:')
                    ? action.replace('cat:', '')
                    : null;
                await interaction.deferUpdate();
                await obtenerCuentaVinculada(interaction.user.id).catch(() => null);
                return await interaction.editReply({
                    ...construirMenuPrincipal(interaction.user.id, targetCategory),
                    files: [],
                    attachments: []
                });
            }

            if (action === 'sniper') {
                await interaction.deferUpdate();
                return await interaction.editReply(construirMenuSniper(lang));
            }

            if (action === 'wishlist') {
                await interaction.deferUpdate();

                let items = [];
                try {
                    const { data, error: dbError } = await supabase
                        .from('roblox_wishlist')
                        .select('*')
                        .eq('user_id', interaction.user.id)
                        .order('id', { ascending: true });
                    if (!dbError && Array.isArray(data)) {
                        items = data;
                    } else if (typeof supabase.memoryFrom === 'function') {
                        const { data: memData } = await supabase
                            .memoryFrom('roblox_wishlist')
                            .select('*')
                            .eq('user_id', interaction.user.id)
                            .order('id', { ascending: true });
                        items = memData || [];
                    }
                } catch {
                    if (typeof supabase.memoryFrom === 'function') {
                        const { data: memData } = await supabase
                            .memoryFrom('roblox_wishlist')
                            .select('*')
                            .eq('user_id', interaction.user.id)
                            .order('id', { ascending: true });
                        items = memData || [];
                    }
                }

                if (!items || items.length === 0) {
                    return await interaction.editReply(construirListaVacia(lang));
                }

                let miniaturas = new Map();
                try {
                    miniaturas = await obtenerMiniaturasBatch(items);
                } catch (thumbErr) {
                    console.error('[WISHLIST THUMBNAIL ERROR]:', thumbErr.message);
                }

                return await interaction.editReply(construirLista(items, miniaturas, lang));
            }
        } catch (error) {
            console.error('[ERROR EN NAVEGACIÓN]:', error);
            throw error;
        }
    }
};