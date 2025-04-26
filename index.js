// index.js (Complete English Version with Fixes v3 - Channel Lock Handling)
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
  MessageFlags,
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed if using require

// State management
const registrationState = new Map();
// --- CHANNEL LOCK MANAGEMENT ---
// Define the Set here to be managed by index.js
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

// Fungsi ini menangani logika setelah tipe akun dipilih
async function handleAccountTypeSelection(interaction, selectedType, stateMap) {
  console.log(
    `[Function] handleAccountTypeSelection called for type: ${selectedType}`
  );
  const channelId = interaction.channel?.id; // Get channel ID for potential lock release on error

  try {
    // Asumsi interaction sudah di-defer SEBELUM memanggil fungsi ini
    if (!interaction.deferred && !interaction.replied) {
      console.warn(
        `[WARN] handleAccountTypeSelection called on non-deferred/replied interaction ${interaction.id}`
      );
      try {
        await interaction.deferUpdate();
      } catch (deferError) {
        console.error(
          `[ERROR] Fallback deferUpdate failed in handleAccountTypeSelection:`,
          deferError
        );
        // --- HAPUS KUNCI JIKA GAGAL ---
        if (channelId) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to handleAccountTypeSelection defer error.`
          );
        }
        // ---
        return;
      }
    }

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

    // Store initial state
    stateMap.set(interaction.message.id, {
      step: "select_status_or_filler",
      userId: interaction.user.id,
      accountType: selectedType,
      channelId: channelId, // Simpan channelId di state untuk referensi nanti
    });
    console.log(
      `[DEBUG] Initial state stored for message ${interaction.message.id}:`,
      stateMap.get(interaction.message.id)
    );

    // Build UI based on selection
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
      console.error(
        `[ERROR] Unknown selectedType in handleAccountTypeSelection: ${selectedType}`
      );
      await interaction.editReply({
        content: "An unexpected error occurred.",
        embeds: [],
        components: [],
      });
      // --- HAPUS KUNCI JIKA ERROR ---
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
    // --- HAPUS KUNCI JIKA ERROR ---
    if (channelId) {
      activeRegistrationChannels.delete(channelId);
      console.log(
        `[DEBUG] Channel ${channelId} unlocked due to error in handleAccountTypeSelection.`
      );
    }
    // ---
    if (error.code !== 10062) {
      // Jangan coba followUp jika interaction sudah hilang
      try {
        // Coba edit reply jika memungkinkan, jika tidak followUp
        if (
          interaction.message &&
          !interaction.replied &&
          !interaction.deferred
        ) {
          await interaction.editReply({
            content: "Error processing selection.",
            embeds: [],
            components: [],
            flags: [MessageFlags.Ephemeral],
          });
        } else {
          await interaction.followUp({
            content: "Error processing selection.",
            flags: [MessageFlags.Ephemeral],
          });
        }
      } catch (errorReplyError) {
        console.error(
          "[ERROR] Failed to send handleAccountTypeSelection error followup:",
          errorReplyError
        );
      }
    }
  }
}

// Event Listener: Interaction Created
client.on(Events.InteractionCreate, async (interaction) => {
  const channelId = interaction.channel?.id; // Dapatkan channel ID di awal

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
      // --- PASS activeRegistrationChannels TO COMMAND EXECUTE ---
      // Pastikan command 'register' menerima argumen ketiga
      if (interaction.commandName === "register") {
        await command.execute(
          interaction,
          appsScriptUrl,
          activeRegistrationChannels
        );
      } else {
        // Untuk command lain yang mungkin tidak memerlukan lock management
        await command.execute(interaction, appsScriptUrl);
      }
      // ---
    } catch (error) {
      console.error(
        `[ERROR] Error executing command ${interaction.commandName}:`,
        error
      );
      // --- HAPUS KUNCI JIKA EKSEKUSI COMMAND GAGAL (terutama untuk register) ---
      if (interaction.commandName === "register" && channelId) {
        activeRegistrationChannels.delete(channelId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to command execution error.`
        );
      }
      // ---
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
    return;
  }

  // Handle String Select Menu Interactions
  if (interaction.isStringSelectMenu()) {
    const selectedValue = interaction.values[0];
    const messageId = interaction.message.id;
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Select Menu Interaction received: ${customId} (interaction: ${interaction.id}, message: ${messageId})`
    );

    try {
      let shouldDefer = true;
      if (customId === "register_select_filler_status") {
        shouldDefer = false;
        console.log(
          `[DEBUG] Skipping deferUpdate for ${customId} because showModal will be used.`
        );
      }

      if (shouldDefer && !interaction.deferred && !interaction.replied) {
        try {
          await interaction.deferUpdate();
          console.log(
            `[DEBUG] Interaction ${customId} (${interaction.id}) deferred.`
          );
        } catch (deferError) {
          console.error(
            `[ERROR] Failed to defer interaction ${customId} (${interaction.id}):`,
            deferError
          );
          // Jika defer gagal, proses mungkin terhenti, hapus kunci jika relevan
          if (customId.startsWith("register_") && channelId) {
            const currentState = registrationState.get(messageId);
            if (currentState && currentState.userId === interaction.user.id) {
              activeRegistrationChannels.delete(channelId);
              registrationState.delete(messageId);
              console.log(
                `[DEBUG] Channel ${channelId} unlocked due to select menu defer error.`
              );
            }
          }
          return;
        }
      }

      // Proses berdasarkan customId
      if (customId === "register_select_account_type") {
        await handleAccountTypeSelection(
          interaction,
          selectedValue,
          registrationState
        );
      } else if (customId === "register_select_main_status") {
        const currentState = registrationState.get(messageId);
        if (
          !currentState ||
          currentState.userId !== interaction.user.id ||
          currentState.step !== "select_status_or_filler"
        ) {
          console.warn(
            `[WARN] State/User/Step mismatch for ${customId}: ${messageId}`
          );
          await interaction.editReply({
            content:
              "Sesi registrasi tidak valid atau kedaluwarsa. Silakan mulai ulang dengan /register.",
            embeds: [],
            components: [],
          });
          // --- HAPUS KUNCI JIKA STATE TIDAK VALID ---
          if (currentState && channelId === currentState.channelId) {
            // Pastikan channel cocok
            activeRegistrationChannels.delete(channelId);
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to state mismatch (main status).`
            );
          }
          registrationState.delete(messageId);
          // ---
          return;
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
      } else if (customId === "register_select_filler_status") {
        // Interaction TIDAK di-defer di awal
        const currentState = registrationState.get(messageId);
        if (
          !currentState ||
          currentState.userId !== interaction.user.id ||
          currentState.step !== "select_status_or_filler"
        ) {
          console.warn(
            `[WARN] State/User/Step mismatch for ${customId}: ${messageId}`
          );
          // --- HAPUS KUNCI JIKA STATE TIDAK VALID ---
          if (currentState && channelId === currentState.channelId) {
            activeRegistrationChannels.delete(channelId);
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to state mismatch (filler status).`
            );
          }
          registrationState.delete(messageId);
          // ---
          try {
            await interaction.reply({
              content:
                "Sesi registrasi tidak valid atau kedaluwarsa. Silakan mulai ulang dengan /register.",
              flags: [MessageFlags.Ephemeral],
            });
          } catch (replyError) {
            console.error(
              `[ERROR] Failed to send ephemeral reply for state mismatch (${customId}):`,
              replyError
            );
            try {
              await interaction.followUp({
                content: "Sesi registrasi tidak valid...",
                flags: [MessageFlags.Ephemeral],
              });
            } catch (e) {}
          }
          return;
        }
        currentState.isFiller = selectedValue === "true";
        currentState.step = "awaiting_main_id_modal";
        registrationState.set(messageId, currentState);

        const modal = new ModalBuilder()
          .setCustomId(
            `register_farm_modal_${interaction.user.id}_${messageId}`
          )
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
          `[DEBUG] Modal shown for ${customId} (interaction: ${interaction.id}).`
        );
      }
    } catch (error) {
      console.error(
        `[ERROR] Error handling select menu ${customId} (${interaction.id}):`,
        error
      );
      // --- HAPUS KUNCI JIKA ERROR ---
      const currentState = registrationState.get(messageId);
      if (currentState && channelId === currentState.channelId) {
        activeRegistrationChannels.delete(channelId);
        registrationState.delete(messageId); // Hapus state juga
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to select menu error.`
        );
      }
      // ---
      if (error.code !== 10062 && error.code !== 40060) {
        // 40060: Interaction has already been acknowledged (misal showModal gagal)
        try {
          if (interaction.deferred || interaction.replied) {
            // Jika sudah di-ack
            await interaction.followUp({
              content: "Terjadi error saat memproses pilihan Anda.",
              flags: [MessageFlags.Ephemeral],
            });
          } else if (interaction.isRepliable()) {
            // Jika belum di-ack
            await interaction.reply({
              content: "Terjadi error saat memproses pilihan Anda.",
              flags: [MessageFlags.Ephemeral],
            });
          }
        } catch (errorReplyError) {
          console.error(
            "[ERROR] Failed to send select menu error reply/followup:",
            errorReplyError
          );
        }
      }
    }
    return;
  }

  // Handle Button Interactions
  if (interaction.isButton()) {
    const messageId = interaction.message.id;
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Button Interaction received: ${customId} (interaction: ${interaction.id}, message: ${messageId})`
    );

    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate();
        console.log(
          `[DEBUG] Button Interaction ${customId} (${interaction.id}) deferred.`
        );
      }

      if (customId === "register_cancel") {
        const currentState = registrationState.get(messageId);
        await interaction.editReply({
          content: "❌ Registration process cancelled.",
          embeds: [],
          components: [],
        });
        // --- HAPUS KUNCI SAAT CANCEL ---
        if (currentState && channelId === currentState.channelId) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to user cancellation.`
          );
        }
        registrationState.delete(messageId);
        // ---
      } else if (customId === "register_back_to_type") {
        // Hapus state saat kembali, tapi JANGAN hapus kunci karena proses masih berjalan
        registrationState.delete(messageId);
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
          content: null, // Hapus konten teks sebelumnya
          embeds: [initialEmbed],
          components: [selectRow, buttonRow],
        });
      }
      // Add handlers for other buttons if needed (e.g., register_confirm_submit is handled in MessageCreate now)
    } catch (error) {
      console.error(
        `[ERROR] Error handling button ${customId} (${interaction.id}):`,
        error
      );
      // --- HAPUS KUNCI JIKA ERROR TOMBOL ---
      const currentState = registrationState.get(messageId);
      if (currentState && channelId === currentState.channelId) {
        activeRegistrationChannels.delete(channelId);
        registrationState.delete(messageId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to button error.`
        );
      }
      // ---
      if (error.code !== 10062 && error.code !== 40060) {
        try {
          await interaction.followUp({
            content: "Terjadi error saat memproses tombol.",
            flags: [MessageFlags.Ephemeral],
          });
        } catch (errorReplyError) {
          console.error(
            "[ERROR] Failed to send button error reply:",
            errorReplyError
          );
        }
      }
    }
    return;
  }

  // Handle Modal Submissions
  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Modal Submit Interaction received: ${customId} (interaction: ${interaction.id})`
    );

    // --- Variabel untuk messageId dan userId dari modal ---
    let messageId;
    let userIdFromModal;

    try {
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

      messageId = customIdParts[4]; // Ambil messageId dari customId
      userIdFromModal = customIdParts[3]; // Ambil userId dari customId

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

      if (interaction.user.id !== userIdFromModal) {
        console.warn(
          `[WARN] Modal user mismatch: Expected ${userIdFromModal}, got ${interaction.user.id} for ${customId}`
        );
        await interaction.reply({
          content: "Error processing form: User mismatch. Please start over.",
          flags: [MessageFlags.Ephemeral],
        });
        // --- HAPUS KUNCI JIKA USER MISMATCH ---
        const currentState = registrationState.get(messageId);
        if (currentState && channelId === currentState.channelId) {
          activeRegistrationChannels.delete(channelId);
          registrationState.delete(messageId);
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to modal user mismatch.`
          );
        }
        // ---
        return;
      }

      // Defer modal submission SETELAH validasi dasar
      await interaction.deferUpdate();
      console.log(
        `[DEBUG] Modal Interaction ${customId} (${interaction.id}) deferred.`
      );

      // Proses state dan edit pesan asli
      const currentState = registrationState.get(messageId);
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
        // --- HAPUS KUNCI JIKA STATE TIDAK VALID ---
        if (currentState && channelId === currentState.channelId) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to modal state mismatch.`
          );
        }
        registrationState.delete(messageId);
        // ---
        await interaction.followUp({
          content:
            "Registration session invalid/expired. Please start over with /register.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const linkedMainId = interaction.fields.getTextInputValue(
        "register_main_id_input"
      );
      if (!/^\d+$/.test(linkedMainId)) {
        // Jangan hapus state atau kunci, biarkan user coba lagi atau cancel
        await interaction.followUp({
          content:
            "Error: Invalid Governor ID format. Please enter numbers only.",
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      currentState.mainId = linkedMainId;
      currentState.step = "awaiting_screenshot";
      registrationState.set(messageId, currentState);

      // Edit pesan interaktif asli
      try {
        // Coba fetch pesan asli menggunakan messageId dari customId modal
        const originalMessage = await interaction.channel.messages.fetch(
          messageId
        );
        if (!originalMessage) {
          // Ini seharusnya tidak terjadi jika state valid, tapi sebagai fallback
          console.error(
            `[ERROR] Original message ${messageId} not found after modal submit.`
          );
          // --- HAPUS KUNCI JIKA PESAN ASLI HILANG ---
          if (channelId === currentState.channelId) {
            activeRegistrationChannels.delete(channelId);
            console.log(
              `[DEBUG] Channel ${channelId} unlocked due to missing original message after modal.`
            );
          }
          registrationState.delete(messageId);
          // ---
          await interaction.followUp({
            content: "Error: Could not find the original registration message.",
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

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
            {
              name: "Linked Main ID",
              value: linkedMainId,
              inline: true,
            }
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
        // --- HAPUS KUNCI JIKA EDIT GAGAL ---
        if (channelId === currentState.channelId) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to failed edit after modal.`
          );
        }
        registrationState.delete(messageId);
        // ---
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
      // --- HAPUS KUNCI JIKA ERROR MODAL UMUM ---
      const currentState = registrationState.get(messageId); // Ambil messageId lagi jika perlu
      if (currentState && channelId === currentState.channelId) {
        activeRegistrationChannels.delete(channelId);
        registrationState.delete(messageId);
        console.log(
          `[DEBUG] Channel ${channelId} unlocked due to modal submit error.`
        );
      }
      // ---
      if (error.code !== 10062 && error.code !== 40060) {
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: "Error processing form submission.",
              flags: [MessageFlags.Ephemeral],
            });
          } else {
            await interaction.followUp({
              content: "Error processing form submission.",
              flags: [MessageFlags.Ephemeral],
            });
          }
        } catch (errorReplyError) {
          console.error(
            "[ERROR] Failed to send modal error reply/followup:",
            errorReplyError
          );
        }
      }
    }
    return;
  }
});

// Event Listener: Message Created (for screenshot replies)
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || message.type !== MessageType.Reply) return;

  const repliedToMessageId = message.reference?.messageId;
  if (!repliedToMessageId) return;

  const currentState = registrationState.get(repliedToMessageId);
  // Pastikan state ada, user cocok, dan langkahnya benar
  if (
    !currentState ||
    currentState.userId !== message.author.id ||
    currentState.step !== "awaiting_screenshot"
  ) {
    return; // Abaikan jika tidak cocok
  }

  // Dapatkan channelId dari state yang disimpan sebelumnya
  const channelId = currentState.channelId;

  if (message.attachments.size > 0) {
    const attachment = message.attachments.first();
    if (attachment.contentType?.startsWith("image/")) {
      console.log(
        `[DEBUG] Screenshot received for message ${repliedToMessageId} from user ${message.author.id}`
      );
      await message.react("👍").catch(console.error);

      let processingMessage;
      try {
        processingMessage = await message
          .reply("⏳ Processing your registration, please wait...")
          .catch(console.error);
        if (!processingMessage) {
          console.error("[ERROR] Failed to send processing message reply.");
          // Coba kirim pesan biasa jika reply gagal
          processingMessage = await message.channel
            .send(`Processing registration for ${message.author}...`)
            .catch(console.error);
        }
      } catch (replyError) {
        console.error(
          "[ERROR] Failed to send initial processing message:",
          replyError
        );
        // Jika gagal mengirim pesan proses, kemungkinan ada masalah channel, hentikan dan hapus kunci
        if (channelId) {
          activeRegistrationChannels.delete(channelId);
          registrationState.delete(repliedToMessageId);
          console.log(
            `[DEBUG] Channel ${channelId} unlocked due to processing message failure.`
          );
        }
        return;
      }

      let imageBase64 = "";
      try {
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

        const finalPayload = {
          command: "register",
          data: {
            discordUserId: currentState.userId,
            discordUsername: message.author.username,
            tipeAkun: currentState.accountType,
            ...(currentState.accountType === "main" && {
              statusMain: currentState.status,
            }),
            ...(currentState.accountType === "farm" && {
              isFiller: currentState.isFiller,
              idMainTerhubung: currentState.mainId,
            }),
            imageBase64: imageBase64,
            attachmentUrl: screenshotUrl, // Sertakan URL juga
          },
        };

        console.log(
          `[DEBUG] Sending final registration data to Apps Script for message ${repliedToMessageId}`
        );
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

        // --- PROSES SUKSES ---
        if (result.status === "success" && result.details) {
          const successEmbed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle("✅ Registration Successful!")
            .addFields(
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
              // ... (Tambahkan field lain sesuai kebutuhan) ...
            )
            .setTimestamp();
          // Tambahkan detail spesifik berdasarkan tipe akun dari respons GAS
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
          if (result.message) successEmbed.setDescription(result.message);
          // Jangan tambahkan thumbnail lagi: // successEmbed.setThumbnail(attachment.url);

          if (processingMessage && !processingMessage.deleted) {
            await processingMessage
              .edit({
                content: `${message.author}, your registration is complete!`,
                embeds: [successEmbed],
              })
              .catch(console.error);
          } else {
            // Jika pesan proses hilang, kirim pesan baru
            await message.channel
              .send({
                content: `${message.author}, your registration is complete!`,
                embeds: [successEmbed],
              })
              .catch(console.error);
          }

          // Hapus komponen dari pesan interaksi asli
          try {
            const originalInteractionMessage =
              await message.channel.messages.fetch(repliedToMessageId);
            if (
              originalInteractionMessage &&
              originalInteractionMessage.components.length > 0
            ) {
              await originalInteractionMessage.edit({
                components: [], // Hapus semua tombol/menu
              });
              console.log(
                `[DEBUG] Components removed from original message ${repliedToMessageId}`
              );
            }
          } catch (editError) {
            // Abaikan jika pesan asli tidak ditemukan atau tidak bisa diedit
            if (editError.code !== 10008) {
              // Jangan log jika Unknown Message
              console.warn(
                `[WARN] Could not remove components from original message ${repliedToMessageId}: ${editError.message}`
              );
            }
          }

          // --- HAPUS STATE DAN KUNCI SETELAH SUKSES ---
          registrationState.delete(repliedToMessageId);
          if (channelId) {
            activeRegistrationChannels.delete(channelId);
            console.log(
              `[INFO] Registration state cleared and channel ${channelId} unlocked successfully for message ${repliedToMessageId}`
            );
          } else {
            console.log(
              `[INFO] Registration state cleared successfully for message ${repliedToMessageId} (channelId not found in state).`
            );
          }
          // ---

          // --- PROSES GAGAL (dari Apps Script) ---
        } else {
          console.error(
            `[ERROR] Registration failed via Apps Script for ${repliedToMessageId}. Response:`,
            result
          );
          const failMessage = `❌ Registration failed: ${
            result.message || "Unknown error from registration system."
          }`;
          if (processingMessage && !processingMessage.deleted) {
            await processingMessage.edit(failMessage).catch(console.error);
          } else {
            await message.reply(failMessage).catch(console.error);
          }
          // --- HAPUS STATE DAN KUNCI SETELAH GAGAL DARI GAS ---
          registrationState.delete(repliedToMessageId);
          if (channelId) {
            activeRegistrationChannels.delete(channelId);
            console.log(
              `[INFO] Registration state cleared and channel ${channelId} unlocked due to Apps Script failure for message ${repliedToMessageId}`
            );
          } else {
            console.log(
              `[INFO] Registration state cleared due to Apps Script failure for message ${repliedToMessageId} (channelId not found in state).`
            );
          }
          // ---
        }
        // --- ERROR INTERNAL SAAT PROSES ---
      } catch (error) {
        console.error(
          `[ERROR] Error during final registration processing for ${repliedToMessageId}:`,
          error
        );
        const errorMessage = `An internal error occurred during registration: ${error.message}. Please try again or contact an admin.`;
        if (processingMessage && !processingMessage.deleted) {
          await processingMessage.edit(errorMessage).catch(console.error);
        } else {
          // Coba reply ke pesan user jika pesan proses gagal/hilang
          await message.reply(errorMessage).catch(console.error);
        }
        // --- HAPUS STATE DAN KUNCI SETELAH ERROR INTERNAL ---
        registrationState.delete(repliedToMessageId);
        if (channelId) {
          activeRegistrationChannels.delete(channelId);
          console.log(
            `[INFO] Registration state cleared and channel ${channelId} unlocked due to internal error for message ${repliedToMessageId}`
          );
        } else {
          console.log(
            `[INFO] Registration state cleared due to internal error for message ${repliedToMessageId} (channelId not found in state).`
          );
        }
        // ---
      }
    } else {
      // Jika bukan gambar, minta lagi tanpa menghentikan proses/menghapus kunci
      await message
        .reply("⚠️ Please reply with an image file (screenshot).")
        .catch(console.error);
    }
  }
});

// Login the Bot
console.log("Attempting to log in...");
client.login(token);

// Start Keep-Alive Server (Optional but recommended for Replit free tier)
try {
  const keepAlive = require("./server.js"); // Pastikan file server.js ada
  keepAlive();
  console.log("[INFO] Keep-alive server started.");
} catch (serverError) {
  if (serverError.code === "MODULE_NOT_FOUND") {
    console.log("[INFO] Keep-alive server (server.js) not found, skipping.");
  } else {
    console.error("[ERROR] Could not start keep-alive server:", serverError);
  }
}
