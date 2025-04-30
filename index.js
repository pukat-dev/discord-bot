// index.js (Complete English Version with Interaction & State Fixes)
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
const fetch = require("node-fetch"); // Ensure node-fetch v2 is installed

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
  const userId = interaction.user.id; // Get userId

  try {
    // Interaction should already be deferred (deferUpdate) before calling this

    let nextEmbed;
    let componentsRow1;
    let componentsRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("register_back_to_type")
        .setLabel("Back") // Back Button Label
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("register_cancel")
        .setLabel("Cancel") // Cancel Button Label
        .setStyle(ButtonStyle.Danger)
    );

    // Update state (create new state for this messageId)
    stateMap.set(messageId, {
      step: "select_status_or_filler", // Next expected step
      userId: userId, // Store the initiating userId
      accountType: selectedType,
      channelId: channelId,
    });
    console.log(
      `[DEBUG] State created/updated for message ${messageId}:`,
      stateMap.get(messageId)
    );

    // Build UI for the next step
    if (selectedType === "main") {
      nextEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 Register Main Account") // Main Registration Title
        .setDescription("Please select your account status:") // Main Status Description
        .setTimestamp();
      const statusSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_main_status")
        .setPlaceholder("Select status...") // Main Status Placeholder
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("DKP 2921 Old Player") // Old Player Option
            .setValue("Old Player"),
          new StringSelectMenuOptionBuilder()
            .setLabel("DKP Migrants") // Migrant Option
            .setValue("Migrants")
        );
      componentsRow1 = new ActionRowBuilder().addComponents(statusSelect);
    } else if (selectedType === "farm") {
      nextEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 Register Farm Account") // Farm Registration Title
        .setDescription('Is this farm account a designated "Filler Account"?') // Farm Filler Description
        .setTimestamp();
      const fillerSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_filler_status")
        .setPlaceholder("Is this a filler account?") // Farm Filler Placeholder
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Yes") // Yes Filler Option
            .setDescription("This farm will be used as a filler.") // Yes Filler Description
            .setValue("true"),
          new StringSelectMenuOptionBuilder()
            .setLabel("No") // No Filler Option
            .setDescription("This farm is NOT a filler.") // No Filler Description
            .setValue("false")
        );
      componentsRow1 = new ActionRowBuilder().addComponents(fillerSelect);
    } else {
      // This case should ideally not be reached if interaction handling is correct
      console.error(
        `[ERROR] Unknown selectedType in handleAccountTypeSelection: ${selectedType}`
      );
      await interaction.editReply({
        content: "An unexpected error occurred processing the account type.", // Unexpected Error Message
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
      // Ensure interaction can still be followed up
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: "An error occurred while processing your selection.", // Processing Error Message
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        // If not, try a regular reply (though likely to fail if interaction is broken)
        await interaction.reply({
          content: "An error occurred while processing your selection.",
          flags: [MessageFlags.Ephemeral],
        });
      }
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
  // --> ADD THIS <--
  console.log(
    `[TIMESTAMP] ${new Date().toISOString()} - Interaction received: ${
      interaction.id
    }, Type: ${interaction.type}, User: ${interaction.user.id}`
  );

  const channelId = interaction.channel?.id;
  const userId = interaction.user.id;

  // Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    // --> ADD THIS <--
    console.log(
      `[TIMESTAMP] ${new Date().toISOString()} - Routing command: ${
        interaction.commandName
      } (${interaction.id})`
    );
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`[ERROR] Command ${interaction.commandName} not found.`);
      try {
        // Use ephemeral flag
        await interaction.reply({
          content: `Command '${interaction.commandName}' not found.`, // Command Not Found Message
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
          activeRegistrationChannels // Pass Set to register command
        );
      } else {
        await command.execute(interaction, appsScriptUrl); // Pass url to other commands if needed
      }
    } catch (error) {
      console.error(
        `[ERROR] Error executing command ${interaction.commandName}:`,
        error
      );
      // Unlock channel if error occurs during register command execution
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
      // Send ephemeral error message
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Error executing this command!", // Execution Error Message
            flags: [MessageFlags.Ephemeral],
          });
        } else {
          await interaction.reply({
            content: "Error executing this command!", // Execution Error Message
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

  // =======================================================================
  // Handle String Select Menu Interactions
  // =======================================================================
  if (interaction.isStringSelectMenu()) {
    const selectedValue = interaction.values[0];
    const messageId = interaction.message.id;
    const customId = interaction.customId;
    // userId is already defined at the start of the InteractionCreate listener

    console.log(
      `[DEBUG] Select Menu Interaction received: ${customId} (interaction: ${interaction.id}, message: ${messageId})`
    );

    try {
      // --- State Logic ---
      if (customId === "register_select_account_type") {
        // FIRST step after initial message. State might not exist yet (valid).
        const currentState = registrationState.get(messageId);

        // Only fail if state exists BUT user ID doesn't match (prevents hijacking)
        if (currentState && currentState.userId !== userId) {
          console.warn(
            `[WARN] User mismatch on existing state for ${customId}: ${messageId}. Expected ${currentState.userId}, got ${userId}. Ignoring.`
          );
          await interaction.reply({
            content:
              "This registration menu belongs to another user. Please start over.",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }
        await interaction.deferUpdate();
        console.log(
          `[DEBUG] Interaction ${customId} (${interaction.id}) deferred successfully.`
        );
        await handleAccountTypeSelection(
          interaction,
          selectedValue,
          registrationState
        );
      } else if (
        customId === "register_select_main_status" ||
        customId === "register_select_filler_status"
      ) {
        // For SUBSEQUENT steps, state MUST exist and belong to the correct user.
        const currentState = registrationState.get(messageId);
        if (!currentState || currentState.userId !== userId) {
          console.warn(
            `[WARN] State/User mismatch for subsequent step ${customId}: ${messageId}. Ignoring.`
          );
          await interaction.reply({
            content:
              "This registration step is no longer valid or belongs to another user. Please start over.",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        // --- Process subsequent steps ---
        if (customId === "register_select_main_status") {
          await interaction.deferUpdate();
          console.log(
            `[DEBUG] Interaction ${customId} (${interaction.id}) deferred successfully.`
          );

          if (currentState.step !== "select_status_or_filler") {
            /* ... handle error ... */ return;
          }
          currentState.status = selectedValue;
          currentState.step = "awaiting_screenshot";
          registrationState.set(messageId, currentState);

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
          await interaction.editReply({
            content: "",
            embeds: [embed],
            components: [row],
          });
          console.log(`[DEBUG] Reply edited for ${customId}.`);
        } else if (customId === "register_select_filler_status") {
          // *** REMOVED deferUpdate() here because showModal() acknowledges the interaction ***

          if (currentState.step !== "select_status_or_filler") {
            /* ... handle error ... */ return;
          }
          currentState.isFiller = selectedValue === "true";
          currentState.step = "awaiting_main_id_modal";
          registrationState.set(messageId, currentState);

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

          await interaction.showModal(modal);
          console.log(
            `[DEBUG] Modal shown for ${customId} (interaction: ${interaction.id}). Select Menu interaction acknowledged via showModal.`
          );
        }
      }
    } catch (error) {
      console.error(
        `[ERROR] Error handling select menu ${customId} (${interaction.id}):`,
        error
      );
      const currentStateForError = registrationState.get(messageId);
      const effectiveChannelId = channelId || currentStateForError?.channelId;
      if (
        effectiveChannelId &&
        activeRegistrationChannels.has(effectiveChannelId)
      ) {
        activeRegistrationChannels.delete(effectiveChannelId);
        console.log(
          `[DEBUG] Channel ${effectiveChannelId} unlocked due to select menu error.`
        );
      }
      registrationState.delete(messageId);
      try {
        if (interaction.replied || interaction.deferred) {
          if (error.code !== "InteractionAlreadyReplied") {
            await interaction.followUp({
              content: "An error occurred while processing your selection.",
              flags: [MessageFlags.Ephemeral],
            });
          } else {
            console.warn(
              `[WARN] Suppressing followUp for InteractionAlreadyReplied error in select menu handler.`
            );
          }
        } else {
          await interaction.reply({
            content: "An error occurred while processing your selection.",
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (errorReplyError) {
        if (errorReplyError.code !== "InteractionAlreadyReplied") {
          console.error(
            "[ERROR] Failed to send select menu error feedback:",
            errorReplyError
          );
        }
      }
    }
    return; // End StringSelectMenu handling
  }
  // =======================================================================
  // END Handle String Select Menu Interactions
  // =======================================================================

  // =======================================================================
  // Handle Button Interactions
  // =======================================================================
  if (interaction.isButton()) {
    const messageId = interaction.message.id;
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Button Interaction received: ${customId} (interaction: ${interaction.id}, message: ${messageId})`
    );
    const currentState = registrationState.get(messageId); // Get state early for checks

    // --- State and User Check ---
    if (
      customId !== "register_cancel" &&
      customId !== "register_back_to_type" &&
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
      return;
    }
    // --- End State Check ---

    try {
      await interaction.deferUpdate();
      console.log(
        `[DEBUG] Button Interaction ${customId} (${interaction.id}) deferred.`
      );

      if (customId === "register_cancel") {
        await interaction.editReply({
          content: "❌ Registration process cancelled.",
          embeds: [],
          components: [],
        });
        console.log(`[DEBUG] Message ${messageId} edited for cancellation.`);
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
        if (registrationState.has(messageId)) {
          registrationState.delete(messageId);
          console.log(
            `[DEBUG] State for message ${messageId} deleted due to cancellation.`
          );
        }
      } else if (customId === "register_back_to_type") {
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
        registrationState.delete(messageId);
        console.log(
          `[DEBUG] State deleted for message ${messageId} due to 'Back' button.`
        );
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
        await interaction.editReply({
          content: null,
          embeds: [initialEmbed],
          components: [selectRow, buttonRow],
        });
        console.log(`[DEBUG] Reply edited for ${customId}.`);
      } else if (customId === "register_confirm_submit") {
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
        await interaction.editReply({
          content: "⏳ Submitting registration to backend...",
          embeds: [],
          components: [],
        });

        let finalPayload;
        let imageBase64 = "";
        if (currentState.attachment && currentState.attachment.url) {
          try {
            const response = await fetch(currentState.attachment.url);
            if (!response.ok)
              throw new Error(`Failed to fetch image: ${response.statusText}`);
            const buffer = await response.buffer();
            imageBase64 = buffer.toString("base64");
            console.log(
              `[DEBUG] Image successfully converted to base64 for ${messageId}`
            );
          } catch (imgErr) {
            console.error(
              "[ERROR] Failed to convert image on final submit:",
              imgErr
            );
            await interaction.editReply({
              content: `❌ Error processing screenshot: ${imgErr.message}. Registration cancelled.`,
            });
            activeRegistrationChannels.delete(channelId);
            registrationState.delete(messageId);
            return;
          }
        } else {
          await interaction.editReply({
            content: `❌ Error: Screenshot data missing before final submission. Registration cancelled.`,
          });
          activeRegistrationChannels.delete(channelId);
          registrationState.delete(messageId);
          return;
        }

        finalPayload = {
          command: "register",
          data: {
            discordUserId: currentState.userId,
            discordUsername: interaction.user.username,
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

        console.log(
          `[DEBUG] Sending final registration data to Apps Script for message ${messageId}`
        );
        let appsScriptResponse;
        let resultText;
        try {
          appsScriptResponse = await fetch(appsScriptUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(finalPayload),
          });
          resultText = await appsScriptResponse.text();
          if (!appsScriptResponse.ok) {
            console.error(
              `[ERROR] Apps Script error on final submit (${appsScriptResponse.status}): ${resultText}`
            );
            let errorMsg = `Registration backend failed: ${resultText.substring(
              0,
              150
            )}`;
            try {
              const errorJson = JSON.parse(resultText);
              if (errorJson.message) {
                errorMsg = `Registration backend failed: ${errorJson.message}`;
              }
            } catch (parseErr) {
              /* Ignore */
            }
            throw new Error(errorMsg);
          }
        } catch (fetchError) {
          console.error(
            `[ERROR] Failed to contact Apps Script: ${fetchError.message}`
          );
          throw new Error(
            `Could not contact the registration server. Please try again later.`
          );
        }

        let result;
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

        registrationState.delete(messageId);
        if (channelId && activeRegistrationChannels.has(channelId)) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[INFO] State cleared and channel ${channelId} unlocked successfully for message ${messageId}`
          );
        }
      }
    } catch (error) {
      console.error(
        `[ERROR] Error handling button ${customId} (${interaction.id}):`,
        error
      );
      const currentStateForError = registrationState.get(messageId);
      const effectiveChannelId = channelId || currentStateForError?.channelId;
      if (
        effectiveChannelId &&
        activeRegistrationChannels.has(effectiveChannelId)
      ) {
        activeRegistrationChannels.delete(effectiveChannelId);
        console.log(
          `[DEBUG] Channel ${effectiveChannelId} unlocked due to button error.`
        );
      }
      registrationState.delete(messageId);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: `An error occurred: ${error.message}`,
            flags: [MessageFlags.Ephemeral],
          });
        } else {
          await interaction.reply({
            content: `An error occurred: ${error.message}`,
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send button error followup:",
          errorReplyError
        );
      }
    }
    return; // End Button handling
  }
  // =======================================================================
  // END Handle Button Interactions
  // =======================================================================

  // =======================================================================
  // Handle Modal Submissions (MODIFIED)
  // =======================================================================
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Modal Submit Interaction received: ${customId} (interaction: ${interaction.id})`
    );

    // --- Variables for messageId and userId from modal ---
    let messageId;
    let userIdFromModal;

    try {
      // =====> MOVE DEFER UPDATE TO THE TOP <=====
      await interaction.deferUpdate(); // Use deferUpdate as we will edit the original message
      console.log(
        `[DEBUG] Modal Interaction ${customId} (${interaction.id}) deferred IMMEDIATELY.`
      );
      // =====> END MOVE <=====

      // Validate modal custom ID format
      if (!customId.startsWith("register_farm_modal_")) {
        console.warn(
          `[WARN] Received modal submit with unexpected customId: ${customId}`
        );
        // Use followUp since we deferred
        await interaction.followUp({
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
        await interaction.followUp({
          content: "Error: Invalid form submission format.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      userIdFromModal = customIdParts[3];
      messageId = customIdParts[4];

      if (!/^\d+$/.test(messageId) || !/^\d+$/.test(userIdFromModal)) {
        console.warn(
          `[WARN] Invalid messageId or userId in modal customId: ${customId}`
        );
        await interaction.followUp({
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
        await interaction.followUp({
          content: "Error processing form: User mismatch. Please start over.",
          flags: [MessageFlags.Ephemeral],
        });
        const currentState = registrationState.get(messageId);
        if (
          currentState &&
          currentState.channelId &&
          activeRegistrationChannels.has(currentState.channelId)
        ) {
          activeRegistrationChannels.delete(currentState.channelId);
          console.log(
            `[DEBUG] Channel ${currentState.channelId} unlocked due to modal user mismatch.`
          );
        }
        registrationState.delete(messageId);
        return;
      }

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
        if (
          currentState &&
          currentState.channelId &&
          activeRegistrationChannels.has(currentState.channelId)
        ) {
          activeRegistrationChannels.delete(currentState.channelId);
          console.log(
            `[DEBUG] Channel ${currentState.channelId} unlocked due to modal state mismatch.`
          );
        }
        registrationState.delete(messageId);
        await interaction.followUp({
          content:
            "Registration session invalid/expired. Please start over with /register.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      // Get and validate input from modal
      const linkedMainId = interaction.fields.getTextInputValue(
        "register_main_id_input"
      );
      if (!/^\d{7,10}$/.test(linkedMainId)) {
        await interaction.followUp({
          content:
            "Error: Invalid Linked Main ID format. Please enter 7-10 digits only.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      // Update state
      currentState.mainId = linkedMainId;
      currentState.step = "awaiting_screenshot";
      registrationState.set(messageId, currentState);

      // Edit the original interactive message
      try {
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
        if (
          currentState &&
          currentState.channelId &&
          activeRegistrationChannels.has(currentState.channelId)
        ) {
          activeRegistrationChannels.delete(currentState.channelId);
          console.log(
            `[DEBUG] Channel ${currentState.channelId} unlocked due to failed edit after modal.`
          );
        }
        registrationState.delete(messageId);
        await interaction.followUp({
          content:
            "Error updating registration prompt after form submission. Please start over.",
          flags: [MessageFlags.Ephemeral],
        });
      }
    } catch (error) {
      console.error(
        `[ERROR] Error handling modal ${customId} (${interaction.id}):`,
        error
      );

      // --- UNLOCK CHANNEL ON GENERAL MODAL ERROR ---
      let currentMessageId = null;
      if (customId.startsWith("register_farm_modal_")) {
        const parts = customId.split("_");
        if (parts.length === 5) {
          currentMessageId = parts[4];
        }
      }

      if (currentMessageId) {
        const currentState = registrationState.get(currentMessageId);
        if (
          currentState &&
          currentState.channelId &&
          activeRegistrationChannels.has(currentState.channelId)
        ) {
          activeRegistrationChannels.delete(currentState.channelId);
          console.log(
            `[DEBUG] Channel ${currentState.channelId} unlocked due to modal submit error.`
          );
        }
        registrationState.delete(currentMessageId);
      } else {
        console.warn(
          "[WARN] Could not determine messageId to clean up state/lock after modal error."
        );
      }
      // ---

      // Send error feedback (interaction *should* be deferred if error happened after the deferUpdate call)
      try {
        // Check if the error is the Unknown Interaction error from the initial defer attempt
        if (error.code === 10062) {
          console.warn(
            "[WARN] Modal defer failed (Unknown Interaction), cannot send followup."
          );
          // No followup possible if the defer itself failed
        } else if (interaction.deferred || interaction.replied) {
          // If deferred successfully but failed later, send followup
          await interaction.followUp({
            content: "Error processing form submission.",
            flags: [MessageFlags.Ephemeral],
          });
        } else {
          // Fallback if somehow not deferred/replied (less likely now)
          await interaction.reply({
            content: "Error processing form submission.",
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (errorReplyError) {
        // Avoid logging if the error is just InteractionAlreadyReplied (e.g., from the fallback reply attempt)
        if (errorReplyError.code !== 40060) {
          console.error(
            "[ERROR] Failed to send modal error feedback:",
            errorReplyError
          );
        }
      }
    }
    return; // End ModalSubmit handling
  }
  // =======================================================================
  // END Handle Modal Submissions
  // =======================================================================

  // =======================================================================
  // Handle Message Replies for Screenshots
  // =======================================================================
  if (
    !interaction.isMessageComponent() &&
    !interaction.isModalSubmit() &&
    !interaction.isChatInputCommand()
  ) {
    const message = interaction;
    if (message.type === MessageType.Reply) {
      const repliedToMessageId = message.reference?.messageId;
      if (!repliedToMessageId) return;

      const currentState = registrationState.get(repliedToMessageId);
      if (
        !currentState ||
        currentState.userId !== message.author.id ||
        currentState.step !== "awaiting_screenshot"
      ) {
        return;
      }

      if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType?.startsWith("image/")) {
          console.log(
            `[DEBUG] Screenshot received for message ${repliedToMessageId} from user ${message.author.id}`
          );
          await message.react("👍").catch(console.error);

          let processingMessage;
          try {
            processingMessage = await message.reply(
              "⏳ Processing your registration, please wait..."
            );
            console.log("[DEBUG] Sent processing message reply.");

            currentState.attachment = {
              url: attachment.url,
              id: attachment.id,
            };
            currentState.step = "confirming_details";
            registrationState.set(repliedToMessageId, currentState);
            console.log(
              `[DEBUG] State updated for ${repliedToMessageId} after screenshot.`
            );

            const originalInteractionMessage =
              await message.channel.messages.fetch(repliedToMessageId);
            if (!originalInteractionMessage) {
              throw new Error(
                "Original interaction message not found for confirmation."
              );
            }

            const confirmEmbed = new EmbedBuilder()
              .setColor(0xffff00)
              .setTitle("🔍 Confirm Registration Details")
              .setDescription(
                "Please review your registration details below and confirm:"
              )
              .addFields(
                {
                  name: "Account Type",
                  value: currentState.accountType === "main" ? "Main" : "Farm",
                  inline: true,
                },
                ...(currentState.accountType === "main"
                  ? [
                      {
                        name: "Status",
                        value: currentState.status || "N/A",
                        inline: true,
                      },
                    ]
                  : [
                      {
                        name: "Is Filler?",
                        value: currentState.isFiller ? "Yes" : "No",
                        inline: true,
                      },
                      {
                        name: "Linked Main ID",
                        value: currentState.mainId || "N/A",
                        inline: true,
                      },
                    ])
              )
              .addFields({
                name: "Screenshot",
                value: `[View Attachment](${currentState.attachment.url})`,
              })
              .setThumbnail(currentState.attachment.url)
              .setTimestamp()
              .setFooter({
                text: `Confirmation for message ID: ${repliedToMessageId}`,
              });

            const submitButton = new ButtonBuilder()
              .setCustomId("register_confirm_submit")
              .setLabel("Submit Registration")
              .setStyle(ButtonStyle.Success);
            const backButton = new ButtonBuilder()
              .setCustomId("register_back_to_type")
              .setLabel("Start Over")
              .setStyle(ButtonStyle.Secondary);
            const cancelButtonConfirm = new ButtonBuilder()
              .setCustomId("register_cancel")
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Danger);
            const confirmRow = new ActionRowBuilder().addComponents(
              submitButton,
              backButton,
              cancelButtonConfirm
            );

            await originalInteractionMessage.edit({
              content: null,
              embeds: [confirmEmbed],
              components: [confirmRow],
            });
            console.log(
              `[DEBUG] Message ${repliedToMessageId} edited to show confirmation.`
            );

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
            if (
              currentState &&
              currentState.channelId &&
              activeRegistrationChannels.has(currentState.channelId)
            ) {
              activeRegistrationChannels.delete(currentState.channelId);
              console.log(
                `[DEBUG] Channel ${currentState.channelId} unlocked due to screenshot processing error.`
              );
            }
            registrationState.delete(repliedToMessageId);
            const errorMsg = `An error occurred processing your screenshot: ${error.message}. Please try again or contact an admin.`;
            if (processingMessage && !processingMessage.deleted) {
              await processingMessage.edit(errorMsg).catch(console.error);
            } else {
              await message.reply(errorMsg).catch(console.error);
            }
          }
        } else {
          await message
            .reply("⚠️ Please reply with an **image file** (screenshot).")
            .catch(console.error);
        }
      }
    }
  }
  // =======================================================================
  // END Handle Message Replies for Screenshots
  // =======================================================================
}); // End InteractionCreate listener

// Login the Bot
console.log("Attempting to log in...");
client.login(token);

// Keep-Alive Server Section Removed
