// commands/leaderboard.js

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed

// Helper function for number formatting (can be moved to a utility file)
// Using "id-ID" locale for number formatting consistency (e.g., using dots for thousands).
// Change if a different locale (like "en-US" for commas) is preferred.
const formatNumber = (num) => {
  if (num === null || num === undefined) return "0";
  // Ensure conversion to Number before toLocaleString
  const number = Number(num);
  return isNaN(number) ? "N/A" : number.toLocaleString("id-ID");
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Displays the KvK player rankings.") // English description
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Select the ranking type to display.") // English description
        .setRequired(false) // Optional, defaults to 'Score'
        .addChoices(
          // English choices
          { name: "KvK Score (Final Score)", value: "Score" },
          { name: "Pure DKP (Zone KP)", value: "DKP" },
          { name: "Pre-KvK (Converted KP)", value: "PreKvK" },
          { name: "Power Reduce", value: "PowerReduce" },
          { name: "Death T4 (T4 Troops Lost)", value: "DeathT4" },
          { name: "Death T5 (T5 Troops Lost)", value: "DeathT5" }
        )
        .addIntegerOption((option) =>
          option
            .setName("limit")
            .setDescription("Number of top ranks (default 100)")
            .setRequired(false)
        )
    ),
  // You could add an Integer option 'limit' here

  async execute(interaction, appsScriptUrl) {
    console.log(
      `[/leaderboard] Executing command for user ${interaction.user.id}`
    );

    try {
      // Defer reply as soon as possible
      await interaction.deferReply();
    } catch (error) {
      console.error("[/leaderboard] Deferral failed:", error);
      // Cannot proceed if deferral fails (e.g., error 10062)
      return;
    }

    // --- Channel Check ---
    const leaderboardChannelId = process.env.LEADERBOARD_CHANNEL_ID;
    if (
      leaderboardChannelId &&
      interaction.channelId !== leaderboardChannelId
    ) {
      console.log(
        `[/leaderboard] Command used in wrong channel ${interaction.channelId}. Allowed: ${leaderboardChannelId}`
      );
      try {
        // Edit the deferred reply since we already deferred
        await interaction.editReply({
          content: `This command can only be used in the <#${leaderboardChannelId}> channel.`, // English message
          ephemeral: true, // Message only visible to the user
        });
      } catch (e) {
        console.error(
          "[/leaderboard] Failed to send wrong channel message:",
          e
        );
      }
      return; // Stop execution if channel is wrong
    }
    // --- End Channel Check ---

    const rankingType = interaction.options.getString("type") ?? "Score"; // Default to 'Score'
    const limitToShow = 100; // Adjust if you add a limit option
    // const limitToShow = interaction.options.getInteger('limit') ?? 100;

    if (!appsScriptUrl) {
      console.error(
        "[ERROR] /leaderboard: APPS_SCRIPT_WEB_APP_URL is not configured."
      );
      // Edit the deferred reply
      return interaction.editReply({
        content: "Error: Backend configuration is missing.", // English message
        ephemeral: true,
      });
    }

    try {
      // Determine the initial fetching message based on type
      let fetchingMessage = `⏳ Fetching ${rankingType} leaderboard data (Top ${limitToShow})...`; // Default message
      switch (rankingType) {
        case "DKP":
          fetchingMessage = `⏳ Fetching Pure DKP (Zone KP) data (Top ${limitToShow})...`;
          break;
        case "PreKvK":
          fetchingMessage = `⏳ Fetching Pre-KvK (Converted KP) data (Top ${limitToShow})...`;
          break;
        case "PowerReduce":
          fetchingMessage = `⏳ Fetching Power Reduce data (Top ${limitToShow})...`;
          break;
        case "DeathT4":
          fetchingMessage = `⏳ Fetching Death T4 data (Top ${limitToShow})...`;
          break;
        case "DeathT5":
          fetchingMessage = `⏳ Fetching Death T5 data (Top ${limitToShow})...`;
          break;
        case "Score":
        default:
          fetchingMessage = `⏳ Fetching KvK Score (Final Score) data (Top ${limitToShow})...`;
          break;
      }
      // Edit the deferred reply to show progress
      await interaction.editReply(fetchingMessage);

      const payload = {
        command: "get_leaderboard",
        data: {
          type: rankingType,
          limit: limitToShow,
        },
      };

      console.log(`[/leaderboard] Sending request to backend:`, payload);
      // Call the backend Google Apps Script
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
          errorMsg = `❌ Failed to retrieve data: ${
            errorData.message || `Backend Error (${response.status})`
          }`; // English message
        } catch (e) {
          console.error(
            "[/leaderboard] Failed to parse error response from backend:",
            e
          );
          // Keep the generic Backend Error message if parsing fails
        }
        console.error(
          `[/leaderboard] Backend request failed: ${response.status} ${response.statusText}`
        );
        // Edit the deferred reply with the error
        return interaction.editReply({ content: errorMsg });
      }

      // Parse the JSON response from the backend
      const responseData = await response.json();
      console.log(
        `[/leaderboard] Received response from backend. Status: ${responseData.status}`
      );

      // 4. Process Response & Build Embed
      // Check if the backend call was successful and returned data
      if (
        responseData.status === "success" &&
        Array.isArray(responseData.details)
      ) {
        const leaderboardData = responseData.details; // Array: [{ rank, id, nickname, value }, ...]

        // Determine Embed Title and Value Label based on Ranking Type
        let embedTitle = "";
        let valueLabel = "";
        let embedColor = 0x0099ff; // Default color (blue)

        switch (rankingType) {
          case "DKP":
            embedTitle = `🏅 Leaderboard - Pure DKP (Zone KP) (Top ${leaderboardData.length})`;
            valueLabel = "KP";
            embedColor = 0x0099ff; // Blue
            break;
          case "PreKvK":
            embedTitle = `✨ Leaderboard - Pre-KvK (Converted KP) (Top ${leaderboardData.length})`;
            valueLabel = "Converted KP";
            embedColor = 0xffa500; // Orange
            break;
          case "PowerReduce":
            embedTitle = `📉 Leaderboard - Power Reduce (Top ${leaderboardData.length})`;
            valueLabel = "Power Reduce";
            embedColor = 0xff4500; // OrangeRed
            break;
          case "DeathT4":
            embedTitle = `💀 Leaderboard - Death T4 (Top ${leaderboardData.length})`;
            valueLabel = "T4 Lost";
            embedColor = 0x8b0000; // DarkRed
            break;
          case "DeathT5":
            embedTitle = `☠️ Leaderboard - Death T5 (Top ${leaderboardData.length})`;
            valueLabel = "T5 Lost";
            embedColor = 0x4b0082; // Indigo
            break;
          case "Score":
          default:
            embedTitle = `🏆 Leaderboard - KvK Score (Final Score) (Top ${leaderboardData.length})`;
            valueLabel = "Score";
            embedColor = 0x00ff00; // Green
            break;
        }

        // Create the embed message
        const leaderboardEmbed = new EmbedBuilder()
          .setColor(embedColor)
          .setTitle(embedTitle)
          .setTimestamp()
          .setFooter({ text: "RoK Stats System • Kingdom 2921" }); // Adjust footer if needed

        // Check if any data was returned
        if (leaderboardData.length === 0) {
          // This case should ideally be handled by the backend returning 'unavailable' status,
          // but included here as a fallback.
          leaderboardEmbed.setDescription(
            `No ranking data available for type ${rankingType} at this time.` // English message
          );
        } else {
          const displayLimit = 25; // Limit display in Discord to avoid hitting description limits
          // Map the data to description lines
          const descriptionLines = leaderboardData
            .slice(0, displayLimit) // Take only top 'displayLimit' for display
            .map(
              (player) =>
                // Ensure nickname isn't null/undefined, fallback to ID if needed
                `${player.rank}. \`${player.id}\` ${
                  player.nickname || `ID: ${player.id}`
                } - **${formatNumber(player.value)}** ${valueLabel}`
            );

          let description = descriptionLines.join("\n");
          // Add a note if showing fewer entries than available
          if (leaderboardData.length > displayLimit) {
            description += `\n\n*Showing Top ${displayLimit} of ${leaderboardData.length} available entries.*`; // English note
          }

          // Check Discord description length limit (4096 chars)
          if (description.length > 4096) {
            description = description.substring(0, 4090) + "\n..."; // Truncate if too long
          }
          leaderboardEmbed.setDescription(description);
        }

        // Edit the deferred reply with the final embed
        await interaction.editReply({
          content: "", // Remove the "Fetching..." message
          embeds: [leaderboardEmbed],
        });
      } else if (
        responseData.status === "unavailable" ||
        responseData.status === "error"
      ) {
        // Handle cases where backend indicates data is unavailable or an error occurred
        console.warn(
          `[/leaderboard] Backend returned status: ${responseData.status}. Message: ${responseData.message}`
        );
        // Edit the deferred reply with the message from the backend
        await interaction.editReply({
          content: `⚠️ ${
            responseData.message || "Failed to retrieve leaderboard data."
          }`, // English message
          embeds: [], // Ensure no old embed is shown
        });
      } else {
        // Handle other unexpected responses from the backend
        console.error(
          "[/leaderboard] Backend returned unexpected status or invalid data format:",
          responseData
        );
        // Edit the deferred reply with a generic error
        await interaction.editReply({
          content: `❌ Failed to process leaderboard data. Unknown response format received.`, // English message
          embeds: [],
        });
      }
    } catch (error) {
      // Catch any errors during the command execution (e.g., network issues, parsing errors)
      console.error("[/leaderboard] Error executing command:", error);
      // Main catch block after deferReply attempt
      try {
        // Try to edit the existing deferred reply (e.g., the "Fetching data..." message)
        await interaction.editReply({
          content:
            "An error occurred while processing the leaderboard command.", // English message
          embeds: [],
          components: [],
        });
      } catch (editError) {
        // If editing fails (e.g., interaction expired due to 10062 error earlier), try followUp
        console.error(
          "[/leaderboard] Failed to editReply in catch block:",
          editError
        );
        // Don't try followUp if the initial error was 10062 (Unknown Interaction)
        if (editError.code !== 10062) {
          try {
            // Send a new message if editing the original reply failed
            await interaction.followUp({
              content:
                "An error occurred while processing the leaderboard command.", // English message
              ephemeral: true, // Make it visible only to the user who ran the command
            });
          } catch (followUpError) {
            console.error(
              "[/leaderboard] Failed to followUp in catch block:",
              followUpError
            );
            // Log if even followUp fails
          }
        }
      }
    }
  },
};
