const { Events, ContainerBuilder, SectionBuilder, TextDisplayBuilder, MessageFlags, ChannelType, PermissionFlagsBits } = require('discord.js');
const supabase = require('../db');

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        console.log(`Kortex fue añadido al servidor: ${guild.name} (ID: ${guild.id})`);

        try {
            const { error } = await supabase
                .from('guilds')
                .upsert([{ guild_id: guild.id, name: guild.name, joined_at: new Date().toISOString(), left_at: null }], { onConflict: 'guild_id' });

            if (error) {
                console.error('Error al registrar el servidor en Supabase:', error.message);
            } else {
                console.log(`Servidor ${guild.name} guardado en la base de datos.`);
            }
        } catch (err) {
            console.error('Error inesperado al conectar con Supabase:', err);
        }

        let targetChannel = guild.systemChannel;

        if (!targetChannel || !targetChannel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)) {
            targetChannel = guild.channels.cache.find(channel =>
                channel.type === ChannelType.GuildText &&
                channel.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages)
            );
        }

        if (!targetChannel) {
            console.log(`No se encontraron canales con permisos para enviar el cartel de bienvenida en ${guild.name}.`);
            return;
        }

        const textoBienvenida = new TextDisplayBuilder().setContent(
            `## ¡Gracias por sumar a Kortex a ${guild.name}!\n\n` +
            'Hola, soy Kortex. Estoy listo para ayudarte a gestionar y añadir funciones interactivas a tu comunidad.\n\n' +
            '🚀 **Comenzar**\n' +
            'Probá ejecutar el comando `/ping` en cualquier canal para comprobar mi latencia y conexión.\n\n' +
            '⚙️ **Configuración**\n' +
            'Toda la información del servidor ya se encuentra sincronizada correctamente en la base de datos.\n\n' +
            '-# Kortex Bot • Sistema de bienvenida'
        );

        const section = new SectionBuilder()
            .addTextDisplayComponents(textoBienvenida)
            .setThumbnailAccessory(thumb => thumb.setURL(guild.client.user.displayAvatarURL()));

        const container = new ContainerBuilder().addSectionComponents(section);

        try {
            await targetChannel.send({ 
                embeds: [], 
                components: [container], 
                flags: MessageFlags.IsComponentsV2 
            });
            console.log(`Mensaje de bienvenida enviado correctamente en el canal #${targetChannel.name}.`);
        } catch (error) {
            console.error(`Error al enviar el cartel de bienvenida en ${guild.name}:`, error);
        }
    },
};