const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

const adminChannelId = process.env.ADMIN_CHANNEL_ID;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("fix-name")
        .setDescription(
            "Updates nicknames in Registration Sheet based on List Players Sheet (Admin Only).",
        ),

    async execute(interaction, appsScriptUrl) {
        console.log(
            `[DEBUG] ${new Date().toISOString()} - /fix-name command invoked by ${interaction.user.tag} in channel ${interaction.channelId}`,
        );

        if (!adminChannelId) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Replit Secret 'ADMIN_CHANNEL_ID' not set! Cannot perform channel check.`,
            );
            try {
                await interaction.reply({
                    content:
                        "Configuration Error: Admin channel ID is not set.",
                    ephemeral: true,
                });
            } catch (replyError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send config error message:`,
                    replyError,
                );
            }
            return;
        }
        if (interaction.channelId !== adminChannelId) {
            console.log(
                `[WARN] ${new Date().toISOString()} - /fix-name blocked for user ${interaction.user.tag} in channel ${interaction.channelId}. Not the admin channel.`,
            );
            try {
                await interaction.reply({
                    content:
                        "This command can only be used in the designated admin channel.",
                    ephemeral: true,
                });
            } catch (replyError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send unauthorized channel message:`,
                    replyError,
                );
            }
            return;
        }
        console.log(
            `[DEBUG] ${new Date().toISOString()} - Channel check passed for /fix-name in channel ${interaction.channelId}.`,
        );

        try {
            await interaction.deferReply({ ephemeral: false });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Interaction deferred for /fix-name.`,
            );
            await interaction.editReply({
                content: "⏳ Synchronizing nicknames... Please wait.",
                embeds: [],
            });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Sent initial processing message for /fix-name.`,
            );
        } catch (deferOrEditError) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Failed to defer or edit initial reply for /fix-name:`,
                deferOrEditError,
            );
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({
                        content:
                            "Failed to start the nickname synchronization process.",
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content:
                            "Failed to start the nickname synchronization process.",
                        ephemeral: true,
                    });
                }
            } catch (followUpError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send error message after defer/edit failure:`,
                    followUpError,
                );
            }
            return;
        }

        const payload = {
            command: "fix_registration_names",
            data: {},
        };

        try {
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Sending request to Apps Script URL for fix_registration_names: ${appsScriptUrl}`,
            );
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            console.log(
                `[DEBUG] ${new Date().toISOString()} - Received response status from GAS: ${response.status}`,
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Apps Script returned error ${response.status}: ${errorText.substring(0, 500)}`,
                );
                throw new Error(
                    `Google Apps Script returned an error (${response.status}).`,
                );
            }

            const result = await response.json();
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Parsed response from GAS (fix_registration_names): status=${result.status}`,
            );

            const resultEmbed = new EmbedBuilder()
                .setTitle("Nickname Synchronization Report")
                .setDescription(result.message || "Process finished.")
                .setColor(result.status === "success" ? "#00FF00" : "#FF0000")
                .setTimestamp();

            if (result.status === "success" && result.details) {
                resultEmbed.addFields(
                    {
                        name: "Nicknames Updated",
                        value: (result.details.updatedCount || 0).toString(),
                        inline: true,
                    },
                    {
                        name: "Nicknames Cleared (ID not found)",
                        value: (result.details.clearedCount || 0).toString(),
                        inline: true,
                    },
                    {
                        name: "IDs Not Found in List",
                        value: (result.details.notFoundCount || 0).toString(),
                        inline: true,
                    },
                );
            } else if (result.status !== "success") {
                resultEmbed.addFields({
                    name: "Error",
                    value: result.message || "An unknown error occurred.",
                });
            }

            await interaction.editReply({
                content: null,
                embeds: [resultEmbed],
            });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Sent final report embed for /fix-name.`,
            );
        } catch (error) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Error during /fix-name execution:`,
                error,
            );
            try {
                await interaction.editReply({
                    content: `An error occurred while fixing nicknames: ${error.message}`,
                    embeds: [],
                });
            } catch (editError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send error message via editReply in catch block:`,
                    editError,
                );
            }
        }
    },
};
