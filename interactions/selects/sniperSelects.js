// ==========================================
// ARCHIVO: interactions/selects/sniperSelects.js
// ==========================================

const supabase = require('../../db');
const { renderizarPanelConfig } = require('../buttons/manageActions');

module.exports = {
    customIdPrefix: 'select_manage_item',

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const selectedDbId = interaction.values[0];

        const { data: item, error } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('id', selectedDbId)
            .eq('user_id', interaction.user.id)
            .maybeSingle();

        if (error || !item) {
            return await interaction.editReply({ content: '❌ No se encontró el objeto seleccionado.' });
        }

        const panelData = await renderizarPanelConfig(item);
        return await interaction.editReply(panelData);
    }
};
