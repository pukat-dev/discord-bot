// index.js (Complete English Version with Interaction Fixes)
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageType, // Keep this for message reply check
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags, // Ensure MessageFlags is imported
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const fetch = require("node-fetch");

// State management
const registrationState = new Map();
// Central channel lock management
const activeRegistrationChannels = new Set();

// Load Credentials & Configuration
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;

// Basic validation for environment variables
if (!token) {
  console.error("Error: DISCORD_BOT_TOKEN not found!");
  process.exit(1);
}
if (!clientId) {
  console.error("Error: DISCORD_CLIENT_ID not found!");
}
if (!appsScriptUrl) {
  console.error("Error: APPS_SCRIPT_WEB_APP_URL not found!");
}

// Create a new Discord Client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Ensure this is enabled in Developer Portal
  ],
});

// --- IMPORTANT: Error Handler for the Client ---
client.on(Events.Error, (error) => {
  console.error("!!! DISCORD CLIENT ERROR !!!:", error);
});
// --- END Error Handler ---

// Setup Command Handling
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
try {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
      console.log(`[INFO] Loaded command: ${command.data.name}`);
    } else {
      console.log(
        `[WARN] Command at ${filePath} is missing "data" or "execute".`
      );
    }
  }
} catch (error) {
  console.error("Error reading commands folder:", error);
}

// Event Listener: Bot Ready
client.once(Events.ClientReady, (readyClient) => {
  console.log(`>>> Bot Ready! Logged in as ${readyClient.user.tag} <<<`);
});

// Function to handle logic after account type selection
async function handleAccountTypeSelection(interaction, selectedType, stateMap) {
  console.log(
    `[Function] handleAccountTypeSelection called for type: ${selectedType}`
  );
  const channelId = interaction.channel?.id;
  const messageId = interaction.message.id; // Get messageId for state

  try {
    // Interaction should already be deferred (deferUpdate) before calling this

    let nextEmbed;
    let componentsRow1;
    let componentsRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("register_back_to_type")
        .setLabel("Back")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("register_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
    );

    // Update state (assuming previous step was selecting type)
    stateMap.set(messageId, {
      step: "select_status_or_filler", // Next expected step
      userId: interaction.user.id,
      accountType: selectedType,
      channelId: channelId,
    });
    console.log(
      `[DEBUG] State updated for message ${messageId}:`,
      stateMap.get(messageId)
    );

    // Build UI for the next step
    if (selectedType === "main") {
      nextEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 Register Main Account")
        .setDescription("Please select your account status:")
        .setTimestamp();
      const statusSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_main_status")
        .setPlaceholder("Select status...")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("DKP 2921 Old Player")
            .setValue("Old Player"),
          new StringSelectMenuOptionBuilder()
            .setLabel("DKP Migrants")
            .setValue("Migrants")
        );
      componentsRow1 = new ActionRowBuilder().addComponents(statusSelect);
    } else if (selectedType === "farm") {
      nextEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 Register Farm Account")
        .setDescription('Is this farm account a designated "Filler Account"?')
        .setTimestamp();
      const fillerSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_filler_status")
        .setPlaceholder("Is this a filler account?")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Yes")
            .setDescription("This farm will be used as a filler.")
            .setValue("true"),
          new StringSelectMenuOptionBuilder()
            .setLabel("No")
            .setDescription("This farm is NOT a filler.")
            .setValue("false")
        );
      componentsRow1 = new ActionRowBuilder().addComponents(fillerSelect);
    } else {
      // This case should ideally not be reached if interaction handling is correct
      console.error(
        `[ERROR] Unknown selectedType in handleAccountTypeSelection: ${selectedType}`
      );
      await interaction.editReply({
        content: "An unexpected error occurred processing the account type.",
        embeds: [],
        components: [],
      });
      if (channelId && activeRegistrationChannels.has(channelId)) {
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to unknown account type.`
        );
      }
      stateMap.delete(messageId); // Clean up state
      return;
    }

    // Edit the original reply (interaction is already deferred)
    await interaction.editReply({
      embeds: [nextEmbed],
      components: [componentsRow1, componentsRow2],
    });
    console.log(
      `[DEBUG] Interaction reply edited for ${interaction.id} (handleAccountTypeSelection).`
    );
  } catch (error) {
    console.error(
      `[ERROR] Error in handleAccountTypeSelection (interaction: ${interaction.id}, type: ${selectedType}):`,
      error
    );
    // --- UNLOCK ON ERROR ---
    if (channelId && activeRegistrationChannels.has(channelId)) {
      activeRegistrationChannels.delete(channelId);
      console.log(
        `[DEBUG] Channel ${channelId} unlocked due to error in handleAccountTypeSelection.`
      );
    }
    stateMap.delete(messageId); // Clean up state
    // ---
    // Attempt to inform the user using followUp since interaction was deferred
    try {
      await interaction.followUp({
        content: "An error occurred while processing your selection.",
        flags: [MessageFlags.Ephemeral],
      });
    } catch (followUpError) {
      console.error(
        "[ERROR] Failed to send followup on handleAccountTypeSelection error:",
        followUpError
      );
    }
  }
}

// Event Listener: Interaction Created (Handles commands AND components)
client.on(Events.InteractionCreate, async (interaction) => {
  const channelId = interaction.channel?.id;
  const userId = interaction.user.id;

  // Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`[ERROR] Command ${interaction.commandName} not found.`);
      try {
        await interaction.reply({
          content: `Command '${interaction.commandName}' not found.`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (replyError) {
        console.error(
          "[ERROR] Failed to send command not found reply:",
          replyError
        );
      }
      return;
    }
    try {
      if (interaction.commandName === "register") {
        await command.execute(
          interaction,
          appsScriptUrl,
          activeRegistrationChannels
        );
      } else {
        await command.execute(interaction, appsScriptUrl); // Pass url to other commands if needed
      }
    } catch (error) {
      console.error(
        `[ERROR] Error executing command ${interaction.commandName}:`,
        error
      );
      if (
        interaction.commandName === "register" &&
        channelId &&
        activeRegistrationChannels.has(channelId)
      ) {
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to command execution error.`
        );
      }
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Error executing this command!",
            flags: [MessageFlags.Ephemeral],
          });
        } else {
          await interaction.reply({
            content: "Error executing this command!",
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send command execution error reply:",
          errorReplyError
        );
      }
    }
    return; // End ChatInputCommand handling
  }

  // Handle String Select Menu Interactions
  if (interaction.isStringSelectMenu()) {
    const selectedValue = interaction.values[0];
    const messageId = interaction.message.id;
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Select Menu Interaction received: ${customId} (interaction: ${interaction.id}, message: ${messageId})`
    );

    // --- State Check ---
    const currentState = registrationState.get(messageId);
    if (!currentState || currentState.userId !== userId) {
      console.warn(
        `[WARN] State/User mismatch for ${customId}: ${messageId}. Ignoring.`
      );
      try {
        // Try to send an ephemeral message without acknowledging again
        await interaction.reply({
          content:
            "This registration menu is no longer valid or belongs to another user. Please start over.",
          flags: [MessageFlags.Ephemeral],
        });
      } catch (replyError) {
        // If reply fails (e.g., already ack'd), log it but don't crash
        console.error(
          `[ERROR] Failed to send ephemeral reply for state mismatch (${customId}):`,
          replyError
        );
      }
      return; // Stop processing
    }
    // --- End State Check ---

    try {
      // --- Defer Update ---
      // Defer immediately after state check passes
      await interaction.deferUpdate();
      console.log(
        `[DEBUG] Interaction ${customId} (${interaction.id}) deferred successfully.`
      );
      // --- End Defer ---

      // Process based on customId
      if (customId === "register_select_account_type") {
        // Check step before processing
        if (currentState.step !== undefined && currentState.step !== null) {
          // Should be null/undefined at initial step
          console.warn(
            `[WARN] Unexpected step (${currentState.step}) for ${customId}. Resetting flow.`
          );
          // Optionally reset UI here or just ignore
        }
        await handleAccountTypeSelection(
          interaction,
          selectedValue,
          registrationState
        );
      } else if (customId === "register_select_main_status") {
        // Validate step
        if (currentState.step !== "select_status_or_filler") {
          console.warn(
            `[WARN] Step mismatch for ${customId}: Expected 'select_status_or_filler', got '${currentState.step}'. Message: ${messageId}`
          );
          await interaction.followUp({
            content: "Registration flow error. Please start over.",
            flags: [MessageFlags.Ephemeral],
          }); // Use followUp
          activeRegistrationChannels.delete(channelId);
          registrationState.delete(messageId); // Unlock and clear state
          return;
        }
        // Update state
        currentState.status = selectedValue;
        currentState.step = "awaiting_screenshot"; // Next step
        registrationState.set(messageId, currentState);

        // Prepare next step UI
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle(`📝 Register Main Account (${selectedValue})`)
          .setDescription(
            `Status selected: **${selectedValue}**. \n\nNext, please **REPLY TO THIS MESSAGE** with the **screenshot of your Governor Profile**.`
          )
          .addFields(
            {
              name: "Account Type",
              value: currentState.accountType,
              inline: true,
            },
            { name: "Status", value: selectedValue, inline: true }
          )
          .setFooter({
            text: `Awaiting screenshot reply for message ID: ${messageId}`,
          })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("register_cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger)
        );
        // Edit the deferred reply
        await interaction.editReply({
          content: "",
          embeds: [embed],
          components: [row],
        });
        console.log(`[DEBUG] Edited reply for ${customId}.`);
      } else if (customId === "register_select_filler_status") {
        // Validate step
        if (currentState.step !== "select_status_or_filler") {
          console.warn(
            `[WARN] Step mismatch for ${customId}: Expected 'select_status_or_filler', got '${currentState.step}'. Message: ${messageId}`
          );
          await interaction.followUp({
            content: "Registration flow error. Please start over.",
            flags: [MessageFlags.Ephemeral],
          }); // Use followUp
          activeRegistrationChannels.delete(channelId);
          registrationState.delete(messageId); // Unlock and clear state
          return;
        }
        // Update state
        currentState.isFiller = selectedValue === "true";
        currentState.step = "awaiting_main_id_modal"; // Next step
        registrationState.set(messageId, currentState);

        // Create and show the modal
        const modal = new ModalBuilder()
          .setCustomId(`register_farm_modal_${userId}_${messageId}`)
          .setTitle("Register Farm Account");
        const mainIdInput = new TextInputBuilder()
          .setCustomId("register_main_id_input")
          .setLabel("Enter Linked Main Account Governor ID")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g., 123456789")
          .setRequired(true)
          .setMinLength(7)
          .setMaxLength(10);
        const actionRow = new ActionRowBuilder().addComponents(mainIdInput);
        modal.addComponents(actionRow);

        // Show the modal (this acknowledges the original select menu interaction via deferUpdate,
        // and the modal submission will be a NEW interaction)
        await interaction.showModal(modal);
        console.log(
          `[DEBUG] Modal shown for ${customId} (interaction: ${interaction.id}). Select Menu interaction acknowledged via deferUpdate.`
        );
      }
      // Add handlers for other select menus if needed
    } catch (error) {
      console.error(
        `[ERROR] Error handling select menu ${customId} (${interaction.id}):`,
        error
      );
      // --- UNLOCK CHANNEL ON ERROR ---
      if (
        currentState &&
        channelId === currentState.channelId &&
        activeRegistrationChannels.has(channelId)
      ) {
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to select menu error.`
        );
      }
      registrationState.delete(messageId); // Clean up state too
      // ---
      // Send error feedback using followUp
      try {
        await interaction.followUp({
          content: "An error occurred processing your selection.",
          flags: [MessageFlags.Ephemeral],
        });
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send select menu error followup:",
          errorReplyError
        );
      }
    }
    return; // End StringSelectMenu handling
  }

  // Handle Button Interactions
  if (interaction.isButton()) {
    const messageId = interaction.message.id;
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Button Interaction received: ${customId} (interaction: ${interaction.id}, message: ${messageId})`
    );
    const currentState = registrationState.get(messageId); // Get state early for checks

    // --- State and User Check (Optional but recommended for buttons too) ---
    if (
      customId !== "register_cancel" &&
      (!currentState || currentState.userId !== userId)
    ) {
      console.warn(
        `[WARN] State/User mismatch for button ${customId}: ${messageId}. Ignoring.`
      );
      try {
        await interaction.reply({
          content: "This button is no longer valid or belongs to another user.",
          flags: [MessageFlags.Ephemeral],
        });
      } catch (replyError) {
        console.error(
          `[ERROR] Failed to send ephemeral reply for button state mismatch (${customId}):`,
          replyError
        );
      }
      return; // Stop processing
    }
    // --- End State Check ---

    try {
      // Defer update immediately
      await interaction.deferUpdate();
      console.log(
        `[DEBUG] Button Interaction ${customId} (${interaction.id}) deferred.`
      );

      if (customId === "register_cancel") {
        // Edit the message first
        await interaction.editReply({
          content: "❌ Registration process cancelled.",
          embeds: [],
          components: [],
        });
        console.log(`[DEBUG] Edited message ${messageId} for cancellation.`);

        // --- UNLOCK CHANNEL & CLEAN STATE ON CANCEL ---
        // Use channelId from interaction if available, fallback to state if needed
        const effectiveChannelId = channelId || currentState?.channelId;
        if (effectiveChannelId) {
          if (activeRegistrationChannels.has(effectiveChannelId)) {
            activeRegistrationChannels.delete(effectiveChannelId);
            console.log(
              `[DEBUG] Channel ${effectiveChannelId} unlocked due to user cancellation.`
            );
          } else {
            console.log(
              `[DEBUG] Channel ${effectiveChannelId} was already unlocked when cancel was processed.`
            );
          }
        } else {
          console.warn(
            `[WARN] Could not determine channelId to unlock for cancel interaction ${interaction.id}.`
          );
        }
        // Always try to delete state for this message
        if (registrationState.has(messageId)) {
          registrationState.delete(messageId);
          console.log(
            `[DEBUG] State for message ${messageId} deleted due to cancellation.`
          );
        }
        // ---
      } else if (customId === "register_back_to_type") {
        // Validate step before going back
        if (!currentState || currentState.step !== "select_status_or_filler") {
          console.warn(
            `[WARN] Back button clicked at unexpected step: ${currentState?.step}. Message: ${messageId}`
          );
          await interaction.followUp({
            content: "Cannot go back from this step.",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }
        // Delete current state when going back
        registrationState.delete(messageId);
        console.log(
          `[DEBUG] State deleted for message ${messageId} due to 'Back' button.`
        );
        // Rebuild the initial step UI
        const initialEmbed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle("📝 New Account Registration")
          .setDescription(
            "Please select the type of account you want to register:"
          )
          .setTimestamp();
        const accountTypeSelect = new StringSelectMenuBuilder()
          .setCustomId("register_select_account_type")
          .setPlaceholder("Select account type...")
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("Main Account")
              .setValue("main"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Farm Account")
              .setValue("farm")
          );
        const cancelButton = new ButtonBuilder()
          .setCustomId("register_cancel")
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger);
        const selectRow = new ActionRowBuilder().addComponents(
          accountTypeSelect
        );
        const buttonRow = new ActionRowBuilder().addComponents(cancelButton);
        // Edit the deferred reply
        await interaction.editReply({
          content: null,
          embeds: [initialEmbed],
          components: [selectRow, buttonRow],
        });
        console.log(`[DEBUG] Edited reply for ${customId}.`);
      } else if (customId === "register_confirm_submit") {
        // Validate step
        if (!currentState || currentState.step !== "confirming_details") {
          console.warn(
            `[WARN] Submit button clicked at unexpected step: ${currentState?.step}. Message: ${messageId}`
          );
          await interaction.followUp({
            content: "Cannot submit from this step. Please review the process.",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        // Show processing message
        await interaction.editReply({
          content: "⏳ Submitting registration to backend...",
          embeds: [],
          components: [],
        });

        // Prepare final payload for Apps Script
        let finalPayload;
        let imageBase64 = "";
        if (currentState.attachment) {
          try {
            imageBase64 = await imageToBase64(currentState.attachment.url);
          } catch (imgErr) {
            console.error(
              "[ERROR] Failed to convert image on final submit:",
              imgErr
            );
            await interaction.editReply({
              content: `❌ Error processing screenshot: ${imgErr.message}. Registration cancelled.`,
            });
            activeRegistrationChannels.delete(channelId);
            registrationState.delete(messageId); // Unlock & clear
            return;
          }
        } else {
          await interaction.editReply({
            content: `❌ Error: Screenshot data missing before final submission. Registration cancelled.`,
          });
          activeRegistrationChannels.delete(channelId);
          registrationState.delete(messageId); // Unlock & clear
          return;
        }

        finalPayload = {
          command: "register",
          data: {
            discordUserId: currentState.userId,
            discordUsername: interaction.user.username, // Get username from current interaction
            tipeAkun: currentState.accountType,
            ...(currentState.accountType === "main" && {
              statusMain: currentState.status,
            }),
            ...(currentState.accountType === "farm" && {
              isFiller: currentState.isFiller,
              idMainTerhubung: currentState.mainId,
            }),
            imageBase64: imageBase64,
            attachmentUrl: currentState.attachment.url,
          },
        };

        // Send data to Google Apps Script
        console.log(
          `[DEBUG] Sending final registration data to Apps Script for message ${messageId}`
        );
        const appsScriptResponse = await fetch(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalPayload),
        });

        let result;
        const resultText = await appsScriptResponse.text();
        if (!appsScriptResponse.ok) {
          console.error(
            `[ERROR] Apps Script error on final submit (${appsScriptResponse.status}): ${resultText}`
          );
          throw new Error(
            `Registration backend failed: ${resultText.substring(0, 100)}`
          ); // Throw error to be caught below
        }
        try {
          result = JSON.parse(resultText);
        } catch (parseErr) {
          console.error(
            `[ERROR] Failed to parse Apps Script success response: ${resultText}`
          );
          throw new Error(
            "Registration backend sent an invalid success response."
          );
        }

        console.log(
          `[DEBUG] Final Apps Script response for ${messageId}:`,
          result
        );

        // --- PROCESS SUCCESSFUL RESPONSE ---
        if (result.status === "success" && result.details) {
          const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("✅ Registration Successful!")
            .setTimestamp();
          if (result.message) successEmbed.setDescription(result.message);
          successEmbed.addFields(
            {
              name: "Governor ID",
              value: result.details.govId?.toString() || "N/A",
              inline: true,
            },
            {
              name: "Account Type",
              value: result.details.type || currentState.accountType || "N/A",
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
          await interaction.editReply({
            content: `${interaction.user}, your registration is complete!`,
            embeds: [successEmbed],
            components: [],
          });
          console.log(
            `[INFO] Registration successful for user ${currentState.userId}, message ${messageId}.`
          );
        } else {
          console.error(
            `[ERROR] Registration failed via Apps Script (status not success or details missing):`,
            result
          );
          throw new Error(
            `Registration failed: ${
              result.message || "Unknown error from registration system."
            }`
          );
        }

        // --- CLEAN UP STATE AND UNLOCK CHANNEL AFTER SUCCESS ---
        registrationState.delete(messageId);
        if (channelId && activeRegistrationChannels.has(channelId)) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[INFO] State cleared and channel ${channelId} unlocked successfully for message ${messageId}`
          );
        }
        // ---
      } // End submit button logic
      // Add handlers for other buttons if needed
    } catch (error) {
      console.error(
        `[ERROR] Error handling button ${customId} (${interaction.id}):`,
        error
      );
      // --- UNLOCK CHANNEL ON BUTTON ERROR ---
      if (
        currentState &&
        channelId === currentState.channelId &&
        activeRegistrationChannels.has(channelId)
      ) {
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to button error.`
        );
      }
      registrationState.delete(messageId); // Clean up state too
      // ---
      // Send error feedback (interaction should be deferred)
      try {
        await interaction.followUp({
          content: `An error occurred: ${error.message}`,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send button error followup:",
          errorReplyError
        );
      }
    }
    return; // End Button handling
  }

  // Handle Modal Submissions
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Modal Submit Interaction received: ${customId} (interaction: ${interaction.id})`
    );

    // --- Variables for messageId and userId from modal ---
    let messageId;
    let userIdFromModal;

    try {
      // Validate modal custom ID format
      if (!customId.startsWith("register_farm_modal_")) {
        console.warn(
          `[WARN] Received modal submit with unexpected customId: ${customId}`
        );
        await interaction.reply({
          content: "Error: Unknown form submitted.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      const customIdParts = customId.split("_");
      if (customIdParts.length !== 5) {
        console.warn(
          `[WARN] Invalid modal customId format received: ${customId}. Parts: ${customIdParts.length}`
        );
        await interaction.reply({
          content: "Error: Invalid form submission format.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      messageId = customIdParts[4];
      userIdFromModal = customIdParts[3];
      if (!/^\d+$/.test(messageId) || !/^\d+$/.test(userIdFromModal)) {
        console.warn(
          `[WARN] Invalid messageId or userId in modal customId: ${customId}`
        );
        await interaction.reply({
          content: "Error: Corrupted form submission data.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      // Validate user submitting the modal
      if (interaction.user.id !== userIdFromModal) {
        console.warn(
          `[WARN] Modal user mismatch: Expected ${userIdFromModal}, got ${interaction.user.id} for ${customId}`
        );
        await interaction.reply({
          content: "Error processing form: User mismatch. Please start over.",
          flags: [MessageFlags.Ephemeral],
        });
        // --- UNLOCK CHANNEL ON USER MISMATCH ---
        const currentState = registrationState.get(messageId); // Get state to find channel
        if (
          currentState &&
          activeRegistrationChannels.has(currentState.channelId)
        ) {
          activeRegistrationChannels.delete(currentState.channelId);
          console.log(
            `[DEBUG] Channel ${currentState.channelId} unlocked due to modal user mismatch.`
          );
        }
        registrationState.delete(messageId); // Clean state
        // ---
        return;
      }

      // Defer modal submission AFTER basic validation
      await interaction.deferUpdate(); // Use deferUpdate as we will edit the original message
      console.log(
        `[DEBUG] Modal Interaction ${customId} (${interaction.id}) deferred.`
      );

      // Process state and edit original message
      const currentState = registrationState.get(messageId);
      // Validate state, user, and step
      if (
        !currentState ||
        currentState.userId !== interaction.user.id ||
        currentState.step !== "awaiting_main_id_modal"
      ) {
        console.warn(
          `[WARN] State/User/Step mismatch for modal submit: ${messageId} (Current State: ${JSON.stringify(
            currentState
          )})`
        );
        // --- UNLOCK CHANNEL IF STATE INVALID ---
        if (
          currentState &&
          activeRegistrationChannels.has(currentState.channelId)
        ) {
          activeRegistrationChannels.delete(currentState.channelId);
          console.log(
            `[DEBUG] Channel ${currentState.channelId} unlocked due to modal state mismatch.`
          );
        }
        registrationState.delete(messageId); // Clean state
        // ---
        await interaction.followUp({
          content:
            "Registration session invalid/expired. Please start over with /register.",
          flags: [MessageFlags.Ephemeral],
        }); // Use followUp
        return;
      }

      // Get and validate input from modal
      const linkedMainId = interaction.fields.getTextInputValue(
        "register_main_id_input"
      );
      if (!/^\d{7,10}$/.test(linkedMainId)) {
        // Validate format
        await interaction.followUp({
          content:
            "Error: Invalid Linked Main ID format. Please enter 7-10 digits only.",
          flags: [MessageFlags.Ephemeral],
        }); // Use followUp
        return; // Don't clear state, let user retry modal or cancel
      }

      // Update state
      currentState.mainId = linkedMainId;
      currentState.step = "awaiting_screenshot"; // Set next step
      registrationState.set(messageId, currentState);

      // Edit the original interactive message
      try {
        // Prepare next step UI
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle(
            `📝 Register Farm Account (Filler: ${
              currentState.isFiller ? "Yes" : "No"
            })`
          )
          .setDescription(
            `Linked Main ID: **${linkedMainId}** received.\n\nNext, please **REPLY TO THIS MESSAGE** with the **screenshot of this Farm Account's Profile**.`
          )
          .addFields(
            {
              name: "Account Type",
              value: currentState.accountType,
              inline: true,
            },
            {
              name: "Is Filler?",
              value: currentState.isFiller ? "Yes" : "No",
              inline: true,
            },
            { name: "Linked Main ID", value: linkedMainId, inline: true }
          )
          .setFooter({
            text: `Awaiting screenshot reply for message ID: ${messageId}`,
          })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("register_cancel")
            .setLabel("Cancel")
            .setStyle(ButtonStyle.Danger)
        );

        // Edit the original message (interaction is already deferred)
        await interaction.editReply({
          content: "",
          embeds: [embed],
          components: [row],
        });
        console.log(
          `[DEBUG] Original message ${messageId} edited after modal submit.`
        );
      } catch (editError) {
        console.error(
          `[ERROR] Failed to edit original message ${messageId} after modal submit:`,
          editError
        );
        // --- UNLOCK CHANNEL IF EDIT FAILS ---
        if (
          currentState &&
          activeRegistrationChannels.has(currentState.channelId)
        ) {
          activeRegistrationChannels.delete(currentState.channelId);
          console.log(
            `[DEBUG] Channel ${currentState.channelId} unlocked due to failed edit after modal.`
          );
        }
        registrationState.delete(messageId); // Clean state
        // ---
        await interaction.followUp({
          content:
            "Error updating registration prompt after form submission. Please start over.",
          flags: [MessageFlags.Ephemeral],
        }); // Use followUp
      }
    } catch (error) {
      console.error(
        `[ERROR] Error handling modal ${customId} (${interaction.id}):`,
        error
      );
      // --- UNLOCK CHANNEL ON GENERAL MODAL ERROR ---
      const currentMessageId = customId.startsWith("register_farm_modal_")
        ? customId.split("_")[4]
        : null;
      if (currentMessageId) {
        const currentState = registrationState.get(currentMessageId);
        if (
          currentState &&
          activeRegistrationChannels.has(currentState.channelId)
        ) {
          activeRegistrationChannels.delete(currentState.channelId);
          console.log(
            `[DEBUG] Channel ${currentState.channelId} unlocked due to modal submit error.`
          );
        }
        registrationState.delete(currentMessageId); // Clean state
      } else {
        console.warn(
          "[WARN] Could not determine messageId to clean up state/lock after modal error."
        );
      }
      // ---
      // Send error feedback (interaction should be deferred if reached here)
      try {
        await interaction.followUp({
          content: "Error processing form submission.",
          flags: [MessageFlags.Ephemeral],
        });
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send modal error followup:",
          errorReplyError
        );
      }
    }
    return; // End ModalSubmit handling
  }

  // --- Handle Message Replies for Screenshots ---
  if (message.type === MessageType.Reply) {
    const repliedToMessageId = message.reference?.messageId;
    if (!repliedToMessageId) return; // Ignore if reference is missing

    const currentState = registrationState.get(repliedToMessageId);
    // Check if this reply corresponds to the correct user and step
    if (
      !currentState ||
      currentState.userId !== message.author.id ||
      currentState.step !== "awaiting_screenshot"
    ) {
      return; // Not the reply we are looking for
    }

    // Check for image attachment
    if (message.attachments.size > 0) {
      const attachment = message.attachments.first();
      if (attachment.contentType?.startsWith("image/")) {
        console.log(
          `[DEBUG] Screenshot received for message ${repliedToMessageId} from user ${message.author.id}`
        );
        await message.react("👍").catch(console.error); // Acknowledge receipt

        let processingMessage;
        try {
          // Send a "processing" message (replying to the screenshot message)
          processingMessage = await message.reply(
            "⏳ Processing your registration, please wait..."
          );
          console.log("[DEBUG] Sent processing message reply.");

          // --- Store attachment info in state ---
          currentState.attachment = { url: attachment.url, id: attachment.id };
          currentState.step = "confirming_details"; // Move to confirmation step
          registrationState.set(repliedToMessageId, currentState);
          console.log(
            `[DEBUG] State updated for ${repliedToMessageId} after screenshot.`
          );

          // --- Show Confirmation ---
          // Fetch the original interaction message to edit it
          const originalInteractionMessage =
            await message.channel.messages.fetch(repliedToMessageId);
          if (!originalInteractionMessage)
            throw new Error(
              "Original interaction message not found for confirmation."
            );

          // Call the confirmation function (needs interaction-like object)
          // We can simulate parts of the interaction object needed by showConfirmationPublic
          const simulatedInteraction = {
            id: message.id, // Use the reply message ID for context, maybe? Or original?
            message: originalInteractionMessage, // The message to be edited
            channel: message.channel,
            user: message.author,
            // Mock methods if needed by showConfirmationPublic
            isRepliable: () => true, // Assume it's repliable for editing
            editReply: (options) => originalInteractionMessage.edit(options), // Route editReply to message.edit
            followUp: (options) => message.channel.send(options), // Fallback followup
            replied: true, // Mark as replied since we sent processing msg
            deferred: false, // Not deferred in this context
          };
          await showConfirmationPublic(
            simulatedInteraction,
            currentState,
            currentState.accountType === "farm" && !currentState.mainId
          );

          // Delete the "Processing..." message after showing confirmation
          if (processingMessage && !processingMessage.deleted) {
            await processingMessage
              .delete()
              .catch((e) =>
                console.warn("Could not delete processing message:", e)
              );
          }
        } catch (error) {
          console.error(
            `[ERROR] Error processing screenshot reply for ${repliedToMessageId}:`,
            error
          );
          // --- UNLOCK CHANNEL ON SCREENSHOT PROCESSING ERROR ---
          if (
            currentState &&
            activeRegistrationChannels.has(currentState.channelId)
          ) {
            activeRegistrationChannels.delete(currentState.channelId);
            console.log(
              `[DEBUG] Channel ${currentState.channelId} unlocked due to screenshot processing error.`
            );
          }
          registrationState.delete(repliedToMessageId); // Clean state
          // ---
          // Inform user about the error
          const errorMsg = `An error occurred processing your screenshot: ${error.message}. Please try again or contact an admin.`;
          if (processingMessage && !processingMessage.deleted) {
            await processingMessage.edit(errorMsg).catch(console.error);
          } else {
            await message.reply(errorMsg).catch(console.error);
          }
        }
      } else {
        // Reply if the attachment is not an image
        await message
          .reply("⚠️ Please reply with an **image file** (screenshot).")
          .catch(console.error);
      }
    }
    // Ignore replies without attachments
  } // End Message Reply Handling
}); // End InteractionCreate listener

// Login the Bot
console.log("Attempting to log in...");
client.login(token);

// Optional Keep-Alive Server
try {
  const keepAlive = require("./server.js");
  if (typeof keepAlive === "function") {
    keepAlive();
    console.log("[INFO] Keep-alive server started.");
  } else {
    console.log(
      "[INFO] keepAlive export is not a function, skipping server start."
    );
  }
} catch (serverError) {
  if (serverError.code === "MODULE_NOT_FOUND") {
    console.log("[INFO] Keep-alive server (server.js) not found, skipping.");
  } else {
    console.error("[ERROR] Could not start keep-alive server:", serverError);
  }
}
