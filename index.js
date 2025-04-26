// index.js (Complete English Version with Fixes)
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
    MessageFlags, // <-- Added for ephemeral flags
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed if using require

// State management
const registrationState = new Map();

// Load Credentials & Configuration
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
// const gcpApiKey = process.env.GCP_API_KEY; // Uncomment if needed

if (!token) {
    console.error(
        "Error: DISCORD_BOT_TOKEN not found in environment variables/secrets!",
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
                `[WARN] Command at ${filePath} is missing "data" or "execute".`,
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

// --- FUNCTION MOVED HERE (BEFORE InteractionCreate) ---
async function handleAccountTypeSelection(interaction, selectedType, stateMap) {
    console.log(
        `[Function] handleAccountTypeSelection called for type: ${selectedType}`,
    );
    try {
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
                .setStyle(ButtonStyle.Danger),
        );

        // Store initial state
        stateMap.set(interaction.message.id, {
            step: "select_status_or_filler",
            userId: interaction.user.id,
            accountType: selectedType,
        });
        console.log(
            `Initial state stored for message ${interaction.message.id}:`,
            stateMap.get(interaction.message.id),
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
                        .setValue("Old Player"), // Keep specific labels if needed
                    new StringSelectMenuOptionBuilder()
                        .setLabel("DKP Migrants")
                        .setValue("Migrants"), // Keep specific labels if needed
                );
            componentsRow1 = new ActionRowBuilder().addComponents(statusSelect);
        } else if (selectedType === "farm") {
            nextEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle("📝 Register Farm Account")
                .setDescription(
                    'Is this farm account a designated "Filler Account"?',
                )
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
                        .setValue("false"),
                );
            componentsRow1 = new ActionRowBuilder().addComponents(fillerSelect);
        } else {
            console.error(
                `Unknown selectedType in handleAccountTypeSelection: ${selectedType}`,
            );
            await interaction.editReply({
                content: "An unexpected error occurred.",
                embeds: [],
                components: [],
            }); // Use editReply since interaction was deferred
            return;
        }

        console.log(`Editing reply for ${selectedType} selection.`);
        // --- USE editReply HERE --- (Because the interaction was deferred before calling this function)
        await interaction.editReply({
            embeds: [nextEmbed],
            components: [componentsRow1, componentsRow2],
        });
        console.log(`Interaction reply edited.`);
    } catch (error) {
        console.error(
            `Error updating interaction in handleAccountTypeSelection for type ${selectedType}:`,
            error,
        );
        try {
            // Always use followUp for error handling if interaction was deferred
            await interaction.followUp({
                content: "Error processing selection.",
                flags: [MessageFlags.Ephemeral],
            });
        } catch (errorReplyError) {
            console.error(
                "Failed to send handleAccountTypeSelection error followup:",
                errorReplyError,
            );
        }
    }
}
// --- END OF MOVED FUNCTION ---

// Event Listener: Interaction Created
client.on(Events.InteractionCreate, async (interaction) => {
    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(
            interaction.commandName,
        );
        if (!command) {
            console.error(`Command ${interaction.commandName} not found.`);
            try {
                await interaction.reply({
                    content: `Command '${interaction.commandName}' not found.`,
                    flags: [MessageFlags.Ephemeral],
                });
            } catch (replyError) {
                console.error(
                    "Failed to send command not found reply:",
                    replyError,
                );
            }
            return;
        }
        try {
            await command.execute(interaction, appsScriptUrl); // Assuming appsScriptUrl is needed by commands
        } catch (error) {
            console.error(
                `Error executing command ${interaction.commandName}:`,
                error,
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
                    "Failed to send command execution error reply:",
                    errorReplyError,
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

        try {
            if (customId === "register_select_account_type") {
                // --- DEFER HERE --- // <-- Acknowledge interaction quickly
                await interaction.deferUpdate();
                // Now call the function (which will use editReply)
                await handleAccountTypeSelection(
                    interaction,
                    selectedValue,
                    registrationState,
                );
            } else if (customId === "register_select_main_status") {
                await interaction.deferUpdate(); // Defer first
                const currentState = registrationState.get(messageId);
                if (
                    !currentState ||
                    currentState.userId !== interaction.user.id
                ) {
                    console.warn(
                        `State/User mismatch for register_select_main_status: ${messageId}`,
                    );
                    await interaction.editReply({
                        content:
                            "Invalid registration session. Please start over with /register.",
                        embeds: [],
                        components: [],
                    });
                    return;
                }
                currentState.status = selectedValue; // e.g., "Old Player" or "Migrants"
                currentState.step = "awaiting_screenshot";
                registrationState.set(messageId, currentState);

                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle(`📝 Register Main Account (${selectedValue})`)
                    .setDescription(
                        `Status selected: **${selectedValue}**. \n\nNext, please **REPLY TO THIS MESSAGE** with the **screenshot of your Governor Profile**.`,
                    )
                    .addFields(
                        {
                            name: "Account Type",
                            value: currentState.accountType,
                            inline: true,
                        },
                        { name: "Status", value: selectedValue, inline: true },
                    )
                    .setFooter({
                        text: `Awaiting screenshot reply for message ID: ${messageId}`,
                    })
                    .setTimestamp();
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("register_cancel")
                        .setLabel("Cancel")
                        .setStyle(ButtonStyle.Danger),
                );
                await interaction.editReply({
                    content: "",
                    embeds: [embed],
                    components: [row],
                }); // Edit the deferred reply
            } else if (customId === "register_select_filler_status") {
                const currentState = registrationState.get(messageId);
                if (
                    !currentState ||
                    currentState.userId !== interaction.user.id
                ) {
                    console.warn(
                        `State/User mismatch for register_select_filler_status: ${messageId}`,
                    );
                    await interaction.followUp({
                        content:
                            "Invalid registration session. Please start over with /register.",
                        flags: [MessageFlags.Ephemeral],
                    });
                    return;
                }
                currentState.isFiller = selectedValue === "true";
                currentState.step = "awaiting_main_id_modal";
                registrationState.set(messageId, currentState);

                // showModal itself is an acknowledgement
                const modal = new ModalBuilder()
                    .setCustomId(
                        `register_farm_modal_${interaction.user.id}_${messageId}`,
                    )
                    .setTitle("Register Farm Account");
                const mainIdInput = new TextInputBuilder()
                    .setCustomId("register_main_id_input")
                    .setLabel("Enter Linked Main Account Governor ID")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("e.g., 123456789")
                    .setRequired(true)
                    .setMinLength(8)
                    .setMaxLength(11);
                const actionRow = new ActionRowBuilder().addComponents(
                    mainIdInput,
                );
                modal.addComponents(actionRow);
                await interaction.showModal(modal);
            }
            // Add handlers for other select menus if needed
        } catch (error) {
            console.error(`Error handling select menu ${customId}:`, error);
            if (error.code !== 10062 && error.code !== 40060) {
                // Avoid replying to already ack'd/unknown interactions
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: "Error processing selection.",
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
                        "Failed to send select menu error reply:",
                        errorReplyError,
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
        try {
            if (customId === "register_cancel") {
                await interaction.update({
                    content: "❌ Registration process cancelled.",
                    embeds: [],
                    components: [],
                }); // update() is fine for button response
                registrationState.delete(messageId);
            } else if (customId === "register_back_to_type") {
                registrationState.delete(messageId);
                const initialEmbed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle("📝 New Account Registration")
                    .setDescription(
                        "Please select the type of account you want to register:",
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
                            .setValue("farm"),
                    );
                const cancelButton = new ButtonBuilder()
                    .setCustomId("register_cancel")
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Danger);
                const selectRow = new ActionRowBuilder().addComponents(
                    accountTypeSelect,
                );
                const buttonRow = new ActionRowBuilder().addComponents(
                    cancelButton,
                );
                await interaction.update({
                    embeds: [initialEmbed],
                    components: [selectRow, buttonRow],
                }); // update() is fine here
            }
            // Add handlers for other buttons if needed
        } catch (error) {
            console.error(`Error handling button ${customId}:`, error);
            if (error.code !== 10062 && error.code !== 40060) {
                try {
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: "Error processing button click.",
                            flags: [MessageFlags.Ephemeral],
                        });
                    } else {
                        await interaction.followUp({
                            content: "Error processing button click.",
                            flags: [MessageFlags.Ephemeral],
                        });
                    }
                } catch (errorReplyError) {
                    console.error(
                        "Failed to send button error reply:",
                        errorReplyError,
                    );
                }
            }
        }
        return;
    }

    // Handle Modal Submissions
    if (interaction.isModalSubmit()) {
        const customId = interaction.customId;
        try {
            const customIdParts = customId.split("_");
            const messageId = customIdParts.pop(); // Assumes messageId is last part
            const userIdFromModal = customIdParts.pop(); // Assumes userId is second to last

            if (
                interaction.user.id !== userIdFromModal ||
                !messageId ||
                !/^\d+$/.test(messageId)
            ) {
                console.warn(
                    `Modal customId mismatch/invalid: ${customId} for user ${interaction.user.id}`,
                );
                await interaction.reply({
                    content:
                        "Error processing form. Please start over with /register.",
                    flags: [MessageFlags.Ephemeral],
                });
                return;
            }

            if (customId.startsWith("register_farm_modal_")) {
                await interaction.deferUpdate(); // Defer modal submission response
                const currentState = registrationState.get(messageId);
                if (
                    !currentState ||
                    currentState.userId !== interaction.user.id ||
                    currentState.step !== "awaiting_main_id_modal"
                ) {
                    console.warn(
                        `State/User/Step mismatch for modal submit: ${messageId}`,
                    );
                    await interaction.followUp({
                        content:
                            "Registration session invalid/expired. Please start over with /register.",
                        flags: [MessageFlags.Ephemeral],
                    });
                    return;
                }

                const linkedMainId = interaction.fields.getTextInputValue(
                    "register_main_id_input",
                );
                // Add validation for linkedMainId here if needed

                currentState.mainId = linkedMainId;
                currentState.step = "awaiting_screenshot";
                registrationState.set(messageId, currentState);

                // Edit the original interactive message (which had the buttons/selects)
                try {
                    // Fetch the original message using the ID stored in state or passed via customId
                    const originalMessage =
                        await interaction.channel.messages.fetch(messageId);
                    if (!originalMessage)
                        throw new Error(
                            "Original interactive message not found.",
                        );

                    const embed = new EmbedBuilder()
                        .setColor(0x0099ff)
                        .setTitle(
                            `📝 Register Farm Account (Filler: ${currentState.isFiller})`,
                        )
                        .setDescription(
                            `Main ID ${linkedMainId} received.\n\nNext, please **REPLY TO THIS MESSAGE** with the **screenshot of this Farm Account's Profile**.`,
                        )
                        .addFields(
                            {
                                name: "Account Type",
                                value: currentState.accountType,
                                inline: true,
                            },
                            {
                                name: "Is Filler?",
                                value: currentState.isFiller.toString(),
                                inline: true,
                            },
                            {
                                name: "Linked Main ID",
                                value: linkedMainId,
                                inline: true,
                            },
                        )
                        .setFooter({
                            text: `Awaiting screenshot reply for message ID: ${messageId}`,
                        })
                        .setTimestamp();
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId("register_cancel")
                            .setLabel("Cancel")
                            .setStyle(ButtonStyle.Danger),
                    );

                    await originalMessage.edit({
                        content: "",
                        embeds: [embed],
                        components: [row],
                    });
                } catch (editError) {
                    console.error(
                        `Failed to edit original message ${messageId} after modal submit:`,
                        editError,
                    );
                    await interaction.followUp({
                        content:
                            "Error updating registration prompt. Please start over with /register.",
                        flags: [MessageFlags.Ephemeral],
                    });
                }
            }
            // Add handlers for other modals if needed
        } catch (error) {
            console.error(`Error handling modal ${customId}:`, error);
            if (error.code !== 10062 && error.code !== 40060) {
                try {
                    // Modal submissions are usually ack'd by reply/defer, use followUp for errors
                    await interaction.followUp({
                        content: "Error processing form submission.",
                        flags: [MessageFlags.Ephemeral],
                    });
                } catch (errorReplyError) {
                    console.error(
                        "Failed to send modal error reply:",
                        errorReplyError,
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
    if (!repliedToMessageId || !registrationState.has(repliedToMessageId))
        return; // Check if it's a reply to a tracked message

    const currentState = registrationState.get(repliedToMessageId);
    // Check if it's the correct user and the correct step
    if (
        currentState.userId !== message.author.id ||
        currentState.step !== "awaiting_screenshot"
    )
        return;

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType?.startsWith("image/")) {
            await message.react("👍").catch(console.error); // React to acknowledge receipt
            const processingMessage = await message
                .reply("Processing your screenshot...")
                .catch(console.error);
            if (!processingMessage) return; // Exit if sending processing message failed

            let imageBase64 = "";
            try {
                // Download and process image
                const screenshotUrl = attachment.url;
                const imageResponse = await fetch(screenshotUrl);
                if (!imageResponse.ok)
                    throw new Error(
                        `Failed to download image: ${imageResponse.statusText}`,
                    );
                const imageArrayBuffer = await imageResponse.arrayBuffer();
                imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");

                // Prepare payload for Apps Script (KEEP KEYS like tipeAkun if Apps Script expects them)
                const finalPayload = {
                    command: "register",
                    data: {
                        discordUserId: currentState.userId,
                        discordUsername: message.author.username, // Use username, tag might change
                        tipeAkun: currentState.accountType,
                        // Conditionally include properties based on the registration flow state
                        ...(currentState.accountType === "main" && {
                            statusMain: currentState.status,
                        }),
                        ...(currentState.accountType === "farm" && {
                            isFiller: currentState.isFiller,
                        }),
                        ...(currentState.accountType === "farm" && {
                            idMainTerhubung: currentState.mainId,
                        }),
                        imageBase64: imageBase64, // Include the image data
                    },
                };

                // Send data to Apps Script Web App
                console.log(
                    `Sending final registration data to Apps Script for message ${repliedToMessageId}`,
                );
                const appsScriptResponse = await fetch(appsScriptUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(finalPayload),
                    // Consider adding a timeout using AbortController if needed
                });
                const result = await appsScriptResponse.json(); // Assume Apps Script returns JSON
                console.log(`Final Apps Script response:`, result);

                // Process Apps Script Result
                if (result.status === "success" && result.details) {
                    const successEmbed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle("✅ Registration Successful!")
                        .addFields(
                            // Adjust field names/values based on what Apps Script actually returns in result.details
                            {
                                name: "Governor ID",
                                value:
                                    result.details.govId?.toString() || "N/A",
                                inline: true,
                            },
                            {
                                name: "Account Type",
                                value: result.details.type || "N/A",
                                inline: true,
                            },
                        )
                        .setTimestamp();
                    if (result.details.type === "main") {
                        // Check the type from the response
                        successEmbed.addFields(
                            {
                                name: "Target KP",
                                value:
                                    result.details.targetKP?.toLocaleString() ||
                                    "N/A",
                                inline: true,
                            },
                            {
                                name: "Target Deaths",
                                value:
                                    result.details.targetDeath?.toLocaleString() ||
                                    "N/A",
                                inline: true,
                            },
                        );
                    }
                    if (result.message) {
                        successEmbed.setDescription(result.message); // Add message from Apps Script if provided
                    }
                    await processingMessage.edit({
                        content: "",
                        embeds: [successEmbed],
                    });

                    // Clean up the original interactive message (remove buttons/selects)
                    try {
                        const originalInteractionMessage =
                            await message.channel.messages.fetch(
                                repliedToMessageId,
                            );
                        if (originalInteractionMessage) {
                            await originalInteractionMessage.edit({
                                components: [],
                            });
                            console.log(
                                `Components removed from original message ${repliedToMessageId}`,
                            );
                        }
                    } catch (editError) {
                        console.warn(
                            `Could not remove components from original message ${repliedToMessageId}:`,
                            editError,
                        );
                    }
                } else {
                    // Handle Failure response from Apps Script
                    await processingMessage.edit(
                        `❌ Registration failed: ${result.message || "Unknown error from backend."}`,
                    );
                }

                // Clean up state for this registration session
                registrationState.delete(repliedToMessageId);
                console.log(`State cleared for message ${repliedToMessageId}`);
            } catch (error) {
                console.error(
                    "Error during final registration processing:",
                    error,
                );
                // Try to edit the "Processing..." message, or send a new one if it fails/was deleted
                if (processingMessage && !processingMessage.deleted) {
                    await processingMessage
                        .edit(
                            `An error occurred: ${error.message}. Please try again or contact an admin.`,
                        )
                        .catch(console.error);
                } else {
                    await message.channel
                        .send(
                            `An error occurred: ${error.message}. Please try again or contact an admin.`,
                        )
                        .catch(console.error);
                }
                registrationState.delete(repliedToMessageId); // Clean up state on error too
            }
        } // else: attachment is not an image
    } // else: message has no attachments
});

// Login the Bot
console.log("Attempting to log in...");
client.login(token);

// Start Keep-Alive Server (Optional but recommended for Replit free tier)
try {
    const keepAlive = require("./server.js");
    keepAlive(); // Assumes server.js exports a function to start the server
} catch (serverError) {
    if (serverError.code === "MODULE_NOT_FOUND") {
        console.log(
            "[INFO] Keep-alive server (server.js) not found, skipping.",
        );
    } else {
        console.error(
            "[ERROR] Could not start keep-alive server:",
            serverError,
        );
    }
}
