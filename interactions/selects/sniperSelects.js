// ==========================================
// ARCHIVO: interactions/selects/sniperSelects.js
// ==========================================

const { MessageFlags } = require('discord.js');
const supabase = require('../../db');
const { renderizarVistaGrafica } = require('../buttons/chartView');

module.exports = {
    customIdPrefix: 'select_manage_item',

    async execute(interaction) {
        await interaction.deferUpdate();
        const selectedDbId = interaction.values[0];

        const { data: itemsUsuario, error } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('user_id', interaction.user.id)
            .order('id', { ascending: true });

        const item = (itemsUsuario || []).find(i => String(i.id) === String(selectedDbId));

        if (error || !item) {
            return await interaction.followUp({
                content: '❌ No se encontró el objeto seleccionado.',
                flags: MessageFlags.Ephemeral
            });
        }

        const panelData = await renderizarVistaGrafica(item, itemsUsuario, '7d');
        return await interaction.editReply(panelData);
    }
};
