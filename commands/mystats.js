// commands/mystats.js (English Comments unless Indonesian context needed)
// Phase 3: Using QuickChart.io for DKP Progress Visualization
// Added console.log to debug details object

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed
const { URLSearchParams } = require("url"); // To encode chart configuration

// Helper for separator line
const separator = {
    name: "\u200B", // Zero-width space
    value: "────────────────────",
    inline: false,
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("mystats")
        .setDescription(
            "Displays your current KvK stats summary with progress chart.",
        ), // Updated description

    async execute(interaction, appsScriptUrl) {
        const myStatsChannelId = process.env.MY_STATS_CHANNEL_ID;
        if (myStatsChannelId && interaction.channelId !== myStatsChannelId) {
            // Handle channel restriction (code omitted for brevity)
            return interaction.reply({
                content: `This command can only be used in the <#${myStatsChannelId}> channel.`,
                ephemeral: true,
            });
        }

        if (!appsScriptUrl) {
            // Handle missing URL (code omitted for brevity)
            return interaction.reply({
                content: "Error: Backend configuration is missing.",
                ephemeral: true,
            });
        }

        try {
            await interaction.deferReply();
            console.log(`[DEBUG] /mystats: Interaction deferred (publicly).`);
        } catch (deferError) {
            // Handle defer error (code omitted for brevity)
            console.error("Error deferring reply for /mystats:", deferError);
            try {
                await interaction.followUp({
                    content: "Failed to initiate stats request.",
                    ephemeral: true,
                });
            } catch (e) {}
            return;
        }

        try {
            const payload = {
                command: "get_my_stats",
                data: {
                    discordUserId: interaction.user.id,
                },
            };

            console.log(
                `[DEBUG] /mystats: Sending request to Apps Script for user ${interaction.user.id}`,
            );
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            console.log(
                `[DEBUG] /mystats: Received response status ${response.status}`,
            );

            let result;
            const responseText = await response.text();

            if (!response.ok) {
                // Handle fetch error (code omitted for brevity)
                console.error(
                    `[ERROR] /mystats: Apps Script returned status ${response.status}. Response text: ${responseText}`,
                );
                await interaction.editReply({
                    content: `❌ Error communicating with the backend (Status: ${response.status}).`,
                });
                return;
            }

            try {
                result = JSON.parse(responseText);
                console.log(
                    `[DEBUG] /mystats: Received and parsed response data:`,
                    result,
                ); // Log entire result
            } catch (parseError) {
                // Handle JSON parse error (code omitted for brevity)
                console.error(
                    `[ERROR] /mystats: Failed to parse Apps Script response as JSON. Response text: ${responseText}`,
                    parseError,
                );
                await interaction.editReply({
                    content: `❌ Error processing response from the backend (Invalid Format).`,
                });
                return;
            }

            if (result.status === "success" && result.details) {
                const details = result.details;

                // --- DEBUGGING: Log the received details object ---
                console.log(
                    "[DEBUG] /mystats: Details object received from Apps Script:",
                    details,
                );
                // --- END DEBUGGING ---

                // --- Construct Title ---
                // Check the console log above to confirm the EXACT field name for Governor ID!
                // ASSUMPTION: details.GovernorID contains the main account ID from Apps Script
                const governorId = details.governorID || "ID Not Found"; // Use the correct field name based on the log
                const embedTitle = `📊 KvK Stats Summary - ID: ${governorId}`; // Use GovernorID

                // --- Prepare Data for Chart ---
                // ASSUMPTION: details.currentKP, details.targetKP, details.currentDeaths, details.targetDeath exist
                const targetKP = details.targetKP || 0;
                const currentKP = details.currentKP || 0;
                const targetDeath = details.targetDeath || 0;
                const currentDeaths = details.currentDeaths || 0;

                // Calculate percentages (handle division by zero)
                const kpPercentage =
                    targetKP > 0
                        ? Math.min((currentKP / targetKP) * 100, 100)
                        : 0;
                const deathPercentage =
                    targetDeath > 0
                        ? Math.min((currentDeaths / targetDeath) * 100, 100)
                        : 0;

                // --- Create QuickChart Configuration ---
                const chartConfig = {
                    type: "horizontalBar", // Horizontal bar chart
                    data: {
                        labels: ["Kill Points (KP)", "Dead Troops"], // Labels for each bar
                        datasets: [
                            {
                                label: "Progress (%)", // Legend label
                                data: [
                                    kpPercentage.toFixed(1),
                                    deathPercentage.toFixed(1),
                                ], // Data points (percentages)
                                backgroundColor: [
                                    "rgba(75, 192, 192, 0.6)", // Teal color for KP
                                    "rgba(255, 99, 132, 0.6)", // Red color for Deaths
                                ],
                                borderColor: [
                                    "rgba(75, 192, 192, 1)",
                                    "rgba(255, 99, 132, 1)",
                                ],
                                borderWidth: 1,
                            },
                        ],
                    },
                    options: {
                        title: {
                            display: true,
                            text: "DKP Target Progress", // Chart title
                            fontSize: 16,
                            fontColor: "#ffffff", // White title text
                        },
                        legend: {
                            display: false, // Hide legend, labels are clear enough
                        },
                        scales: {
                            xAxes: [
                                {
                                    ticks: {
                                        beginAtZero: true, // Start axis at 0
                                        max: 100, // End axis at 100 (for percentage)
                                        fontColor: "#ffffff", // White axis labels
                                    },
                                    gridLines: {
                                        color: "rgba(255, 255, 255, 0.2)", // Lighter grid lines
                                    },
                                },
                            ],
                            yAxes: [
                                {
                                    ticks: {
                                        fontColor: "#ffffff", // White axis labels (KP, Deaths)
                                    },
                                    gridLines: {
                                        color: "rgba(255, 255, 255, 0.2)", // Lighter grid lines
                                    },
                                },
                            ],
                        },
                        // Add background color to the chart area
                        plugins: {
                            chartArea: {
                                backgroundColor: "rgba(54, 57, 63, 1)", // Discord dark theme background-ish
                            },
                        },
                    },
                };

                // --- Generate QuickChart URL ---
                const encodedConfig = encodeURIComponent(
                    JSON.stringify(chartConfig),
                );
                const chartUrl = `https://quickchart.io/chart?c=${encodedConfig}&backgroundColor=rgba(0,0,0,0)&width=500&height=200`; // Transparent background, adjusted size

                console.log(
                    `[DEBUG] /mystats: Generated QuickChart URL: ${chartUrl}`,
                );

                // --- Build Embed ---
                const statsEmbed = new EmbedBuilder()
                    .setColor(0x1f8b4c) // Slightly different green
                    .setTitle(embedTitle)
                    .setImage(chartUrl) // Set the chart image
                    .setTimestamp();

                // --- Add Fields (Keep text values for clarity) ---
                statsEmbed.addFields(
                    {
                        name: "🎯 Target Kill Points (KP)",
                        value: `*${currentKP.toLocaleString("en-US")} / ${targetKP.toLocaleString("en-US")}*`,
                        inline: true,
                    },
                    {
                        name: "💀 Target Dead Troops",
                        value: `*${currentDeaths.toLocaleString("en-US")} / ${targetDeath.toLocaleString("en-US")}*`,
                        inline: true,
                    },
                    { name: "\u200B", value: "\u200B", inline: false }, // Blank field spacer
                    separator,
                    {
                        name: "🔗 Linked Farm Accounts",
                        value: formatFarmList(details.linkedFarms),
                        inline: false,
                    },
                    separator,
                    {
                        name: "⭐ Pre-KvK Contribution",
                        value:
                            details.preKvkContribution ||
                            "*Data not yet available.*",
                        inline: false,
                    },
                    separator,
                    {
                        name: "⚔️ Zone KP Performance",
                        value:
                            details.zoneKpPerformance ||
                            "*Data not yet available.*",
                        inline: false,
                    },
                    separator,
                    {
                        name: "🧑‍🌾 Filler Account Contribution",
                        value:
                            details.fillerContribution ||
                            "*Data not yet available.*",
                        inline: false,
                    },
                    separator,
                    {
                        name: "🏆 Final KvK Score & Status",
                        value:
                            details.finalScoreStatus ||
                            "*Data not yet available.*",
                        inline: false,
                    },
                    separator,
                    {
                        name: "🏅 Ranking",
                        value: details.ranking || "*Data not yet available.*",
                        inline: false,
                    },
                );

                await interaction.editReply({
                    embeds: [statsEmbed],
                    components: [],
                });
            } else {
                // Handle logical error from Apps Script
                console.log(
                    `[INFO] /mystats: Apps Script returned logical error: ${result.message || "No message provided."}`,
                );
                await interaction.editReply({
                    content: `❌ Error retrieving stats: ${result.message || "Unknown backend error."}`,
                });
            }
        } catch (error) {
            // Generic error handling
            console.error("Error executing /mystats command:", error);
            if (interaction.replied || interaction.deferred) {
                try {
                    await interaction.editReply({
                        content:
                            "An unexpected error occurred while processing your request.",
                    });
                } catch (editError) {
                    console.error(
                        "Failed to send final error reply:",
                        editError,
                    );
                }
            }
        }
    },
};

/**
 * Helper function to format the linked farm list.
 */
function formatFarmList(farms) {
    if (!farms || !Array.isArray(farms) || farms.length === 0) {
        return "No farms linked or registered.";
    }
    let farmListString = farms
        .map(
            (farm) =>
                `• ${farm.name ? `**${farm.name}** ` : ""}ID: \`${farm.id}\` (Filler: ${farm.isFiller ? "Yes" : "No"})`,
        )
        .join("\n");
    if (farmListString.length > 1024) {
        // Embed field value limit
        farmListString = farmListString.substring(0, 1020) + "\n...";
    }
    return farmListString;
}
