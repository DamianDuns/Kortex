// ==========================================
// ARCHIVO: interactions/buttons/navigation.js
// ==========================================

const { 
    ContainerBuilder, SectionBuilder, TextDisplayBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, 
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder, MessageFlags 
} = require('discord.js');
const supabase = require('../../db');
const { obtenerMiniaturasBatch } = require('../../utils/roblox');

function construirMenuPrincipal(userId) {
    const container = new ContainerBuilder();

    // Título de acción directa
    const header = new TextDisplayBuilder().setContent(
        '# ⚡ ROBLOX TOOLKIT\n' +
        'Seleccioná una herramienta o usá los accesos rápidos:'
    );
    container.addTextDisplayComponents(header);
    container.addSeparatorComponents(sep => sep.setDivider(true));

    // Botones de acción rápida: Ver lista directa o ir a calculadoras
    const rowButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_nav_wishlist')
            .setLabel('Mi Lista de Monitoreo')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_quick_sniper')
            .setLabel('Añadir Objeto')
            .setEmoji('🎯')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_quick_calc')
            .setLabel('Calculadoras')
            .setEmoji('🧮')
            .setStyle(ButtonStyle.Secondary)
    );
    container.addActionRowComponents(rowButtons);

    // Selector de herramientas principales
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`select_main_category:${userId}`)
        .setPlaceholder('🛠️ Elegí una herramienta para ejecutar...')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Price Sniper (Añadir o Gestionar)')
                .setDescription('Monitorear precios de Catálogo, Gamepasses, Plugins y Limiteds')
                .setValue('cat_sniper')
                .setEmoji('🎯'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Calculadoras de Economía')
                .setDescription('Cashback 40%, Roblox Plus y Precios Regionales')
                .setValue('cat_calculators')
                .setEmoji('🧮')
        ]);

    const rowSelect = new ActionRowBuilder().addComponents(selectMenu);

    return {
        components: [container, rowSelect],
        flags: MessageFlags.IsComponentsV2
    };
}

function construirMenuSniper() {
    const container = new ContainerBuilder();

    const header = new TextDisplayBuilder().setContent(
        '## 🎯 Price Sniper // Selección de Categoría\n' +
        'Elegí qué tipo de artículo deseás empezar a monitorear:'
    );
    container.addTextDisplayComponents(header);
    container.addSeparatorComponents(sep => sep.setDivider(true));

    const selectTipo = new StringSelectMenuBuilder()
        .setCustomId('select_sniper_type')
        .setPlaceholder('Elegí la categoría del objeto...')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Catálogo / UGC / Limiteds')
                .setDescription('Ropa, accesorios y coleccionables')
                .setValue('catalog')
                .setEmoji('👕'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Gamepass')
                .setDescription('Pases de experiencia en Robux')
                .setValue('gamepass')
                .setEmoji('🎫'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Plugin de Studio')
                .setDescription('Herramientas con precios en USD')
                .setValue('plugin')
                .setEmoji('🔌'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Acceso Pago (Paid Access)')
                .setDescription('Experiencias de entrada paga')
                .setValue('paid_access')
                .setEmoji('🎮')
        ]);

    const rowSelect = new ActionRowBuilder().addComponents(selectTipo);

    const rowNav = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_nav_wishlist')
            .setLabel('Mi Lista')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('btn_nav_main_menu')
            .setLabel('Volver')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
    );

    container.addActionRowComponents(rowNav);

    return {
        components: [container, rowSelect],
        flags: MessageFlags.IsComponentsV2
    };
}

module.exports = {
    customIdPrefix: 'btn_nav_',
    construirMenuPrincipal,
    construirMenuSniper,

    async execute(interaction) {
        try {
            const action = interaction.customId.replace('btn_nav_', '');

            if (action === 'main_menu') {
                await interaction.deferUpdate();
                const menu = construirMenuPrincipal(interaction.user.id);
                return await interaction.editReply(menu);
            }

            if (action === 'wishlist') {
                await interaction.deferUpdate();

                const { data: items, error: dbError } = await supabase
                    .from('roblox_wishlist')
                    .select('*')
                    .eq('user_id', interaction.user.id);

                if (dbError) {
                    return await interaction.followUp({
                        content: '❌ Error al consultar tu lista en la base de datos.',
                        flags: MessageFlags.Ephemeral
                    });
                }

                if (!items || items.length === 0) {
                    const containerVacio = new ContainerBuilder()
                        .addTextDisplayComponents(
                            new TextDisplayBuilder().setContent(
                                '## 📋 Tu Lista de Monitoreo\n' +
                                'Actualmente no tenés objetos en seguimiento.\n\n' +
                                'Presioná **Añadir Objeto** para comenzar a monitorear precios.'
                            )
                        )
                        .addSeparatorComponents(sep => sep.setDivider(true))
                        .addActionRowComponents(
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('btn_quick_sniper')
                                    .setLabel('Añadir Objeto')
                                    .setEmoji('🎯')
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId('btn_nav_main_menu')
                                    .setLabel('Menú Principal')
                                    .setEmoji('⬅️')
                                    .setStyle(ButtonStyle.Secondary)
                            )
                        );

                    return await interaction.editReply({
                        components: [containerVacio],
                        flags: MessageFlags.IsComponentsV2
                    });
                }

                let miniaturas = new Map();
                try {
                    miniaturas = await obtenerMiniaturasBatch(items);
                } catch (thumbErr) {
                    console.error('[WISHLIST THUMBNAIL ERROR]:', thumbErr.message);
                }

                const container = new ContainerBuilder();

                const headerText = new TextDisplayBuilder().setContent(
                    `## 📋 Tu Lista de Monitoreo (${items.length}/5)\n` +
                    `Seleccioná un artículo en el menú inferior para cambiar su meta, pausarlo o eliminarlo.`
                );
                container.addTextDisplayComponents(headerText);
                container.addSeparatorComponents(sep => sep.setDivider(true));

                const selectOptions = [];

                items.forEach((item, index) => {
                    const type = (item.item_type || 'catalog').toLowerCase();
                    const esUSD = type === 'plugin';
                    
                    const fmtActual = esUSD 
                        ? `$${Number(item.last_price || 0).toFixed(2)} USD` 
                        : `${Number(item.last_price || 0).toLocaleString('es-AR')} Robux`;

                    const fmtMeta = (item.target_price !== null && item.target_price !== undefined)
                        ? (esUSD ? `$${Number(item.target_price).toFixed(2)} USD` : `${Number(item.target_price).toLocaleString('es-AR')} Robux`)
                        : 'Sin meta';

                    const nombreObj = item.item_name || 'Objeto sin nombre';
                    const estadoMonitoreo = item.is_paused ? '⏸️ En pausa' : '⚡ Activo';

                    const itemDetailText = new TextDisplayBuilder().setContent(
                        `### ${index + 1}. ${nombreObj}\n\n` +
                        `• 🏷️ **Precio:** \`${fmtActual}\`\n` +
                        `• 🎯 **Meta:** \`${fmtMeta}\`\n` +
                        `• 👀 **Monitoreo:** ${estadoMonitoreo}\n` +
                        `• 🆔 **ID:** \`${item.id_objet}\``
                    );

                    const imgUrl = miniaturas.get(String(item.id_objet));

                    if (imgUrl) {
                        const section = new SectionBuilder()
                            .addTextDisplayComponents(itemDetailText)
                            .setThumbnailAccessory(thumb => thumb.setURL(imgUrl));
                        container.addSectionComponents(section);
                    } else {
                        container.addTextDisplayComponents(itemDetailText);
                    }

                    if (index < items.length - 1) {
                        container.addSeparatorComponents(sep => sep.setDivider(true));
                    }

                    selectOptions.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${index + 1}. ${nombreObj}`.substring(0, 25))
                            .setValue(String(item.id))
                            .setEmoji(item.is_paused ? '⏸️' : '⚡')
                    );
                });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_manage_item')
                    .setPlaceholder('⚙️ Elegí un artículo para gestionarlo...')
                    .addOptions(selectOptions);

                const rowSelect = new ActionRowBuilder().addComponents(selectMenu);
                const rowButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_nav_main_menu')
                        .setLabel('Menú Principal')
                        .setEmoji('⬅️')
                        .setStyle(ButtonStyle.Secondary)
                );

                container.addActionRowComponents(rowButtons);

                return await interaction.editReply({
                    components: [container, rowSelect],
                    flags: MessageFlags.IsComponentsV2
                });
            }
        } catch (error) {
            console.error('[ERROR EN NAVEGACIÓN]:', error);
        }
    }
};