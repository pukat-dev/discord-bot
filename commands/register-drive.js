const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

const adminChannelId = process.env.ADMIN_CHANNEL_ID;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("register-drive")
        .setDescription(
            "Bulk registers MAIN accounts from a Google Drive folder (Admin Only).",
        )
        .addStringOption((option) =>
            option
                .setName("folder_id")
                .setDescription(
                    "Google Drive Folder ID containing screenshots (set perms: Anyone with link -> Editor).",
                )
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("status")
                .setDescription(
                    "Status of ALL main accounts within the folder.",
                )
                .setRequired(true)
                .addChoices(
                    { name: "DKP 2921 Old Player", value: "Old Player" },
                    { name: "DKP Migrants", value: "Migrants" },
                ),
        ),

    async execute(interaction, appsScriptUrl) {
        console.log(
            `[DEBUG] ${new Date().toISOString()} - /register-drive command invoked by ${interaction.user.tag} in channel ${interaction.channelId}`,
        );

        if (!adminChannelId) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Replit Secret 'ADMIN_CHANNEL_ID' not set! Cannot perform channel check.`,
            );
            try {
                await interaction.reply({
                    content:
                        "Configuration Error: Admin channel ID is not set on the bot side. Please contact the bot manager.",
                    ephemeral: true,
                });
            } catch (replyError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send configuration error message:`,
                    replyError,
                );
            }
            return;
        }

        if (interaction.channelId !== adminChannelId) {
            console.log(
                `[WARN] ${new Date().toISOString()} - /register-drive blocked for user ${interaction.user.tag} in channel ${interaction.channelId}. Not the admin channel (${adminChannelId}).`,
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
            `[DEBUG] ${new Date().toISOString()} - Channel check passed for /register-drive in channel ${interaction.channelId}.`,
        );

        try {
            await interaction.deferReply({ ephemeral: false });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Interaction deferred for /register-drive.`,
            );
            await interaction.editReply({
                content:
                    "⏳ Processing request... This may take 1-5 minutes depending on the number of images. Please wait.",
                embeds: [],
            });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Sent initial processing message via editReply.`,
            );
        } catch (deferOrEditError) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Failed to defer or edit initial reply for /register-drive:`,
                deferOrEditError,
            );
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({
                        content:
                            "Failed to start the registration process. Please try again.",
                        ephemeral: true,
                    });
                } else {
                    await interaction.reply({
                        content:
                            "Failed to start the registration process. Please try again.",
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

        const folderId = interaction.options.getString("folder_id");
        const statusMain = interaction.options.getString("status");
        const discordUserId = interaction.user.id;
        const discordUsername = interaction.user.username;

        console.log(
            `[DEBUG] ${new Date().toISOString()} - Options received: folderId=${folderId}, status=${statusMain}, userId=${discordUserId}, username=${discordUsername}`,
        );

        const payload = {
            command: "register_from_drive",
            data: {
                discordUserId: discordUserId,
                discordUsername: discordUsername,
                folderId: folderId,
                statusMain: statusMain,
            },
        };

        try {
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Sending request to Apps Script URL: ${appsScriptUrl}`,
            );
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
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
                    `Google Apps Script returned an error (${response.status}). Check GAS logs for details.`,
                );
            }

            const result = await response.json();
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Parsed response from GAS:`,
                JSON.stringify(result).substring(0, 500),
            );

            const reportEmbed = new EmbedBuilder()
                .setTitle("Bulk Registration Report from Google Drive")
                .setDescription(result.message || "Processing complete.")
                .setColor(
                    result.status === "success"
                        ? "#00FF00"
                        : result.status === "partial"
                          ? "#FFA500"
                          : "#FF0000",
                )
                .addFields({ name: "Processed Folder ID", value: folderId })
                .addFields({
                    name: "Processed Account Status",
                    value: statusMain,
                })
                .setTimestamp();

            if (
                result.details &&
                result.details.failedFiles &&
                result.details.failedFiles.length > 0
            ) {
                const maxFailuresToShow = 10;
                let failureList = result.details.failedFiles
                    .slice(0, maxFailuresToShow)
                    .map((fail) => `• **${fail.fileName}**: ${fail.reason}`)
                    .join("\n");

                if (result.details.failedFiles.length > maxFailuresToShow) {
                    failureList += `\n*...and ${result.details.failedFiles.length - maxFailuresToShow} more.*`;
                }

                reportEmbed.addFields({
                    name: "⚠️ Failure Details",
                    value: failureList,
                });
            } else if (
                result.status !== "success" &&
                (!result.details ||
                    !result.details.failedFiles ||
                    result.details.failedFiles.length === 0)
            ) {
                reportEmbed.addFields({
                    name: "⚠️ Note",
                    value: "An issue occurred during processing. Check GAS logs for more details.",
                });
            }

            await interaction.editReply({
                content: null,
                embeds: [reportEmbed],
            });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Sent final report embed for /register-drive.`,
            );
        } catch (error) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Error during /register-drive execution (fetch or processing):`,
                error,
            );
            try {
                await interaction.editReply({
                    content: `An error occurred while processing your request: ${error.message}\nPlease check the bot and Google Apps Script logs.`,
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
