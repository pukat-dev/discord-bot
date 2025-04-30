// commands/submit_prekvk.js (V3 Flow - Screenshot Only)
// File ini menangani command /submit_prekvk di Discord

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
// Pastikan Anda sudah menginstal node-fetch versi 2: npm install node-fetch@2
const fetch = require("node-fetch");

/**
 * Fungsi helper untuk mengubah URL gambar menjadi string Base64.
 * @param {string} url - URL gambar yang akan dikonversi.
 * @returns {Promise<string>} Promise yang resolve dengan string gambar Base64.
 * @throws {Error} Jika gagal mengambil atau memproses gambar.
 */
async function imageToBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: ${response.statusText} (URL: ${url})`
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

module.exports = {
  // Mendefinisikan struktur command slash
  data: new SlashCommandBuilder()
    .setName("submit_prekvk")
    // Deskripsi command diubah sedikit
    .setDescription("Submit Pre-KvK data (ID and Proof Screenshot).")
    // --- HANYA OPSI ID DAN SCREENSHOT ---
    .addStringOption(
      (option) =>
        option
          .setName("governor_id")
          .setDescription("Enter your Governor ID (7-10 digits).") // Deskripsi tetap Inggris sesuai file asli
          .setRequired(true) // Wajib diisi
          .setMinLength(7) // Minimal 7 digit
          .setMaxLength(10) // Maksimal 10 digit
    )
    .addAttachmentOption(
      (option) =>
        option
          .setName("proof_screenshot")
          .setDescription(
            "Upload Screenshot: Rank Mail (if received) OR Score Page." // Deskripsi tetap Inggris
          )
          .setRequired(true) // Wajib diisi
    ),
  // --- Opsi input_score sudah DIHAPUS ---

  // Fungsi yang akan dieksekusi saat command dijalankan
  async execute(interaction, appsScriptUrl) {
    // Memeriksa apakah command digunakan di channel yang diizinkan (jika dikonfigurasi)
    const allowedChannelId = process.env.PREKVK_CHANNEL_ID; // Ambil ID channel dari environment variable
    if (allowedChannelId && interaction.channelId !== allowedChannelId) {
      const allowedChannel =
        interaction.guild?.channels.cache.get(allowedChannelId);
      const channelMention = allowedChannel
        ? `<#${allowedChannelId}>`
        : `the designated channel (ID: ${allowedChannelId})`;
      console.log(
        `[INFO] /submit_prekvk blocked in channel ${interaction.channelId}`
      );
      return interaction.reply({
        content: `❌ This command can only be used in ${channelMention}.`,
        ephemeral: true, // Pesan hanya terlihat oleh pengguna
      });
    }
    // Memeriksa apakah URL Google Apps Script sudah dikonfigurasi
    if (!appsScriptUrl) {
      console.error("[ERROR] APPS_SCRIPT_WEB_APP_URL is not configured.");
      return interaction.reply({
        content: "Error: Backend configuration is missing.",
        ephemeral: true,
      });
    }

    // Menunda balasan untuk memberi waktu pemrosesan
    await interaction.deferReply();

    try {
      // Mengambil opsi yang diberikan pengguna (inputScore dihapus)
      const governorIdInput = interaction.options.getString("governor_id");
      const proofAttachment =
        interaction.options.getAttachment("proof_screenshot");

      // Validasi input dasar (inputScore dihapus)
      if (!/^\d{7,10}$/.test(governorIdInput)) {
        return interaction.editReply({
          content:
            "❌ Error: Invalid Governor ID. Please enter 7-10 digits only.",
        });
      }
      // Memastikan file yang diunggah adalah gambar
      if (!proofAttachment.contentType?.startsWith("image/")) {
        return interaction.editReply({
          content: "❌ Error: The `proof_screenshot` file must be an image.",
        });
      }

      // Mengonversi gambar ke Base64
      await interaction.editReply({
        content: "⏳ Processing your submission... please wait a minute...",
      });
      let proofImageBase64;
      try {
        proofImageBase64 = await imageToBase64(proofAttachment.url);
        console.log(`[DEBUG] Image converted for user ${interaction.user.id}`);
      } catch (imageError) {
        console.error("[ERROR] Image conversion error:", imageError);
        return interaction.editReply({
          content: `❌ Error processing image: ${imageError.message}. Please try uploading again.`,
        });
      }

      // Menyiapkan payload untuk dikirim ke Google Apps Script (inputScore dihapus)
      const payload = {
        command: "submit_prekvk_data_v3", // Command name untuk backend
        data: {
          discordUserId: interaction.user.id,
          governorId: governorIdInput,
          proofImageBase64: proofImageBase64,
          // inputScore: inputScore, // Baris ini dihapus
        },
      };

      await interaction.editReply({
        content: "⏳ Data is processing, almost done...",
      });

      // Mengirim request ke Google Apps Script
      console.log(
        `[INFO] Sending V3 payload (Screenshot Only) for user ${interaction.user.id}`
      );
      const response = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseStatus = response.status;
      const responseText = await response.text(); // Ambil teks respons
      console.log(
        `[INFO] Backend response status ${responseStatus} for user ${interaction.user.id}.`
      );

      let result;

      // Menangani error dari backend
      if (!response.ok) {
        console.error(
          `[ERROR] Backend error V3 (Screenshot Only) for user ${interaction.user.id}. Status: ${responseStatus}. Response: ${responseText}`
        );
        let errorMsg = `Error communicating with backend (Status: ${responseStatus}).`;
        try {
          // Coba parse JSON jika responsnya JSON
          const parsedError = JSON.parse(responseText);
          errorMsg = `❌ Backend Error: ${
            parsedError.message || responseText || "Unknown error"
          }`;
        } catch (e) {
          // Jika bukan JSON, tampilkan teks respons mentah
          errorMsg = `❌ Backend Error: ${
            responseText || `Status ${responseStatus}`
          }`;
        }
        return interaction.editReply({ content: errorMsg });
      }

      // Mem-parse respons sukses dari backend
      try {
        result = JSON.parse(responseText);
        console.log(
          `[DEBUG] Parsed V3 response (Screenshot Only) for user ${
            interaction.user.id
          }: ${JSON.stringify(result)}`
        );
      } catch (parseError) {
        console.error(
          `[ERROR] Failed to parse V3 response (Screenshot Only) for user ${interaction.user.id}. Error: ${parseError}. Response: ${responseText}`
        );
        return interaction.editReply({
          content:
            "❌ Error processing backend response. Received invalid data.",
        });
      }

      // Menampilkan hasil dalam Embed
      if (result.status === "success" && result.details) {
        const details = result.details;
        const embed = new EmbedBuilder()
          .setColor(details.note ? 0x00ff00 : 0x00ff00) // Kuning jika ada catatan, hijau jika tidak
          .setTitle("✅ Pre-KvK Submission Successed!")
          .setDescription(
            result.message || "Your Pre-KvK data has been processed."
          )
          .addFields(
            {
              name: "Governor ID",
              value: details.governorId?.toString() || governorIdInput,
              inline: true,
            },
            {
              name: "Account Type",
              value: details.accountType || "N/A",
              inline: true,
            },
            {
              name: "Submission Category",
              value: details.submissionCategory || "N/A",
              inline: true,
            }
          );

        // Menambahkan field spesifik berdasarkan kategori yang ditentukan backend
        switch (details.submissionCategory) {
          case "Rank 1-100 (SS Score)": // Nama kategori mungkin berubah sesuai backend
            embed.addFields(
              {
                name: "Detected Rank",
                value: details.extractedRank?.toString() || "N/A",
                inline: true,
              },
              {
                name: "Score (from SS)", // Label diubah
                value: details.extractedScore?.toLocaleString() ?? "N/A", // Gunakan extractedScore
                inline: true,
              },
              {
                name: "System Points (Score*10)",
                value: details.systemPoints?.toLocaleString() ?? "N/A",
                inline: true,
              }
            );
            break;
          case "Rank 101-1000 (SS Rank)": // Nama kategori mungkin berubah
            embed.addFields(
              {
                name: "Detected Rank",
                value: details.extractedRank?.toString() || "N/A",
                inline: true,
              },
              {
                name: "System Points (Bracket)",
                value: details.systemPoints?.toLocaleString() ?? "N/A",
                inline: true,
              },
              {
                name: "Est. KP Convert (Points/20)",
                value: details.kpConvert?.toLocaleString()
                  ? `${details.kpConvert.toLocaleString()} KP`
                  : "N/A",
                inline: true,
              }
            );
            break;
          case "Score Input (Not Top 1000 - SS Score)": // Nama kategori mungkin berubah
            embed.addFields(
              {
                name: "Score (from SS)", // Label diubah
                value: details.extractedScore?.toLocaleString() ?? "N/A", // Gunakan extractedScore
                inline: true,
              },
              {
                name: "Account Status",
                value: details.accountStatus || "N/A",
                inline: true,
              },
              {
                name: "Calculated KP Convert",
                value: details.kpConvert?.toLocaleString()
                  ? `${details.kpConvert.toLocaleString()} KP`
                  : "0 KP",
                inline: true,
              }
            );
            break;
          default: // Fallback jika kategori tidak dikenal
            embed.addFields(
              {
                name: "Detected Rank/Score", // Label umum
                value:
                  (
                    details.extractedRank || details.extractedScore
                  )?.toLocaleString() ?? "N/A",
                inline: true,
              },
              {
                name: "Result Points/KP",
                value:
                  details.systemPoints?.toLocaleString() ??
                  details.kpConvert?.toLocaleString() ??
                  "N/A",
                inline: true,
              }
            );
        }

        // Menambahkan timestamp dan footer
        embed
          .setTimestamp()
          .setFooter({ text: `Submitted by: ${interaction.user.username}` });

        // Menambahkan catatan dari backend jika ada
        if (details.note) {
          embed.addFields({
            name: "Note:",
            value: details.note,
            inline: false,
          });
        }

        // Mengedit balasan dengan embed hasil
        await interaction.editReply({ embeds: [embed], content: "" });
      } else {
        // Menangani kasus jika status backend bukan 'success' atau detail hilang
        console.warn(
          `[WARN] Logical error V3 (Screenshot Only) or missing details for user ${
            interaction.user.id
          }: ${result.message || "No message"}`
        );
        await interaction.editReply({
          content: `❌ Submission Failed: ${
            result.message || "Unknown backend error or missing details."
          }`,
        });
      }
    } catch (error) {
      // Menangani error tak terduga selama eksekusi
      console.error(
        `[ERROR] UNEXPECTED ERROR V3 (Screenshot Only) in /submit_prekvk for user ${interaction.user.id}:`,
        error
      );
      try {
        // Coba edit balasan jika memungkinkan, jika tidak kirim pesan ephemeral
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({
            content:
              "An unexpected error occurred while processing your command. Please contact an admin.",
          });
        } else {
          await interaction.reply({
            content: "An unexpected error occurred. Please contact an admin.",
            ephemeral: true,
          });
        }
      } catch (editError) {
        // Log error jika mengirim pesan error pun gagal
        console.error(
          "[ERROR] Failed to send/edit reply V3 (Screenshot Only) with unexpected error:",
          editError
        );
      }
    }
  },
};
