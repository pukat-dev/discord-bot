// commands/register.js (Interactive Version - Reverted State)

// Import necessary builders from discord.js
const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require("discord.js");
// Use node-fetch v2 if installed that way
const fetch = require("node-fetch");

module.exports = {
    // Command definition /register (Updated Description, No Manual Name)
    data: new SlashCommandBuilder()
        .setName("register")
        .setDescription(
            "Press Enter or Send to start the interactive registration.",
        ),
    // No manual_name option

    // Execute function sends the initial interactive message
    async execute(interaction, appsScriptUrl) {
        console.log(
            `[DEBUG] ${new Date().toISOString()} - Entered /register execute function for user ${interaction.user.id}`,
        );

        // --- Defer the reply FIRST ---
        try {
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Attempting to defer reply...`,
            );
            await interaction.deferReply({ ephemeral: false }); // Keep ephemeral false for initial message visibility
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Interaction deferred successfully.`,
            );
        } catch (deferError) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Error deferring reply:`,
                deferError,
            );
            // Cannot reply if defer failed
            return;
        }
        // -----------------------------

        try {
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Building initial components...`,
            );
            // 1. Create Initial Embed
            const initialEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle("📝 New Account Registration")
                .setDescription(
                    "Please select the type of account you want to register:",
                )
                .setTimestamp();

            // 2. Create Select Menu for Account Type
            const accountTypeSelect = new StringSelectMenuBuilder()
                .setCustomId("register_select_account_type")
                .setPlaceholder("Select account type...")
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel("Main Account")
                        .setDescription("Register your primary account.")
                        .setValue("main"),
                    new StringSelectMenuOptionBuilder()
                        .setLabel("Farm Account")
                        .setDescription("Register a farm account.")
                        .setValue("farm"),
                );

            // 3. Create Cancel Button
            const cancelButton = new ButtonBuilder()
                .setCustomId("register_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger);

            // 4. Create Action Rows to hold components
            const selectRow = new ActionRowBuilder().addComponents(
                accountTypeSelect,
            );
            const buttonRow = new ActionRowBuilder().addComponents(
                cancelButton,
            );
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Initial components built.`,
            );

            // 5. Send the actual content using editReply
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Attempting to editReply...`,
            );
            await interaction.editReply({
                embeds: [initialEmbed],
                components: [selectRow, buttonRow],
            });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Initial registration message sent via editReply.`,
            );
        } catch (error) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Error executing initial /register command (after defer):`,
                error,
            );
            // Try to edit the reply with an error message
            try {
                // Check if interaction is still editable
                if (interaction.editable) {
                    await interaction.editReply({
                        content:
                            "Failed to start the registration process. Please try again.",
                        embeds: [],
                        components: [],
                    });
                } else {
                    console.log(
                        "[DEBUG] Interaction no longer editable in catch block.",
                    );
                }
            } catch (editError) {
                console.error(
                    "Failed to send error reply via editReply:",
                    editError,
                );
            }
        }
    },
};
