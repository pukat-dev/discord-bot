// index.js - Main Discord Bot File (English Comments)

// 1. Import necessary libraries
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
} = require("discord.js"); // Added Modal/TextInput builders
const fs = require("node:fs");
const path = require("node:path");
const fetch = require("node-fetch"); // Make sure node-fetch@2 is installed

// Simple state management for interactive registration
const registrationState = new Map();
// Key: interaction.message.id (ID of the bot's interactive message)
// Value: object { step, userId, accountType, status, isFiller, mainId, interaction } // Added interaction to potentially use later

// 2. Load Credentials & Configuration
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL;
const gcpApiKey = process.env.GCP_API_KEY; // Assuming API key might be needed by Apps Script

// ... (Checks for token, clientId, appsScriptUrl remain the same) ...
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

// 3. Create a new Discord Client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});

// 4. Setup Command Handling
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
// ... (Command loading loop remains the same) ...
let commandFiles = [];
try {
    commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command);
            console.log(
                `[INFO] Successfully loaded command: ${command.data.name}`,
            );
        } else {
            console.log(
                `[WARNING] The command at ${filePath} is missing "data" or "execute".`,
            );
        }
    }
} catch (error) {
    console.error("Error reading the commands folder.", error);
}

// 5. Event Listener: When the Bot is Ready
client.once(Events.ClientReady, (readyClient) => {
    /* ... */ console.log(`Bot Ready! Logged in as ${readyClient.user.tag}`);
});

// 6. Event Listener: When an Interaction is Created
client.on(Events.InteractionCreate, async (interaction) => {
    // 6a. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
        console.log(
            `[DEBUG] Received chat input command: ${interaction.commandName}`,
        ); // DEBUG LOG
        const command = interaction.client.commands.get(
            interaction.commandName,
        );
        if (!command) {
            console.error(`Command ${interaction.commandName} not found.`);
            try {
                await interaction.reply({
                    content: `Command '${interaction.commandName}' not found or is currently unavailable.`,
                    ephemeral: true,
                });
            } catch (replyError) {
                console.error(
                    "Failed to send command not found error reply:",
                    replyError,
                );
            }
            return;
        }
        try {
            // Pass the interaction object and the Apps Script URL to the command's execute function
            console.log(
                `[DEBUG] Attempting to execute command: ${interaction.commandName}`,
            ); // DEBUG LOG
            await command.execute(
                interaction,
                appsScriptUrl /*, registrationState */,
            ); // Pass state map if needed by command execute directly
        } catch (error) {
            console.error(
                `Error executing command ${interaction.commandName}:`,
                error,
            );
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            } else {
                await interaction.reply({
                    content: "There was an error while executing this command!",
                    ephemeral: true,
                });
            }
        }
        return; // Stop processing here after handling slash command
    }

    // 6b. Handle String Select Menu Interactions
    if (interaction.isStringSelectMenu()) {
        console.log(
            `[DEBUG] Received String Select Menu: ${interaction.customId}`,
        );
        const selectedValue = interaction.values[0];
        const messageId = interaction.message.id; // ID of the message the menu is attached to

        try {
            // --- Step 1: Account Type Selection ---
            if (interaction.customId === "register_select_account_type") {
                console.log(
                    `[DEBUG] User ${interaction.user.tag} selected account type: ${selectedValue}`,
                );
                // Pass the state map to the handler
                await handleAccountTypeSelection(
                    interaction,
                    selectedValue,
                    registrationState,
                ); // Call function to show step 2

                // --- Step 2a: Main Account Status Selection ---
            } else if (interaction.customId === "register_select_main_status") {
                console.log(
                    `[DEBUG] User ${interaction.user.tag} selected main status: ${selectedValue}`,
                );
                await interaction.deferUpdate(); // Acknowledge interaction

                // Retrieve and update state
                const currentState = registrationState.get(messageId);
                if (
                    !currentState ||
                    currentState.userId !== interaction.user.id
                ) {
                    console.log(
                        `[WARN] State not found or user mismatch for message ${messageId}`,
                    );
                    await interaction.editReply({
                        content:
                            "Sorry, I couldn't find your registration session. Please start over with /register.",
                        embeds: [],
                        components: [],
                    }); // Use editReply on deferred interaction
                    return;
                }
                currentState.status = selectedValue;
                currentState.step = "awaiting_screenshot"; // Set next expected step
                registrationState.set(messageId, currentState);
                console.log(
                    `[DEBUG] State for ${messageId} updated:`,
                    currentState,
                );

                // Update the message to ask for screenshot reply
                const screenshotEmbed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle(`📝 Register Main Account (${selectedValue})`) // Show selected status
                    .setDescription(
                        `Status selected: **${selectedValue}**. \n\nNext, please **REPLY TO THIS MESSAGE** with the **screenshot of your Governor Profile**.`,
                    ) // Clearer instruction
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

                const cancelButtonRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("register_cancel")
                        .setLabel("Cancel")
                        .setStyle(ButtonStyle.Danger),
                    // No Back button needed here as the next step is a reply
                );

                // Edit the original reply to the deferred interaction
                await interaction.editReply({
                    content: "",
                    embeds: [screenshotEmbed],
                    components: [cancelButtonRow],
                });
                console.log(
                    `[DEBUG] Message ${messageId} updated to await screenshot.`,
                );

                // --- Step 2b: Farm Account Filler Selection ---
            } else if (
                interaction.customId === "register_select_filler_status"
            ) {
                console.log(
                    `[DEBUG] User ${interaction.user.tag} selected filler status: ${selectedValue}`,
                );

                // Retrieve and update state
                const currentState = registrationState.get(messageId);
                if (
                    !currentState ||
                    currentState.userId !== interaction.user.id
                ) {
                    console.log(
                        `[WARN] State not found or user mismatch for message ${messageId}`,
                    );
                    // Use followUp as update might fail if modal shown quickly after deferUpdate
                    await interaction.followUp({
                        content:
                            "Sorry, I couldn't find your registration session. Please start over with /register.",
                        ephemeral: true,
                    });
                    return;
                }
                currentState.isFiller = selectedValue === "true"; // Convert string 'true'/'false' to boolean
                currentState.step = "awaiting_main_id_modal"; // Set next expected step
                registrationState.set(messageId, currentState);
                console.log(
                    `[DEBUG] State for ${messageId} updated:`,
                    currentState,
                );

                // --- Show Modal for Main ID Input ---
                const modal = new ModalBuilder()
                    // Include messageId in customId to link back state if needed, or rely on user ID based state
                    .setCustomId(
                        `register_farm_modal_${interaction.user.id}_${messageId}`,
                    ) // Example: include user and message ID
                    .setTitle("Register Farm Account");

                const mainIdInput = new TextInputBuilder()
                    .setCustomId("register_main_id_input") // Keep this simple
                    .setLabel("Enter Linked Main Account Governor ID")
                    .setStyle(TextInputStyle.Short) // Short text input
                    .setPlaceholder("e.g., 123456789")
                    .setRequired(true)
                    .setMinLength(8) // Basic validation
                    .setMaxLength(11);

                const firstActionRow = new ActionRowBuilder().addComponents(
                    mainIdInput,
                );
                modal.addComponents(firstActionRow);

                // Show the modal to the user
                await interaction.showModal(modal);
                console.log(
                    `[DEBUG] Modal shown to user ${interaction.user.tag} for message ${messageId}`,
                );
            }
            // Add else if for other select menus
        } catch (error) {
            console.error(
                `Error handling select menu ${interaction.customId}:`,
                error,
            );
            // Try to notify user if possible
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content:
                            "An error occurred while processing your selection.",
                        ephemeral: true,
                    });
                } else {
                    await interaction.followUp({
                        content:
                            "An error occurred while processing your selection.",
                        ephemeral: true,
                    });
                }
            } catch (replyError) {
                console.error(
                    "Failed to send error reply for select menu:",
                    replyError,
                );
            }
        }
        return;
    }

    // 6c. Handle Button Interactions
    if (interaction.isButton()) {
        console.log(`[DEBUG] Received Button: ${interaction.customId}`);
        const messageId = interaction.message.id;

        try {
            if (interaction.customId === "register_cancel") {
                console.log(
                    `[DEBUG] User ${interaction.user.tag} cancelled registration.`,
                );
                // Edit the message the button is attached to
                await interaction.update({
                    content: "❌ Registration process cancelled.",
                    embeds: [],
                    components: [],
                });
                registrationState.delete(messageId); // Clean up state on cancel
            } else if (interaction.customId === "register_back_to_type") {
                console.log(
                    `[DEBUG] User ${interaction.user.tag} clicked Back to Type Selection.`,
                );
                // Re-create and send the initial state (select account type)
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

                // Reset state for this message ID or just update UI
                registrationState.delete(messageId); // Simplest to just delete state on back

                await interaction.update({
                    embeds: [initialEmbed],
                    components: [selectRow, buttonRow],
                }); // Update message back to step 1
            }
            // Add else if for other buttons like 'Next'/'Submit' later
        } catch (error) {
            console.error(
                `Error handling button ${interaction.customId}:`,
                error,
            );
            // Try to notify user if possible
            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content:
                            "An error occurred while processing the button click.",
                        ephemeral: true,
                    });
                } else {
                    await interaction.followUp({
                        content:
                            "An error occurred while processing the button click.",
                        ephemeral: true,
                    });
                }
            } catch (replyError) {
                console.error(
                    "Failed to send error reply for button:",
                    replyError,
                );
            }
        }
        return;
    }

    // 6d. Handle Modal Submissions
    if (interaction.isModalSubmit()) {
        console.log(`[DEBUG] Received Modal Submit: ${interaction.customId}`);

        // Extract original message ID from modal custom ID if stored there
        // Example customId format: register_farm_modal_<userId>_<messageId>
        const customIdParts = interaction.customId.split("_");
        const messageId = customIdParts.pop(); // Get last part as messageId
        const userIdFromModal = customIdParts.pop(); // Get second to last part as userId

        // Verify user matches and messageId looks valid (basic check)
        if (
            interaction.user.id !== userIdFromModal ||
            !messageId ||
            !/^\d+$/.test(messageId)
        ) {
            console.warn(
                `[WARN] Modal customId mismatch or invalid format: ${interaction.customId} for user ${interaction.user.id}`,
            );
            await interaction.reply({
                content:
                    "There was an issue processing your form submission. Please try starting over.",
                ephemeral: true,
            });
            return;
        }
        console.log(
            `[DEBUG] Modal submission linked to message ID: ${messageId} for user ${userIdFromModal}`,
        );

        // Check if it's the farm registration modal
        if (interaction.customId.startsWith("register_farm_modal_")) {
            // Acknowledge modal submission quickly
            await interaction.deferUpdate(); // Use deferUpdate for modal responses you edit later

            // Retrieve state using the message ID extracted from customId
            const currentState = registrationState.get(messageId);
            // Additional check: ensure state exists and step is correct
            if (
                !currentState ||
                currentState.userId !== interaction.user.id ||
                currentState.step !== "awaiting_main_id_modal"
            ) {
                console.log(
                    `[WARN] State not found, user mismatch, or wrong step for modal submit ${messageId}`,
                );
                await interaction.followUp({
                    content:
                        "Sorry, your registration session seems invalid or has expired. Please start over with /register.",
                    ephemeral: true,
                });
                return;
            }

            // Get the submitted Main ID
            const linkedMainId = interaction.fields.getTextInputValue(
                "register_main_id_input",
            );
            // TODO: Add validation for linkedMainId (e.g., check if it's numeric, maybe check if it exists in Registration Sheet?)
            console.log(
                `[DEBUG] User ${interaction.user.tag} submitted Main ID: ${linkedMainId}`,
            );

            // Update state
            currentState.mainId = linkedMainId;
            currentState.step = "awaiting_screenshot"; // Next step is screenshot
            registrationState.set(messageId, currentState);
            console.log(
                `[DEBUG] State for ${messageId} updated after modal:`,
                currentState,
            );

            // --- Update the original message (referenced by messageId) to ask for screenshot ---
            try {
                // Fetch the original message the interaction components were attached to
                const originalMessage =
                    await interaction.channel.messages.fetch(messageId);
                if (!originalMessage)
                    throw new Error("Original interactive message not found.");

                // Build the embed asking for the farm's profile screenshot
                const screenshotEmbed = new EmbedBuilder()
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

                const cancelButtonRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId("register_cancel")
                        .setLabel("Cancel")
                        .setStyle(ButtonStyle.Danger),
                );

                // Edit the original message
                await originalMessage.edit({
                    content: "",
                    embeds: [screenshotEmbed],
                    components: [cancelButtonRow],
                });
                console.log(
                    `[DEBUG] Original message ${messageId} updated to await screenshot after modal.`,
                );
            } catch (editError) {
                console.error(
                    `[ERROR] Failed to edit original message ${messageId} after modal submit:`,
                    editError,
                );
                // Inform user via followUp as interaction was deferred
                await interaction.followUp({
                    content:
                        "Error updating registration prompt. Please try /register again.",
                    ephemeral: true,
                });
            }
        }
        // Add else if for other modal customIds
        return;
    }
});

// --- Function for Handling Account Type Selection ---
// Updates the message to show step 2 AND stores initial state
async function handleAccountTypeSelection(interaction, selectedType, stateMap) {
    // Import builders here if not defined globally at the top
    const {
        EmbedBuilder,
        ActionRowBuilder,
        StringSelectMenuBuilder,
        StringSelectMenuOptionBuilder,
        ButtonBuilder,
        ButtonStyle,
    } = require("discord.js");

    console.log(
        `[DEBUG][Function] handleAccountTypeSelection called for type: ${selectedType}`,
    );
    try {
        let nextEmbed;
        let componentsRow1;
        let componentsRow2 = new ActionRowBuilder() // Row for Back/Cancel buttons
            .addComponents(
                new ButtonBuilder()
                    .setCustomId("register_back_to_type")
                    .setLabel("Back")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId("register_cancel")
                    .setLabel("Cancel")
                    .setStyle(ButtonStyle.Danger),
            );

        // Store initial state using message ID as key
        // Store user ID to prevent others from hijacking the interaction
        stateMap.set(interaction.message.id, {
            step: "select_status_or_filler", // Indicate current step
            userId: interaction.user.id,
            accountType: selectedType,
            // manualName: manualName // Store manual name if collected earlier
        });
        console.log(
            `[DEBUG] Initial state stored for message ${interaction.message.id}:`,
            stateMap.get(interaction.message.id),
        );

        if (selectedType === "main") {
            // Build UI for Main Status
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
                        .setValue("Migrants"),
                );
            componentsRow1 = new ActionRowBuilder().addComponents(statusSelect);
        } else if (selectedType === "farm") {
            // Build UI for Filler Status
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
                        .setDescription(
                            "This farm is NOT a filler (e.g., only for PreKvK).",
                        )
                        .setValue("false"),
                );
            componentsRow1 = new ActionRowBuilder().addComponents(fillerSelect);
        } else {
            console.error(
                `[ERROR] Unknown selectedType in handleAccountTypeSelection: ${selectedType}`,
            );
            await interaction.update({
                content: "An unexpected error occurred with the selected type.",
                embeds: [],
                components: [],
            }); // Use update as interaction is fresh
            return;
        }

        // Update message (using update because this is the first response to the select menu interaction)
        console.log(
            `[DEBUG] Updating interaction message for ${selectedType} selection.`,
        );
        await interaction.update({
            embeds: [nextEmbed],
            components: [componentsRow1, componentsRow2],
        });
        console.log(`[DEBUG] Interaction message updated.`);
    } catch (error) {
        console.error(
            `Error updating interaction in handleAccountTypeSelection for type ${selectedType}:`,
            error,
        );
        // Try to inform the user if update fails
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: "An error occurred while processing your selection.",
                ephemeral: true,
            });
        } else {
            try {
                await interaction.followUp({
                    content:
                        "An error occurred while processing your selection.",
                    ephemeral: true,
                });
            } catch {}
        }
    }
}

// 7. Event Listener: When a Message is Created (for screenshot reply)
// (This listener remains the same as the previous version - handling the reply and calling Apps Script)
client.on(Events.MessageCreate, async (message) => {
    // Ignore messages from bots and messages that are not replies
    if (message.author.bot || message.type !== MessageType.Reply) return;

    // Check if this message is a reply to one of our interactive registration messages
    const repliedToMessageId = message.reference?.messageId;
    if (!repliedToMessageId || !registrationState.has(repliedToMessageId))
        return;

    const currentState = registrationState.get(repliedToMessageId);

    // Check if it's the correct user replying and if we are expecting a screenshot
    if (
        currentState.userId !== message.author.id ||
        currentState.step !== "awaiting_screenshot"
    ) {
        console.log(
            `[DEBUG] Ignoring reply from ${message.author.tag} to message ${repliedToMessageId} - wrong user or step (${currentState.step}).`,
        );
        return;
    }

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType?.startsWith("image/")) {
            console.log(
                `[DEBUG] Received screenshot reply for registration message ${repliedToMessageId} from user ${message.author.tag}`,
            );
            await message.react("👍");
            const processingMessage = await message.reply(
                "Processing your screenshot...",
            );

            let imageBase64 = "";
            try {
                // Download and convert image
                const screenshotUrl = attachment.url;
                const imageResponse = await fetch(screenshotUrl);
                if (!imageResponse.ok)
                    throw new Error(
                        `Failed to download image: ${imageResponse.statusText}`,
                    );
                const imageArrayBuffer = await imageResponse.arrayBuffer();
                imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");
                console.log(
                    `[DEBUG] Screenshot converted to Base64 (size: ${imageBase64.length})`,
                );

                // Prepare final data payload
                const finalPayload = {
                    command: "register",
                    data: {
                        discordUserId: currentState.userId,
                        discordUsername: message.author.username,
                        tipeAkun: currentState.accountType,
                        statusMain: currentState.status,
                        isFiller: currentState.isFiller,
                        idMainTerhubung: currentState.mainId,
                        imageBase64: imageBase64,
                    },
                };

                // Send data to Apps Script
                console.log(
                    `[DEBUG] Sending final registration data to Apps Script for message ${repliedToMessageId}`,
                );
                const appsScriptResponse = await fetch(appsScriptUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(finalPayload),
                });
                const result = await appsScriptResponse.json();
                console.log(`[DEBUG] Final Apps Script response:`, result);

                // Process Apps Script Result
                if (result.status === "success" && result.details) {
                    // Build Success Embed
                    const successEmbed = new EmbedBuilder()
                        .setColor(0x00ff00)
                        .setTitle("✅ Registration Successful!")
                        .addFields(
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
                        successEmbed.setDescription(result.message);
                    }
                    await processingMessage.edit({
                        content: "",
                        embeds: [successEmbed],
                    });

                    // Remove components from original message
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
                                `[DEBUG] Components removed from original message ${repliedToMessageId}`,
                            );
                        }
                    } catch (editError) {
                        console.error(
                            `[WARN] Could not edit original message ${repliedToMessageId} to remove components:`,
                            editError,
                        );
                    }
                } else {
                    // Handle Failure
                    await processingMessage.edit(
                        `❌ Registration failed: ${result.message || "Unknown backend error."}`,
                    );
                }

                // Clean up state
                registrationState.delete(repliedToMessageId);
                console.log(
                    `[DEBUG] State cleared for message ${repliedToMessageId}`,
                );
            } catch (error) {
                console.error(
                    "Error during final registration processing:",
                    error,
                );
                await processingMessage.edit(
                    `An error occurred: ${error.message}. Please try again or contact admin.`,
                );
                registrationState.delete(repliedToMessageId); // Clean up state on error too
            }
        } else {
            /* Reply not an image */
        }
    } else {
        /* Reply no attachment */
    }
});

// 8. Login the Bot to Discord
client.login(token);

// 9. (Optional) Start the Keep-Alive Server
require("./server.js");
console.log("Keep-alive server also started (if configured).");
