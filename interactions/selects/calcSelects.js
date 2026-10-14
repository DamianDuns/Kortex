const { estadoCalculadoraUsuario, obtenerSeleccion, construirPanelCalculadoraLimpio, calcularEmbedResultado } = require('../calcHelpers');

module.exports = {
    customIdPrefix: 'select_calc_',

    async execute(interaction) {
        if (interaction.customId === 'select_calc_multiselect') {
            let seleccionadas = interaction.values;

            if (seleccionadas.includes('plus_10') && seleccionadas.includes('plus_20')) {
                seleccionadas = seleccionadas.filter(opt => opt !== 'plus_10');
            }

            estadoCalculadoraUsuario.set(interaction.user.id, seleccionadas);
            const panelActualizado = construirPanelCalculadoraLimpio(seleccionadas);
            return await interaction.update(panelActualizado);
        }

        if (interaction.customId.startsWith('select_calc_region:')) {
            const basePrice = parseInt(interaction.customId.split(':')[1], 10);
            const tierKey = interaction.values[0];
            const seleccionadas = obtenerSeleccion(interaction.user.id);

            const resultado = calcularEmbedResultado(basePrice, seleccionadas, tierKey);
            return await interaction.update(resultado);
        }
    }
};