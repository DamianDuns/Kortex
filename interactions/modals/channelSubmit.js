// ==========================================
// ARCHIVO: interactions/modals/channelSubmit.js
// ==========================================

const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const supabase = require('../../db');
const { renderizarPanelConfig } = require('../buttons/manageActions');

module.exports = {
    customIdPrefix: 'modal_channel_submit:',

    async execute(interaction) {
        await interaction.deferUpdate();
        const dbId = interaction.customId.split(':')[1];
        const rawChannelId = interaction.fields.getTextInputValue('input_channel_id').trim();

        // 1. Verificación de existencia del canal y tipo
        const canal = await interaction.client.channels.fetch(rawChannelId).catch(() => null);

        if (!canal || !canal.isTextBased() || !canal.guild) {
            return await interaction.followUp({ 
                content: '❌ No se encontró un canal de texto válido en ningún servidor disponible con esa ID.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const guild = canal.guild;

        // 2. Verificación de membresía del usuario en ese servidor
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);

        if (!member) {
            return await interaction.followUp({ 
                content: `❌ No pertenecés al servidor **${guild.name}** donde se encuentra el canal especificado.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        // 3. Verificación de permisos de administración / gestión del usuario
        const tienePermisos = guild.ownerId === interaction.user.id ||
                             member.permissions.has(PermissionFlagsBits.Administrator) ||
                             member.permissions.has(PermissionFlagsBits.ManageChannels);

        if (!tienePermisos) {
            return await interaction.followUp({ 
                content: `❌ No tenés permisos suficientes (**Administrador**, **Gestionar Canales** o **Propietario del Servidor**) en **${guild.name}** para vincular alertas a sus canales.`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        // 4. Verificación de permisos del bot en el canal de destino
        const me = guild.members.me;
        const botPerms = canal.permissionsFor(me);

        if (!botPerms?.has(PermissionFlagsBits.ViewChannel) || !botPerms?.has(PermissionFlagsBits.SendMessages)) {
            return await interaction.followUp({ 
                content: `❌ Kortex no tiene permisos de **Ver Canal** y **Enviar Mensajes** en <#${canal.id}> (${guild.name}).`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        // 5. Actualización en Supabase
        const { error } = await supabase
            .from('roblox_wishlist')
            .update({ channel_id: canal.id, webhook_url: null })
            .eq('id', dbId)
            .eq('user_id', interaction.user.id);

        if (error) {
            return await interaction.followUp({ 
                content: `Error al actualizar el canal en la base de datos: ${error.message}`, 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Re-renderizar panel de configuración actualizado
        const { data: itemActualizado } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('id', dbId)
            .eq('user_id', interaction.user.id)
            .maybeSingle();

        if (itemActualizado) {
            const panelData = await renderizarPanelConfig(itemActualizado);
            await interaction.editReply(panelData);

            return await interaction.followUp({ 
                content: `📢 **Canal vinculado con éxito:** Las alertas para **${itemActualizado.item_name}** se enviarán en <#${canal.id}> del servidor **${guild.name}**.`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};
