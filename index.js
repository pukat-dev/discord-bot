// index.js (Simplified for Non-Interactive, English)
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  // EmbedBuilder, ActionRowBuilder, etc., no longer needed here for registration
  MessageFlags, // Still useful for ephemeral replies
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const fetch = require("node-fetch"); // Still needed by register.js

// --- State Management Removed ---
// const registrationState = new Map(); // No longer needed
// const activeRegistrationChannels = new Set(); // No longer needed

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
  // No need to exit, but inform the user
}
if (!appsScriptUrl) {
  console.error("Error: APPS_SCRIPT_WEB_APP_URL not found!");
  // May need to exit if the bot cannot function without it
  // process.exit(1);
}

// Create a new Discord Client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    // GatewayIntentBits.GuildMessages, // May not be needed if not reading regular messages
    // GatewayIntentBits.MessageContent, // Not needed if not reading message content
    // Adjust intents based on your other commands' needs
  ],
});

// --- IMPORTANT: Error Handler for the Client ---
client.on(Events.Error, (error) => {
  console.error("!!! DISCORD CLIENT ERROR !!!:", error);
});
// --- END Error Handler ---

// Setup Command Handling
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands"); // Ensure 'commands' folder exists
try {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
      // Clear cache if file was previously required (useful for hot-reloading)
      delete require.cache[require.resolve(filePath)];
      const command = require(filePath);

      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        console.log(`[INFO] Loaded command: ${command.data.name}`);
      } else {
        console.log(
          `[WARN] Command at ${filePath} is missing "data" or "execute".`
        );
      }
    } catch (loadError) {
      console.error(
        `[ERROR] Failed to load command at ${filePath}:`,
        loadError
      );
    }
  }
} catch (error) {
  console.error("Error reading commands folder:", error);
  // Consider exiting if commands cannot be loaded
  // process.exit(1);
}

// Event Listener: Bot Ready
client.once(Events.ClientReady, (readyClient) => {
  console.log(`>>> Bot Ready! Logged in as ${readyClient.user.tag} <<<`);
  // You might want to register slash commands here if not done elsewhere
  // require('./deploy-commands'); // Example if you have a deploy-commands.js file
});

// =======================================================================
// Event Listener: InteractionCreate (Handles Commands Only)
// =======================================================================
client.on(Events.InteractionCreate, async (interaction) => {
  // Only process Chat Input Commands (Slash Commands)
  if (!interaction.isChatInputCommand()) {
    // If you have other interaction types (e.g., buttons from OTHER commands),
    // handle them here. But for registration, we ignore them.
    // console.log(`[DEBUG] Ignoring non-command interaction: ${interaction.type}`);
    return;
  }

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`[ERROR] Command ${interaction.commandName} not found.`);
    try {
      await interaction.reply({
        content: `Command '${interaction.commandName}' was not found.`, // English error message
        flags: [MessageFlags.Ephemeral], // Use ephemeral flags
      });
    } catch (replyError) {
      console.error(
        "[ERROR] Failed to send 'command not found' reply:",
        replyError
      );
    }
    return;
  }

  console.log(
    `[INFO] Executing command: ${interaction.commandName} by ${interaction.user.tag} (${interaction.user.id})`
  );

  try {
    // Execute the command, only passing interaction and appsScriptUrl
    await command.execute(interaction, appsScriptUrl);
  } catch (error) {
    console.error(
      `[ERROR] Error executing command ${interaction.commandName}:`,
      error
    );
    try {
      // Try sending an error message, either via followUp (if already deferred/replied) or a new reply
      const errorMessage = "An error occurred while executing this command!"; // English error message
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: errorMessage,
          flags: [MessageFlags.Ephemeral], // Use ephemeral flags
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          flags: [MessageFlags.Ephemeral], // Use ephemeral flags
        });
      }
    } catch (errorReplyError) {
      console.error(
        "[ERROR] Failed to send command execution error reply:",
        errorReplyError
      );
    }
  }
}); // End InteractionCreate listener

// --- MessageCreate Listener Removed ---
// This listener is no longer needed for the non-interactive registration flow
// client.on(Events.MessageCreate, async (message) => { ... });

// Login the Bot
console.log("Attempting to log in...");
client
  .login(token)
  .then(() => {
    console.log("[INFO] Bot successfully logged in.");
  })
  .catch((loginError) => {
    console.error("[FATAL] Bot failed to log in:", loginError);
    process.exit(1); // Exit if login fails
  });

// Optional: Add signal handling for graceful shutdown
process.on("SIGINT", () => {
  console.log("SIGINT received. Shutting down gracefully...");
  client.destroy(); // Destroy Discord connection
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down gracefully...");
  client.destroy();
  process.exit(0);
});
