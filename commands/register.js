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
const activeRegistrationChannels = new Set(); // Kunci ditambahkan di sini
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
    // Check if the interaction is still valid and can be replied to or edited
    if (interaction.replied || interaction.deferred) {
      // If already replied/deferred (e.g., from deferUpdate), try editing the original message if possible
      if (interaction.message) {
        await interaction.message.edit({
          content: "Please review your registration details below and confirm:",
          embeds: [confirmEmbed],
          components: [confirmRow],
        });
      } else {
        // Fallback: Follow up if message reference isn't available
        await interaction.followUp({
          content: "Please review your registration details below and confirm:",
          embeds: [confirmEmbed],
          components: [confirmRow],
          ephemeral: false, // Make it public if following up
        });
      }
    } else if (interaction.isRepliable()) {
      // If not replied/deferred yet, use editReply (common case for initial command)
      await interaction.editReply({
        content: "Please review your registration details below and confirm:", // Original text
        embeds: [confirmEmbed],
        components: [confirmRow], // Add the buttons
      });
    } else {
      console.warn(
        `[WARN] Interaction ${interaction.id} is not repliable, deferred, or replied.`
      );
      // Cannot update the interaction directly
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
      // Attempt to edit the original message if possible
      if (interaction.message && !interaction.message.deleted) {
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
        !(interaction.replied || interaction.deferred)
      ) {
        // If interaction is fresh and hasn't been replied to
        await interaction.reply({
          content: "Error displaying confirmation.",
          ephemeral: true,
        });
      } else if (interaction.isRepliable()) {
        // If interaction was replied/deferred, follow up
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
    // KUNCI DITAMBAHKAN DI SINI
    activeRegistrationChannels.add(channelId);
    console.log(
      `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} locked for registration.`
    );

    // NOTE: The 'finally' block for releasing the lock is REMOVED here.
    // Lock release MUST be handled in index.js where the flow concludes.
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
        // --- KUNCI DIHAPUS JIKA DEFER GAGAL ---
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to defer error.`
        );
        // ---
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
        return; // Stop execution
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
        // --- KUNCI DIHAPUS JIKA EDITREPLY AWAL GAGAL ---
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to initial editReply error.`
        );
        // ---
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
        return; // Stop execution
      }

      // Interaction filter: only from the user who initiated the command
      const filter = (i) => i.user.id === userId;

      // Create a collector primarily for timeout detection on the initial message
      const collector = initialReply.createMessageComponentCollector({
        filter,
        time: MESSAGE_AWAIT_TIMEOUT * 2, // Long timeout, actual step timeouts handled in index.js
        dispose: true, // Try to clean up listeners
      });

      // --- COLLECTOR LOGIC (Minimal, mostly for logging/timeout) ---
      collector.on("collect", async (i) => {
        // Log collection but expect index.js to handle the interaction logic
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Collector observed interaction: ${
            i.customId
          } from user ${i.user.id} on message ${
            initialReply.id
          }. Expecting index.js to handle.`
        );
        // No UI updates or state changes here
      });

      // --- COLLECTOR END LOGIC ---
      collector.on("end", (collected, reason) => {
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Registration collector for message ${
            initialReply.id
          } ended. Reason: ${reason}.`
        );

        // --- PENGHAPUSAN KUNCI DIHAPUS DARI SINI ---
        // activeRegistrationChannels.delete(channelId);
        // console.log( `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} unlocked via collector end.` );
        // ---

        // Optional: Check if the message still exists and might need cleanup if timeout occurred
        // But rely on index.js to handle the primary cleanup and lock release.
        interaction.channel.messages
          .fetch(initialReply.id)
          .then((finalMessageState) => {
            if (
              reason === "time" &&
              finalMessageState?.components?.length > 0
            ) {
              console.log(
                `[WARN] Collector timed out for message ${initialReply.id}. index.js should handle final state and lock.`
              );
              // Optionally edit message here as a fallback, but index.js is preferred
              // finalMessageState.edit({ content: "Registration timed out.", embeds: [], components: [] }).catch(e => {});
            }
          })
          .catch((err) => {
            if (err.code !== 10008) {
              // Ignore "Unknown Message"
              console.error(
                `[ERROR] Failed to fetch message ${initialReply.id} at collector end:`,
                err
              );
            }
          });
      }); // End collector.on('end')
    } catch (error) {
      // Handle major errors during setup
      console.error(
        `[ERROR] ${new Date().toISOString()} - Major error during /register command execution in channel ${channelId}:`,
        error
      );
      // --- KUNCI DIHAPUS JIKA TERJADI ERROR BESAR ---
      activeRegistrationChannels.delete(channelId);
      console.log(
        `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} unlocked due to major error.`
      );
      // ---
      try {
        if (interaction.editable) {
          await interaction.editReply({
            content:
              "An internal error occurred during the registration setup. Please try again later.",
            embeds: [],
            components: [],
          });
        } else if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Failed to start the registration process.",
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
