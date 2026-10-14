const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Responde con la latencia del bot.'),
    async execute(interaction) {
        await interaction.reply({ content: 'Calculando latencia...' });
        const sent = await interaction.fetchReply();
        
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        
        await interaction.editReply({
            content: '',
            flags: MessageFlags.IsComponentsV2,
            components: [
                {
                    type: 17, // Container
                    accent_color: 0x5865F2,
                    components: [
                        {
                            type: 10, // TextDisplay
                            content: `🏓 **Pong!**\n\n> ⚡ **Latencia del mensaje:** \`${latency}ms\`\n> 🌐 **WebSocket API:** \`${interaction.client.ws.ping}ms\``
                        }
                    ]
                }
            ]
        });
    },
};
