const {
    estadoCalculadoraUsuario,
    estadoTierCalculadoraUsuario,
    obtenerSeleccion,
    construirPanelCalculadoraLimpio,
    calcularEmbedResultado
} = require('../calcHelpers');

module.exports = {
    customIdPrefix: 'select_calc_',

    async execute(interaction) {
        const uid = String(interaction.user.id);

        if (interaction.customId === 'select_calc_multiselect') {
            let seleccionadas = interaction.values;

            if (seleccionadas.includes('plus_10') && seleccionadas.includes('plus_20')) {
                seleccionadas = seleccionadas.filter(opt => opt !== 'plus_10');
            }

            estadoCalculadoraUsuario.set(uid, seleccionadas);
            const panelActualizado = construirPanelCalculadoraLimpio(seleccionadas, uid);
            return await interaction.update(panelActualizado);
        }

        if (interaction.customId === 'select_calc_tier_preset') {
            const tierKey = interaction.values[0] || 'TIER_100';
            estadoTierCalculadoraUsuario.set(uid, tierKey);

            let seleccionadas = [...obtenerSeleccion(uid)];
            if (tierKey !== 'TIER_100' && !seleccionadas.includes('roblox_regional')) {
                seleccionadas.push('roblox_regional');
            } else if (tierKey === 'TIER_100') {
                seleccionadas = seleccionadas.filter(opt => opt !== 'roblox_regional');
            }
            estadoCalculadoraUsuario.set(uid, seleccionadas);

            const panelActualizado = construirPanelCalculadoraLimpio(seleccionadas, uid);
            return await interaction.update(panelActualizado);
        }

        if (interaction.customId.startsWith('select_calc_region:')) {
            const basePrice = parseInt(interaction.customId.split(':')[1], 10);
            const tierKey = interaction.values[0] || 'TIER_100';
            estadoTierCalculadoraUsuario.set(uid, tierKey);

            let seleccionadas = [...obtenerSeleccion(uid)];
            if (tierKey !== 'TIER_100' && !seleccionadas.includes('roblox_regional')) {
                seleccionadas.push('roblox_regional');
            }
            estadoCalculadoraUsuario.set(uid, seleccionadas);

            await interaction.deferUpdate();
            const resultado = await calcularEmbedResultado(basePrice, seleccionadas, tierKey, uid);
            return await interaction.editReply(resultado);
        }
    }
};