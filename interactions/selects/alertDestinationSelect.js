// ==========================================
// ARCHIVO: interactions/selects/alertDestinationSelect.js
// ==========================================

const {
    ContainerBuilder,
    TextDisplayBuilder,
    ChannelSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags
} = require('discord.js');
const supabase = require('../../db');
const { renderizarPanelConfig } = require('../buttons/manageActions');
const { COLORES, footer, separador, boton } = require('../../utils/ui');

module.exports = {
    customIdPrefix: 'select_alert_destination',

    async execute(interaction) {
        // Caso A: el usuario seleccionó un canal desde el ChannelSelectMenu nativo
        if (interaction.customId.startsWith('select_alert_destination_channel:')) {
            await interaction.deferUpdate();
            const dbId = interaction.customId.split(':')[1];
            const channelId = interaction.values[0];

            const canal = await interaction.client.channels.fetch(channelId).catch(() => null);
            if (!canal || !canal.isTextBased() || !canal.guild) {
                return await interaction.followUp({
                    content: '❌ No se pudo acceder a ese canal de texto.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const guild = canal.guild;
            const member = await guild.members.fetch(interaction.user.id).catch(() => null);
            const tienePermisos = guild.ownerId === interaction.user.id ||
                member?.permissions.has(PermissionFlagsBits.Administrator) ||
                member?.permissions.has(PermissionFlagsBits.ManageChannels);

            if (!tienePermisos) {
                return await interaction.followUp({
                    content: `❌ Necesitás permisos de **Administrador** o **Gestionar Canales** en **${guild.name}** para enviar alertas a <#${canal.id}>.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const botPerms = canal.permissionsFor(guild.members.me);
            if (!botPerms?.has(PermissionFlagsBits.ViewChannel) || !botPerms?.has(PermissionFlagsBits.SendMessages)) {
                return await interaction.followUp({
                    content: `❌ Kortex no tiene permisos de **Ver Canal** y **Enviar Mensajes** en <#${canal.id}>.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const { error } = await supabase
                .from('roblox_wishlist')
                .update({ channel_id: canal.id, webhook_url: null })
                .eq('id', dbId)
                .eq('user_id', interaction.user.id);

            if (error) {
                return await interaction.followUp({
                    content: `❌ Error al guardar el canal: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const { data: itemActualizado } = await supabase
                .from('roblox_wishlist')
                .select('*')
                .eq('id', dbId)
                .eq('user_id', interaction.user.id)
                .maybeSingle();

            if (itemActualizado) {
                await interaction.editReply(await renderizarPanelConfig(itemActualizado));
                await interaction.followUp({
                    content: `📢 **Canal vinculado con éxito:** Las alertas de **${itemActualizado.item_name}** se enviarán en <#${canal.id}>.`,
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        }

        // Caso B: el usuario eligió el tipo de destino (DM, Canal o Webhook)
        const dbId = interaction.customId.split(':')[1];
        const opcion = interaction.values[0];

        // 1. Opción Webhook -> Abre Modal de texto
        if (opcion === 'dest_webhook') {
            const modal = new ModalBuilder()
                .setCustomId(`modal_webhook_submit:${dbId}`)
                .setTitle('Configurar Webhook de Alertas');

            const inputWebhook = new TextInputBuilder()
                .setCustomId('input_webhook_url')
                .setLabel('URL del Webhook de Discord')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('https://discord.com/api/webhooks/...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputWebhook));
            return await interaction.showModal(modal);
        }

        // 2. Opción Canal de Servidor -> Selector nativo si está en un servidor, o Modal por ID
        if (opcion === 'dest_channel') {
            if (interaction.inGuild()) {
                await interaction.deferUpdate();

                const selectorCanal = new ChannelSelectMenuBuilder()
                    .setCustomId(`select_alert_destination_channel:${dbId}`)
                    .setPlaceholder('📢 Elegí un canal de texto de este servidor...')
                    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

                const container = new ContainerBuilder()
                    .setAccentColor(COLORES.lista)
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `### 📢 Seleccioná el canal de alertas\n` +
                            `Elegí directamente un canal de este servidor en el menú desplegable, o tocá **Ingresar ID manual** si el canal está en otro servidor.`
                        )
                    )
                    .addSeparatorComponents(separador())
                    .addActionRowComponents(new ActionRowBuilder().addComponents(selectorCanal))
                    .addActionRowComponents(
                        new ActionRowBuilder().addComponents(
                            boton(`btn_action_open_channel_modal:${dbId}`, 'Ingresar ID manual', '🔢', ButtonStyle.Secondary),
                            boton(`btn_action_open_config:${dbId}`, 'Volver al objeto', '⬅️', ButtonStyle.Secondary)
                        )
                    )
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(footer('Requiere permiso de Gestionar Canales o Administrador'))
                    );

                return await interaction.editReply({
                    components: [container],
                    flags: MessageFlags.IsComponentsV2
                });
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_channel_submit:${dbId}`)
                .setTitle('Vincular Canal por ID');

            const inputChannel = new TextInputBuilder()
                .setCustomId('input_channel_id')
                .setLabel('ID del Canal de Discord')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ejemplo: 123456789012345678')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(inputChannel));
            return await interaction.showModal(modal);
        }

        await interaction.deferUpdate();

        // 3. Opción Mensaje Directo (DM)
        if (opcion === 'dest_dm') {
            await supabase
                .from('roblox_wishlist')
                .update({ channel_id: null, webhook_url: null })
                .eq('id', dbId)
                .eq('user_id', interaction.user.id);
        }

        // Re-renderizar panel actualizado
        const { data: itemActualizado } = await supabase
            .from('roblox_wishlist')
            .select('*')
            .eq('id', dbId)
            .eq('user_id', interaction.user.id)
            .maybeSingle();

        if (itemActualizado) {
            const panelData = await renderizarPanelConfig(itemActualizado);
            await interaction.editReply(panelData);

            if (opcion === 'dest_dm') {
                await interaction.followUp({
                    content: `💬 **Mensaje Directo configurado:** Las alertas para **${itemActualizado.item_name}** te llegarán por privado.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }
    }
};
