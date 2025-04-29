// commands/submit_prekvk.js (V3 Flow - English)

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed

/**
 * Helper function to convert an image URL to a Base64 encoded string.
 * @param {string} url - The URL of the image to convert.
 * @returns {Promise<string>} A promise that resolves with the Base64 encoded image string.
 * @throws {Error} If fetching or processing the image fails.
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
  data: new SlashCommandBuilder()
    .setName("submit_prekvk")
    .setDescription(
      "Submit Pre-KvK data (ID, Proof Screenshot, and Your Score)."
    )
    // --- ALL OPTIONS ARE REQUIRED ---
    .addStringOption((option) =>
      option
        .setName("governor_id")
        .setDescription("Enter your Governor ID (7-10 digits).")
        .setRequired(true)
        .setMinLength(7)
        .setMaxLength(10)
    )
    .addAttachmentOption(
      (option) =>
        option
          .setName("proof_screenshot")
          .setDescription(
            "Upload Screenshot: Rank Mail (if received) OR Score Page."
          )
          .setRequired(true) // Always required
    )
    .addIntegerOption(
      (option) =>
        option
          .setName("input_score")
          .setDescription("Enter your total Pre-KvK score (numbers only).")
          .setRequired(true) // Always required
          .setMinValue(1) // Minimum score of 1
    ),

  async execute(interaction, appsScriptUrl) {
    // Check if the command is used in the allowed channel
    const allowedChannelId = process.env.PREKVK_CHANNEL_ID; // Ensure this ID is correct in your .env file
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
        ephemeral: true,
      });
    }
    // Check if the Apps Script URL is configured
    if (!appsScriptUrl) {
      console.error("[ERROR] APPS_SCRIPT_WEB_APP_URL is not configured.");
      return interaction.reply({
        content: "Error: Backend configuration is missing.",
        ephemeral: true,
      });
    }

    // Defer the reply to prevent timeout
    await interaction.deferReply();

    try {
      // Get all options (all are required in this flow)
      const governorIdInput = interaction.options.getString("governor_id");
      const proofAttachment =
        interaction.options.getAttachment("proof_screenshot");
      const inputScore = interaction.options.getInteger("input_score");

      // Basic Input Validation
      if (!/^\d{7,10}$/.test(governorIdInput)) {
        return interaction.editReply({
          content:
            "❌ Error: Invalid Governor ID. Please enter 7-10 digits only.",
        });
      }
      if (!proofAttachment.contentType?.startsWith("image/")) {
        return interaction.editReply({
          content: "❌ Error: The `proof_screenshot` file must be an image.",
        });
      }
      if (inputScore <= 0) {
        return interaction.editReply({
          content: "❌ Error: `input_score` must be a positive number.",
        });
      }

      // Convert the image to Base64
      await interaction.editReply({
        content: "⏳ Processing your submission... Converting image...",
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

      // Prepare the payload for Google Apps Script (V3)
      const payload = {
        command: "submit_prekvk_data_v3", // New command name for the backend
        data: {
          discordUserId: interaction.user.id,
          governorId: governorIdInput,
          proofImageBase64: proofImageBase64, // Always send the screenshot
          inputScore: inputScore, // Always send the input score
        },
      };

      await interaction.editReply({
        content: "⏳ Submitting data to the backend...",
      });

      // Send the request to Google Apps Script
      console.log(`[INFO] Sending V3 payload for user ${interaction.user.id}`);
      const response = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseStatus = response.status;
      const responseText = await response.text();
      console.log(
        `[INFO] Backend response status ${responseStatus} for user ${interaction.user.id}.`
      );

      let result;

      // Handle backend errors
      if (!response.ok) {
        console.error(
          `[ERROR] Backend error V3 for user ${interaction.user.id}. Status: ${responseStatus}. Response: ${responseText}`
        );
        let errorMsg = `Error communicating with backend (Status: ${responseStatus}).`;
        try {
          const parsedError = JSON.parse(responseText);
          errorMsg = `❌ Backend Error: ${
            parsedError.message || responseText || "Unknown error"
          }`;
        } catch (e) {
          errorMsg = `❌ Backend Error: ${
            responseText || `Status ${responseStatus}`
          }`;
        }
        return interaction.editReply({ content: errorMsg });
      }

      // Parse successful backend response
      try {
        result = JSON.parse(responseText);
        console.log(
          `[DEBUG] Parsed V3 response for user ${
            interaction.user.id
          }: ${JSON.stringify(result)}`
        );
      } catch (parseError) {
        console.error(
          `[ERROR] Failed to parse V3 response for user ${interaction.user.id}. Error: ${parseError}. Response: ${responseText}`
        );
        return interaction.editReply({
          content:
            "❌ Error processing backend response. Received invalid data.",
        });
      }

      // Display the results in an Embed
      if (result.status === "success" && result.details) {
        const details = result.details;
        const embed = new EmbedBuilder()
          .setColor(details.note ? 0xffcc00 : 0x00ff00) // Yellow if note exists, green otherwise
          .setTitle("✅ Pre-KvK Submission Processed!")
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

        // Add fields based on the submission category determined by the backend
        switch (details.submissionCategory) {
          case "Rank 1-100 (Score Input)":
            embed.addFields(
              {
                name: "Detected Rank (from SS)",
                value: details.extractedRank?.toString() || "N/A",
                inline: true,
              },
              {
                name: "Inputted Score",
                value: details.inputScore?.toLocaleString() || "N/A",
                inline: true,
              },
              {
                name: "System Points (Score*10)",
                value: details.systemPoints?.toLocaleString() ?? "N/A",
                inline: true,
              }
            );
            break;
          case "Rank 101-1000 (SS)":
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
          case "Score Input (Not Top 1000)":
            embed.addFields(
              {
                name: "Inputted Score",
                value: details.inputScore?.toLocaleString() || "N/A",
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
          default: // Fallback if category is unknown
            embed.addFields(
              {
                name: "Detected/Input Value",
                value:
                  (
                    details.extractedRank || details.inputScore
                  )?.toLocaleString() || "N/A",
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

        embed
          .setTimestamp()
          .setFooter({ text: `Submitted by: ${interaction.user.username}` });

        // Add the note from the backend if it exists
        if (details.note) {
          embed.addFields({
            name: "⚠️ Note",
            value: details.note,
            inline: false,
          });
        }

        await interaction.editReply({ embeds: [embed], content: "" }); // Clear loading message
      } else {
        // Handle cases where backend status is not 'success' or details are missing
        console.warn(
          `[WARN] Logical error V3 or missing details for user ${
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
      // Catch unexpected errors during execution
      console.error(
        `[ERROR] UNEXPECTED ERROR V3 in /submit_prekvk for user ${interaction.user.id}:`,
        error
      );
      try {
        // Try to edit the reply if possible, otherwise send an ephemeral message
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
        // Log error if even sending the error message fails
        console.error(
          "[ERROR] Failed to send/edit reply V3 with unexpected error:",
          editError
        );
      }
    }
  },
};
