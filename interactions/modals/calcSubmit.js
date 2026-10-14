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
const { estadoCalculadoraUsuario, calcularEmbedResultado } = require('../calcHelpers');

module.exports = {
    customIdPrefix: 'modal_calc_limpio_submit',

    async execute(interaction) {
        const seleccionadas = estadoCalculadoraUsuario.get(interaction.user.id) || [];
        const rawPrice = interaction.fields.getTextInputValue('input_price').trim();
        const basePrice = parseInt(rawPrice, 10);

        if (isNaN(basePrice) || basePrice <= 0) {
            return await interaction.reply({ content: 'Ingresá un precio numérico entero válido.', flags: MessageFlags.Ephemeral });
        }

        if (seleccionadas.includes('roblox_regional')) {
            const selectRegion = new StringSelectMenuBuilder()
                .setCustomId(`select_calc_region:${basePrice}`)
                .setPlaceholder('Elegí la región o país...')
                .addOptions([
                    new StringSelectMenuOptionBuilder().setLabel('Tier 60% (Argentina, Brasil, Colombia)').setValue('TIER_60').setEmoji('🇦🇷'),
                    new StringSelectMenuOptionBuilder().setLabel('Tier 40% (Venezuela, Bolivia, Paraguay)').setValue('TIER_40').setEmoji('🇻🇪'),
                    new StringSelectMenuOptionBuilder().setLabel('Tier 80% (México, Chile, Uruguay)').setValue('TIER_80').setEmoji('🇲🇽'),
                    new StringSelectMenuOptionBuilder().setLabel('Tier 100% (EE.UU., España, Global)').setValue('TIER_100').setEmoji('🌐')
                ]);

            const rowSelectRegion = new ActionRowBuilder().addComponents(selectRegion);

            const containerRegion = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        '## 🌎 Seleccioná la Región de Roblox\n' +
                        `Precio base ingresado: **${basePrice.toLocaleString()} Robux**\n\n` +
                        'Elegí el nivel de Precio Regional:'
                    )
                )
                .addActionRowComponents(rowSelectRegion);

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