// ==========================================
// ARCHIVO: events/ready.js
// ==========================================

const { Events } = require('discord.js');
const supabase = require('../db');
const { iniciarMonitoreo } = require('../services/priceTracker');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`🤖 Kortex está en línea. Sesión iniciada como ${client.user.tag}`);

        // Obtenemos la lista de todos los servidores donde actualmente está el bot
        const currentGuilds = client.guilds.cache.map(guild => ({
            guild_id: guild.id,
            name: guild.name,
            joined_at: new Date().toISOString()
        }));

        if (currentGuilds.length > 0) {
            try {
                // Guardamos o actualizamos los servidores en la tabla 'guilds' de Supabase
                const { error } = await supabase
                    .from('guilds')
                    .upsert(currentGuilds, { onConflict: 'guild_id' });

                if (error) {
                    console.error('[DB ERROR] Sincronización inicial:', error.message);
                } else {
                    console.log(`[DB ÉXITO] Sincronización completada: ${currentGuilds.length} servidor(es) registrado(s).`);
                }
            } catch (err) {
                console.error('[DB FATAL] Error inesperado durante la conexión con Supabase:', err);
            }
        }

        // Iniciar servicio de monitoreo de precios en segundo plano cada 5 minutos
        iniciarMonitoreo(client, 5);
    },
};
