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
// Set to track channels with active registrations
const activeRegistrationChannels = new Set();
// Set global timeout (5 minutes in milliseconds)
const MESSAGE_AWAIT_TIMEOUT = 300000; // 300,000 ms = 5 minutes
const MODAL_AWAIT_TIMEOUT = 240000; // Timeout for modal submission (e.g., 4 minutes)

/**
 * Displays the registration data confirmation embed to the user.
 * (Matches original structure, translated)
 * @param {import('discord.js').ChatInputCommandInteraction | import('discord.js').Interaction} interaction - The interaction to edit or follow up on.
 * @param {object} data - The object containing collected registration data.
 * @param {boolean} [farmNeedsModalId=false] - Original flag, kept for consistency.
 */
async function showConfirmationPublic(
  interaction, // Can be original or component interaction
  data,
  farmNeedsModalId = false
) {
  // Create the confirmation embed
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xffff00) // Yellow color
    .setTitle("🔍 Confirm Registration Details") // Original title
    .addFields({
      name: "Account Type", // Original field name
      value: data.tipeAkun
        ? data.tipeAkun === "main"
          ? "Main"
          : "Farm"
        : "N/A", // Translate value
      inline: true,
    })
    .setTimestamp();

  // Add specific fields based on account type (matches original structure)
  if (data.tipeAkun === "main") {
    confirmEmbed.addFields({
      name: "Status", // Original field name
      value: data.statusMain || "N/A",
      inline: true,
    });
  } else {
    // If account type is 'farm'
    confirmEmbed.addFields({
      name: "Is Filler?", // Original field name
      value: data.isFiller === null ? "N/A" : data.isFiller ? "Yes" : "No", // Handle null case
      inline: true,
    });
    // Display the linked Main ID (matches original logic)
    if (farmNeedsModalId) {
      // This flag might not be relevant anymore if modal always follows filler selection
      confirmEmbed.addFields({
        name: "Linked Main ID",
        value: "(Will be collected via modal)", // Original text
        inline: true,
      });
    } else {
      confirmEmbed.addFields({
        name: "Linked Main ID", // Original field name
        value: data.idMainTerhubung || "N/A",
        inline: true,
      });
    }
  }

  // Add screenshot information if available (matches original structure)
  if (data.attachment) {
    confirmEmbed.addFields({
      name: "Screenshot", // Original field name
      value: `[View Attachment](${data.attachment.url})`, // Original text
    });
    confirmEmbed.setThumbnail(data.attachment.url);
  } else {
    confirmEmbed.addFields({
      name: "Screenshot",
      value: "Not provided yet.", // Original text
    });
  }

  // Create confirmation buttons (matches original structure)
  const submitButton = new ButtonBuilder()
    .setCustomId("register_confirm_submit")
    .setLabel("Submit Registration") // Original label
    .setStyle(ButtonStyle.Success);
  const backButton = new ButtonBuilder()
    .setCustomId("register_confirm_back") // Ensure this ID is handled if needed
    .setLabel("Start Over") // Original label
    .setStyle(ButtonStyle.Secondary);
  const cancelButton = new ButtonBuilder()
    .setCustomId("register_cancel")
    .setLabel("Cancel") // Original label
    .setStyle(ButtonStyle.Danger);

  // Create an action row for the buttons
  const confirmRow = new ActionRowBuilder().addComponents(
    submitButton,
    backButton, // Re-added Start Over button
    cancelButton
  );

  // Send or edit the message with the confirmation embed and buttons
  try {
    // Use editReply on the interaction that led to this confirmation
    if (
      !interaction.isRepliable() ||
      interaction.replied ||
      interaction.deferred
    ) {
      // If we can't edit the original reply (e.g., modal submit), use followUp or edit the original message if possible
      // For simplicity here, we assume editReply works on the interaction passed.
      // A more robust solution might involve fetching the original message by ID.
      if (interaction.message) {
        // If it's a component interaction with a message reference
        await interaction.message.edit({
          content: "Please review your registration details below and confirm:",
          embeds: [confirmEmbed],
          components: [confirmRow],
        });
      } else {
        // Fallback if no message reference (might happen in edge cases)
        await interaction.followUp({
          content: "Please review your registration details below and confirm:",
          embeds: [confirmEmbed],
          components: [confirmRow],
          ephemeral: false, // Make it public if following up
        });
      }
    } else {
      await interaction.editReply({
        content: "Please review your registration details below and confirm:", // Original text
        embeds: [confirmEmbed],
        components: [confirmRow], // Add the buttons
      });
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
    // Simple text error handling, matching original style but removing components
    try {
      if (interaction.message) {
        await interaction.message
          .edit({
            content: "Error displaying confirmation. Please try again.", // Original error text
            embeds: [],
            components: [], // Remove buttons on error
          })
          .catch((e) =>
            console.error("Error editing message on confirmation error:", e)
          );
      } else if (
        interaction.isRepliable() &&
        !interaction.replied &&
        !interaction.deferred
      ) {
        await interaction.reply({
          content: "Error displaying confirmation.",
          ephemeral: true,
        });
      } else if (interaction.isRepliable()) {
        await interaction.followUp({
          content: "Error displaying confirmation.",
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
  // Slash Command definition (matches original structure)
  data: new SlashCommandBuilder().setName("register").setDescription(
    "Press Enter or Send to start the interactive registration." // Original description
  ),

  /**
   * The main function executed when the /register command is run.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction.
   * @param {string} appsScriptUrl - Your Google Apps Script Web App URL.
   */
  async execute(interaction, appsScriptUrl) {
    // 'interaction' here is the original ChatInputCommandInteraction
    const channelId = interaction.channel.id;
    const userId = interaction.user.id;
    const username = interaction.user.username;

    console.log(
      `[DEBUG] ${new Date().toISOString()} - /register invoked by ${userId} (${username}) in channel ${channelId}`
    );

    // --- CHANNEL LOCK CHECK ---
    if (activeRegistrationChannels.has(channelId)) {
      await interaction.reply({
        content:
          "⚠️ Sorry, another registration process is already active in this channel. Please wait until it's completed or cancelled.", // Lock message in English
        ephemeral: true,
      });
      console.log(
        `[WARN] ${new Date().toISOString()} - /register blocked in channel ${channelId} due to active registration.`
      );
      return; // Stop execution if channel is locked
    }
    // --- END CHANNEL LOCK CHECK ---

    // If not locked, add the channel to the Set (lock the channel)
    activeRegistrationChannels.add(channelId);
    console.log(
      `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} locked for registration.`
    );

    // Use try...finally to ensure the lock is always released
    try {
      // --- START MAIN LOGIC ---

      // Defer reply (PUBLIC) to allow time for subsequent processing
      try {
        await interaction.deferReply({ ephemeral: false }); // Public
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Interaction publicly deferred in channel ${channelId}.`
        );
      } catch (deferError) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Error deferring public reply in channel ${channelId}:`,
          deferError
        );
        // Simple text error reply if possible
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content:
                "❌ Failed to start the registration process due to an internal error.", // Simple error text
              ephemeral: true,
            })
            .catch((e) =>
              console.error("Error sending initial defer error reply:", e)
            );
        }
        return; // Stop execution (finally will still run)
      }

      // --- STEP 1: ACCOUNT TYPE SELECTION (Matches original structure) ---
      const initialEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 New Account Registration") // Original title
        .setDescription(
          "Please select the type of account you want to register:" // Original description
        )
        .setTimestamp();

      const accountTypeSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_account_type") // This ID will be handled by index.js InteractionCreate
        .setPlaceholder("Select account type...") // Original placeholder
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Main Account") // Original label
            .setDescription("Register your primary account.") // Original description
            .setValue("main"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Farm Account") // Original label
            .setDescription("Register a farm account.") // Original description
            .setValue("farm")
        );

      const cancelButtonInitial = new ButtonBuilder()
        .setCustomId("register_cancel") // This ID will be handled by index.js InteractionCreate
        .setLabel("Cancel") // Original label
        .setStyle(ButtonStyle.Danger);

      const selectRow = new ActionRowBuilder().addComponents(accountTypeSelect);
      const buttonRowInitial = new ActionRowBuilder().addComponents(
        cancelButtonInitial
      );

      // Send the initial message
      let initialReply;
      try {
        initialReply = await interaction.editReply({
          embeds: [initialEmbed],
          components: [selectRow, buttonRowInitial], // Show menu and cancel button
          fetchReply: true, // Important to get the message object for the collector
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
        if (interaction.editable) {
          await interaction
            .editReply({
              content:
                "An error occurred setting up registration. Please try again.", // Original error text
              embeds: [],
              components: [],
            })
            .catch((e) =>
              console.error("Error sending initial setup error message:", e)
            );
        }
        return; // Stop execution (finally will still run)
      }

      // Interaction filter: only from the user who initiated the command
      const filter = (i) => i.user.id === userId;

      // Create a collector for message components (menu, buttons) on the INITIAL reply
      // This collector might now only be useful for overall timeout or potentially
      // handling components NOT managed by the global InteractionCreate listener (if any).
      const collector = initialReply.createMessageComponentCollector({
        filter,
        // Set a longer time for the overall process
        time: MESSAGE_AWAIT_TIMEOUT * 2, // e.g., 10 minutes total for the collector
      });

      // Object to store temporary registration data (might be less necessary here if index.js manages state)
      let registrationData = {
        discordUserId: userId,
        discordUsername: username,
        tipeAkun: null,
        statusMain: null,
        isFiller: null,
        idMainTerhubung: null,
        imageBase64: null,
        attachment: null, // Store attachment object { url: '...', contentType: '...' }
        attachmentUrl: null, // Store only URL for GAS payload
      };

      // --- COLLECTOR LOGIC ---
      collector.on("collect", async (i) => {
        // 'i' is the component/modal interaction collected on the initialReply message
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Collector collected interaction: ${
            i.customId
          } from user ${i.user.id} on message ${initialReply.id}`
        );

        // NOTE: Most component interactions (select menus, buttons defined in index.js steps)
        // will likely be handled by the global InteractionCreate listener in index.js FIRST.
        // This collector might catch them too, but the index.js handler should ideally
        // update the state and UI. This collector might primarily serve as a timeout mechanism
        // or handle components specific ONLY to the initial message (like the initial cancel button if not handled globally).

        try {
          // --- Handle interactions SPECIFIC to the initial message if not handled globally ---
          // Example: If the initial cancel button wasn't handled in index.js
          if (
            i.customId === "register_cancel" &&
            i.message.id === initialReply.id
          ) {
            console.log(`[DEBUG] Initial cancel button clicked in collector.`);
            // Defer if not already handled
            if (!i.deferred && !i.replied) await i.deferUpdate();
            // Stop the collector
            collector.stop("cancelled_initial");
            // Edit the original message (handled by index.js InteractionCreate, but added here as fallback/example)
            // await i.message.edit({ content: "Registration cancelled.", embeds: [], components: [] });
            return;
          }

          // --- REMOVED: Handling for 'register_select_account_type' ---
          // The UI update logic for this interaction is now fully handled by
          // the InteractionCreate listener in index.js calling handleAccountTypeSelection.
          /*
            if (i.customId === 'register_select_account_type') {
              // Keep track of the selected type if needed by other collector logic
              registrationData.tipeAkun = i.values[0];
              console.log(
                `[DEBUG] ${new Date().toISOString()} - Account type selected in collector: ${
                  registrationData.tipeAkun
                } by user ${userId} in channel ${channelId}. UI update handled by InteractionCreate.`
              );
  
               // --- UI UPDATE LOGIC REMOVED ---
  
              // Let the InteractionCreate listener in index.js handle the UI update.
            }
            */

          // --- REMOVED: Handling for 'register_select_main_status' ---
          // This should be handled by InteractionCreate in index.js
          /*
            else if (i.customId === 'register_select_main_status') {
               // ... logic removed ...
            }
            */

          // --- REMOVED: Handling for 'register_select_farm_filler' and subsequent modal/screenshot ---
          // This should be handled by InteractionCreate in index.js
          /*
            else if (i.customId === 'register_select_farm_filler') {
               // ... logic removed ...
            }
            */

          // --- REMOVED: Handling for 'register_confirm_submit' ---
          // This button is added by index.js later in the flow, so InteractionCreate should handle it.
          /*
             else if (i.customId === 'register_confirm_submit') {
                  // ... logic removed ...
             }
             */

          // --- REMOVED: Handling for 'register_confirm_back' / 'register_back_to_type' ---
          // These buttons are added by index.js, so InteractionCreate should handle them.
          /*
             if (
              i.customId === "register_confirm_back" ||
              i.customId === "register_back_to_type"
             ) {
                // ... logic removed ...
             }
             */

          // If the collected interaction wasn't one specifically handled above (like the initial cancel),
          // it's likely being handled by the global InteractionCreate listener. Log it.
          if (i.customId !== "register_cancel") {
            // Avoid logging cancel again if handled above
            console.log(
              `[DEBUG] Collector observed interaction ${i.customId}, assuming handled by global listener.`
            );
            // Optionally reset collector timer here if needed: collector.resetTimer();
          }
        } catch (collectError) {
          // Handle errors occurring within collector.on('collect')
          console.error(
            `[ERROR] ${new Date().toISOString()} - Error handling interaction ${
              i?.customId
            } within collector for message ${initialReply.id}:`,
            collectError
          );
          // Stop the collector on error
          collector.stop("collector_error");
        }
      }); // End collector.on('collect')

      // --- COLLECTOR END LOGIC ---
      collector.on("end", (collected, reason) => {
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Registration collector for message ${
            initialReply.id
          } ended. Reason: ${reason}. Items collected: ${collected.size}`
        );

        // Remove the channel lock regardless of the reason
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} unlocked via collector end.`
        );

        // Check if the original message still exists and hasn't been completed/cancelled by index.js
        interaction.channel.messages
          .fetch(initialReply.id)
          .then(async (finalMessageState) => {
            // Only intervene if the process seems abandoned (e.g., timeout without completion)
            // and the message still has components (indicating it wasn't finished)
            const handledReasons = [
              "processed", // Assuming index.js emits this on success
              "cancelled", // Assuming index.js emits this on user cancel
              "cancelled_initial", // Handled by collector cancel
              "collector_error", // Handled by collector error
              // Add other reasons emitted by index.js if known
            ];

            if (
              !handledReasons.includes(reason) &&
              finalMessageState.components.length > 0
            ) {
              console.log(
                `[WARN] Collector ended with reason '${reason}', attempting to clean up message ${initialReply.id}`
              );
              let endContent =
                "Registration process timed out or ended unexpectedly.";
              if (reason === "time") {
                endContent = `Registration timed out. Please use /register to try again.`;
              }
              await finalMessageState
                .edit({
                  content: endContent,
                  embeds: [],
                  components: [], // Remove components
                })
                .catch((e) =>
                  console.error(
                    `[ERROR] Failed to edit message ${initialReply.id} at collector end:`,
                    e
                  )
                );
            } else {
              console.log(
                `[DEBUG] Collector ended for message ${initialReply.id}. Reason (${reason}) indicates process likely handled elsewhere or completed.`
              );
            }
          })
          .catch((err) => {
            // Handle case where the message might have been deleted
            if (err.code === 10008) {
              // Unknown Message
              console.log(
                `[DEBUG] Collector ended for message ${initialReply.id}, but message was not found (likely deleted or process completed). Reason: ${reason}`
              );
            } else {
              console.error(
                `[ERROR] Failed to fetch message ${initialReply.id} at collector end:`,
                err
              );
            }
          });
      }); // End collector.on('end')
    } catch (error) {
      // Handle major errors outside the collector (e.g., deferReply failed)
      console.error(
        `[ERROR] ${new Date().toISOString()} - Major error during /register command execution in channel ${channelId}:`,
        error
      );
      // Ensure lock is released even if error happens before finally
      activeRegistrationChannels.delete(channelId);
      console.log(
        `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} unlocked due to major error.`
      );
      // Simple text error handling
      try {
        if (interaction.editable) {
          // If deferReply succeeded but something else failed
          await interaction.editReply({
            content:
              "An internal error occurred during the registration setup. Please try again later.", // Simple error text
            embeds: [],
            components: [], // Remove components
          });
        } else if (!interaction.replied && !interaction.deferred) {
          // If deferReply failed
          await interaction.reply({
            content: "❌ Failed to start the registration process.", // Simple error text
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
    // NOTE: The 'finally' block was removed as cleanup is now handled
    // within the collector's 'end' event and the main catch block.
  }, // End execute function
}; // End module.exports
