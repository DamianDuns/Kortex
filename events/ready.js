// ==========================================
// ARCHIVO: events/ready.js
// ==========================================

const { Events } = require('discord.js');
const supabase = require('../db');
const { iniciarMonitoreo } = require('../services/priceTracker');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        const currentGuilds = client.guilds.cache.map(guild => ({
            guild_id: guild.id,
            name: guild.name,
            joined_at: new Date().toISOString()
        }));

        let guildsSyncOk = true;

        if (currentGuilds.length > 0) {
            try {
                const { error } = await supabase
                    .from('guilds')
                    .upsert(currentGuilds, { onConflict: 'guild_id' });

                if (error) {
                    guildsSyncOk = false;
                    logger.error('SUPABASE SYNC', error.message);
                }
            } catch (err) {
                guildsSyncOk = false;
                logger.error('SUPABASE FATAL', err);
            }
        }

        const intervaloMinutos = Number(process.env.PRICE_CHECK_INTERVAL_MINUTES) > 0
            ? Number(process.env.PRICE_CHECK_INTERVAL_MINUTES)
            : 5;

        logger.imprimirPanelOnline({
            client,
            guildsSyncOk,
            guildsCount: currentGuilds.length,
            intervaloMinutos
        });

        // Iniciar servicio de monitoreo de precios en segundo plano
        iniciarMonitoreo(client, intervaloMinutos);
    },
};
