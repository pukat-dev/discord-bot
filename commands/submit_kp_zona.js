// commands/submit_kp_zona.js (Versi CommonJS)

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch"); // Gunakan require untuk node-fetch

// Helper function imageToBase64
async function imageToBase64(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(
            `Failed to fetch image: ${response.statusText} (URL: ${url})`,
        );
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
}

// Daftar Zona
const zoneChoices = [
    { name: "Zone 4", value: "Zone 4" },
    { name: "Zone 5", value: "Zone 5" },
    { name: "Zone 6", value: "Zone 6" },
    { name: "Zone 7", value: "Zone 7" },
    { name: "Zone 8", value: "Zone 8" },
    { name: "Kingsland", value: "Kingsland" },
];

// Ekspor menggunakan module.exports
module.exports = {
    data: new SlashCommandBuilder()
        .setName("submit_kp_zona")
        .setDescription("Submit Power & T4/T5 KP (Requires 2 Screenshots).")
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
        .addAttachmentOption((option) =>
            option
                .setName("profile_screenshot")
                .setDescription("Screenshot showing Governor ID and Power.")
                .setRequired(true),
        )
        .addAttachmentOption((option) =>
            option
                .setName("killpoints_screenshot")
                .setDescription(
                    "Screenshot showing Kill Points T4 & T5 details.",
                )
                .setRequired(true),
        ),

    async execute(interaction, appsScriptUrl) {
        const allowedChannelId = process.env.KP_ZONA_CHANNEL_ID;
        if (allowedChannelId && interaction.channelId !== allowedChannelId) {
            const channelMention = `<#${allowedChannelId}>`;
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

        try {
            const zoneName = interaction.options.getString("zone_name");
            const submissionType =
                interaction.options.getString("submission_type");
            const profileScreenshot =
                interaction.options.getAttachment("profile_screenshot");
            const kpScreenshot = interaction.options.getAttachment(
                "killpoints_screenshot",
            );

            if (!profileScreenshot.contentType?.startsWith("image/")) {
                return interaction.editReply({
                    content:
                        "❌ Error: Profile screenshot must be an image file.",
                });
            }
            if (!kpScreenshot.contentType?.startsWith("image/")) {
                return interaction.editReply({
                    content:
                        "❌ Error: Kill Points screenshot must be an image file.",
                });
            }

            await interaction.editReply({
                content: `⏳ Processing ${submissionType} submission for ${zoneName}... Converting images...`,
            });

            let profileBase64, kpBase64;
            try {
                [profileBase64, kpBase64] = await Promise.all([
                    imageToBase64(profileScreenshot.url),
                    imageToBase64(kpScreenshot.url),
                ]);
            } catch (imageError) {
                console.error("[ERROR] Image conversion error:", imageError);
                return interaction.editReply({
                    content: `❌ Error processing images: ${imageError.message}.`,
                });
            }

            const payload = {
                command: "submit_zone_kp",
                data: {
                    discordUserId: interaction.user.id,
                    zoneName: zoneName,
                    submissionType: submissionType,
                    profileImageBase64: profileBase64,
                    kpImageBase64: kpBase64,
                },
            };

            await interaction.editReply({
                content: `⏳ Submitting data for ${zoneName} (${submissionType}) to backend for OCR and storage...`,
            });

            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const responseStatus = response.status;
            const responseText = await response.text();

            if (!response.ok) {
                console.error(
                    `[ERROR] Backend error ${responseStatus}: ${responseText.substring(0, 500)}`,
                );
                let errorMsg = `Backend Error (${responseStatus})`;
                try {
                    const parsedError = JSON.parse(responseText);
                    errorMsg = `❌ Backend Error: ${parsedError.message || "Unknown error from backend."}`;
                } catch (e) {
                    errorMsg = `❌ Backend Error (${responseStatus}): Could not parse error message.`;
                    console.error(
                        "[ERROR] Could not parse backend error response:",
                        responseText,
                    );
                }
                return interaction.editReply({
                    content: errorMsg,
                    embeds: [],
                    files: [],
                });
            }

            let result;
            try {
                result = JSON.parse(responseText);
            } catch (parseError) {
                console.error(
                    `[ERROR] Failed to parse successful backend response: ${parseError}. Response Text: ${responseText.substring(0, 500)}`,
                );
                return interaction.editReply({
                    content:
                        "❌ Error processing backend response (parsing failed).",
                });
            }

            if (result.status === "success" && result.details) {
                const govId = result.details.governorId || "N/A";
                const powerFormatted =
                    typeof result.details.power === "number"
                        ? result.details.power.toLocaleString("en-US")
                        : "N/A";
                const t4KP_formatted =
                    typeof result.details.t4KP === "number"
                        ? result.details.t4KP.toLocaleString("en-US")
                        : "N/A";
                const t5KP_formatted =
                    typeof result.details.t5KP === "number"
                        ? result.details.t5KP.toLocaleString("en-US")
                        : "N/A";
                const kpGainedFormatted =
                    typeof result.details.kpGained === "number"
                        ? result.details.kpGained.toLocaleString("en-US")
                        : "N/A";
                const powerReduceFormatted =
                    typeof result.details.powerReduce === "number"
                        ? result.details.powerReduce.toLocaleString("en-US")
                        : "N/A";

                const successEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle(
                        `✅ Zone Data Submitted: ${zoneName} (${submissionType})`,
                    )
                    .setDescription(
                        result.message ||
                            `Data ${submissionType} war for zone ${zoneName} has been recorded.`,
                    )
                    .addFields(
                        {
                            name: "Governor ID",
                            value: govId.toString(),
                            inline: true,
                        },
                        { name: "Zone Name", value: zoneName, inline: true },
                        {
                            name: "Submission Type",
                            value: submissionType,
                            inline: true,
                        },
                        {
                            name: "Power Recorded",
                            value: powerFormatted,
                            inline: true,
                        },
                        {
                            name: "T4 KP Recorded",
                            value: t4KP_formatted,
                            inline: true,
                        },
                        {
                            name: "T5 KP Recorded",
                            value: t5KP_formatted,
                            inline: true,
                        },
                        {
                            name: "Zone KP Gained",
                            value:
                                kpGainedFormatted !== "N/A"
                                    ? kpGainedFormatted
                                    : "(Pending counter-data)",
                            inline: true,
                        },
                        {
                            name: "Power Reduce",
                            value:
                                powerReduceFormatted !== "N/A"
                                    ? powerReduceFormatted
                                    : "(Pending counter-data)",
                            inline: true,
                        },
                    )
                    .setTimestamp()
                    .setFooter({
                        text: `Requested by: ${interaction.user.username}`,
                    });

                await interaction.editReply({
                    content: "",
                    embeds: [successEmbed],
                    files: [],
                });
            } else if (result.status === "success") {
                await interaction.editReply({
                    content: `✅ Submission recorded, but details missing in response. ${result.message || ""}`,
                });
            } else {
                await interaction.editReply({
                    content: `❌ Submission Failed: ${result.message || "Unknown backend error."}`,
                });
            }
        } catch (error) {
            console.error(
                `[ERROR] UNEXPECTED ERROR in command /submit_kp_zona for ${interaction.user.id}:`,
                error,
            );
            try {
                await interaction.editReply({
                    content:
                        "An unexpected error occurred while processing your command.",
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
