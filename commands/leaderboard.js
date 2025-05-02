// commands/leaderboard.js

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed

// Helper function for number formatting
const formatNumber = (num) => {
  if (num === null || num === undefined) return "0";
  const number = Number(num);
  // Using id-ID for dots as thousands separators. Change to 'en-US' for commas if preferred.
  return isNaN(number) ? "N/A" : number.toLocaleString("en-US");
};

// Helper function to create a standard response embed
const createResponseEmbed = (title, description, color) => {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: "RoK Stats System • Kingdom 2921" }); // Adjust footer if needed
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Displays the KvK player rankings.")
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Select the ranking type to display.")
        .setRequired(false) // Optional, defaults to 'Score'
        .addChoices(
          // English choices for values, names can be localized if needed
          { name: "KvK Score (Final Score)", value: "Score" },
          { name: "Pure DKP (Zone KP)", value: "DKP" },
          { name: "Pre-KvK (Converted KP)", value: "PreKvK" },
          { name: "Power Reduce", value: "PowerReduce" },
          { name: "Death T4 (T4 Troops Lost)", value: "DeathT4" },
          { name: "Death T5 (T5 Troops Lost)", value: "DeathT5" }
        )
    )
    .addIntegerOption(
      (
        option // Integer option for limit
      ) =>
        option
          .setName("limit")
          .setDescription("Number of top ranks to display (default 100)")
          .setRequired(false) // Make it optional
    ),

  async execute(interaction, appsScriptUrl) {
    // Log command execution start
    console.log(
      `[/leaderboard] Executing command for user ${interaction.user.id} (${interaction.user.tag}) in channel ${interaction.channelId}`
    );

    try {
      // Defer reply to avoid interaction timeout
      await interaction.deferReply();
    } catch (error) {
      console.error("[/leaderboard] Deferral failed:", error);
      // If deferral fails, we can't send a reply
      return;
    }

    // --- Channel Check ---
    const leaderboardChannelId = process.env.LEADERBOARD_CHANNEL_ID; // Get allowed channel ID from environment variables
    if (
      leaderboardChannelId && // Check if an allowed channel ID is set
      interaction.channelId !== leaderboardChannelId // Check if the command is used in the allowed channel
    ) {
      console.log(
        `[/leaderboard] Command used in wrong channel ${interaction.channelId}. Allowed: ${leaderboardChannelId}`
      );
      try {
        // Create an embed for the restriction message
        const embed = createResponseEmbed(
          "Command Restriction",
          `This command can only be used in the <#${leaderboardChannelId}> channel.`,
          0xffcc00 // Yellow/Warning color
        );
        // Edit the deferred reply with the restriction message
        await interaction.editReply({ embeds: [embed], ephemeral: true }); // Ephemeral: only visible to the user
      } catch (e) {
        console.error(
          "[/leaderboard] Failed to send wrong channel message:",
          e
        );
      }
      return; // Stop execution
    }
    // --- End Channel Check ---

    // Get options from the interaction, providing default values
    const rankingType = interaction.options.getString("type") ?? "Score"; // Default to 'Score' if not provided
    const limitToShow = interaction.options.getInteger("limit") ?? 100; // Default to 100 if not provided

    // Check if the backend URL is configured
    if (!appsScriptUrl) {
      console.error(
        "[ERROR] /leaderboard: APPS_SCRIPT_WEB_APP_URL is not configured."
      );
      // Create an embed for the configuration error
      const embed = createResponseEmbed(
        "Configuration Error",
        "Error: Backend configuration is missing. Please contact the administrator.",
        0xff0000 // Red color
      );
      // Edit the deferred reply with the error message
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    try {
      // Determine the initial "fetching" message based on the selected type
      let fetchingMessage = `⏳ Fetching ${rankingType} leaderboard data (Top ${limitToShow})...`;
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
      // Edit the deferred reply to show the fetching message
      await interaction.editReply(fetchingMessage);

      // Prepare the payload for the backend request
      const payload = {
        command: "get_leaderboard",
        data: { type: rankingType, limit: limitToShow },
      };

      // Log the request being sent to the backend
      console.log(
        `[/leaderboard] Sending request to backend:`,
        JSON.stringify(payload)
      );

      // Make the POST request to the Google Apps Script Web App URL
      const response = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // Consider adding a timeout here if needed
        // signal: AbortSignal.timeout(15000) // e.g., 15 seconds timeout
      });

      // Initialize variable for the final embed reply
      let finalEmbed;

      // --- Process Backend Response ---
      if (!response.ok) {
        // Handle HTTP errors (status code not in the 200-299 range)
        let errorMsg = `Backend returned an error (${response.status} ${response.statusText})`;
        try {
          // Try to parse a potential JSON error message from the backend
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg; // Use backend message if available
        } catch (e) {
          console.log(
            "[/leaderboard] Could not parse error response body as JSON."
          );
          // Optional: Read response as text if JSON parsing fails
          // const textError = await response.text();
          // errorMsg += `\nResponse: ${textError.substring(0, 1000)}`;
        }
        console.error(
          `[/leaderboard] Backend request failed: ${response.status} ${response.statusText}`
        );
        // Create an error embed
        finalEmbed = createResponseEmbed(
          "Backend Error",
          `❌ Failed to retrieve data: ${errorMsg}`,
          0xff0000
        ); // Red
      } else {
        // Handle successful HTTP response (status code 2xx)
        const responseData = await response.json();
        // Log the raw response received from the backend
        console.log(
          `[/leaderboard] Received response from backend:`,
          JSON.stringify(responseData)
        );

        // Determine the actual status and data/message location, handling potential nesting
        let actualStatus = responseData.status; // Start with top-level status
        let actualDetails = responseData.details;
        let actualMessage = responseData.message;

        // Check for the specific nested structure where top status is 'success' but details contains another status object
        if (
          actualStatus === "success" &&
          typeof actualDetails === "object" &&
          actualDetails !== null &&
          actualDetails.status
        ) {
          console.log(
            "[/leaderboard] Detected nested status structure. Using nested values."
          );
          actualStatus = actualDetails.status; // Prioritize the nested status
          actualMessage = actualDetails.message || actualMessage; // Prioritize the nested message
          actualDetails = actualDetails.details; // Use the inner details (expected to be the array or undefined)
        }

        // Now process based on the *actual* status determined above
        if (actualStatus === "success") {
          // Check if actualDetails is now the expected array
          if (Array.isArray(actualDetails)) {
            // --- SUCCESS CASE: Data array found ---
            const leaderboardData = actualDetails;
            let embedTitle = "";
            let valueLabel = "";
            let embedColor = 0x0099ff; // Default success color

            // Determine title, label, color based on the requested rankingType
            switch (rankingType) {
              case "DKP":
                embedTitle = `🏅 Leaderboard - Pure DKP (Zone KP) (Top ${leaderboardData.length})`;
                valueLabel = "KP";
                embedColor = 0x0099ff;
                break; // Blue
              case "PreKvK":
                embedTitle = `✨ Leaderboard - Pre-KvK (Converted KP) (Top ${leaderboardData.length})`;
                valueLabel = "Converted KP";
                embedColor = 0xffa500;
                break; // Orange
              case "PowerReduce":
                embedTitle = `📉 Leaderboard - Power Reduce (Top ${leaderboardData.length})`;
                valueLabel = "Power Reduce";
                embedColor = 0xff4500;
                break; // OrangeRed
              case "DeathT4":
                embedTitle = `💀 Leaderboard - Death T4 (Top ${leaderboardData.length})`;
                valueLabel = "T4 Lost";
                embedColor = 0x8b0000;
                break; // DarkRed
              case "DeathT5":
                embedTitle = `☠️ Leaderboard - Death T5 (Top ${leaderboardData.length})`;
                valueLabel = "T5 Lost";
                embedColor = 0x4b0082;
                break; // Indigo
              case "Score":
              default:
                embedTitle = `🏆 Leaderboard - KvK Score (Final Score) (Top ${leaderboardData.length})`;
                valueLabel = "Score";
                embedColor = 0x00ff00;
                break; // Green
            }

            // Build the success embed description
            if (leaderboardData.length === 0) {
              // Handle case where data array is empty
              finalEmbed = createResponseEmbed(
                embedTitle,
                `No ranking data available for type ${rankingType} at this time.`,
                embedColor
              );
            } else {
              // Limit the number of entries shown in the embed (Discord has limits)
              const displayLimit = Math.min(limitToShow, 25); // Show up to 'limitToShow' or 25, whichever is smaller
              // Format each player entry
              const descriptionLines = leaderboardData
                .slice(0, displayLimit) // Take only the top entries for display
                .map(
                  (p) =>
                    `${p.rank}. \`${p.id}\` ${
                      p.nickname || `ID: ${p.id}`
                    } - **${formatNumber(p.value)}** ${valueLabel}`
                );

              let description = descriptionLines.join("\n"); // Join lines with newline

              // Add a note if more data was available than shown
              if (leaderboardData.length > displayLimit) {
                description += `\n\n*Showing Top ${displayLimit} of ${leaderboardData.length} available entries.*`;
              }
              // Check for Discord's description length limit
              if (description.length > 4096) {
                description = description.substring(0, 4090) + "\n..."; // Truncate if too long
              }
              // Create the final success embed
              finalEmbed = createResponseEmbed(
                embedTitle,
                description,
                embedColor
              );
            }
          } else {
            // --- UNEXPECTED SUCCESS CASE: actualStatus is success, but actualDetails is not an array ---
            console.error(
              "[/leaderboard] Success status determined, but details format is not an array:",
              actualDetails
            );
            finalEmbed = createResponseEmbed(
              "Processing Error",
              "❌ Failed to process leaderboard data. Unexpected data format received after resolving status.",
              0xff0000
            ); // Red
          }
        } else if (actualStatus === "unavailable" || actualStatus === "error") {
          // --- HANDLED CASE: Status is 'unavailable' or 'error' (either top-level or nested) ---
          console.warn(
            `[/leaderboard] Determined status: ${actualStatus}. Message: ${actualMessage}`
          );
          const embedColor =
            actualStatus === "unavailable" ? 0xffcc00 : 0xff0000; // Yellow for unavailable, Red for error
          const embedTitle =
            actualStatus === "unavailable"
              ? "Data Unavailable"
              : "Backend Error";
          // Create the warning/error embed using the determined message
          finalEmbed = createResponseEmbed(
            embedTitle,
            `⚠️ ${actualMessage || "Failed to retrieve leaderboard data."}`,
            embedColor
          );
        } else {
          // --- UNEXPECTED CASE: Unknown final status ---
          console.error(
            "[/leaderboard] Unknown final status determined:",
            actualStatus
          );
          finalEmbed = createResponseEmbed(
            "Processing Error",
            `❌ Failed to process leaderboard data. Unknown status received: ${actualStatus}`,
            0xff0000
          ); // Red
        }
      }

      // Edit the deferred reply with the final embed
      await interaction.editReply({ content: "", embeds: [finalEmbed] }); // Remove fetching message, show the embed
    } catch (error) {
      // Catch any other errors during command execution (e.g., network issues before fetch, JSON parsing errors, logic errors)
      console.error("[/leaderboard] Error executing command:", error);
      try {
        // Create a generic error embed
        const errorEmbed = createResponseEmbed(
          "Command Error",
          `An unexpected error occurred while processing the command: ${error.message}`,
          0xff0000 // Red
        );
        // Try to edit the deferred reply with the error embed
        await interaction.editReply({
          content: "",
          embeds: [errorEmbed],
          components: [],
        });
      } catch (editError) {
        // Handle cases where editing the reply fails (e.g., interaction already timed out)
        console.error(
          "[/leaderboard] Failed to editReply in main catch block:",
          editError
        );
        // Optional: Follow up with an ephemeral message if editing fails, unless it's a known interaction issue (10062)
        if (editError.code !== 10062) {
          // 10062 = Unknown Interaction
          try {
            await interaction.followUp({
              content: "An error occurred while processing the command.",
              ephemeral: true,
            });
          } catch (followUpError) {
            console.error(
              "[/leaderboard] Failed to followUp in main catch block:",
              followUpError
            );
          }
        }
      }
    }
  },
};
