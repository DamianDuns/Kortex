// ==========================================
// ARCHIVO: events/guildDelete.js
// Registro limpio de baja cuando Kortex es removido de un servidor
// ==========================================

const { Events } = require('discord.js');
const supabase = require('../db');
const logger = require('../utils/logger');

module.exports = {
    name: Events.GuildDelete,
    async execute(guild) {
        if (!guild || !guild.id) return;
        const guildName = guild.name || guild.id;
        logger.info('GUILD LEAVE', `Kortex fue removido del servidor: ${guildName} (ID: ${guild.id})`);

        try {
            const { error } = await supabase
                .from('guilds')
                .delete()
                .eq('guild_id', String(guild.id));

            if (error) {
                await supabase
                    .memoryFrom('guilds')
                    .delete()
                    .eq('guild_id', String(guild.id));
                logger.warn('GUILD LEAVE', `Baja procesada en memoria local para ${guildName}`);
            } else {
                logger.success('GUILD LEAVE', `Servidor ${guildName} removido del registro activo.`);
            }
        } catch (err) {
            await supabase
                .memoryFrom('guilds')
                .delete()
                .eq('guild_id', String(guild.id));
            logger.warn('GUILD LEAVE', `Respaldo local aplicado al salir de ${guildName}: ${err.message}`);
        }
    }
};
