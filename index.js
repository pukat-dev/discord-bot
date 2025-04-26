// index.js (Complete English Version with Fixes v5 - Flags & Central Handling)
require("dotenv").config(); // Ensure environment variables/secrets are loaded
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
  MessageType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags, // Ensure MessageFlags is imported
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed if using require

// State management
const registrationState = new Map();
// --- CHANNEL LOCK MANAGEMENT ---
// Define the Set HERE to be managed centrally by index.js
// This Set will be passed to the register command.
const activeRegistrationChannels = new Set();
// ---

// Load Credentials & Configuration
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;

if (!token) {
  console.error(
    "Error: DISCORD_BOT_TOKEN not found in environment variables/secrets!"
  );
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
    GatewayIntentBits.MessageContent, // Ensure this intent is ENABLED in the Developer Portal
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

// Function to handle logic after account type selection (English UI)
async function handleAccountTypeSelection(interaction, selectedType, stateMap) {
  console.log(
    `[Function] handleAccountTypeSelection called for type: ${selectedType}`
  );
  const channelId = interaction.channel?.id; // Get channel ID for potential lock release on error

  try {
    // Assume interaction was deferred BEFORE calling this function (usually via deferUpdate)
    if (!interaction.deferred && !interaction.replied) {
      console.warn(
        `[WARN] handleAccountTypeSelection called on non-deferred/replied interaction ${interaction.id}`
      );
      try {
        // Attempt to defer if not already done
        await interaction.deferUpdate();
      } catch (deferError) {
        console.error(
          `[ERROR] Fallback deferUpdate failed in handleAccountTypeSelection:`,
          deferError
        );
        // --- UNLOCK ON ERROR ---
        if (channelId) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to handleAccountTypeSelection defer error.`
          );
        }
        // ---
        return; // Stop if defer fails
      }
    }

    let nextEmbed;
    let componentsRow1;
    // Back and Cancel buttons in English
    let componentsRow2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("register_back_to_type")
        .setLabel("Back") // English
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("register_cancel")
        .setLabel("Cancel") // English
        .setStyle(ButtonStyle.Danger)
    );

    // Store initial state
    stateMap.set(interaction.message.id, {
      step: "select_status_or_filler",
      userId: interaction.user.id,
      accountType: selectedType,
      channelId: channelId, // Store channelId in state for later reference
    });
    console.log(
      `[DEBUG] Initial state stored for message ${interaction.message.id}:`,
      stateMap.get(interaction.message.id)
    );

    // Build UI based on selection (English UI)
    if (selectedType === "main") {
      nextEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 Register Main Account") // English
        .setDescription("Please select your account status:") // English
        .setTimestamp();
      const statusSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_main_status")
        .setPlaceholder("Select status...") // English
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("DKP 2921 Old Player") // Keep specific labels if needed
            .setValue("Old Player"),
          new StringSelectMenuOptionBuilder()
            .setLabel("DKP Migrants") // Keep specific labels if needed
            .setValue("Migrants")
        );
      componentsRow1 = new ActionRowBuilder().addComponents(statusSelect);
    } else if (selectedType === "farm") {
      nextEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 Register Farm Account") // English
        .setDescription('Is this farm account a designated "Filler Account"?') // English
        .setTimestamp();
      const fillerSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_filler_status")
        .setPlaceholder("Is this a filler account?") // English
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Yes") // English
            .setDescription("This farm will be used as a filler.") // English
            .setValue("true"),
          new StringSelectMenuOptionBuilder()
            .setLabel("No") // English
            .setDescription("This farm is NOT a filler.") // English
            .setValue("false")
        );
      componentsRow1 = new ActionRowBuilder().addComponents(fillerSelect);
    } else {
      console.error(
        `[ERROR] Unknown selectedType in handleAccountTypeSelection: ${selectedType}`
      );
      // Edit the original reply (which should exist due to deferUpdate)
      await interaction.editReply({
        content: "An unexpected error occurred processing the account type.", // English
        embeds: [],
        components: [],
      });
      // --- UNLOCK ON ERROR ---
      if (channelId) {
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to unknown account type.`
        );
      }
      // ---
      return;
    }

    console.log(
      `[DEBUG] Editing reply for ${selectedType} selection (interaction: ${interaction.id}).`
    );
    // Edit the original reply with the next step
    await interaction.editReply({
      embeds: [nextEmbed],
      components: [componentsRow1, componentsRow2],
    });
    console.log(`[DEBUG] Interaction reply edited for ${interaction.id}.`);
  } catch (error) {
    console.error(
      `[ERROR] Error in handleAccountTypeSelection (interaction: ${interaction.id}, type: ${selectedType}):`,
      error
    );
    // --- UNLOCK ON ERROR ---
    if (channelId) {
      activeRegistrationChannels.delete(channelId);
      console.log(
        `[DEBUG] Channel ${channelId} unlocked due to error in handleAccountTypeSelection.`
      );
    }
    // ---
    // Attempt to inform the user about the error
    try {
      // Check if we can still edit the original reply
      if (interaction.message && interaction.isRepliable()) {
        await interaction
          .editReply({
            content: "An error occurred while processing your selection.", // English
            embeds: [],
            components: [],
            flags: [MessageFlags.Ephemeral], // Use flags
          })
          .catch((e) =>
            console.error(
              "[ERROR] Failed to edit reply on handleAccountTypeSelection error:",
              e
            )
          );
      } else if (interaction.isRepliable()) {
        // Fallback to followup if editReply isn't suitable
        await interaction
          .followUp({
            content: "An error occurred while processing your selection.", // English
            flags: [MessageFlags.Ephemeral], // Use flags
          })
          .catch((e) =>
            console.error(
              "[ERROR] Failed to send followup on handleAccountTypeSelection error:",
              e
            )
          );
      }
    } catch (errorReplyError) {
      console.error(
        "[ERROR] Failed to send error message in handleAccountTypeSelection:",
        errorReplyError
      );
    }
  }
}

// Event Listener: Interaction Created (Handles commands AND components)
client.on(Events.InteractionCreate, async (interaction) => {
  const channelId = interaction.channel?.id; // Get channel ID early

  // Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      console.error(`[ERROR] Command ${interaction.commandName} not found.`);
      try {
        // Use flags for ephemeral reply
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
      // --- PASS activeRegistrationChannels TO 'register' COMMAND EXECUTE ---
      if (interaction.commandName === "register") {
        // Pass the centrally managed Set to the command
        await command.execute(
          interaction,
          appsScriptUrl,
          activeRegistrationChannels // <-- Pass the Set here
        );
      } else {
        // For other commands that might not need lock management
        await command.execute(interaction, appsScriptUrl);
      }
      // ---
    } catch (error) {
      console.error(
        `[ERROR] Error executing command ${interaction.commandName}:`,
        error
      );
      // --- UNLOCK CHANNEL IF COMMAND EXECUTION FAILS (especially for register) ---
      // Unlock is handled here using the central Set
      if (interaction.commandName === "register" && channelId) {
        // Check if lock exists before deleting
        if (activeRegistrationChannels.has(channelId)) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to command execution error.`
          );
        }
      }
      // ---
      try {
        // Send ephemeral error feedback
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({
            content: "Error executing this command!",
            flags: [MessageFlags.Ephemeral], // Use flags
          });
        } else {
          await interaction.reply({
            content: "Error executing this command!",
            flags: [MessageFlags.Ephemeral], // Use flags
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

    // --- Defer Update (unless showing modal) ---
    let needsDefer = true;
    if (customId === "register_select_filler_status") {
      needsDefer = false; // showModal acknowledges the interaction
      console.log(
        `[DEBUG] Skipping deferUpdate for ${customId} because showModal will be used.`
      );
    }

    if (needsDefer) {
      try {
        // Defer the update immediately to acknowledge the interaction
        await interaction.deferUpdate();
        console.log(
          `[DEBUG] Interaction ${customId} (${interaction.id}) deferred.`
        );
      } catch (deferError) {
        console.error(
          `[ERROR] Failed to defer interaction ${customId} (${interaction.id}):`,
          deferError
        );
        // If defer fails (e.g., interaction already acknowledged elsewhere or timed out), stop processing
        // Unlock channel if relevant to registration and defer failed critically
        if (
          customId.startsWith("register_") &&
          channelId &&
          (deferError.code === 10062 || deferError.code === 40060)
        ) {
          const currentState = registrationState.get(messageId);
          if (
            currentState &&
            currentState.userId === interaction.user.id &&
            currentState.channelId === channelId
          ) {
            if (activeRegistrationChannels.has(channelId)) {
              activeRegistrationChannels.delete(channelId); // Use central Set
              console.log(
                `[DEBUG] Channel ${channelId} unlocked due to select menu defer error (Code: ${deferError.code}).`
              );
            }
            registrationState.delete(messageId); // Clean up state too
          }
        }
        return; // Don't proceed if defer failed
      }
    }
    // --- End Defer ---

    try {
      // Process based on customId
      if (customId === "register_select_account_type") {
        // Call the handler function (which will edit the deferred reply)
        await handleAccountTypeSelection(
          interaction,
          selectedValue,
          registrationState
        );
      } else if (customId === "register_select_main_status") {
        const currentState = registrationState.get(messageId);
        // Validate state, user, and step
        if (
          !currentState ||
          currentState.userId !== interaction.user.id ||
          currentState.step !== "select_status_or_filler"
        ) {
          console.warn(
            `[WARN] State/User/Step mismatch for ${customId}: ${messageId}`
          );
          // Edit the deferred reply with an error message
          await interaction.editReply({
            content:
              "Registration session invalid or expired. Please start over with /register.", // English
            embeds: [],
            components: [],
          });
          // --- UNLOCK CHANNEL IF STATE INVALID ---
          if (currentState && channelId === currentState.channelId) {
            if (activeRegistrationChannels.has(channelId)) {
              activeRegistrationChannels.delete(channelId); // Use central Set
              console.log(
                `[DEBUG] Channel ${channelId} unlocked due to state mismatch (main status).`
              );
            }
          }
          registrationState.delete(messageId); // Clean up state map
          // ---
          return;
        }
        // Update state
        currentState.status = selectedValue;
        currentState.step = "awaiting_screenshot";
        registrationState.set(messageId, currentState);

        // Prepare next step UI (English)
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle(`📝 Register Main Account (${selectedValue})`) // English
          .setDescription(
            `Status selected: **${selectedValue}**. \n\nNext, please **REPLY TO THIS MESSAGE** with the **screenshot of your Governor Profile**.` // English
          )
          .addFields(
            {
              name: "Account Type", // English
              value: currentState.accountType,
              inline: true,
            },
            { name: "Status", value: selectedValue, inline: true } // English
          )
          .setFooter({
            text: `Awaiting screenshot reply for message ID: ${messageId}`, // English
          })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("register_cancel")
            .setLabel("Cancel") // English
            .setStyle(ButtonStyle.Danger)
        );
        // Edit the deferred reply
        await interaction.editReply({
          content: "",
          embeds: [embed],
          components: [row],
        });
      } else if (customId === "register_select_filler_status") {
        // Interaction was NOT deferred earlier
        const currentState = registrationState.get(messageId);
        // Validate state, user, and step
        if (
          !currentState ||
          currentState.userId !== interaction.user.id ||
          currentState.step !== "select_status_or_filler"
        ) {
          console.warn(
            `[WARN] State/User/Step mismatch for ${customId}: ${messageId}`
          );
          // --- UNLOCK CHANNEL IF STATE INVALID ---
          if (currentState && channelId === currentState.channelId) {
            if (activeRegistrationChannels.has(channelId)) {
              activeRegistrationChannels.delete(channelId); // Use central Set
              console.log(
                `[DEBUG] Channel ${channelId} unlocked due to state mismatch (filler status).`
              );
            }
          }
          registrationState.delete(messageId); // Clean up state map
          // ---
          // Reply ephemerally since interaction wasn't deferred
          try {
            await interaction.reply({
              content:
                "Registration session invalid or expired. Please start over with /register.", // English
              flags: [MessageFlags.Ephemeral], // Use flags
            });
          } catch (replyError) {
            console.error(
              `[ERROR] Failed to send ephemeral reply for state mismatch (${customId}):`,
              replyError
            );
            // Fallback if reply fails (e.g., interaction already acknowledged)
            try {
              await interaction.followUp({
                content: "Registration session invalid or expired.", // English
                flags: [MessageFlags.Ephemeral], // Use flags
              });
            } catch (e) {
              console.error("[ERROR] Failed followup for state mismatch:", e);
            }
          }
          return;
        }
        // Update state
        currentState.isFiller = selectedValue === "true";
        currentState.step = "awaiting_main_id_modal";
        registrationState.set(messageId, currentState);

        // Create and show the modal (English)
        const modal = new ModalBuilder()
          .setCustomId(
            `register_farm_modal_${interaction.user.id}_${messageId}`
          )
          .setTitle("Register Farm Account"); // English
        const mainIdInput = new TextInputBuilder()
          .setCustomId("register_main_id_input")
          .setLabel("Enter Linked Main Account Governor ID") // English
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("e.g., 123456789") // English
          .setRequired(true)
          .setMinLength(7)
          .setMaxLength(10);
        const actionRow = new ActionRowBuilder().addComponents(mainIdInput);
        modal.addComponents(actionRow);

        // Show the modal (this acknowledges the interaction)
        await interaction.showModal(modal);
        console.log(
          `[DEBUG] Modal shown for ${customId} (interaction: ${interaction.id}).`
        );
      }
    } catch (error) {
      console.error(
        `[ERROR] Error handling select menu ${customId} (${interaction.id}):`,
        error
      );
      // --- UNLOCK CHANNEL ON ERROR ---
      const currentState = registrationState.get(messageId);
      if (currentState && channelId === currentState.channelId) {
        if (activeRegistrationChannels.has(channelId)) {
          activeRegistrationChannels.delete(channelId); // Use central Set
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to select menu error.`
          );
        }
        registrationState.delete(messageId); // Clean up state too
      }
      // ---
      // Send error feedback
      try {
        // Check if interaction was deferred or replied to before the error
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({
            content: "An error occurred processing your selection.", // English
            flags: [MessageFlags.Ephemeral], // Use flags
          });
        } else if (interaction.isRepliable()) {
          // If not acknowledged yet (e.g., error before showModal)
          await interaction.reply({
            content: "An error occurred processing your selection.", // English
            flags: [MessageFlags.Ephemeral], // Use flags
          });
        }
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send select menu error reply/followup:",
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

    try {
      // Defer update immediately
      await interaction.deferUpdate();
      console.log(
        `[DEBUG] Button Interaction ${customId} (${interaction.id}) deferred.`
      );

      if (customId === "register_cancel") {
        const currentState = registrationState.get(messageId);
        // Edit the deferred reply
        await interaction.editReply({
          content: "❌ Registration process cancelled.", // English
          embeds: [],
          components: [],
        });
        // --- UNLOCK CHANNEL ON CANCEL ---
        if (currentState && channelId === currentState.channelId) {
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId); // Use central Set
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to user cancellation.`
            );
          }
        }
        registrationState.delete(messageId); // Clean state
        // ---
      } else if (customId === "register_back_to_type") {
        // Delete state when going back, but DO NOT unlock channel yet
        registrationState.delete(messageId);
        // Rebuild the initial step UI (English)
        const initialEmbed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle("📝 New Account Registration") // English
          .setDescription(
            "Please select the type of account you want to register:" // English
          )
          .setTimestamp();
        const accountTypeSelect = new StringSelectMenuBuilder()
          .setCustomId("register_select_account_type")
          .setPlaceholder("Select account type...") // English
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel("Main Account") // English
              .setValue("main"),
            new StringSelectMenuOptionBuilder()
              .setLabel("Farm Account") // English
              .setValue("farm")
          );
        const cancelButton = new ButtonBuilder()
          .setCustomId("register_cancel")
          .setLabel("Cancel") // English
          .setStyle(ButtonStyle.Danger);
        const selectRow = new ActionRowBuilder().addComponents(
          accountTypeSelect
        );
        const buttonRow = new ActionRowBuilder().addComponents(cancelButton);
        // Edit the deferred reply
        await interaction.editReply({
          content: null, // Remove previous text content
          embeds: [initialEmbed],
          components: [selectRow, buttonRow],
        });
      }
      // Add handlers for other buttons if needed
    } catch (error) {
      console.error(
        `[ERROR] Error handling button ${customId} (${interaction.id}):`,
        error
      );
      // --- UNLOCK CHANNEL ON BUTTON ERROR ---
      const currentState = registrationState.get(messageId);
      if (currentState && channelId === currentState.channelId) {
        if (activeRegistrationChannels.has(channelId)) {
          activeRegistrationChannels.delete(channelId); // Use central Set
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to button error.`
          );
        }
        registrationState.delete(messageId); // Clean state
      }
      // ---
      // Send error feedback (interaction should be deferred)
      try {
        await interaction.followUp({
          content: "An error occurred while processing the button click.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send button error reply:",
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
      // Basic validation of modal custom ID format
      if (!customId.startsWith("register_farm_modal_")) {
        console.warn(
          `[WARN] Received modal submit with unexpected customId: ${customId}`
        );
        await interaction.reply({
          content: "Error: Unknown form submitted.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
        return;
      }

      const customIdParts = customId.split("_");
      if (customIdParts.length !== 5) {
        console.warn(
          `[WARN] Invalid modal customId format received: ${customId}. Parts: ${customIdParts.length}`
        );
        await interaction.reply({
          content: "Error: Invalid form submission format.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
        return;
      }

      messageId = customIdParts[4]; // Get messageId from customId
      userIdFromModal = customIdParts[3]; // Get userId from customId

      // Validate extracted IDs
      if (!/^\d+$/.test(messageId) || !/^\d+$/.test(userIdFromModal)) {
        console.warn(
          `[WARN] Invalid messageId or userId in modal customId: ${customId}`
        );
        await interaction.reply({
          content: "Error: Corrupted form submission data.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
        return;
      }

      // Validate user submitting the modal
      if (interaction.user.id !== userIdFromModal) {
        console.warn(
          `[WARN] Modal user mismatch: Expected ${userIdFromModal}, got ${interaction.user.id} for ${customId}`
        );
        await interaction.reply({
          content: "Error processing form: User mismatch. Please start over.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
        // --- UNLOCK CHANNEL ON USER MISMATCH ---
        const currentState = registrationState.get(messageId);
        if (currentState && channelId === currentState.channelId) {
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId); // Use central Set
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to modal user mismatch.`
            );
          }
          registrationState.delete(messageId); // Clean state
        }
        // ---
        return;
      }

      // Defer modal submission AFTER basic validation
      await interaction.deferUpdate();
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
        if (currentState && channelId === currentState.channelId) {
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId); // Use central Set
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to modal state mismatch.`
            );
          }
        }
        registrationState.delete(messageId); // Clean state
        // ---
        // Send ephemeral followup (interaction is deferred)
        await interaction.followUp({
          content:
            "Registration session invalid/expired. Please start over with /register.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
        return;
      }

      // Get and validate input from modal
      const linkedMainId = interaction.fields.getTextInputValue(
        "register_main_id_input"
      );
      if (!/^\d+$/.test(linkedMainId)) {
        // Don't delete state or unlock, let user retry or cancel
        await interaction.followUp({
          content:
            "Error: Invalid Governor ID format. Please enter numbers only.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
        return;
      }

      // Update state
      currentState.mainId = linkedMainId;
      currentState.step = "awaiting_screenshot";
      registrationState.set(messageId, currentState);

      // Edit the original interactive message
      try {
        // Fetch the original message using messageId from modal customId
        const originalMessage = await interaction.channel.messages.fetch(
          messageId
        );
        if (!originalMessage) {
          // Should not happen if state is valid, but handle as fallback
          console.error(
            `[ERROR] Original message ${messageId} not found after modal submit.`
          );
          // --- UNLOCK CHANNEL IF ORIGINAL MESSAGE MISSING ---
          if (channelId === currentState.channelId) {
            if (activeRegistrationChannels.has(channelId)) {
              activeRegistrationChannels.delete(channelId); // Use central Set
              console.log(
                `[DEBUG] Channel ${channelId} unlocked due to missing original message after modal.`
              );
            }
          }
          registrationState.delete(messageId); // Clean state
          // ---
          await interaction.followUp({
            content: "Error: Could not find the original registration message.", // English
            flags: [MessageFlags.Ephemeral], // Use flags
          });
          return;
        }

        // Prepare next step UI (English)
        const embed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle(
            `📝 Register Farm Account (Filler: ${
              currentState.isFiller ? "Yes" : "No" // English
            })`
          )
          .setDescription(
            `Linked Main ID: **${linkedMainId}** received.\n\nNext, please **REPLY TO THIS MESSAGE** with the **screenshot of this Farm Account's Profile**.` // English
          )
          .addFields(
            {
              name: "Account Type", // English
              value: currentState.accountType,
              inline: true,
            },
            {
              name: "Is Filler?", // English
              value: currentState.isFiller ? "Yes" : "No", // English
              inline: true,
            },
            {
              name: "Linked Main ID", // English
              value: linkedMainId,
              inline: true,
            }
          )
          .setFooter({
            text: `Awaiting screenshot reply for message ID: ${messageId}`, // English
          })
          .setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("register_cancel")
            .setLabel("Cancel") // English
            .setStyle(ButtonStyle.Danger)
        );

        // Edit the original message
        await originalMessage.edit({
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
        if (channelId === currentState.channelId) {
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId); // Use central Set
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to failed edit after modal.`
            );
          }
        }
        registrationState.delete(messageId); // Clean state
        // ---
        await interaction.followUp({
          content:
            "Error updating registration prompt after form submission. Please start over.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
      }
    } catch (error) {
      console.error(
        `[ERROR] Error handling modal ${customId} (${interaction.id}):`,
        error
      );
      // --- UNLOCK CHANNEL ON GENERAL MODAL ERROR ---
      // Attempt to get messageId again if needed (it should be set if format was valid)
      const currentMessageId = customId.startsWith("register_farm_modal_")
        ? customId.split("_")[4]
        : null;
      if (currentMessageId) {
        const currentState = registrationState.get(currentMessageId);
        if (currentState && channelId === currentState.channelId) {
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId); // Use central Set
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to modal submit error.`
            );
          }
          registrationState.delete(currentMessageId); // Clean state
        }
      } else {
        console.warn(
          "[WARN] Could not determine messageId to clean up state/lock after modal error."
        );
      }
      // ---
      // Send error feedback (interaction should be deferred)
      try {
        await interaction.followUp({
          content: "Error processing form submission.", // English
          flags: [MessageFlags.Ephemeral], // Use flags
        });
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send modal error reply/followup:",
          errorReplyError
        );
      }
    }
    return; // End ModalSubmit handling
  }
}); // End InteractionCreate listener

// Event Listener: Message Created (for screenshot replies)
client.on(Events.MessageCreate, async (message) => {
  // Ignore bots and non-reply messages
  if (message.author.bot || message.type !== MessageType.Reply) return;

  // Get the ID of the message this message is replying to
  const repliedToMessageId = message.reference?.messageId;
  if (!repliedToMessageId) return;

  // Check if the replied-to message corresponds to an active registration awaiting screenshot
  const currentState = registrationState.get(repliedToMessageId);
  // Validate state, user, and step
  if (
    !currentState ||
    currentState.userId !== message.author.id ||
    currentState.step !== "awaiting_screenshot"
  ) {
    // If it's not a reply to the correct step/user/message, ignore it silently
    return;
  }

  // Get channelId from the stored state
  const channelId = currentState.channelId;

  // Check if the reply contains an image attachment
  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.contentType?.startsWith("image/")) {
      console.log(
        `[DEBUG] Screenshot received for message ${repliedToMessageId} from user ${message.author.id}`
      );
      // React to the user's message to show it's being processed
      await message.react("👍").catch(console.error);

      let processingMessage;
      try {
        // Reply to the user's screenshot message
        processingMessage = await message
          .reply("⏳ Processing your registration, please wait...") // English
          .catch(console.error);
        if (!processingMessage) {
          console.error("[ERROR] Failed to send processing message reply.");
          // Fallback: send a message to the channel if reply fails
          processingMessage = await message.channel
            .send(`Processing registration for ${message.author}...`) // English
            .catch(console.error);
        }
      } catch (replyError) {
        console.error(
          "[ERROR] Failed to send initial processing message:",
          replyError
        );
        // If sending the processing message fails, unlock and clean up
        if (channelId) {
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId); // Use central Set
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to processing message failure.`
            );
          }
        }
        registrationState.delete(repliedToMessageId); // Clean state
        return; // Stop processing
      }

      let imageBase64 = "";
      try {
        // Download image and convert to base64
        const screenshotUrl = attachment.url;
        const imageResponse = await fetch(screenshotUrl);
        if (!imageResponse.ok)
          throw new Error(
            `Failed to download image: ${imageResponse.statusText} (URL: ${screenshotUrl})`
          );
        const imageArrayBuffer = await imageResponse.arrayBuffer();
        imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");
        console.log(
          `[DEBUG] Image converted to base64 for message ${repliedToMessageId}. Size: ${imageBase64.length}`
        );

        // Prepare payload for Apps Script
        const finalPayload = {
          command: "register",
          data: {
            discordUserId: currentState.userId,
            discordUsername: message.author.username,
            tipeAkun: currentState.accountType, // Keep original keys if Apps Script expects them
            ...(currentState.accountType === "main" && {
              statusMain: currentState.status,
            }),
            ...(currentState.accountType === "farm" && {
              isFiller: currentState.isFiller,
              idMainTerhubung: currentState.mainId,
            }),
            imageBase64: imageBase64,
            attachmentUrl: screenshotUrl, // Include URL as well
          },
        };

        console.log(
          `[DEBUG] Sending final registration data to Apps Script for message ${repliedToMessageId}`
        );
        // Send data to Google Apps Script
        const appsScriptResponse = await fetch(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(finalPayload),
        });

        if (!appsScriptResponse.ok) {
          const errorText = await appsScriptResponse.text();
          throw new Error(
            `Apps Script Error (${appsScriptResponse.status}): ${errorText}`
          );
        }
        const result = await appsScriptResponse.json();
        console.log(
          `[DEBUG] Final Apps Script response for ${repliedToMessageId}:`,
          result
        );

        // --- PROCESS SUCCESSFUL RESPONSE from Apps Script ---
        if (result.status === "success" && result.details) {
          const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("✅ Registration Successful!") // English
            .addFields(
              {
                name: "Governor ID", // English
                value: result.details.govId?.toString() || "N/A",
                inline: true,
              },
              {
                name: "Account Type", // English
                value: result.details.type || currentState.accountType || "N/A",
                inline: true,
              }
              // Add more fields as needed based on Apps Script response
            )
            .setTimestamp();
          // Add specific details based on account type from GAS response
          if (result.details.type === "main") {
            successEmbed.addFields(
              {
                name: "Status", // English
                value: result.details.status || "N/A",
                inline: true,
              },
              {
                name: "Target KP", // English
                value: result.details.targetKP?.toLocaleString() || "N/A",
                inline: true,
              },
              {
                name: "Target Deaths", // English
                value: result.details.targetDeath?.toLocaleString() || "N/A",
                inline: true,
              }
            );
          } else if (result.details.type === "farm") {
            successEmbed.addFields(
              {
                name: "Is Filler?", // English
                value: result.details.isFiller ? "Yes" : "No", // English
                inline: true,
              },
              {
                name: "Linked Main ID", // English
                value: result.details.linkedMainId || "N/A",
                inline: true,
              }
            );
          }
          if (result.message) successEmbed.setDescription(result.message); // Use message from GAS if provided

          // Edit the "Processing..." message with the success embed
          if (processingMessage && !processingMessage.deleted) {
            await processingMessage
              .edit({
                content: `${message.author}, your registration is complete!`, // English
                embeds: [successEmbed],
              })
              .catch(console.error);
          } else {
            // Fallback if processing message was deleted
            await message.channel
              .send({
                content: `${message.author}, your registration is complete!`, // English
                embeds: [successEmbed],
              })
              .catch(console.error);
          }

          // Remove components (buttons/menus) from the original interactive message
          try {
            const originalInteractionMessage =
              await message.channel.messages.fetch(repliedToMessageId);
            if (
              originalInteractionMessage &&
              originalInteractionMessage.components.length > 0
            ) {
              await originalInteractionMessage.edit({
                components: [], // Remove all components
              });
              console.log(
                `[DEBUG] Components removed from original message ${repliedToMessageId}`
              );
            }
          } catch (editError) {
            // Ignore if message is already deleted or components removed
            if (editError.code !== 10008) {
              // Ignore "Unknown Message"
              console.warn(
                `[WARN] Could not remove components from original message ${repliedToMessageId}: ${editError.message}`
              );
            }
          }

          // --- CLEAN UP STATE AND UNLOCK CHANNEL AFTER SUCCESS ---
          registrationState.delete(repliedToMessageId);
          if (channelId) {
            if (activeRegistrationChannels.has(channelId)) {
              activeRegistrationChannels.delete(channelId); // Use central Set
              console.log(
                `[INFO] Registration state cleared and channel ${channelId} unlocked successfully for message ${repliedToMessageId}`
              );
            }
          } else {
            // Should ideally not happen if state was valid, but log anyway
            console.log(
              `[INFO] Registration state cleared successfully for message ${repliedToMessageId} (channelId not found in final state).`
            );
          }
          // ---

          // --- PROCESS FAILED RESPONSE from Apps Script ---
        } else {
          console.error(
            `[ERROR] Registration failed via Apps Script for ${repliedToMessageId}. Response:`,
            result
          );
          const failMessage = `❌ Registration failed: ${
            result.message || "Unknown error from registration system." // English
          }`;
          // Edit the "Processing..." message with the failure reason
          if (processingMessage && !processingMessage.deleted) {
            await processingMessage.edit(failMessage).catch(console.error);
          } else {
            // Fallback reply if processing message deleted
            await message.reply(failMessage).catch(console.error);
          }
          // --- CLEAN UP STATE AND UNLOCK CHANNEL AFTER GAS FAILURE ---
          registrationState.delete(repliedToMessageId);
          if (channelId) {
            if (activeRegistrationChannels.has(channelId)) {
              activeRegistrationChannels.delete(channelId); // Use central Set
              console.log(
                `[INFO] Registration state cleared and channel ${channelId} unlocked due to Apps Script failure for message ${repliedToMessageId}`
              );
            }
          } else {
            console.log(
              `[INFO] Registration state cleared due to Apps Script failure for message ${repliedToMessageId} (channelId not found in final state).`
            );
          }
          // ---
        }
        // --- HANDLE INTERNAL ERRORS DURING PROCESSING ---
      } catch (error) {
        console.error(
          `[ERROR] Error during final registration processing for ${repliedToMessageId}:`,
          error
        );
        const errorMessage = `An internal error occurred during registration: ${error.message}. Please try again or contact an admin.`; // English
        // Edit the "Processing..." message with the internal error
        if (processingMessage && !processingMessage.deleted) {
          await processingMessage.edit(errorMessage).catch(console.error);
        } else {
          // Fallback reply if processing message deleted
          await message.reply(errorMessage).catch(console.error);
        }
        // --- CLEAN UP STATE AND UNLOCK CHANNEL AFTER INTERNAL ERROR ---
        registrationState.delete(repliedToMessageId);
        if (channelId) {
          if (activeRegistrationChannels.has(channelId)) {
            activeRegistrationChannels.delete(channelId); // Use central Set
            console.log(
              `[INFO] Registration state cleared and channel ${channelId} unlocked due to internal error for message ${repliedToMessageId}`
            );
          }
        } else {
          console.log(
            `[INFO] Registration state cleared due to internal error for message ${repliedToMessageId} (channelId not found in final state).`
          );
        }
        // ---
      }
    } else {
      // Reply if the attachment is not an image
      // Don't stop the process or unlock, just prompt again
      await message
        .reply("⚠️ Please reply with an image file (screenshot).") // English
        .catch(console.error);
    }
  }
  // Ignore replies that don't have attachments
}); // End MessageCreate listener

// Login the Bot
console.log("Attempting to log in...");
client.login(token);

// Start Keep-Alive Server (Optional but recommended for Replit free tier)
try {
  const keepAlive = require("./server.js"); // Ensure server.js exists
  keepAlive();
  console.log("[INFO] Keep-alive server started.");
} catch (serverError) {
  if (serverError.code === "MODULE_NOT_FOUND") {
    console.log("[INFO] Keep-alive server (server.js) not found, skipping.");
  } else {
    console.error("[ERROR] Could not start keep-alive server:", serverError);
  }
}
