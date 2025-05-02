// commands/leaderboard.js

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch@2 is installed

// Helper function for number formatting
const formatNumber = (num) => {
  if (num === null || num === undefined) return "0";
  const number = Number(num);
  return isNaN(number) ? "N/A" : number.toLocaleString("id-ID"); // Using id-ID for dots as thousands separators
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
        .setRequired(false)
        .addChoices(
          { name: "KvK Score (Final Score)", value: "Score" },
          { name: "Pure DKP (Zone KP)", value: "DKP" },
          { name: "Pre-KvK (Converted KP)", value: "PreKvK" },
          { name: "Power Reduce", value: "PowerReduce" },
          { name: "Death T4 (T4 Troops Lost)", value: "DeathT4" },
          { name: "Death T5 (T5 Troops Lost)", value: "DeathT5" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Number of top ranks to display (default 100)")
        .setRequired(false)
    ),

  async execute(interaction, appsScriptUrl) {
    console.log(
      `[/leaderboard] Executing command for user ${interaction.user.id}`
    );

    try {
      await interaction.deferReply();
    } catch (error) {
      console.error("[/leaderboard] Deferral failed:", error);
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
        const embed = createResponseEmbed(
          "Command Restriction",
          `This command can only be used in the <#${leaderboardChannelId}> channel.`,
          0xffcc00 // Yellow/Warning color
        );
        await interaction.editReply({ embeds: [embed], ephemeral: true });
      } catch (e) {
        console.error(
          "[/leaderboard] Failed to send wrong channel message:",
          e
        );
      }
      return;
    }
    // --- End Channel Check ---

    const rankingType = interaction.options.getString("type") ?? "Score";
    const limitToShow = interaction.options.getInteger("limit") ?? 100;

    if (!appsScriptUrl) {
      console.error(
        "[ERROR] /leaderboard: APPS_SCRIPT_WEB_APP_URL is not configured."
      );
      const embed = createResponseEmbed(
        "Configuration Error",
        "Error: Backend configuration is missing.",
        0xff0000 // Red color
      );
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    try {
      // Determine the initial fetching message based on type
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
      await interaction.editReply(fetchingMessage);

      const payload = {
        command: "get_leaderboard",
        data: { type: rankingType, limit: limitToShow },
      };

      console.log(`[/leaderboard] Sending request to backend:`, payload);
      const response = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Initialize variables for the final reply
      let finalEmbed;

      // --- Process Backend Response ---
      if (!response.ok) {
        // Handle HTTP errors (e.g., 500, 404)
        let errorMsg = `Backend Error (${response.status})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch (e) {
          /* Ignore parsing error, use default message */
        }
        console.error(
          `[/leaderboard] Backend request failed: ${response.status} ${response.statusText}`
        );
        finalEmbed = createResponseEmbed(
          "Backend Error",
          `❌ Failed to retrieve data: ${errorMsg}`,
          0xff0000
        ); // Red
      } else {
        // Handle successful HTTP response (2xx)
        const responseData = await response.json();
        console.log(
          `[/leaderboard] Received response from backend:`,
          JSON.stringify(responseData)
        ); // Log the full response

        // Check the structure and status returned by the backend
        if (responseData.status === "success") {
          // Check if details contains the actual data (array) or a nested status (object)
          if (Array.isArray(responseData.details)) {
            // --- SUCCESS CASE: Data is in an array ---
            const leaderboardData = responseData.details;
            let embedTitle = "";
            let valueLabel = "";
            let embedColor = 0x0099ff; // Default success color (blue)

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

            if (leaderboardData.length === 0) {
              finalEmbed = createResponseEmbed(
                embedTitle, // Use the determined title
                `No ranking data available for type ${rankingType} at this time.`,
                embedColor // Use the determined color
              );
            } else {
              const displayLimit = Math.min(limitToShow, 25);
              const descriptionLines = leaderboardData
                .slice(0, displayLimit)
                .map(
                  (p) =>
                    `${p.rank}. \`${p.id}\` ${
                      p.nickname || `ID: ${p.id}`
                    } - **${formatNumber(p.value)}** ${valueLabel}`
                );

              let description = descriptionLines.join("\n");
              if (leaderboardData.length > displayLimit) {
                description += `\n\n*Showing Top ${displayLimit} of ${leaderboardData.length} available entries.*`;
              }
              if (description.length > 4096) {
                description = description.substring(0, 4090) + "\n...";
              }

              // Create the success embed using the helper
              finalEmbed = createResponseEmbed(
                embedTitle,
                description,
                embedColor
              );
            }
          } else if (
            typeof responseData.details === "object" &&
            responseData.details !== null &&
            responseData.details.status
          ) {
            // --- HANDLED CASE: Details contains a nested status (like 'unavailable' or 'error') ---
            console.warn(
              `[/leaderboard] Backend returned nested status: ${responseData.details.status}. Message: ${responseData.details.message}`
            );
            const nestedStatus = responseData.details.status;
            const nestedMessage =
              responseData.details.message ||
              `Data for ${rankingType} is currently unavailable.`;
            const embedColor =
              nestedStatus === "unavailable" ? 0xffcc00 : 0xff0000; // Yellow for unavailable, Red for error
            const embedTitle =
              nestedStatus === "unavailable"
                ? "Data Unavailable"
                : "Backend Error";
            finalEmbed = createResponseEmbed(
              embedTitle,
              `⚠️ ${nestedMessage}`,
              embedColor
            );
          } else {
            // --- UNEXPECTED SUCCESS CASE: Status is success, but details is not array or expected object ---
            console.error(
              "[/leaderboard] Backend returned success status but details format is unexpected:",
              responseData.details
            );
            finalEmbed = createResponseEmbed(
              "Processing Error",
              "❌ Failed to process leaderboard data. Unexpected data format received.",
              0xff0000
            ); // Red
          }
        } else if (
          responseData.status === "unavailable" ||
          responseData.status === "error"
        ) {
          // --- HANDLED CASE: Top-level status is 'unavailable' or 'error' ---
          console.warn(
            `[/leaderboard] Backend returned top-level status: ${responseData.status}. Message: ${responseData.message}`
          );
          const embedColor =
            responseData.status === "unavailable" ? 0xffcc00 : 0xff0000; // Yellow for unavailable, Red for error
          const embedTitle =
            responseData.status === "unavailable"
              ? "Data Unavailable"
              : "Backend Error";
          finalEmbed = createResponseEmbed(
            embedTitle,
            `⚠️ ${
              responseData.message || "Failed to retrieve leaderboard data."
            }`,
            embedColor
          );
        } else {
          // --- UNEXPECTED CASE: Unknown top-level status ---
          console.error(
            "[/leaderboard] Backend returned unknown status:",
            responseData
          );
          finalEmbed = createResponseEmbed(
            "Processing Error",
            `❌ Failed to process leaderboard data. Unknown status received: ${responseData.status}`,
            0xff0000
          ); // Red
        }
      }

      // Edit the reply with the final embed
      await interaction.editReply({ content: "", embeds: [finalEmbed] }); // Remove fetching message
    } catch (error) {
      // Catch any errors during the command execution (e.g., network issues, JSON parsing errors)
      console.error("[/leaderboard] Error executing command:", error);
      try {
        const errorEmbed = createResponseEmbed(
          "Command Error",
          "An error occurred while processing the leaderboard command.",
          0xff0000 // Red
        );
        await interaction.editReply({
          content: "",
          embeds: [errorEmbed],
          components: [],
        });
      } catch (editError) {
        console.error(
          "[/leaderboard] Failed to editReply in catch block:",
          editError
        );
        // Optional: Follow up if edit fails and error is not 10062 (Unknown Interaction)
        if (editError.code !== 10062) {
          try {
            await interaction.followUp({
              content: "An error occurred while processing the command.",
              ephemeral: true,
            });
          } catch (followUpError) {
            console.error(
              "[/leaderboard] Failed to followUp in catch block:",
              followUpError
            );
          }
        }
      }
    }
  },
};
