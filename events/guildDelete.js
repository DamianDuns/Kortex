const { Events } = require('discord.js');
const supabase = require('../db');

module.exports = {
    name: Events.GuildDelete,
    async execute(guild) {
        console.log(`Kortex fue removido del servidor: ${guild.name} (ID: ${guild.id})`);

        try {
            // Actualizamos la columna left_at con la fecha y hora actual
            const { error } = await supabase
                .from('guilds')
                .update({ left_at: new Date().toISOString() })
                .eq('guild_id', guild.id);

            if (error) {
                console.error('Error al actualizar la salida en Supabase:', error.message);
            } else {
                console.log(`Fecha de salida registrada para el servidor ${guild.name}.`);
            }
        } catch (err) {
            console.error('Error inesperado al conectar con la base de datos:', err);
        }
    },
};
