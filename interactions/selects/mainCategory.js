// ==========================================
// ARCHIVO: interactions/selects/mainCategory.js
// ==========================================

const { 
    ContainerBuilder, 
    TextDisplayBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    MessageFlags 
} = require('discord.js');
const { construirMenuSniper } = require('../buttons/navigation');

module.exports = {
    customIdPrefix: 'select_main_category',

    async execute(interaction) {
        const [, ownerId] = interaction.customId.split(':');

        if (ownerId && interaction.user.id !== ownerId) {
            return await interaction.reply({
                content: '❌ Solo la persona que invocó este comando puede interactuar con el menú.',
                flags: MessageFlags.Ephemeral
            });
        }

        const opcion = interaction.values[0];

        if (opcion === 'cat_sniper') {
            await interaction.deferUpdate();
            const panelSniper = construirMenuSniper();
            return await interaction.editReply(panelSniper);
        }

        if (opcion === 'cat_calculators') {
            await interaction.deferUpdate();

            const textoCalc = new TextDisplayBuilder().setContent(
                '## 🧮 Calculadoras de Economía de Roblox\n\n' +
                'Elegí la herramienta que querés utilizar para simular impuestos, comisiones y conversiones:'
            );

            const selectCalc = new StringSelectMenuBuilder()
                .setCustomId('select_calc_type')
                .setPlaceholder('Seleccioná una calculadora...')
                .addOptions([
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Tax de Roblox (30%)')
                        .setDescription('Calculá cuánto Robux recibís o debés cobrar tras el 30% de comisión')
                        .setValue('calc_tax')
                        .setEmoji('💸'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Cashback de Grupo (40%)')
                        .setDescription('Calculá el retorno de Robux al comprar desde tu grupo')
                        .setValue('calc_cashback')
                        .setEmoji('👑'),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('DevEx / Estimador USD')
                        .setDescription('Convertí Robux a Dólares con la tasa oficial de DevEx')
                        .setValue('calc_devex')
                        .setEmoji('💵')
                ]);

            const rowSelect = new ActionRowBuilder().addComponents(selectCalc);
            const rowButtons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('btn_nav_main_menu')
                    .setLabel('Menú Principal')
                    .setEmoji('⬅️')
                    .setStyle(ButtonStyle.Secondary)
            );

            const containerCalc = new ContainerBuilder()
                .addTextDisplayComponents(textoCalc)
                .addActionRowComponents(rowButtons);

            return await interaction.editReply({
                components: [containerCalc, rowSelect],
                flags: MessageFlags.IsComponentsV2
            });
        }
    }
};
