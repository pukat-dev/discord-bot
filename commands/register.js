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
  MessageFlags, // Import MessageFlags
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
 * (Function remains the same as previous English version)
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
          // ephemeral: false, // Default is non-ephemeral
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
          flags: [MessageFlags.Ephemeral], // Use flags
        });
      } else if (interaction.isRepliable()) {
        // If interaction was replied/deferred, follow-up
        await interaction.followUp({
          content: errorMessage,
          flags: [MessageFlags.Ephemeral], // Use flags
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
        flags: [MessageFlags.Ephemeral], // Use flags
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
      // Defer reply (publicly)
      try {
        // Public defer, no ephemeral needed. Acknowledge interaction quickly.
        await interaction.deferReply();
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Interaction publicly deferred in channel ${channelId}.`
        );
      } catch (deferError) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Error deferring public reply in channel ${channelId}:`,
          deferError // Log the actual error object
        );
        // Unlock channel if defer fails
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to defer error (in register.js).`
        );

        // If defer fails, the interaction is likely invalid. Try sending a channel message instead of replying/following up.
        // Check if the error indicates the interaction was already acknowledged or unknown
        if (deferError.code === 40060 || deferError.code === 10062) {
          console.warn(
            `[WARN] Initial defer failed (Code: ${deferError.code}). Interaction likely already acknowledged or unknown.`
          );
          // Optionally try sending a message to the channel if appropriate
          try {
            await interaction.channel.send({
              content: `⚠️ Could not start registration for ${interaction.user}. The interaction might have expired or been acknowledged elsewhere. Please try /register again.`,
            });
          } catch (sendError) {
            console.error(
              "[ERROR] Failed to send channel message after defer failure:",
              sendError
            );
          }
        } else if (!interaction.replied && !interaction.deferred) {
          // For other defer errors, attempt an ephemeral reply if possible (though likely to fail if interaction is broken)
          try {
            await interaction.reply({
              content:
                "❌ Failed to start the registration process due to an internal error.", // English Error text
              flags: [MessageFlags.Ephemeral], // Use flags
            });
          } catch (replyError) {
            console.error(
              "[ERROR] Failed to send ephemeral reply after other defer error:",
              replyError
            );
            // Fallback: Try sending a message to the channel
            try {
              await interaction.channel.send({
                content: `❌ An internal error occurred starting registration for ${interaction.user}. Please try again later.`,
              });
            } catch (sendError) {
              console.error(
                "[ERROR] Failed to send channel message after reply failure:",
                sendError
              );
            }
          }
        } else {
          // If already replied/deferred somehow, log it.
          console.warn(
            `[WARN] Interaction ${interaction.id} was already replied/deferred when initial defer failed with code ${deferError.code}.`
          );
        }
        return; // Stop execution if defer fails
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

      // Send initial message (edit the deferred reply)
      let initialReply;
      try {
        initialReply = await interaction.editReply({
          embeds: [initialEmbed],
          components: [selectRow, buttonRowInitial],
          fetchReply: true, // Get the message object for the collector
        });
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Initial public registration message sent in channel ${channelId}. Message ID: ${
            initialReply.id
          }`
        );
      } catch (editErr) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Failed to send initial registration message (editReply) in channel ${channelId}:`,
          editErr
        );
        // Unlock channel if editReply fails
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to initial editReply error (in register.js).`
        );
        // Attempt to edit the reply again with an error message if possible
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
        return; // Stop execution
      }

      // Interaction filter
      const filter = (i) => i.user.id === userId;

      // Collector setup - ONLY for timeout detection on the initial message
      const collector = initialReply.createMessageComponentCollector({
        filter, // Filter still useful for timeout logic if needed, but doesn't handle interactions
        time: MESSAGE_AWAIT_TIMEOUT,
        dispose: true,
      });

      // REMOVED collector.on('collect') to prevent double acknowledgements.
      // All component interaction handling MUST be in index.js's InteractionCreate listener.

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

          // Unlock channel if still locked (check using the passed Set)
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId);
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to timeout (collector end in register.js).`
            );
          } else {
            console.log(
              `[DEBUG] Channel ${channelId} was already unlocked when collector timed out (message ${messageId}).`
            );
            // Note: State in index.js might still exist and needs separate cleanup if timeout isn't handled there too.
          }

          // Edit the original message to indicate timeout in English
          // Use interaction.channel.messages.fetch as initialReply might be outdated
          interaction.channel.messages
            .fetch(messageId)
            .then(async (finalMessageState) => {
              // Check if the message still exists and has components (indicating it wasn't completed/cancelled)
              if (
                finalMessageState &&
                finalMessageState.components.length > 0
              ) {
                await finalMessageState
                  .edit({
                    content: `⏰ This registration has expired due to inactivity. Please start over using /register.`, // English timeout message
                    embeds: [],
                    components: [], // Remove components
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
                // Message might have been deleted or components removed by successful completion/cancellation in index.js
                console.log(
                  `[DEBUG] Message ${messageId} components already removed or message deleted. No timeout edit needed.`
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
        // Other 'end' reasons (like 'messageDelete') don't require specific action here now.
      }); // End collector.on('end')
    } catch (error) {
      // Handle major errors during setup
      console.error(
        `[ERROR] ${new Date().toISOString()} - Major error during /register command execution in channel ${channelId}:`,
        error
      );
      // Unlock channel on major error
      activeRegistrationChannels.delete(channelId);
      console.log(
        `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} unlocked due to major error (in register.js).`
      );
      // Send error feedback in English
      try {
        const majorErrorMessage =
          "An internal error occurred during the registration setup. Please try again later."; // English Error text
        if (interaction.editable) {
          // Try editing the potentially deferred reply
          await interaction.editReply({
            content: majorErrorMessage,
            embeds: [],
            components: [],
          });
        } else if (
          !interaction.replied &&
          !interaction.deferred &&
          interaction.isRepliable()
        ) {
          // If not deferred/replied yet, send an ephemeral reply
          await interaction.reply({
            content: "❌ Failed to start the registration process.", // English Error text
            flags: [MessageFlags.Ephemeral], // Use flags
          });
        } else {
          // If already replied/deferred or not repliable, try sending to channel
          await interaction.channel
            .send({
              content: `❌ An internal error occurred starting registration for ${interaction.user}. Please try again later.`,
            })
            .catch((e) =>
              console.error(
                "[ERROR] Failed to send channel message on major error:",
                e
              )
            );
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
