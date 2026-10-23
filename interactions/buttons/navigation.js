// ==========================================
// ARCHIVO: interactions/buttons/navigation.js
// Panel Principal Multicategoría (/roblox) + Price Sniper y Mi Lista
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

const MAX_WISHLIST_ITEMS = 5;
const ultimaCategoriaUsuario = new Map();

const DEFINICION_CATEGORIAS = {
    cat_economy: {
        titulo: '💰 Categoría 1: Economía, Mercado y Precios',
        color: COLORES.primario,
        descripcion: 'Monitoreo inteligente de precios, pisos dinámicos UGC, Robux pendientes y auditoría de grupos.',
        herramientas: [
            {
                titulo: '### 🎯 1.1 Price Sniper y Mi Lista (máx. 5)',
                desc: 'Monitoreá Catálogo, Limiteds, Gamepasses y Plugins con gráficas históricas y alertas en vivo.',
                btnId: 'btn_quick_sniper',
                emoji: '🎯',
                style: ButtonStyle.Primary
            },
            {
                titulo: '### 🧮 1.2 Calculadoras Financieras (+40% Cashback)',
                desc: 'Calculá descuentos de Cashback de grupo (40%), Roblox Plus (10%/20%) y precios regionales por país.',
                btnId: 'btn_quick_calc',
                emoji: '🧮',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 📉 1.3 Monitor de Pisos de Precio Dinámicos (UGC)',
                desc: 'Detectá en qué categorías de accesorios acaba de bajar el precio mínimo oficial de Roblox.',
                btnId: 'btn_econ_floors',
                emoji: '📉',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### ⏳ 1.4 Agenda y Alerta de Robux Pendientes',
                desc: 'Registrá tus ventas o cashbacks y recibí una alerta exacta cuando Roblox libere tus Robux.',
                btnId: 'btn_econ_pending',
                emoji: '⏳',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🏛️ 1.5 Auditor y Catálogo de Grupos',
                desc: 'Inspeccioná cualquier grupo de Roblox, ordená su catálogo de ropa y calculá el retorno del 40%.',
                btnId: 'btn_econ_group',
                emoji: '🏛️',
                style: ButtonStyle.Secondary
            }
        ]
    },
    cat_avatar: {
        titulo: '👕 Categoría 2: Taller de Avatares y Estudio 3D/2D',
        color: 0x8B5CF6,
        descripcion: 'Prueba de conjuntos en vivo, ítems similares y alternativos, descarga de plantillas de ropa, modelos 3D y combinación por color.',
        herramientas: [
            {
                titulo: '### 🧪 2.1 Probador de Combinaciones en Vivo (Outfit Sandbox)',
                desc: 'Probate hasta 5 objetos del catálogo sobre tu personaje o cotizá tu ropa equipada actual con desglose de precios.',
                btnId: 'btn_ava_sandbox',
                emoji: '🧪',
                style: ButtonStyle.Primary
            },
            {
                titulo: '### 🔍 2.2 Buscador de Clones y Similares (Roblox + UGC)',
                desc: 'Encontrá tanto ítems oficiales de Roblox parecidos como alternativas UGC económicas con su porcentaje de ahorro.',
                btnId: 'btn_ava_clones',
                emoji: '🔍',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🧬 2.3 Extractor de Texturas + Maniquí 2D',
                desc: 'Descargá la plantilla original .PNG de cualquier camisa o pantalón y probala sobre un maniquí frente y espalda.',
                btnId: 'btn_ava_textures',
                emoji: '🧬',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 📦 2.4 Exportador 3D (Render PNG HD + Archivo .ZIP)',
                desc: 'Obtené el render PNG de alta resolución y el paquete .ZIP con el modelo 3D y sus texturas listo para usar.',
                btnId: 'btn_ava_export3d',
                emoji: '📦',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🎨 2.5 Emparejador de Accesorios por Color (Color-Match)',
                desc: 'Detecta los 3 colores principales de tu prenda o avatar y busca accesorios del catálogo que combinen.',
                btnId: 'btn_ava_colormatch',
                emoji: '🎨',
                style: ButtonStyle.Secondary
            }
        ]
    },
    cat_games: {
        titulo: '🎮 Categoría 3: Utilidades de Juego y Servidores',
        color: 0x10B981,
        descripcion: 'Servidores vacíos con unión rápida, pases de juego, códigos promocionales, avisos de actualizaciones y mapas conectados.',
        herramientas: [
            {
                titulo: '### 👻 3.1 Buscador de Servidores Vacíos con Unión Directa',
                desc: 'Encontrá los servidores públicos con menos jugadores y mejor conexión listos para entrar en un clic.',
                btnId: 'btn_games_servers',
                emoji: '👻',
                style: ButtonStyle.Primary
            },
            {
                titulo: '### 🎟️ 3.2 Extractor Completo de Pases de un Juego',
                desc: 'Consultá, buscá y ordená por precio todos los pases de tienda y paquetes internos de cualquier juego.',
                btnId: 'btn_games_passes',
                emoji: '🎟️',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🎁 3.3 Bóveda de Códigos Activos con Checklist Personal',
                desc: 'Consultá o agregá códigos promocionales y marcá cuáles ya canjeaste para llevar tu progreso.',
                btnId: 'btn_games_codes',
                emoji: '🎁',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🔔 3.4 Avisos de Parches y Actualizaciones de Juegos',
                desc: 'Seguí tus juegos favoritos y recibí un aviso apenas los creadores publiquen una nueva actualización.',
                btnId: 'btn_games_patches',
                emoji: '🔔',
                style: ButtonStyle.Secondary
            },
            {
                titulo: '### 🗺️ 3.5 Explorador de Sub-Lugares y Mapas Conectados',
                desc: 'Descubrí todos los mapas secundarios, lobbies de intercambio y mundos dentro de cualquier experiencia.',
                btnId: 'btn_games_mapper',
                emoji: '🗺️',
                style: ButtonStyle.Secondary
            }
        ]
    }
};

// ==========================================
// HUB PRINCIPAL (/roblox y @Kortex)
// ==========================================
function construirMenuPrincipal(userId, categoryKey = null, feedbackMsg = null) {
    const uid = String(userId || 'anon');
    const activeCatKey = categoryKey || ultimaCategoriaUsuario.get(uid) || 'cat_economy';
    ultimaCategoriaUsuario.set(uid, activeCatKey);

    const cat = DEFINICION_CATEGORIAS[activeCatKey] || DEFINICION_CATEGORIAS.cat_economy;
    const cuentaVinculada = obtenerCuentaVinculadaSync(uid);

    const container = new ContainerBuilder().setAccentColor(cat.color);

    const metodoBadge = cuentaVinculada?.auth_method === 'oauth' || cuentaVinculada?.roblox_oauth_verified
        ? '🔐 Roblox OAuth 2.0'
        : '⚡ Modo Básico';

    const fastLinkLine = cuentaVinculada
        ? `\n-# 🎮 **Cuenta de Roblox:** \`@${cuentaVinculada.roblox_username}\` (ID \`${cuentaVinculada.roblox_user_id}\` • ${metodoBadge})`
        : '\n-# 🎮 *Sin cuenta de Roblox vinculada — tocá el botón al pie para conectar tu cuenta de Roblox*';

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '# ⚡ Roblox Toolkit — Kortex\n' +
        `**${cat.titulo}**\n` +
        `${cat.descripcion}` +
        fastLinkLine +
        (feedbackMsg ? `\n\n> ✅ ${feedbackMsg}` : '')
    ));

    // Selector de las 3 grandes categorías (customId: 'roblox_category_select')
    const selectCategoria = new StringSelectMenuBuilder()
        .setCustomId('roblox_category_select')
        .setPlaceholder('📂 Cambiá entre las 3 categorías de herramientas...')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Categoría 1: Economía, Mercado y Precios (5 herramientas)')
                .setDescription('Price Sniper, Calculadoras, Pisos de Precio, Robux Pendientes y Grupos')
                .setValue('cat_economy')
                .setEmoji('💰')
                .setDefault(activeCatKey === 'cat_economy'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Categoría 2: Taller de Avatares y Estudio 3D/2D (5 herramientas)')
                .setDescription('Probador de Ropa, Similares, Plantillas 2D, Exportador 3D y Color-Match')
                .setValue('cat_avatar')
                .setEmoji('👕')
                .setDefault(activeCatKey === 'cat_avatar'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Categoría 3: Utilidades de Juego y Servidores (5 herramientas)')
                .setDescription('Servidores Vacíos, Pases de Juego, Códigos, Actualizaciones y Mapas')
                .setValue('cat_games')
                .setEmoji('🎮')
                .setDefault(activeCatKey === 'cat_games')
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectCategoria));
    container.addSeparatorComponents(separador(true));

    // Las 5 herramientas de la categoría activa con su respectivo botón "Abrir" a la derecha (SectionBuilder)
    cat.herramientas.forEach((h, idx) => {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `${h.titulo}\n${h.desc}`
                ))
                .setButtonAccessory(boton(h.btnId, 'Abrir', h.emoji, h.style))
        );
        if (idx < cat.herramientas.length - 1) {
            container.addSeparatorComponents(separador());
        }
    });

    container.addSeparatorComponents(separador(true));

    // Único botón inferior en /roblox: exclusivamente para la cuenta de Roblox
    const labelFastLink = cuentaVinculada
        ? `Cuenta de Roblox: @${cuentaVinculada.roblox_username} (Gestionar)`
        : 'Vincular Cuenta de Roblox';

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_fastlink_modal', labelFastLink, '🎮', ButtonStyle.Secondary)
        )
    );

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('Navegación en un solo panel • 15 utilidades de Roblox • Configuración de Discord: /config')
    ));

    return {
        components: [container],
        files: [],
        attachments: [],
        flags: MessageFlags.IsComponentsV2
    };
}

// ==========================================
// PRICE SNIPER: elegir categoría + acceso a Mi Lista
// ==========================================
function construirMenuSniper() {
    const container = new ContainerBuilder().setAccentColor(COLORES.sniper);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '## 🎯 Price Sniper\n' +
        'Añadí un objeto nuevo en 3 pasos:\n' +
        '> **1.** Elegí la categoría en el menú desplegable.\n' +
        '> **2.** Pegá el **ID** o el **enlace** de Roblox.\n' +
        '> **3.** Definí una meta de precio *(opcional)* y dónde recibir las alertas.'
    ));

    const selectTipo = new StringSelectMenuBuilder()
        .setCustomId('select_sniper_type')
        .setPlaceholder('➕ Elegí una categoría para añadir un objeto...')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Catálogo / UGC / Limiteds')
                .setDescription('Ropa, accesorios y coleccionables (Robux)')
                .setValue('catalog')
                .setEmoji(EMOJI_TIPO.catalog),
            new StringSelectMenuOptionBuilder()
                .setLabel('Gamepass')
                .setDescription('Pases de experiencias (Robux)')
                .setValue('gamepass')
                .setEmoji(EMOJI_TIPO.gamepass),
            new StringSelectMenuOptionBuilder()
                .setLabel('Plugin de Studio')
                .setDescription('Herramientas del Creator Store (USD)')
                .setValue('plugin')
                .setEmoji(EMOJI_TIPO.plugin),
            new StringSelectMenuOptionBuilder()
                .setLabel('Acceso Pago (Paid Access)')
                .setDescription('Experiencias con entrada paga')
                .setValue('paid_access')
                .setEmoji(EMOJI_TIPO.paid_access)
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectTipo));

    container.addSeparatorComponents(separador(true));

    // Mi Lista integrada dentro de la categoría Price Sniper
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                '### 📋 Mi Lista de Monitoreo\n' +
                `Revisá tus objetos en seguimiento (máx. ${MAX_WISHLIST_ITEMS}), consultá sus **gráficas de precios** o configurá tus alertas.`
            ))
            .setButtonAccessory(boton('btn_nav_wishlist', 'Ver Mi Lista', '📋', ButtonStyle.Success))
    );

    container.addSeparatorComponents(separador());

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            boton('btn_nav_main_menu', 'Volver al Toolkit', '⬅️')
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
// MI LISTA DE MONITOREO (dentro de Price Sniper)
// ==========================================
function construirListaVacia() {
    const container = new ContainerBuilder()
        .setAccentColor(COLORES.neutro)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '## 📋 Tu Lista de Monitoreo\n' +
            'Todavía no estás siguiendo ningún objeto.\n\n' +
            '> Volvé al **Price Sniper** y elegí una categoría arriba para añadir tu primer objeto. 🎯'
        ))
        .addSeparatorComponents(separador())
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                boton('btn_nav_sniper', 'Volver a Price Sniper', '⬅️', ButtonStyle.Primary),
                boton('btn_nav_main_menu', 'Menú Principal', '🏠')
            )
        );

    return { components: [container], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
}

function construirLista(items, miniaturas) {
    const activos = items.filter(i => !i.is_paused).length;
    const pausados = items.length - activos;

    const container = new ContainerBuilder().setAccentColor(COLORES.lista);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `# 📋 Tu Lista de Monitoreo  \`${items.length}/${MAX_WISHLIST_ITEMS}\`\n` +
        `-# ⚡ **${activos}** activo(s)  •  ⏸️ **${pausados}** en pausa`
    ));
    container.addSeparatorComponents(separador(true));

    const selectOptions = [];

    items.forEach((item, index) => {
        const type = (item.item_type || 'catalog').toLowerCase();
        const esUSD = type === 'plugin';
        const nombreObj = item.item_name || 'Objeto sin nombre';
        const tieneMeta = item.target_price !== null && item.target_price !== undefined;
        const metaAlcanzada = tieneMeta && Number(item.last_price) <= Number(item.target_price);

        const fmtActual = formatearPrecio(item.last_price, esUSD);
        const fmtActualPlano = formatearPrecioTexto(item.last_price, esUSD);
        const fmtMeta = tieneMeta
            ? `${formatearPrecio(item.target_price, esUSD)}${metaAlcanzada ? '  ✅' : ''}`
            : '`Sin meta`';
        const estado = item.is_paused ? '⏸️ En pausa' : '🟢 Activo';

        const detalle = new TextDisplayBuilder().setContent(
            `## ${EMOJI_TIPO[type] || '📦'} __**${nombreObj}**__\n` +
            `🏷️ **Precio:** ${fmtActual}  •  🎯 **Meta:** ${fmtMeta}\n` +
            `-# ${estado}  •  ${NOMBRE_TIPO[type] || type}  •  ID ${item.id_objet}`
        );

        const imgUrl = miniaturas.get(String(item.id_objet));
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

        selectOptions.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(`${index + 1}. ${nombreObj}`.substring(0, 100))
                .setDescription(`${fmtActualPlano}  •  ${item.is_paused ? 'En pausa' : 'Activo'}`.substring(0, 100))
                .setValue(String(item.id))
                .setEmoji(item.is_paused ? '⏸️' : (EMOJI_TIPO[type] || '⚡'))
        );
    });

    container.addSeparatorComponents(separador(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_manage_item')
                .setPlaceholder('📈 Elegí un objeto para ver su gráfica o configurar alertas...')
                .addOptions(selectOptions)
        )
    );

    const botonesNav = [];
    if (items.length < MAX_WISHLIST_ITEMS) {
        botonesNav.push(boton('btn_quick_sniper', 'Añadir Objeto', '➕', ButtonStyle.Primary));
    }
    botonesNav.push(
        boton('btn_nav_wishlist', 'Actualizar', '🔄'),
        boton('btn_nav_sniper', 'Volver a Sniper', '⬅️'),
        boton('btn_nav_main_menu', 'Menú Principal', '🏠')
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

            if (action === 'main_menu') {
                await interaction.deferUpdate();
                await obtenerCuentaVinculada(interaction.user.id).catch(() => null);
                return await interaction.editReply({
                    ...construirMenuPrincipal(interaction.user.id),
                    files: [],
                    attachments: []
                });
            }

            if (action.startsWith('cat:')) {
                const catKey = action.split(':')[1] || 'cat_economy';
                await interaction.deferUpdate();
                await obtenerCuentaVinculada(interaction.user.id).catch(() => null);
                return await interaction.editReply({
                    ...construirMenuPrincipal(interaction.user.id, catKey),
                    files: [],
                    attachments: []
                });
            }

            if (action === 'sniper') {
                await interaction.deferUpdate();
                return await interaction.editReply(construirMenuSniper());
            }

            if (action === 'wishlist') {
                await interaction.deferUpdate();

                const { data: items, error: dbError } = await supabase
                    .from('roblox_wishlist')
                    .select('*')
                    .eq('user_id', interaction.user.id)
                    .order('id', { ascending: true });

                if (dbError) {
                    return await interaction.followUp({
                        content: '❌ Error al consultar tu lista en la base de datos.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!items || items.length === 0) {
                    return await interaction.editReply(construirListaVacia());
                }

                let miniaturas = new Map();
                try {
                    miniaturas = await obtenerMiniaturasBatch(items);
                } catch (thumbErr) {
                    console.error('[WISHLIST THUMBNAIL ERROR]:', thumbErr.message);
                }

                return await interaction.editReply(construirLista(items, miniaturas));
            }
        } catch (error) {
            console.error('[ERROR EN NAVEGACIÓN]:', error);
            throw error;
        }
    }
};