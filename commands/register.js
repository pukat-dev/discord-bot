// register.js (Fixed Option Order, English, Non-Interactive Version)

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch v2 is installed

module.exports = {
  // Command definition with options for all inputs
  data: new SlashCommandBuilder()
    .setName("register")
    .setDescription("Registers a new main or farm account (non-interactive).")
    .addStringOption(
      (
        option // REQUIRED
      ) =>
        option
          .setName("account_type")
          .setDescription("Select the account type (main/farm)")
          .setRequired(true)
          .addChoices(
            { name: "Main", value: "main" },
            { name: "Farm", value: "farm" }
          )
    )
    .addStringOption(
      (
        option // REQUIRED
      ) =>
        option
          .setName("detail")
          .setDescription(
            "Main: Status (Old Player/Migrants), Farm: Linked Main ID"
          )
          .setRequired(true)
    )
    .addAttachmentOption(
      (
        option // REQUIRED - Moved before optional options
      ) =>
        option
          .setName("screenshot")
          .setDescription("Screenshot of your Governor Profile")
          .setRequired(true)
    )
    .addBooleanOption(
      (
        option // OPTIONAL - Moved after all required options
      ) =>
        option
          .setName("is_filler")
          .setDescription(
            "Farm Only: Is this a filler account? (Defaults to No)"
          )
          .setRequired(false)
    ), // Explicitly false, though default is false

  /**
   * Simplified execute function.
   * Directly fetches data from options and processes it.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} appsScriptUrl - The Google Apps Script Web App URL
   */
  async execute(interaction, appsScriptUrl) {
    // 1. Defer reply to allow time for processing
    await interaction.deferReply();
    console.log(`[DEBUG] Interaction deferred for non-interactive /register.`);

    // 2. Get data from Command Options
    const accountType = interaction.options.getString("account_type");
    const detail = interaction.options.getString("detail");
    // Get optional boolean AFTER required options
    const isFiller = interaction.options.getBoolean("is_filler") ?? false;
    const screenshotAttachment =
      interaction.options.getAttachment("screenshot");
    const userId = interaction.user.id;
    const username = interaction.user.username;

    console.log(
      `[DEBUG] Non-interactive /register invoked by ${userId} (${username}) with options:`,
      { accountType, detail, isFiller, screenshotUrl: screenshotAttachment.url }
    );

    // 3. Simple Input Validation
    if (accountType === "farm" && !/^\d{7,10}$/.test(detail)) {
      await interaction.editReply({
        content:
          '❌ Error: For Farm accounts, "detail" must be a valid 7-10 digit Linked Main ID.',
        ephemeral: true,
      });
      return;
    }
    const lowerDetail = detail.toLowerCase();
    if (
      accountType === "main" &&
      !["old player", "migrants"].includes(lowerDetail)
    ) {
      await interaction.editReply({
        content:
          '❌ Error: For Main accounts, "detail" must be "Old Player" or "Migrants".',
        ephemeral: true,
      });
      return;
    }
    const mainStatus =
      accountType === "main"
        ? lowerDetail === "old player"
          ? "Old Player"
          : "Migrants"
        : null;

    if (!screenshotAttachment.contentType?.startsWith("image/")) {
      await interaction.editReply({
        content: "❌ Error: The screenshot must be an image file.",
        ephemeral: true,
      });
      return;
    }

    // 4. Prepare Data Payload
    const registrationData = {
      discordUserId: userId,
      discordUsername: username,
      tipeAkun: accountType,
      attachmentUrl: screenshotAttachment.url,
      ...(accountType === "main" && { statusMain: mainStatus }),
      ...(accountType === "farm" && {
        isFiller: isFiller,
        idMainTerhubung: detail,
      }),
    };

    // 5. Display Simple Confirmation (Optional, Non-Interactive)
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(
        `⏳ Processing Registration: ${
          accountType === "main" ? "Main" : "Farm"
        }`
      )
      .setDescription("Your details are being sent to the backend...")
      .addFields(
        {
          name: "Account Type",
          value: accountType === "main" ? "Main" : "Farm",
          inline: true,
        },
        ...(accountType === "main"
          ? [
              {
                name: "Status",
                value: registrationData.statusMain,
                inline: true,
              },
            ]
          : []),
        ...(accountType === "farm"
          ? [
              {
                name: "Is Filler?",
                value: registrationData.isFiller ? "Yes" : "No",
                inline: true,
              },
              {
                name: "Linked Main ID",
                value: registrationData.idMainTerhubung,
                inline: true,
              },
            ]
          : []),
        {
          name: "Screenshot",
          value: `[View Attachment](${registrationData.attachmentUrl})`,
        }
      )
      .setThumbnail(registrationData.attachmentUrl)
      .setTimestamp()
      .setFooter({ text: "Please wait..." });

    await interaction.editReply({ embeds: [confirmEmbed] });

    // 6. Process Backend Submission (Apps Script)
    try {
      console.log(
        `[DEBUG] Fetching image from URL: ${registrationData.attachmentUrl}`
      );
      const response = await fetch(registrationData.attachmentUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch image (${response.status}): ${response.statusText}`
        );
      }
      const buffer = await response.buffer();
      const imageBase64 = buffer.toString("base64");
      console.log(
        `[DEBUG] Image fetched and converted to base64 successfully.`
      );

      const finalPayload = {
        command: "register",
        data: {
          ...registrationData,
          imageBase64: imageBase64,
        },
      };

      console.log(
        `[DEBUG] Sending non-interactive registration data to Apps Script: ${appsScriptUrl}`
      );
      const appsScriptResponse = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload),
      });

      const resultText = await appsScriptResponse.text();
      console.log(
        `[DEBUG] Apps Script Response Status: ${appsScriptResponse.status}`
      );
      console.log(`[DEBUG] Apps Script Response Text: ${resultText}`);

      if (!appsScriptResponse.ok) {
        let errorMsg = `Backend Error (${appsScriptResponse.status})`;
        try {
          const errorJson = JSON.parse(resultText);
          if (errorJson.message) {
            errorMsg += `: ${errorJson.message}`;
          } else {
            errorMsg += `: ${resultText.substring(0, 200)}`;
          }
        } catch (parseErr) {
          errorMsg += `: ${resultText.substring(0, 200)}`;
        }
        throw new Error(errorMsg);
      }

      let result;
      try {
        result = JSON.parse(resultText);
      } catch (parseError) {
        console.error(
          "[ERROR] Failed to parse successful Apps Script response:",
          parseError
        );
        console.error("[ERROR] Raw successful response text:", resultText);
        throw new Error(
          "The backend sent an invalid success response (not JSON)."
        );
      }

      // 7. Display Final Result (Success)
      if (result.status === "success" && result.details) {
        const successEmbed = new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ Registration Successful!")
          .setDescription(
            result.message ||
              "Your registration has been processed successfully."
          )
          .addFields(
            {
              name: "Governor ID",
              value: result.details.govId?.toString() || "N/A",
              inline: true,
            },
            {
              name: "Account Type",
              value: result.details.type || registrationData.tipeAkun || "N/A",
              inline: true,
            }
          );
        if (result.details.type === "main") {
          successEmbed.addFields(
            {
              name: "Status",
              value: result.details.status || "N/A",
              inline: true,
            },
            {
              name: "Target KP",
              value: result.details.targetKP?.toLocaleString() || "N/A",
              inline: true,
            },
            {
              name: "Target Deaths",
              value: result.details.targetDeath?.toLocaleString() || "N/A",
              inline: true,
            }
          );
        } else if (result.details.type === "farm") {
          successEmbed.addFields(
            {
              name: "Is Filler?",
              value: result.details.isFiller ? "Yes" : "No",
              inline: true,
            },
            {
              name: "Linked Main ID",
              value: result.details.linkedMainId || "N/A",
              inline: true,
            }
          );
        }
        successEmbed.setTimestamp();
        await interaction.followUp({ embeds: [successEmbed] });
        console.log(
          `[INFO] Non-interactive registration successful for user ${userId}.`
        );
      } else {
        console.error(
          "[ERROR] Registration failed according to Apps Script response:",
          result
        );
        throw new Error(
          `Registration Failed: ${
            result.message || "Unknown error from the backend system."
          }`
        );
      }
    } catch (error) {
      // 8. Handle Errors during backend process or others
      console.error(
        "[ERROR] Error processing non-interactive registration:",
        error
      );
      const errorMessage = `❌ An error occurred while processing your registration: ${error.message}`;
      try {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } catch (followUpError) {
        console.error("[ERROR] Failed to send error follow-up:", followUpError);
        await interaction
          .editReply({ content: errorMessage, embeds: [], components: [] })
          .catch((editErr) =>
            console.error(
              "[ERROR] Failed to edit reply with error message:",
              editErr
            )
          );
      }
    }
  }, // End execute
}; // End module.exports
