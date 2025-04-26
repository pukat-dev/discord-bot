// commands/kp_zone_upload.js (Corrected Version)

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

async function fileToBase64(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(
            `Failed to fetch file: ${response.statusText} (URL: ${url})`,
        );
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
}

const zoneChoices = [
    { name: "Zone 4", value: "Zone 4" },
    { name: "Zone 5", value: "Zone 5" },
    { name: "Zone 6", value: "Zone 6" },
    { name: "Zone 7", value: "Zone 7" },
    { name: "Zone 8", value: "Zone 8" },
    { name: "Kingsland", value: "Kingsland" },
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName("kp_zone_upload")
        .setDescription("Upload an Excel file for bulk Zone KP submission.")
        .addStringOption((option) =>
            option
                .setName("zone_name")
                .setDescription("Select the war zone.")
                .setRequired(true)
                .addChoices(...zoneChoices),
        )
        .addStringOption((option) =>
            option
                .setName("submission_type")
                .setDescription(
                    "Select whether this is BEFORE or AFTER the war.",
                )
                .setRequired(true)
                .addChoices(
                    { name: "Before War", value: "Before" },
                    { name: "After War", value: "After" },
                ),
        )
        .addAttachmentOption(
            (
                option, // Corrected syntax
            ) =>
                option
                    .setName("excel_file")
                    .setDescription(
                        "Upload Excel (.xlsx) with GovID, Power, T4KP, T5KP columns.",
                    )
                    .setRequired(true),
        ),

    async execute(interaction, appsScriptUrl) {
        const allowedChannelId = process.env.ADMIN_CHANNEL_ID;
        if (allowedChannelId && interaction.channelId !== allowedChannelId) {
            const channelMention = `<#${allowedChannelId}>`;
            console.log(
                `[INFO] /kp_zone_upload blocked in channel ${interaction.channelId}`,
            );
            return interaction.reply({
                content: `❌ This command can only be used in ${channelMention}.`,
                ephemeral: true,
            });
        }
        if (!appsScriptUrl) {
            console.error("[ERROR] APPS_SCRIPT_WEB_APP_URL is not configured.");
            return interaction.reply({
                content: "Error: Backend configuration is missing.",
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        let zoneName, submissionType; // Define here for broader scope if needed in catch

        try {
            zoneName = interaction.options.getString("zone_name");
            submissionType = interaction.options.getString("submission_type");
            const excelFile = interaction.options.getAttachment("excel_file");

            if (
                !excelFile.name.toLowerCase().endsWith(".xlsx") &&
                excelFile.contentType !==
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ) {
                await interaction.editReply({
                    content:
                        "❌ Error: Please upload a valid Excel file (.xlsx).",
                });
                return;
            }

            await interaction.editReply({
                content: `⏳ Processing ${submissionType} submission for ${zoneName}... Reading Excel file...`, // Corrected string
            });

            let excelBase64;
            try {
                excelBase64 = await fileToBase64(excelFile.url);
            } catch (fileError) {
                console.error("[ERROR] File conversion error:", fileError);
                await interaction.editReply({
                    content: `❌ Error reading file: ${fileError.message}.`,
                });
                return;
            }

            const payload = {
                command: "submit_zone_kp_bulk",
                data: {
                    discordUserId: interaction.user.id,
                    zoneName: zoneName,
                    submissionType: submissionType,
                    excelBase64: excelBase64,
                },
            };

            await interaction.editReply({
                content: `⏳ Submitting bulk data for ${zoneName} (${submissionType}) to backend... This may take a moment.`, // Corrected string
            });

            console.log(
                `[INFO] Sending bulk payload for ${interaction.user.id}: command=${payload.command}`, // Corrected string
            );
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const responseStatus = response.status;
            const responseText = await response.text();
            console.log(
                `[INFO] Bulk response status ${responseStatus} for ${interaction.user.id}. Body length: ${responseText.length}`,
            );

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error(
                    `[ERROR] Failed to parse backend response for bulk upload: ${parseError}. Response Text: ${responseText.substring(0, 500)}`,
                );
                await interaction.editReply({
                    content:
                        "❌ Error processing backend response (parsing failed).",
                });
                return;
            }

            const resultEmbed = new EmbedBuilder()
                .setTitle(
                    `📊 Bulk Zone KP Submission Result: ${zoneName} (${submissionType})`,
                ) // Corrected string
                .setDescription(result.message || "Processing finished.")
                .setTimestamp()
                .setFooter({
                    text: `Requested by: ${interaction.user.username}`,
                });

            if (result.status === "success") {
                resultEmbed.setColor(0x00ff00);
                resultEmbed.addFields(
                    {
                        name: "Successfully Processed",
                        value: `${result.details?.successCount ?? 0}`,
                        inline: true,
                    },
                    {
                        name: "Failed Entries",
                        value: `${result.details?.failures?.length ?? 0}`,
                        inline: true,
                    },
                );

                if (result.details?.failures?.length > 0) {
                    let failureDetails = "";
                    for (const fail of result.details.failures.slice(0, 10)) {
                        const rowNum = fail.row || "N/A";
                        const govId = fail.governorId || "N/A";
                        const reason = fail.reason || "Unknown reason";
                        const line = `Row ${rowNum} (ID: ${govId}): ${reason}\n`;
                        if (failureDetails.length + line.length > 1000) {
                            failureDetails += "... (list truncated)";
                            break;
                        }
                        failureDetails += line;
                    }
                    if (failureDetails) {
                        resultEmbed.addFields({
                            name: "Failure Details (Partial)",
                            value: `\`\`\`${failureDetails}\`\`\``,
                        });
                    }
                }
            } else {
                resultEmbed.setColor(0xff0000);
                resultEmbed.addFields({
                    name: "Status",
                    value: `Error during processing.`,
                });
                if (result.details?.failures?.length > 0) {
                    let failureDetails = "";
                    for (const fail of result.details.failures.slice(0, 10)) {
                        const rowNum = fail.row || "N/A";
                        const govId = fail.governorId || "N/A";
                        const reason = fail.reason || "Unknown reason";
                        const line = `Row ${rowNum} (ID: ${govId}): ${reason}\n`;
                        if (failureDetails.length + line.length > 1000) {
                            failureDetails += "... (list truncated)";
                            break;
                        }
                        failureDetails += line;
                    }
                    if (failureDetails) {
                        resultEmbed.addFields({
                            name: "Failure Details (Partial)",
                            value: `\`\`\`${failureDetails}\`\`\``,
                        });
                    }
                }
            }

            await interaction.editReply({ content: "", embeds: [resultEmbed] });
        } catch (error) {
            console.error(
                `[ERROR] UNEXPECTED ERROR in command /kp_zone_upload for ${interaction.user.id}:`,
                error,
            );
            const safeZoneName = zoneName || "N/A"; // Use defined variables safely
            const safeSubmissionType = submissionType || "N/A"; // Use defined variables safely
            try {
                await interaction.editReply({
                    content: `An unexpected error occurred while processing command for Zone ${safeZoneName} (${safeSubmissionType}). Please check logs.`,
                });
            } catch (replyError) {
                console.error(
                    `[ERROR] Failed to send error message to user ${interaction.user.id}:`,
                    replyError,
                );
            }
        }
    },
};
