// ==========================================
// ARCHIVO: interactions/modals/calcSubmit.js
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder,
    MessageFlags
} = require('discord.js');
const { obtenerSeleccion, calcularEmbedResultado } = require('../calcHelpers');
const { COLORES, separador } = require('../../utils/ui');

module.exports = {
    customIdPrefix: 'modal_calc_limpio_submit',

    async execute(interaction) {
        const seleccionadas = obtenerSeleccion(interaction.user.id);
        const rawPrice = interaction.fields.getTextInputValue('input_price').trim().replace(/[.,\s]/g, '');
        const basePrice = parseInt(rawPrice, 10);

        if (isNaN(basePrice) || basePrice <= 0) {
            return await interaction.reply({
                content: '⚠️ Ingresá un precio válido en Robux (solo números, por ejemplo `250`).',
                flags: MessageFlags.Ephemeral
            });
        }

        if (seleccionadas.includes('roblox_regional')) {
            const selectRegion = new StringSelectMenuBuilder()
                .setCustomId(`select_calc_region:${basePrice}`)
                .setPlaceholder('🌎 Elegí la región o país...')
                .addOptions([
                    new StringSelectMenuOptionBuilder().setLabel('Tier 100% — EE.UU., España, Global').setDescription('Sin descuento regional').setValue('TIER_100').setEmoji('🌐'),
                    new StringSelectMenuOptionBuilder().setLabel('Tier 80% — México, Chile, Uruguay').setDescription('20% de descuento').setValue('TIER_80').setEmoji('🇲🇽'),
                    new StringSelectMenuOptionBuilder().setLabel('Tier 60% — Argentina, Brasil, Colombia').setDescription('40% de descuento').setValue('TIER_60').setEmoji('🇦🇷'),
                    new StringSelectMenuOptionBuilder().setLabel('Tier 40% — Venezuela, Bolivia, Paraguay').setDescription('60% de descuento').setValue('TIER_40').setEmoji('🇻🇪')
                ]);

            const containerRegion = new ContainerBuilder()
                .setAccentColor(COLORES.calc)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '## 🌎 Elegí tu región\n' +
                        `Precio base: **${basePrice.toLocaleString('es-AR')} R$**`
                    )
                )
                .addSeparatorComponents(separador())
                .addActionRowComponents(new ActionRowBuilder().addComponents(selectRegion));

            return await interaction.reply({
                components: [containerRegion],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
            });
        }

        const resData = calcularEmbedResultado(basePrice, seleccionadas);
        return await interaction.reply({
            components: resData.components,
            flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
        });
    }
};