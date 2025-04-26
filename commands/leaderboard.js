// commands/leaderboard.js (English Version with Channel Check)

const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
} = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed

// Helper function for number formatting (can be moved to a utility file if used elsewhere)
// Note: Using "id-ID" locale for number formatting consistency (e.g., using dots for thousands). Change if needed.
const formatNumber = (num) => {
    if (num === null || num === undefined) return "0";
    const number = Number(num);
    return isNaN(number) ? "N/A" : number.toLocaleString("id-ID");
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Displays the KvK player rankings.") // Translated description
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Select the ranking type to display.") // Translated description
                .setRequired(false) // Optional, defaults to 'Score'
                .addChoices(
                    // Translated choices
                    { name: "KvK Score (Final Score)", value: "Score" },
                    { name: "Pure DKP (Zone KP)", value: "DKP" },
                ),
        ),
    // You could add an Integer option 'limit' here if you want users to specify the count
    // example: .addIntegerOption(option => option.setName('limit').setDescription('Number of top ranks (default 100)').setRequired(false))

    async execute(interaction, appsScriptUrl) {
        console.log(
            `[/leaderboard] Executing command for user ${interaction.user.id}`,
        );

        // 1. Defer Reply (Do this as soon as possible)
        try {
            await interaction.deferReply();
        } catch (error) {
            console.error("[/leaderboard] Deferral failed:", error);
            // If defer fails (e.g., due to error 10062), we cannot proceed
            // Specific error handling for 10062 is in the main catch block later if needed
            return;
        }

        // --- Channel Check ---
        const leaderboardChannelId = process.env.LEADERBOARD_CHANNEL_ID;
        if (
            leaderboardChannelId &&
            interaction.channelId !== leaderboardChannelId
        ) {
            console.log(
                `[/leaderboard] Command used in wrong channel ${interaction.channelId}. Allowed: ${leaderboardChannelId}`,
            );
            try {
                await interaction.editReply({
                    // Use editReply since we deferred
                    content: `This command can only be used in the <#${leaderboardChannelId}> channel.`, // Translated message
                    ephemeral: true, // Message only visible to the user
                });
            } catch (e) {
                console.error(
                    "[/leaderboard] Failed to send wrong channel message:",
                    e,
                );
            }
            return; // Stop execution if channel is wrong
        }
        // --- End Channel Check ---

        // 2. Get Options & Backend URL
        const rankingType = interaction.options.getString("type") ?? "Score"; // Default to 'Score'
        const limitToShow = 100; // Request 100 from backend (matches backend default)
        // If you added a 'limit' option: const limitToShow = interaction.options.getInteger('limit') ?? 100;

        if (!appsScriptUrl) {
            console.error(
                "[ERROR] /leaderboard: APPS_SCRIPT_WEB_APP_URL is not configured.",
            );
            // Use editReply since we deferred
            return interaction.editReply({
                content: "Error: Backend configuration is missing.",
                ephemeral: true,
            });
        }

        // 3. Call Backend
        try {
            // Edit the deferred message to show progress
            // Translated message
            await interaction.editReply(
                `⏳ Fetching ${rankingType === "Score" ? "KvK Score" : "Pure DKP"} leaderboard data (Top ${limitToShow})...`,
            );

            const payload = {
                command: "get_leaderboard",
                data: {
                    type: rankingType,
                    limit: limitToShow,
                },
            };

            console.log(`[/leaderboard] Sending request to backend:`, payload);
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            // Check HTTP status before trying to parse JSON
            if (!response.ok) {
                let errorMsg = `Backend Error (${response.status})`;
                try {
                    // Try to read error message from backend if available
                    const errorData = await response.json();
                    errorMsg = `❌ Failed to retrieve data: ${errorData.message || `Backend Error (${response.status})`}`; // Translated message
                } catch (e) {
                    console.error(
                        "[/leaderboard] Failed to parse error response from backend:",
                        e,
                    );
                }
                console.error(
                    `[/leaderboard] Backend request failed: ${response.status} ${response.statusText}`,
                );
                return interaction.editReply({ content: errorMsg });
            }

            const responseData = await response.json();
            console.log(
                `[/leaderboard] Received response from backend. Status: ${responseData.status}`,
            );

            // 4. Process Response & Build Embed
            if (
                responseData.status === "success" &&
                Array.isArray(responseData.details)
            ) {
                const leaderboardData = responseData.details; // Array: [{ rank, id, nickname, value }, ...]

                // Set title based on ranking type
                const embedTitle =
                    rankingType === "Score"
                        ? `🏆 Leaderboard - KvK Score (Top ${leaderboardData.length})` // Translated title
                        : `🏅 Leaderboard - Pure DKP (Zone KP) (Top ${leaderboardData.length})`; // Translated title
                const valueLabel = rankingType === "Score" ? "Score" : "KP";

                const leaderboardEmbed = new EmbedBuilder()
                    .setColor(rankingType === "Score" ? 0x00ff00 : 0x0099ff) // Green for Score, Blue for DKP
                    .setTitle(embedTitle)
                    .setTimestamp()
                    .setFooter({ text: "RoK Stats System • Kingdom 2921" }); // Kept footer as is

                if (leaderboardData.length === 0) {
                    leaderboardEmbed.setDescription(
                        "No ranking data available for this type yet.",
                    ); // Translated message
                } else {
                    const displayLimit = 25; // Limit display in Discord to avoid hitting description limits
                    const descriptionLines = leaderboardData
                        .slice(0, displayLimit) // Take only top 'displayLimit' for display
                        .map(
                            (player) =>
                                // Ensure nickname isn't null/undefined, fallback to ID if needed
                                `${player.rank}. \`${player.id}\` ${player.nickname || `ID: ${player.id}`} - **${formatNumber(player.value)}** ${valueLabel}`,
                        );

                    let description = descriptionLines.join("\n");
                    // Add a note if showing fewer entries than available
                    if (leaderboardData.length > displayLimit) {
                        description += `\n\n*Showing Top ${displayLimit} of ${leaderboardData.length} available entries.*`; // Translated note
                    }

                    // Check Discord description length limit (4096 chars)
                    if (description.length > 4096) {
                        description = description.substring(0, 4090) + "\n..."; // Truncate if too long
                    }
                    leaderboardEmbed.setDescription(description);
                }

                await interaction.editReply({
                    content: "",
                    embeds: [leaderboardEmbed],
                });
            } else {
                // Handle cases where backend status is not 'success' or details is not an array
                console.error(
                    "[/leaderboard] Backend returned error status or invalid data format:",
                    responseData,
                );
                // Translated message
                await interaction.editReply({
                    content: `❌ Failed to retrieve leaderboard data: ${responseData.message || "Invalid data format received from backend."}`,
                });
            }
        } catch (error) {
            console.error("[/leaderboard] Error executing command:", error);
            // Main catch block after deferReply attempt
            try {
                // Try to edit the existing deferred reply (e.g., the "Fetching data..." message)
                // Translated message
                await interaction.editReply({
                    content:
                        "An error occurred while processing the leaderboard command.",
                    embeds: [],
                    components: [],
                });
            } catch (editError) {
                // If editing fails (e.g., interaction expired due to 10062 error earlier), try followUp
                console.error(
                    "[/leaderboard] Failed to editReply in catch block:",
                    editError,
                );
                // Don't try followUp if the initial error was 10062 (Unknown Interaction)
                if (editError.code !== 10062) {
                    try {
                        // Translated message
                        await interaction.followUp({
                            content:
                                "An error occurred while processing the leaderboard command.",
                            ephemeral: true,
                        });
                    } catch (followUpError) {
                        console.error(
                            "[/leaderboard] Failed to followUp in catch block:",
                            followUpError,
                        );
                    }
                }
            }
        }
    },
};
