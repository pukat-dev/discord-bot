// commands/submit_prekvk.js (V3 Flow - Screenshot Only)

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch");

// Helper: Build error embed
function buildErrorEmbed(
  title = "❌ Submission Failed",
  message = "An unknown error occurred."
) {
  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(title)
    .setDescription(message)
    .setTimestamp();
}

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
  data: new SlashCommandBuilder()
    .setName("submit_prekvk")
    .setDescription("Submit Pre-KvK data (ID and Proof Screenshot).")
    .addStringOption((option) =>
      option
        .setName("governor_id")
        .setDescription("Enter your Governor ID (7-10 digits).")
        .setRequired(true)
        .setMinLength(7)
        .setMaxLength(10)
    )
    .addAttachmentOption((option) =>
      option
        .setName("proof_screenshot")
        .setDescription(
          "Upload Screenshot: Rank Mail (if received) OR Score Page."
        )
        .setRequired(true)
    ),

  async execute(interaction, appsScriptUrl) {
    const allowedChannelId = process.env.PREKVK_CHANNEL_ID;
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
        embeds: [
          buildErrorEmbed(
            "📢 Wrong Channel",
            `You can only use this command in ${channelMention}. Please switch to that channel to continue.`
          ),
        ],
        ephemeral: true,
      });
    }

    if (!appsScriptUrl) {
      console.error("[ERROR] APPS_SCRIPT_WEB_APP_URL is not configured.");
      return interaction.reply({
        embeds: [
          buildErrorEmbed(
            "⚙️ Configuration Error",
            "Backend service is not configured properly. Please contact an admin."
          ),
        ],
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    try {
      const governorIdInput = interaction.options.getString("governor_id");
      const proofAttachment =
        interaction.options.getAttachment("proof_screenshot");

      if (!/^\d{7,10}$/.test(governorIdInput)) {
        return interaction.editReply({
          embeds: [
            buildErrorEmbed(
              "🆔 Invalid Governor ID",
              "Please enter a valid Governor ID (7-10 digits)."
            ),
          ],
        });
      }

      if (!proofAttachment.contentType?.startsWith("image/")) {
        return interaction.editReply({
          embeds: [
            buildErrorEmbed(
              "🖼️ Invalid File Type",
              "The uploaded file must be an image (e.g., JPG or PNG). Please try again."
            ),
          ],
        });
      }

      await interaction.editReply({
        content: "⏳ Processing your submission... please wait...",
      });

      let proofImageBase64;
      try {
        proofImageBase64 = await imageToBase64(proofAttachment.url);
        console.log(`[DEBUG] Image converted for user ${interaction.user.id}`);
      } catch (imageError) {
        console.error("[ERROR] Image conversion error:", imageError);
        return interaction.editReply({
          embeds: [
            buildErrorEmbed(
              "📷 Image Error",
              `Failed to process your image: ${imageError.message}. Please try uploading again.`
            ),
          ],
        });
      }

      const payload = {
        command: "submit_prekvk_data_v3",
        data: {
          discordUserId: interaction.user.id,
          governorId: governorIdInput,
          proofImageBase64,
        },
      };

      await interaction.editReply({
        content: "⏳ Submitting data to server... almost done...",
      });

      console.log(
        `[INFO] Sending V3 payload (Screenshot Only) for user ${interaction.user.id}`
      );
      const response = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseStatus = response.status;
      const responseText = await response.text();

      if (!response.ok) {
        console.error(
          `[ERROR] Backend error V3 for user ${interaction.user.id}. Status: ${responseStatus}. Response: ${responseText}`
        );
        let errorMsg = `Failed to contact the server (Status: ${responseStatus}).`;
        try {
          const parsedError = JSON.parse(responseText);
          errorMsg = `❌ Server Error: ${
            parsedError.message || responseText || "Unknown error"
          }`;
        } catch (e) {
          errorMsg = `❌ Server Error: ${
            responseText || `Status ${responseStatus}`
          }`;
        }
        return interaction.editReply({
          embeds: [buildErrorEmbed("🌐 Server Error", errorMsg)],
        });
      }

      let result;
      try {
        result = JSON.parse(responseText);
        console.log(`[DEBUG] Parsed V3 response:`, result);
      } catch (parseError) {
        console.error(
          `[ERROR] Failed to parse backend response for user ${interaction.user.id}. Error: ${parseError}`
        );
        return interaction.editReply({
          embeds: [
            buildErrorEmbed(
              "📡 Invalid Server Response",
              "We received an unexpected response from the server. Please try again or contact an admin."
            ),
          ],
        });
      }

      if (result.status !== "success" || !result.details) {
        console.warn(
          `[WARN] Unexpected logic or missing details for user ${
            interaction.user.id
          }: ${result.message || "No message"}`
        );
        return interaction.editReply({
          embeds: [
            buildErrorEmbed(
              "🚫 Submission Failed",
              result.message ||
                "An unknown error occurred while saving your data. Please try again."
            ),
          ],
        });
      }

      const successEmbed = new EmbedBuilder()
        .setColor(0x00cc66)
        .setTitle("✅ Submission Successful!")
        .setDescription(
          "Thank you! Your Pre-KvK data has been received and is now being processed."
        )
        .addFields(
          {
            name: "🆔 Governor ID",
            value: `\`${governorIdInput}\``,
            inline: true,
          },
          {
            name: "📄 Status",
            value: result.details || "Successfully saved",
            inline: true,
          }
        )
        .setTimestamp()
        .setFooter({ text: `User: ${interaction.user.username}` });

      return interaction.editReply({ embeds: [successEmbed], content: "" });
    } catch (error) {
      console.error(
        `[ERROR] UNEXPECTED ERROR for user ${interaction.user.id}:`,
        error
      );
      try {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Unexpected Error")
          .setDescription(
            "Something went wrong while processing your Pre-KvK submission. Please try again later or contact an admin."
          )
          .setTimestamp()
          .setFooter({ text: `User: ${interaction.user.username}` });

        if (interaction.replied || interaction.deferred) {
          await interaction.editReply({ embeds: [errorEmbed], content: "" });
        } else {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
      } catch (editError) {
        console.error(
          "[ERROR] Failed to send fallback error message:",
          editError
        );
      }
    }
  },
};
