// ==========================================
// ARCHIVO: interactions/buttons/navigation.js
// ==========================================

const {
    ContainerBuilder, SectionBuilder, TextDisplayBuilder,
    ActionRowBuilder, ButtonStyle,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags
} = require('discord.js');
const supabase = require('../../db');
const { obtenerMiniaturasBatch } = require('../../utils/roblox');
const {
    COLORES, EMOJI_TIPO, NOMBRE_TIPO,
    footer, separador, boton, formatearPrecio, formatearPrecioTexto
} = require('../../utils/ui');

const MAX_WISHLIST_ITEMS = 5;

// ==========================================
// HUB PRINCIPAL (/roblox y @Kortex)
// ==========================================
// eslint-disable-next-line no-unused-vars
function construirMenuPrincipal(userId) {
    const container = new ContainerBuilder().setAccentColor(COLORES.primario);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '# ⚡ Roblox Toolkit\n' +
        'Elegí una categoría para empezar:'
    ));

    container.addSeparatorComponents(separador(true));

    // Categoría 1: Price Sniper (incluye añadir objetos + Mi Lista y gráficas)
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                '### 🎯 Price Sniper\n' +
                `Monitoreá Catálogo, Limiteds, Gamepasses y Plugins, consultá **Mi Lista** (máx. ${MAX_WISHLIST_ITEMS}) y mirá gráficas de precios.`
            ))
            .setButtonAccessory(boton('btn_quick_sniper', 'Abrir', '🎯', ButtonStyle.Primary))
    );

    container.addSeparatorComponents(separador());

    // Categoría 2: Calculadoras
    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                '### 🧮 Calculadoras\n' +
                'Cashback de grupo (40%), Roblox Plus (10% / 20%) y precios regionales.'
            ))
            .setButtonAccessory(boton('btn_quick_calc', 'Abrir', '🧮'))
    );

    container.addSeparatorComponents(separador());
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        footer('¿Primera vez? Usá /help para ver la guía de herramientas')
    ));

    return {
        components: [container],
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
            boton('btn_nav_main_menu', 'Volver', '⬅️')
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
            `🪙 **Precio:** ${fmtActual}  •  🎯 **Meta:** ${fmtMeta}\n` +
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
        boton('btn_nav_sniper', 'Volver', '⬅️')
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(botonesNav));

    return { components: [container], files: [], attachments: [], flags: MessageFlags.IsComponentsV2 };
}

module.exports = {
    customIdPrefix: 'btn_nav_',
    construirMenuPrincipal,
    construirMenuSniper,
    construirLista,
    construirListaVacia,

    async execute(interaction) {
        try {
            const action = interaction.customId.replace('btn_nav_', '');

            if (action === 'main_menu') {
                await interaction.deferUpdate();
                return await interaction.editReply({
                    ...construirMenuPrincipal(interaction.user.id),
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