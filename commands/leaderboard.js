// commands/leaderboard.js

const {
  SlashCommandBuilder,
  EmbedBuilder,
  AttachmentBuilder, // Import AttachmentBuilder
} = require("discord.js");
const fetch = require("node-fetch");
const XLSX = require("xlsx"); // Import the xlsx library

// Helper function for number formatting
const formatNumber = (num) => {
  if (num === null || num === undefined) return "0";
  const number = Number(num);
  return isNaN(number) ? "N/A" : number.toLocaleString("en-US"); // Use en-US for commas
};

// Helper function to create a standard response embed
const createResponseEmbed = (title, description, color) => {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: "RoK Stats System • Kingdom 2921" });
};

// Function to generate Excel buffer
const createExcelBuffer = (data, rankingType, valueLabel) => {
  try {
    // Prepare data for worksheet: Map array of objects to array of arrays
    const worksheetData = [
      ["Rank", "Governor ID", "Nickname", valueLabel], // Header row
      ...data.map((player) => [
        player.rank,
        player.id,
        player.nickname || `ID: ${player.id}`, // Handle missing nickname
        player.value,
      ]),
    ];

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(worksheetData);

    // Optional: Adjust column widths (example)
    ws["!cols"] = [
      { wch: 5 }, // Rank
      { wch: 15 }, // ID
      { wch: 30 }, // Nickname
      { wch: 20 }, // Value
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Leaderboard ${rankingType}`); // Sheet name

    // Write workbook to buffer
    const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    return buffer;
  } catch (error) {
    console.error("[/leaderboard] Error generating Excel buffer:", error);
    return null; // Return null if buffer generation fails
  }
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription(
      "Displays the KvK player rankings and provides a full Excel export."
    ) // Updated description
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
        .setDescription(
          "Number of ranks to show in the embed (default 10, max 25)"
        ) // Clarified limit purpose
        .setRequired(false)
    ),

  async execute(interaction, appsScriptUrl) {
    console.log(
      `[/leaderboard] Executing command for user ${interaction.user.id} (${interaction.user.tag}) in channel ${interaction.channelId}`
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
          0xffcc00
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
    // User limit for embed display, default 10, max 25
    const userEmbedLimit = interaction.options.getInteger("limit");
    const embedDisplayLimit = userEmbedLimit
      ? Math.min(userEmbedLimit, 25)
      : 10; // Use user limit up to 25, else default 10

    if (!appsScriptUrl) {
      console.error(
        "[ERROR] /leaderboard: APPS_SCRIPT_WEB_APP_URL is not configured."
      );
      const embed = createResponseEmbed(
        "Configuration Error",
        "Error: Backend configuration is missing. Please contact the administrator.",
        0xff0000
      );
      return interaction.editReply({ embeds: [embed], ephemeral: true });
    }

    try {
      // Fetching message - Limit parameter is no longer sent or relevant for fetching FULL data
      let fetchingMessage = `⏳ Fetching FULL ${rankingType} leaderboard data...`;
      await interaction.editReply(fetchingMessage);

      // Payload for backend - We don't need to send limit anymore if backend ignores it
      const payload = {
        command: "get_leaderboard",
        // We don't strictly need to send limit if the backend returns the full list anyway
        // data: { type: rankingType, limit: 9999 }, // Or send a high limit
        data: { type: rankingType }, // Or just send type if backend is updated to ignore limit
      };

      console.log(
        `[/leaderboard] Sending request to backend:`,
        JSON.stringify(payload)
      );
      const response = await fetch(appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let finalEmbed;
      let excelAttachment = null; // Variable to hold the attachment

      // --- Process Backend Response ---
      if (!response.ok) {
        let errorMsg = `Backend returned an error (${response.status} ${response.statusText})`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.message || errorMsg;
        } catch (e) {
          console.log(
            "[/leaderboard] Could not parse error response body as JSON."
          );
        }
        console.error(
          `[/leaderboard] Backend request failed: ${response.status} ${response.statusText}`
        );
        finalEmbed = createResponseEmbed(
          "Backend Error",
          `❌ Failed to retrieve data: ${errorMsg}`,
          0xff0000
        );
      } else {
        const responseData = await response.json();
        console.log(
          `[/leaderboard] Received response from backend:`,
          JSON.stringify(responseData).substring(0, 500) + "..."
        ); // Log start of response

        let actualStatus = responseData.status;
        let actualDetails = responseData.details;
        let actualMessage = responseData.message;

        if (
          actualStatus === "success" &&
          typeof actualDetails === "object" &&
          actualDetails !== null &&
          actualDetails.status
        ) {
          console.log(
            "[/leaderboard] Detected nested status structure. Using nested values."
          );
          actualStatus = actualDetails.status;
          actualMessage = actualDetails.message || actualMessage;
          actualDetails = actualDetails.details;
        }

        if (actualStatus === "success") {
          if (Array.isArray(actualDetails)) {
            // --- SUCCESS CASE: Data array found ---
            const fullLeaderboardData = actualDetails; // This is the FULL list
            let embedTitle = "";
            let valueLabel = "";
            let embedColor = 0x0099ff;

            // Determine title, label, color
            switch (rankingType) {
              case "DKP":
                embedTitle = `🏅 Leaderboard - Pure DKP (Zone KP)`;
                valueLabel = "KP";
                embedColor = 0x0099ff;
                break;
              case "PreKvK":
                embedTitle = `✨ Leaderboard - Pre-KvK (Converted KP)`;
                valueLabel = "Converted KP";
                embedColor = 0xffa500;
                break;
              case "PowerReduce":
                embedTitle = `📉 Leaderboard - Power Reduce`;
                valueLabel = "Power Reduce";
                embedColor = 0xff4500;
                break;
              case "DeathT4":
                embedTitle = `💀 Leaderboard - Death T4`;
                valueLabel = "T4 Lost";
                embedColor = 0x8b0000;
                break;
              case "DeathT5":
                embedTitle = `☠️ Leaderboard - Death T5`;
                valueLabel = "T5 Lost";
                embedColor = 0x4b0082;
                break;
              case "Score":
              default:
                embedTitle = `🏆 Leaderboard - KvK Score (Final Score)`;
                valueLabel = "Score";
                embedColor = 0x00ff00;
                break;
            }
            // Add count to title
            embedTitle += ` (Top ${embedDisplayLimit} / ${fullLeaderboardData.length} Total)`;

            // Build the success embed description (using embedDisplayLimit)
            if (fullLeaderboardData.length === 0) {
              finalEmbed = createResponseEmbed(
                embedTitle,
                `No ranking data available for type ${rankingType} at this time.`,
                embedColor
              );
            } else {
              // Slice data ONLY for the embed display
              const embedData = fullLeaderboardData.slice(0, embedDisplayLimit);
              const descriptionLines = embedData.map(
                (p) =>
                  `${p.rank}. \`${p.id}\` ${
                    p.nickname || `ID: ${p.id}`
                  } - **${formatNumber(p.value)}** ${valueLabel}`
              );

              let description = descriptionLines.join("\n");
              if (fullLeaderboardData.length > embedDisplayLimit) {
                description += `\n\n*Showing Top ${embedDisplayLimit} of ${fullLeaderboardData.length} total entries. Full list attached.*`; // Updated note
              }
              if (description.length > 4096) {
                description = description.substring(0, 4090) + "\n...";
              }
              finalEmbed = createResponseEmbed(
                embedTitle,
                description,
                embedColor
              );

              // --- Generate Excel File ---
              console.log(
                `[/leaderboard] Generating Excel file for ${fullLeaderboardData.length} entries...`
              );
              const excelBuffer = createExcelBuffer(
                fullLeaderboardData,
                rankingType,
                valueLabel
              );
              if (excelBuffer) {
                const timestamp = new Date()
                  .toISOString()
                  .replace(/[:.]/g, "-");
                const fileName = `leaderboard_${rankingType}_${timestamp}.xlsx`;
                excelAttachment = new AttachmentBuilder(excelBuffer, {
                  name: fileName,
                });
                console.log(
                  `[/leaderboard] Excel file "${fileName}" generated successfully.`
                );
              } else {
                // Optionally add a note to the embed if Excel fails
                finalEmbed.setFooter({
                  text:
                    finalEmbed.data.footer.text +
                    " • Failed to generate Excel file.",
                });
              }
              // --- End Excel File Generation ---
            }
          } else {
            console.error(
              "[/leaderboard] Success status determined, but details format is not an array:",
              actualDetails
            );
            finalEmbed = createResponseEmbed(
              "Processing Error",
              "❌ Failed to process leaderboard data. Unexpected data format received.",
              0xff0000
            );
          }
        } else if (actualStatus === "unavailable" || actualStatus === "error") {
          console.warn(
            `[/leaderboard] Determined status: ${actualStatus}. Message: ${actualMessage}`
          );
          const embedColor =
            actualStatus === "unavailable" ? 0xffcc00 : 0xff0000;
          const embedTitle =
            actualStatus === "unavailable"
              ? "Data Unavailable"
              : "Backend Error";
          finalEmbed = createResponseEmbed(
            embedTitle,
            `⚠️ ${actualMessage || "Failed to retrieve leaderboard data."}`,
            embedColor
          );
        } else {
          console.error(
            "[/leaderboard] Unknown final status determined:",
            actualStatus
          );
          finalEmbed = createResponseEmbed(
            "Processing Error",
            `❌ Failed to process leaderboard data. Unknown status received: ${actualStatus}`,
            0xff0000
          );
        }
      }

      // Edit the reply with the final embed and potentially the file
      const replyOptions = { content: "", embeds: [finalEmbed], files: [] };
      if (excelAttachment) {
        replyOptions.files.push(excelAttachment); // Add the attachment if it was created
      }
      await interaction.editReply(replyOptions);
    } catch (error) {
      console.error("[/leaderboard] Error executing command:", error);
      try {
        const errorEmbed = createResponseEmbed(
          "Command Error",
          `An unexpected error occurred: ${error.message}`,
          0xff0000
        );
        await interaction.editReply({
          content: "",
          embeds: [errorEmbed],
          components: [],
        });
      } catch (editError) {
        console.error(
          "[/leaderboard] Failed to editReply in main catch block:",
          editError
        );
        if (editError.code !== 10062) {
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
