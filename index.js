// index.js (Cleaned & Ignores 'register_' IDs - v3)
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  MessageFlags,
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const fetch = require("node-fetch"); // Keep if other parts of index.js use it

// Load Credentials & Configuration
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL; // Pass this to commands

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
    GatewayIntentBits.MessageContent,
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

// Event Listener: Interaction Created
client.on(Events.InteractionCreate, async (interaction) => {
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
      // Pass appsScriptUrl to the command's execute function
      await command.execute(interaction, appsScriptUrl);
    } catch (error) {
      console.error(
        `[ERROR] Error executing command ${interaction.commandName}:`,
        error
      );
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
    return; // End handler for commands
  }

  // --- Check if interaction should be handled by a command's collector ---
  // Simple check: If customId starts with 'register_', assume register.js handles it.
  if (interaction.customId && interaction.customId.startsWith("register_")) {
    console.log(
      `[DEBUG] Interaction ${interaction.customId} (${interaction.id}) ignored by index.js listener (handled by command).`
    );
    return; // Let the collector in register.js handle this
  }

  // --- Handle other interactions NOT handled by command collectors ---
  if (interaction.isStringSelectMenu()) {
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Unhandled Select Menu Interaction received in index.js: ${customId} (interaction: ${interaction.id})`
    );
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `Received unhandled menu: ${customId}. This interaction is not yet configured.`,
          ephemeral: true,
        });
      }
    } catch (e) {
      if (e.code !== 10062)
        console.error(`Error acknowledging unhandled menu ${customId}:`, e);
    }
    return;
  }

  if (interaction.isButton()) {
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Unhandled Button Interaction received in index.js: ${customId} (interaction: ${interaction.id})`
    );
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `Received unhandled button: ${customId}. This interaction is not yet configured.`,
          ephemeral: true,
        });
      }
    } catch (e) {
      if (e.code !== 10062)
        console.error(`Error acknowledging unhandled button ${customId}:`, e);
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    const customId = interaction.customId;
    console.log(
      `[DEBUG] Unhandled Modal Submit Interaction received in index.js: ${customId} (interaction: ${interaction.id})`
    );
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: `Received unhandled modal: ${customId}. This interaction is not yet configured.`,
          ephemeral: true,
        });
      }
    } catch (e) {
      if (e.code !== 10062)
        console.error(`Error acknowledging unhandled modal ${customId}:`, e);
    }
    return;
  }
});

// Login the Bot
console.log("Attempting to log in...");
client.login(token);

// Start Keep-Alive Server (Optional but recommended for Replit free tier)
// --- MODIFICATION: Consider removing this if deploying to Render ---
try {
  const keepAlive = require("./server.js"); // Pastikan file server.js ada
  if (typeof keepAlive === "function") {
    // Check if keepAlive is a function
    keepAlive();
    console.log("[INFO] Keep-alive server started.");
  } else {
    console.warn("[WARN] keepAlive was required but not a function. Skipping.");
  }
} catch (serverError) {
  if (serverError.code === "MODULE_NOT_FOUND") {
    console.log("[INFO] Keep-alive server (server.js) not found, skipping.");
  } else {
    console.error("[ERROR] Could not start keep-alive server:", serverError);
  }
}
