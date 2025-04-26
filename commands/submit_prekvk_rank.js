// commands/submit_prekvk_rank.js (Display Calculation Note)

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed

/**
 * Helper function to convert image URL to Base64
 * @param {string} url URL of the image
 * @returns {Promise<string>} Base64 encoded string of the image
 */
async function imageToBase64(url) {
    // ... (fungsi ini tetap sama) ...
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(
            `Failed to fetch image: ${response.statusText} (URL: ${url})`,
        );
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("submit_prekvk_rank")
        .setDescription(
            "Submit Pre-KvK rank. Use 'manual_score' option ONLY if you are Rank 1-10.",
        )
        .addAttachmentOption((option) =>
            option
                .setName("profile_screenshot")
                .setDescription(
                    "Screenshot of your Governor Profile (showing ID).",
                )
                .setRequired(true),
        )
        .addAttachmentOption((option) =>
            option
                .setName("rank_screenshot")
                .setDescription("Screenshot of your Pre-KvK rank mail/page.")
                .setRequired(true),
        )
        .addIntegerOption((option) =>
            option
                .setName("manual_score")
                .setDescription(
                    "Your score (ONLY fill this if your rank is 1-10).",
                )
                .setRequired(false)
                .setMinValue(1),
        ),

    async execute(interaction, appsScriptUrl) {
        // ... (Channel check dan Apps Script URL check tetap sama) ...
        const allowedChannelId = process.env.PREKVK_CHANNEL_ID;
        if (allowedChannelId && interaction.channelId !== allowedChannelId) {
            const allowedChannel =
                interaction.guild?.channels.cache.get(allowedChannelId);
            const channelMention = allowedChannel
                ? `<#${allowedChannelId}>`
                : `the designated channel (ID: ${allowedChannelId})`;
            console.log(
                `[INFO] /submit_prekvk_rank blocked in channel ${interaction.channelId}`,
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

        try {
            // Defer public
            await interaction.deferReply();
        } catch (deferError) {
            console.error("[ERROR] Error deferring reply:", deferError);
            return;
        }

        try {
            // ... (Get options, validate attachments, edit reply "Processing...", convert images - tetap sama) ...
            const profileAttachment =
                interaction.options.getAttachment("profile_screenshot");
            const rankAttachment =
                interaction.options.getAttachment("rank_screenshot");
            const manualScore = interaction.options.getInteger("manual_score");

            if (!profileAttachment.contentType?.startsWith("image/"))
                return interaction.editReply({
                    content: "❌ Error: Profile screenshot must be an image.",
                });
            if (!rankAttachment.contentType?.startsWith("image/"))
                return interaction.editReply({
                    content: "❌ Error: Rank screenshot must be an image.",
                });

            await interaction.editReply({
                content:
                    "⏳ Processing your submission... Downloading images...",
            });
            let profileImageBase64, rankImageBase64;
            try {
                profileImageBase64 = await imageToBase64(profileAttachment.url);
                rankImageBase64 = await imageToBase64(rankAttachment.url);
                console.log(
                    `[DEBUG] Images converted for ${interaction.user.id}`,
                );
            } catch (imageError) {
                console.error("[ERROR] Image conversion error:", imageError);
                return interaction.editReply({
                    content: `❌ Error processing images: ${imageError.message}.`,
                });
            }

            const payload = {
                command: "submit_prekvk_rank",
                data: {
                    /* ... data ... */ discordUserId: interaction.user.id,
                    profileImageBase64,
                    rankImageBase64,
                    manualScore,
                },
            };
            await interaction.editReply({
                content: "⏳ Submitting data to the backend...",
            });

            // ... (Send request to Apps Script - tetap sama) ...
            console.log(`[INFO] Sending payload for ${interaction.user.id}`);
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            console.log(
                `[INFO] Response status ${response.status} for ${interaction.user.id}.`,
            );

            let result;
            const responseText = await response.text();

            // --- Handle Final Response ---
            if (!response.ok) {
                // ... (Error handling editReply tetap sama) ...
                console.error(
                    `[ERROR] Backend error for ${interaction.user.id}. Status: ${response.status}. Response: ${responseText}`,
                );
                let errorMsg = `Error communicating with backend (Status: ${response.status}).`;
                try {
                    errorMsg = `❌ Backend Error: ${JSON.parse(responseText).message || "Unknown error"}`;
                } catch (e) {}
                return interaction.editReply({ content: errorMsg });
            }

            try {
                result = JSON.parse(responseText);
                console.log(
                    `[DEBUG] Parsed response for ${interaction.user.id}: ${JSON.stringify(result)}`,
                );
            } catch (parseError) {
                // ... (Error handling editReply tetap sama) ...
                console.error(
                    `[ERROR] Parse error for ${interaction.user.id}. Error: ${parseError}. Response: ${responseText}`,
                );
                return interaction.editReply({
                    content: "❌ Error processing backend response.",
                });
            }

            // --- MODIFIKASI EMBED UNTUK MENAMPILKAN CATATAN ---
            if (result.status === "success") {
                const successEmbed = new EmbedBuilder()
                    .setColor(result.details?.note ? 0xffcc00 : 0x00ff00) // Kuning jika ada note, hijau jika tidak
                    .setTitle("✅ Pre-KvK Submission Successful!")
                    .setDescription(
                        result.message ||
                            "Your Pre-KvK data has been submitted.",
                    )
                    .addFields(
                        {
                            name: "Governor ID",
                            value:
                                result.details?.governorId?.toString() || "N/A",
                            inline: true,
                        },
                        {
                            name: "Account Type",
                            value: result.details?.accountType || "N/A",
                            inline: true,
                        },
                        {
                            name: "Submitted Rank/Score",
                            value:
                                result.details?.rankOrScore?.toString() ||
                                "N/A",
                            inline: true,
                        },
                        {
                            name: "Calculated Points",
                            value: result.details?.points?.toString() || "N/A",
                            inline: true,
                        },
                    )
                    .setTimestamp();

                // Periksa apakah ada catatan dari backend
                if (result.details?.note) {
                    successEmbed.addFields({
                        name: "⚠️ Note", // Judul generik untuk catatan
                        value: result.details.note, // Tampilkan pesan catatan dari backend
                        inline: false,
                    });
                }
                // Jika menggunakan alur editReply, author tidak perlu ditambahkan lagi
                // .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })

                await interaction.editReply({
                    embeds: [successEmbed],
                    content: "",
                }); // Edit reply publik
            } else {
                // ... (Error handling editReply tetap sama) ...
                console.warn(
                    `[WARN] Logical error for ${interaction.user.id}: ${result.message || "No message"}`,
                );
                await interaction.editReply({
                    content: `❌ Submission Failed: ${result.message || "Unknown backend error."}`,
                });
            }
            // --- END MODIFIKASI EMBED ---
        } catch (error) {
            // ... (Error handling editReply tetap sama) ...
            console.error(
                `[ERROR] UNEXPECTED ERROR for ${interaction.user.id}:`,
                error,
            );
            try {
                await interaction.editReply({
                    content:
                        "An unexpected error occurred. Please contact an admin.",
                });
            } catch (editError) {
                console.error(
                    "[ERROR] Failed to edit reply with unexpected error:",
                    editError,
                );
            }
        }
    },
};
