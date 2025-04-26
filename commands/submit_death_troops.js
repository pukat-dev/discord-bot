// commands/submit_death_troops.js (Updated: Troops image NOT grayscaled)

const {
    SlashCommandBuilder,
    EmbedBuilder,
    AttachmentBuilder,
    MessageFlags, // Impor MessageFlags
} = require("discord.js");
const fetch = require("node-fetch"); // Pastikan node-fetch@2 terinstal
const Jimp = require("jimp"); // Import Jimp

// Helper function untuk format angka
const formatNumber = (num) => {
    if (num === null || num === undefined) return "0";
    const number = Number(num);
    return isNaN(number) ? "N/A" : number.toLocaleString("id-ID");
};

// Helper function: Proses gambar dan konversi ke Base64
// Dulu ada parameter applyGrayscale, sekarang tidak diperlukan untuk troops
async function processImageAttachment(attachment) {
    if (!attachment || !attachment.url) {
        throw new Error("Attachment tidak valid.");
    }
    try {
        console.log(
            `Processing image: ${attachment.name}`, // Log tanpa info grayscale
        );
        const response = await fetch(attachment.url);
        if (!response.ok) {
            throw new Error(
                `Gagal mengunduh gambar (${response.status}): ${response.statusText}`,
            );
        }
        // Langsung konversi buffer asli ke Base64
        const imageBuffer = Buffer.from(await response.arrayBuffer());
        console.log(`Converting original buffer for ${attachment.name}.`);
        return imageBuffer.toString("base64");
    } catch (error) {
        console.error(`Error processing image ${attachment.name}:`, error);
        throw new Error(
            `Gagal memproses gambar "${attachment.name}": ${error.message}`,
        );
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("submit-death-troops")
        .setDescription("Submit screenshot profil dan pasukan mati T4/T5.")
        .addAttachmentOption((option) =>
            option
                .setName("profile_screenshot")
                .setDescription(
                    "Screenshot profil gubernur Anda (untuk verifikasi ID).",
                )
                .setRequired(true),
        )
        .addAttachmentOption((option) =>
            option
                .setName("troops_screenshot")
                .setDescription(
                    "Screenshot rincian pasukan mati (yang menunjukkan T4 & T5).",
                )
                .setRequired(true),
        ),

    async execute(interaction, appsScriptUrl) {
        console.log(
            `[/submit-death-troops] Executing command for user ${interaction.user.id}`,
        );

        // Defer reply menggunakan flags
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            console.log("[/submit-death-troops] Reply deferred successfully.");
        } catch (deferError) {
            console.error(
                "[/submit-death-troops] Deferral failed:",
                deferError,
            );
            try {
                await interaction.followUp({
                    content:
                        "❌ Maaf, terjadi masalah saat memulai perintah. Interaksi mungkin sudah kedaluwarsa. Silakan coba lagi.",
                    ephemeral: true,
                });
            } catch (followUpError) {
                console.error(
                    "[/submit-death-troops] Failed to send follow-up error message after deferral failure:",
                    followUpError,
                );
            }
            return;
        }

        // Validasi URL Backend
        if (!appsScriptUrl) {
            console.error(
                "[ERROR] /submit-death-troops: APPS_SCRIPT_WEB_APP_URL is not configured.",
            );
            return interaction.editReply({
                content: "Error: Konfigurasi backend hilang.",
                embeds: [],
                components: [],
            });
        }

        try {
            // 1. Ambil Attachments
            const profileAttachment =
                interaction.options.getAttachment("profile_screenshot");
            const troopsAttachment =
                interaction.options.getAttachment("troops_screenshot");

            // 2. Validasi Tipe Attachment
            if (!profileAttachment?.contentType?.startsWith("image/")) {
                return interaction.editReply({
                    content: "File profil harus berupa gambar.",
                    embeds: [],
                    components: [],
                });
            }
            if (!troopsAttachment?.contentType?.startsWith("image/")) {
                return interaction.editReply({
                    content: "File pasukan mati harus berupa gambar.",
                    embeds: [],
                    components: [],
                });
            }

            // Beri tahu pengguna bahwa proses sedang berjalan
            await interaction.editReply({
                content: "⏳ Memproses gambar screenshot...", // Pesan lebih generik
                embeds: [],
                components: [],
            });

            // 3. Konversi ke Base64 (TANPA grayscale untuk troops)
            let profileBase64, troopsBase64;
            try {
                // Jalankan proses secara paralel
                [profileBase64, troopsBase64] = await Promise.all([
                    processImageAttachment(profileAttachment), // Profil (tidak pernah grayscale)
                    processImageAttachment(troopsAttachment), // Pasukan mati (TIDAK LAGI grayscale)
                ]);
                console.log(
                    "[/submit-death-troops] Images processed and converted (no grayscale applied).",
                );
            } catch (processingError) {
                console.error(
                    "[/submit-death-troops] Image processing error:",
                    processingError,
                );
                return interaction.editReply({
                    content: `❌ Gagal memproses gambar: ${processingError.message}`,
                    embeds: [],
                    components: [],
                });
            }

            // 4. Siapkan Payload & Panggil Backend
            const payload = {
                command: "submit_death_troops",
                data: {
                    discordUserId: interaction.user.id,
                    profileImageBase64: profileBase64,
                    troopsImageBase64: troopsBase64, // Kirim data gambar asli (warna)
                },
            };

            await interaction.editReply({
                content: "✅ Gambar diproses. Mengirim data ke backend...",
                embeds: [],
                components: [],
            });
            console.log("[/submit-death-troops] Sending data to backend...");

            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            // 5. Tangani Respons Backend
            let responseData;
            const responseText = await response.text();
            try {
                responseData = JSON.parse(responseText);
            } catch (jsonError) {
                console.error(
                    "[/submit-death-troops] Failed to parse JSON response:",
                    jsonError,
                );
                console.error(
                    "[/submit-death-troops] Raw backend response text:",
                    responseText,
                );
                throw new Error(
                    `Gagal parse respons backend. Status: ${response.status}. Respons: ${responseText.substring(0, 200)}`,
                );
            }

            console.log(
                "[/submit-death-troops] Received response:",
                responseData,
            );

            if (response.ok && responseData.status === "success") {
                const details = responseData.details || {};
                const successEmbed = new EmbedBuilder()
                    .setColor(0x00ff00) // Green
                    .setTitle("✅ Data Pasukan Mati Berhasil Dikirim")
                    .setDescription(
                        responseData.message ||
                            `Data untuk Gov ID \`${details.govId}\` telah disimpan.`,
                    )
                    .addFields(
                        {
                            name: "Governor ID",
                            value: `\`${details.govId || "N/A"}\``,
                            inline: true,
                        },
                        {
                            name: "Tipe Akun",
                            value: details.accountType || "N/A",
                            inline: true,
                        },
                        {
                            name: "Filler?",
                            value: details.isFiller ? "Ya" : "Tidak",
                            inline: true,
                        },
                        {
                            name: "T4 Mati (Submitted)",
                            value: formatNumber(details.t4Submitted),
                            inline: true,
                        },
                        {
                            name: "T5 Mati (Submitted)",
                            value: formatNumber(details.t5Submitted),
                            inline: true,
                        },
                    )
                    .setTimestamp();

                if (
                    details.isFiller &&
                    typeof details.fillerScoreCalculated === "number"
                ) {
                    successEmbed.addFields({
                        name: "Skor Filler (Calculated)",
                        value: formatNumber(details.fillerScoreCalculated),
                        inline: true,
                    });
                }
                await interaction.editReply({
                    content: "",
                    embeds: [successEmbed],
                    components: [],
                });
            } else {
                const errorMessage =
                    responseData.message ||
                    `Backend Error (${response.status})`;
                console.error(
                    `[/submit-death-troops] Backend returned error: ${errorMessage}`,
                    responseData,
                );
                await interaction.editReply({
                    content: `❌ Gagal mengirim data: ${errorMessage}`,
                    embeds: [],
                    components: [],
                });
            }
        } catch (error) {
            console.error(
                "[/submit-death-troops] Error executing command:",
                error,
            );
            if (!interaction.replied && !interaction.deferred) {
                console.warn(
                    "[/submit-death-troops] Interaction was not replied or deferred before catching error. Cannot editReply.",
                );
                try {
                    await interaction.followUp({
                        content: `Terjadi error tidak terduga: ${error.message}`,
                        ephemeral: true,
                    });
                } catch {}
            } else {
                try {
                    await interaction.editReply({
                        content: `Terjadi error tidak terduga: ${error.message}`,
                        embeds: [],
                        components: [],
                    });
                } catch (editError) {
                    console.error(
                        "[/submit-death-troops] Failed to editReply in main catch block:",
                        editError,
                    );
                    if (editError.code !== 10062) {
                        try {
                            await interaction.followUp({
                                content:
                                    "Terjadi error saat memproses perintah setelah respons awal.",
                                ephemeral: true,
                            });
                        } catch {}
                    }
                }
            }
        }
    },
};
