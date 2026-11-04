// ==========================================
// ARCHIVO: interactions/modals/calcSubmit.js
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    MessageFlags
} = require('discord.js');
const {
    estadoTierCalculadoraUsuario,
    obtenerTierCalculadora,
    obtenerSeleccion,
    construirOpcionesMenuTiers,
    calcularEmbedResultado,
    EMOJI_ROBUX
} = require('../calcHelpers');
const { COLORES, separador, boton } = require('../../utils/ui');

module.exports = {
    customIdPrefix: 'modal_calc_limpio_submit',

    async execute(interaction) {
        const uid = String(interaction.user.id);
        const seleccionadas = obtenerSeleccion(uid);
        const activeTier = obtenerTierCalculadora(uid);
        const rawPrice = interaction.fields.getTextInputValue('input_price').trim().replace(/[.,\s]/g, '');
        const basePrice = parseInt(rawPrice, 10);

        if (isNaN(basePrice) || basePrice <= 0) {
            return await interaction.reply({
                content: '⚠️ Ingresá un precio válido en Robux (solo números, por ejemplo `250`).',
                flags: MessageFlags.Ephemeral
            });
        }

        // Si el usuario activó manualmente "Precio Regional" pero aún no había elegido un Tier distinto de 100% en la calculadora ni en /config
        if (seleccionadas.includes('roblox_regional') && activeTier === 'TIER_100' && !estadoTierCalculadoraUsuario.has(uid)) {
            const selectRegion = new StringSelectMenuBuilder()
                .setCustomId(`select_calc_region:${basePrice}`)
                .setPlaceholder('🌎 Elegí el Tier de Región de Precios (100% / 80% / 60% / 40%)...')
                .addOptions(construirOpcionesMenuTiers(activeTier));

            const containerRegion = new ContainerBuilder()
                .setAccentColor(COLORES.calc)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '## 🌎 Elegí tu Tier de Región de Precios\n' +
                        `🏷️ Precio base: **\`${basePrice.toLocaleString('es-AR')} R$\`** ${EMOJI_ROBUX}`
                    )
                )
                .addSeparatorComponents(separador())
                .addActionRowComponents(new ActionRowBuilder().addComponents(selectRegion))
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        boton('btn_quick_calc', 'Volver Atrás', '⬅️')
                    )
                );

            await interaction.deferUpdate();
            return await interaction.editReply({
                components: [containerRegion],
                files: [],
                attachments: [],
                flags: MessageFlags.IsComponentsV2
            });
        }

        await interaction.deferUpdate();
        const resData = await calcularEmbedResultado(basePrice, seleccionadas, activeTier, uid);
        return await interaction.editReply({
            components: resData.components,
            files: resData.files || [],
            attachments: [],
            flags: MessageFlags.IsComponentsV2
        });
    }
};