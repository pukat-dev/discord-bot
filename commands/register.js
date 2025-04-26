// Import necessary modules from discord.js and node-fetch
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder, // Although not used directly here, might be useful later
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  InteractionType,
} = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch v2 is installed (npm install node-fetch@2)

// --- CHANNEL LOCK & TIMEOUT ---
// REMOVED: const activeRegistrationChannels = new Set();
// The Set is now managed centrally in index.js and passed as an argument.

// Set global timeout (5 minutes in milliseconds) - Adjust as needed
const MESSAGE_AWAIT_TIMEOUT = 300000; // 300,000 ms = 5 minutes
const MODAL_AWAIT_TIMEOUT = 240000; // Timeout for modal submission (e.g., 4 minutes)

/**
 * Displays the registration data confirmation embed to the user.
 * @param {import('discord.js').ChatInputCommandInteraction | import('discord.js').Interaction} interaction
 * @param {object} data
 * @param {boolean} [farmNeedsModalId=false]
 */
async function showConfirmationPublic(
  interaction,
  data,
  farmNeedsModalId = false
) {
  // Create the confirmation embed in English
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xffff00)
    .setTitle("🔍 Confirm Registration Details") // English Title
    .addFields({
      name: "Account Type", // English Field
      value: data.tipeAkun
        ? data.tipeAkun === "main"
          ? "Main"
          : "Farm"
        : "N/A",
      inline: true,
    })
    .setTimestamp();

  // Add specific fields based on account type
  if (data.tipeAkun === "main") {
    confirmEmbed.addFields({
      name: "Status",
      value: data.statusMain || "N/A",
      inline: true,
    });
  } else {
    confirmEmbed.addFields({
      name: "Is Filler?", // English Field
      value: data.isFiller === null ? "N/A" : data.isFiller ? "Yes" : "No", // English Value
      inline: true,
    });
    // Display the linked Main ID
    if (farmNeedsModalId) {
      confirmEmbed.addFields({
        name: "Linked Main ID", // English Field
        value: "(Will be collected via modal)", // English Text
        inline: true,
      });
    } else {
      confirmEmbed.addFields({
        name: "Linked Main ID", // English Field
        value: data.idMainTerhubung || "N/A",
        inline: true,
      });
    }
  }

  // Add screenshot information if available
  if (data.attachment) {
    confirmEmbed.addFields({
      name: "Screenshot",
      value: `[View Attachment](${data.attachment.url})`, // English Text
    });
    confirmEmbed.setThumbnail(data.attachment.url);
  } else {
    confirmEmbed.addFields({
      name: "Screenshot",
      value: "Not provided yet.", // English Text
    });
  }

  // Create confirmation buttons in English
  const submitButton = new ButtonBuilder()
    .setCustomId("register_confirm_submit")
    .setLabel("Submit Registration") // English Label
    .setStyle(ButtonStyle.Success);
  const backButton = new ButtonBuilder()
    .setCustomId("register_confirm_back")
    .setLabel("Start Over") // English Label
    .setStyle(ButtonStyle.Secondary);
  const cancelButton = new ButtonBuilder()
    .setCustomId("register_cancel")
    .setLabel("Cancel") // English Label
    .setStyle(ButtonStyle.Danger);

  const confirmRow = new ActionRowBuilder().addComponents(
    submitButton,
    backButton,
    cancelButton
  );

  // Send or edit the message with the confirmation embed and buttons
  try {
    const confirmationMessage =
      "Please review your registration details below and confirm:"; // English Text
    if (interaction.replied || interaction.deferred) {
      if (interaction.message) {
        await interaction.message.edit({
          content: confirmationMessage,
          embeds: [confirmEmbed],
          components: [confirmRow],
        });
      } else {
        await interaction.followUp({
          content: confirmationMessage,
          embeds: [confirmEmbed],
          components: [confirmRow],
          ephemeral: false,
        });
      }
    } else if (interaction.isRepliable()) {
      await interaction.editReply({
        content: confirmationMessage,
        embeds: [confirmEmbed],
        components: [confirmRow],
      });
    } else {
      console.warn(
        `[WARN] Interaction ${interaction.id} is not repliable, deferred, or replied.`
      );
    }
    console.log(
      `[DEBUG] ${new Date().toISOString()} - Public confirmation message shown/edited in channel ${
        interaction.channel?.id
      }.`
    );
  } catch (editError) {
    console.error(
      `[ERROR] ${new Date().toISOString()} - Failed to show public confirmation in channel ${
        interaction.channel?.id
      }:`,
      editError
    );
    // Simple text error handling in English
    const errorMessage = "Error displaying confirmation. Please try again."; // English Text
    try {
      if (interaction.message && !interaction.message.deleted) {
        await interaction.message
          .edit({
            content: errorMessage,
            embeds: [],
            components: [],
          })
          .catch((e) =>
            console.error("Error editing message on confirmation error:", e)
          );
      } else if (
        interaction.isRepliable() &&
        !(interaction.replied || interaction.deferred)
      ) {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      } else if (interaction.isRepliable()) {
        await interaction.followUp({
          content: errorMessage,
          ephemeral: true,
        });
      }
    } catch (e) {
      console.error("Error sending confirmation error message:", e);
    }
  }
}

// Export the command module
module.exports = {
  // Command definition in English
  data: new SlashCommandBuilder().setName("register").setDescription(
    "Press Enter or Send to start the interactive registration." // English description
  ),

  /**
   * The main function executed when the /register command is run.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   * @param {string} appsScriptUrl
   * @param {Set<string>} activeRegistrationChannels
   */
  async execute(interaction, appsScriptUrl, activeRegistrationChannels) {
    const channelId = interaction.channel.id;
    const userId = interaction.user.id;
    const username = interaction.user.username;

    console.log(
      `[DEBUG] ${new Date().toISOString()} - /register invoked by ${userId} (${username}) in channel ${channelId}`
    );

    // Channel lock check with English message
    if (activeRegistrationChannels.has(channelId)) {
      await interaction.reply({
        content:
          "⚠️ Sorry, another registration process is already active in this channel. Please wait until it's completed or cancelled.", // English Lock message
        ephemeral: true,
      });
      console.log(
        `[WARN] ${new Date().toISOString()} - /register blocked in channel ${channelId} due to active registration (checked shared Set).`
      );
      return;
    }

    activeRegistrationChannels.add(channelId);
    console.log(
      `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} locked for registration (added to shared Set).`
    );

    try {
      // Defer reply
      try {
        await interaction.deferReply({ ephemeral: false });
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Interaction publicly deferred in channel ${channelId}.`
        );
      } catch (deferError) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Error deferring public reply in channel ${channelId}:`,
          deferError
        );
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to defer error (in register.js).`
        );
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content:
                "❌ Failed to start the registration process due to an internal error.", // English Error text
              ephemeral: true,
            })
            .catch((e) =>
              console.error("Error sending initial defer error reply:", e)
            );
        }
        return;
      }

      // Initial embed in English
      const initialEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 New Account Registration") // English Title
        .setDescription(
          "Please select the type of account you want to register:" // English Description
        )
        .setTimestamp();

      // Account type select menu in English
      const accountTypeSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_account_type")
        .setPlaceholder("Select account type...") // English Placeholder
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Main Account") // English Label
            .setDescription("Register your primary account.") // English Description
            .setValue("main"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Farm Account") // English Label
            .setDescription("Register a farm account.") // English Description
            .setValue("farm")
        );

      // Cancel button in English
      const cancelButtonInitial = new ButtonBuilder()
        .setCustomId("register_cancel")
        .setLabel("Cancel") // English Label
        .setStyle(ButtonStyle.Danger);

      const selectRow = new ActionRowBuilder().addComponents(accountTypeSelect);
      const buttonRowInitial = new ActionRowBuilder().addComponents(
        cancelButtonInitial
      );

      // Send initial message
      let initialReply;
      try {
        initialReply = await interaction.editReply({
          embeds: [initialEmbed],
          components: [selectRow, buttonRowInitial],
          fetchReply: true,
        });
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Initial public registration message sent in channel ${channelId}. Message ID: ${
            initialReply.id
          }`
        );
      } catch (editErr) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Failed to send initial registration message in channel ${channelId}:`,
          editErr
        );
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to initial editReply error (in register.js).`
        );
        if (interaction.editable) {
          await interaction
            .editReply({
              content:
                "An error occurred while setting up registration. Please try again.", // English Error text
              embeds: [],
              components: [],
            })
            .catch((e) =>
              console.error("Error sending initial setup error message:", e)
            );
        }
        return;
      }

      // Interaction filter
      const filter = (i) => i.user.id === userId;

      // Collector setup
      const collector = initialReply.createMessageComponentCollector({
        filter,
        time: MESSAGE_AWAIT_TIMEOUT,
        dispose: true,
      });

      // Collector collect event (logging only)
      collector.on("collect", async (i) => {
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Collector (in register.js) observed interaction: ${
            i.customId
          } from user ${i.user.id} on message ${
            initialReply.id
          }. Expecting index.js to handle.`
        );
      });

      // Collector end event (handles timeout)
      collector.on("end", (collected, reason) => {
        const messageId = initialReply.id;
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Registration collector (in register.js) for message ${messageId} ended. Reason: ${reason}.`
        );

        // Handle Timeout Explicitly
        if (reason === "time") {
          console.log(
            `[INFO] Registration process timed out for message ${messageId} in channel ${channelId}.`
          );

          // Unlock channel if still locked
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId);
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to timeout (collector end in register.js).`
            );
          } else {
            console.log(
              `[DEBUG] Channel ${channelId} was already unlocked when collector timed out (message ${messageId}).`
            );
          }

          // Edit the original message to indicate timeout in English
          interaction.channel.messages
            .fetch(messageId)
            .then(async (finalMessageState) => {
              if (
                finalMessageState &&
                finalMessageState.components.length > 0
              ) {
                await finalMessageState
                  .edit({
                    content: `⏰ This registration has expired due to inactivity. Please start over using /register.`, // English timeout message
                    embeds: [],
                    components: [],
                  })
                  .catch((e) =>
                    console.error(
                      `[ERROR] Failed to edit message ${messageId} on timeout:`,
                      e
                    )
                  );
                console.log(
                  `[DEBUG] Edited message ${messageId} to show timeout.`
                );
              } else {
                console.log(
                  `[DEBUG] Message ${messageId} either deleted or already completed/cancelled. No timeout edit needed.`
                );
              }
            })
            .catch((err) => {
              if (err.code === 10008) {
                // Unknown Message
                console.log(
                  `[DEBUG] Original message ${messageId} not found for timeout edit (likely deleted).`
                );
              } else {
                console.error(
                  `[ERROR] Failed to fetch message ${messageId} at collector end for timeout edit:`,
                  err
                );
              }
            });
        }
      }); // End collector.on('end')
    } catch (error) {
      // Handle major errors during setup
      console.error(
        `[ERROR] ${new Date().toISOString()} - Major error during /register command execution in channel ${channelId}:`,
        error
      );
      activeRegistrationChannels.delete(channelId);
      console.log(
        `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} unlocked due to major error (in register.js).`
      );
      // Send error feedback in English
      try {
        const majorErrorMessage =
          "An internal error occurred during the registration setup. Please try again later."; // English Error text
        if (interaction.editable) {
          await interaction.editReply({
            content: majorErrorMessage,
            embeds: [],
            components: [],
          });
        } else if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Failed to start the registration process.", // English Error text
            ephemeral: true,
          });
        }
      } catch (e) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Failed to send final error feedback message:`,
          e
        );
      }
    }
  }, // End execute function
}; // End module.exports
