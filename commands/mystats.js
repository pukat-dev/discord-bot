// commands/mystats.js (Full Code - Handle Rank Data Availability - v18 - English - ID Validation 4-10 Digits)

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const fetch = require("node-fetch");

// --- Helper Functions ---
const separator = {
  name: "\u200B",
  value: "────────────────────",
  inline: false,
};

const formatNumber = (num, decimalPlaces = 0) => {
  if (num === null || num === undefined) return "N/A";
  const number = Number(num);
  if (isNaN(number)) return "N/A";
  return number.toLocaleString("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });
};

const calculatePercentage = (current, target) => {
  const currentNum = parseNumberSafe(current);
  const targetNum = parseNumberSafe(target);
  if (targetNum <= 0) return 0;
  const percentage = Math.max(0, (currentNum / targetNum) * 100);
  return parseFloat(percentage.toFixed(1));
};

const parseNumberSafe = (value) => {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return isNaN(num) ? 0 : num;
};

function formatFarmList(farms) {
  if (!farms || !Array.isArray(farms) || farms.length === 0) {
    return "*No farms linked.*";
  }
  try {
    let farmListString = farms
      .map((farm) => {
        const idText = farm?.id ? `\`${farm.id}\`` : "N/A";
        const fillerText =
          farm?.isFiller !== undefined ? (farm.isFiller ? "Yes" : "No") : "N/A";
        return `• **ID:** ${idText} (**Filler:** ${fillerText})`;
      })
      .join("\n");
    if (farmListString.length > 1020) {
      farmListString = farmListString.substring(0, 1020) + "\n...";
    }
    return farmListString;
  } catch (e) {
    console.error("[Helper formatFarmList] Error during formatting:", e);
    return "*Error formatting farm list.*";
  }
}

function formatPreKvkFarms(farmDetails) {
  if (!farmDetails || !Array.isArray(farmDetails) || farmDetails.length === 0) {
    return "*No farm data submitted.*";
  }
  try {
    let output = farmDetails
      .map(
        (farm) =>
          `• **Farm ID \`${farm.id}\`:** ${formatNumber(farm.points)} Points`
      )
      .join("\n");
    if (output.length > 1000) {
      output = output.substring(0, 1000) + "\n...";
    }
    return output;
  } catch (e) {
    console.error("[Helper formatPreKvkFarms] Error during formatting:", e);
    return "*Error formatting PreKvK farm details.*";
  }
}

function formatZoneKpDetails(zoneDetails) {
  if (!zoneDetails || !Array.isArray(zoneDetails) || zoneDetails.length === 0) {
    return "*No zone data submitted.*";
  }
  try {
    let output = zoneDetails
      .map((zone) => {
        const startKP = formatNumber(zone.kpAwal);
        const endKP = formatNumber(zone.kpAkhir);
        const gainedKP = formatNumber(zone.kpGained);
        const startPower = formatNumber(zone.powerBefore);
        const endPower = formatNumber(zone.powerAfter);
        const reducedPower = formatNumber(zone.powerReduce);

        return (
          `• **${zone.zone}**:\n` +
          `  - KP Start/End: ${startKP} / ${endKP}\n` +
          `  - **KP Gained:** **${gainedKP}**\n` +
          `  - Power Start/End: ${startPower} / ${endPower}\n` +
          `  - **Power Reduced:** **${reducedPower}**`
        );
      })
      .join("\n\n");
    if (output.length > 1000) {
      output = output.substring(0, 1000) + "\n...";
    }
    return output;
  } catch (e) {
    console.error("[Helper formatZoneKpDetails] Error during formatting:", e);
    return "*Error formatting zone details.*";
  }
}

function formatFillerDetails(fillerDetails) {
  if (
    !fillerDetails ||
    !Array.isArray(fillerDetails) ||
    fillerDetails.length === 0
  ) {
    return "*No filler data submitted.*";
  }
  try {
    let output = fillerDetails
      .map((filler) => {
        const t4 = formatNumber(filler.t4);
        const t5 = formatNumber(filler.t5);
        const deathPoints = formatNumber(filler.score, 1);
        return `• **ID \`${filler.id}\`**:\n  - T4 Dead: ${t4}\n  - T5 Dead: ${t5}\n  - **Death Points:** **${deathPoints}**`;
      })
      .join("\n\n");
    if (output.length > 1000) {
      output = output.substring(0, 1000) + "\n...";
    }
    return output;
  } catch (e) {
    console.error("[Helper formatFillerDetails] Error during formatting:", e);
    return "*Error formatting filler details.*";
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("mystats")
    .setDescription(
      "Displays comprehensive KvK stats summary for a specific Governor ID."
    )
    .addStringOption((option) =>
      option
        .setName("governor_id")
        .setDescription(
          "Enter the Governor ID (main or farm account) to check."
        )
        .setRequired(true)
    ),

  async execute(interaction, appsScriptUrl) {
    console.log(
      `[/mystats] Executing command for user ${
        interaction.user.id
      } at ${new Date().toISOString()}`
    );

    const registrationChannelId = "YOUR_REGISTRATION_CHANNEL_ID";

    try {
      console.log(`[/mystats] Attempting deferReply...`);
      await interaction.deferReply();
      console.log(`[/mystats] deferReply successful.`);

      const myStatsChannelId = process.env.MY_STATS_CHANNEL_ID;
      if (myStatsChannelId && interaction.channelId !== myStatsChannelId) {
        console.log(
          `[/mystats] Command used in wrong channel ${interaction.channelId}. Allowed: ${myStatsChannelId}`
        );
        return interaction.editReply({
          content: `This command can only be used in <#${myStatsChannelId}>.`,
        });
      }
      if (!appsScriptUrl) {
        console.error(
          "[ERROR] /mystats: APPS_SCRIPT_WEB_APP_URL is not configured."
        );
        return interaction.editReply({
          content: "Error: Backend configuration is missing.",
        });
      }

      const governorIdInput = interaction.options.getString("governor_id");
      const discordUserId = interaction.user.id;

      if (!/^\d{4,10}$/.test(governorIdInput)) {
        console.log(
          `[/mystats] Invalid Gov ID format provided: ${governorIdInput}`
        );
        return interaction.editReply({
          content:
            "❌ Invalid Governor ID format. Please enter **4 to 10 digits** only.",
        });
      }
      const targetGovernorId = governorIdInput;
      console.log(
        `[/mystats] User ${discordUserId} checking stats for requested Gov ID: ${targetGovernorId}`
      );

      await interaction.editReply({
        content: `⏳ Fetching KvK stats for Governor ID \`${targetGovernorId}\`... This may take up to 2 minutes, please wait.`,
      });
      const statsPayload = {
        command: "get_my_stats",
        data: { governorId: targetGovernorId },
      };
      console.log(
        `[/mystats] Sending 'get_my_stats' request for Gov ID ${targetGovernorId}`
      );
      let result;
      try {
        const statsResponse = await fetch(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statsPayload),
        });
        const statsResponseText = await statsResponse.text();
        const responseStatus = statsResponse.status;
        console.log(
          `[/mystats] 'get_my_stats' response status ${responseStatus} for Gov ID ${targetGovernorId}. Raw text (first 300): ${statsResponseText.substring(
            0,
            300
          )}`
        );

        try {
          result = JSON.parse(statsResponseText);
        } catch (parseError) {
          console.error(
            "[/mystats] Failed to parse JSON response:",
            parseError
          );
          throw new Error(
            `Failed to parse response from backend.${
              !statsResponse.ok ? ` (Status: ${responseStatus})` : ""
            }`
          );
        }

        if (result?.status === "error") {
          console.warn(
            `[/mystats] Backend returned status 'error'. Message: ${result.message}`
          );
          throw new Error(
            result.message || "Backend reported an unspecified error."
          );
        }

        if (!statsResponse.ok) {
          console.error(
            `[/mystats] Received non-OK HTTP status ${responseStatus} but JSON status was not 'error'. Response:`,
            result
          );
          throw new Error(
            `Backend responded with HTTP ${responseStatus} but didn't report a specific error in JSON.`
          );
        }
      } catch (fetchOrProcessingError) {
        console.error(
          "[/mystats] Error during fetch or processing backend response:",
          fetchOrProcessingError
        );
        let finalErrorMessage = `❌ Error retrieving stats: ${
          fetchOrProcessingError.message || "Could not connect/parse."
        }`;
        if (
          fetchOrProcessingError.message &&
          fetchOrProcessingError.message.endsWith("is not registered.")
        ) {
          finalErrorMessage = `❌ ${fetchOrProcessingError.message} Please go to the <#${registrationChannelId}> channel to register.`;
        } else if (
          fetchOrProcessingError.message &&
          fetchOrProcessingError.message.includes("is not linked")
        ) {
          finalErrorMessage = `❌ ${fetchOrProcessingError.message}`;
        }
        return interaction.editReply({ content: finalErrorMessage });
      }

      if (result?.status === "success" && result?.details) {
        const details = result.details;

        const nickname = details.nickname || "N/A";
        const power = parseNumberSafe(details.power);
        const governorId = details.governorId;
        const requestedId = details.requestedId;

        const targets = details.targets ?? {
          targetKP: 0,
          targetDeathPoints: 0,
        };
        const preKvk = details.preKvk ?? {
          mainPoints: 0,
          farmPoints: 0,
          totalPoints: 0,
          equivalentKP: 0,
          farmsDetail: [],
        };
        const zoneKP = details.zoneKP ?? {
          zonesDetail: [],
          totalGainedKP: 0,
          totalPowerReduce: 0,
        };
        const deaths = details.deaths ?? {
          mainT4: 0,
          mainT5: 0,
          totalMainDeaths: 0,
          totalMainDeathPoints: 0,
        };
        const fillers = details.fillers ?? {
          fillersDetail: [],
          totalFillerScore: 0,
          equivalentDeathPoints: 0,
        };
        const finalScoreData = details.finalScore ?? {
          score: 0,
          neededDeathPoints: 0,
          finalNeededDeathPoints: 0,
          dkpStatus: "N/A",
        };
        const rank = details.rank ?? {
          rankDKP: "N/A",
          rankScore: "N/A",
          rankPreKvk: "N/A",
        };
        const linkedFarms = details.linkedFarms ?? [];

        const actualTargetKP = parseNumberSafe(targets.targetKP);
        const actualTargetDeathPoints = parseNumberSafe(
          targets.targetDeathPoints
        );
        const currentScore = parseNumberSafe(finalScoreData.score);
        const currentRawDeaths = parseNumberSafe(deaths.totalMainDeaths);
        const currentMainDeathPoints = parseNumberSafe(
          deaths.totalMainDeathPoints
        );
        const finalNeededDeathPoints = parseNumberSafe(
          finalScoreData.finalNeededDeathPoints
        );
        const equivalentDeathPointsCovered = parseNumberSafe(
          fillers.equivalentDeathPoints
        );

        const kpPercentage = calculatePercentage(currentScore, actualTargetKP);
        const rawDeathPointsPercentage = calculatePercentage(
          currentMainDeathPoints,
          actualTargetDeathPoints
        );
        const finalDeathPointsProgress = Math.max(
          0,
          actualTargetDeathPoints - finalNeededDeathPoints
        );
        const finalDeathPointsPercentage = calculatePercentage(
          finalDeathPointsProgress,
          actualTargetDeathPoints
        );

        let dkpStatus = "Target Not Set";
        let statusColor = 0x5865f2;
        let statusRemark = "";

        if (actualTargetKP > 0 && actualTargetDeathPoints > 0) {
          const kpMet = kpPercentage >= 100;
          const deathTargetMet = finalNeededDeathPoints <= 0;

          if (kpMet && deathTargetMet) {
            dkpStatus = "Fulfilled";
            statusColor = 0x00ff00;
          } else {
            if (kpPercentage < 50 || rawDeathPointsPercentage < 50) {
              dkpStatus = "Not Fulfilled (Risk)";
              statusColor = 0xff0000;
              statusRemark = "\n⚠️ *Potentially leaving the kingdom.*";
            } else if (kpPercentage >= 50 && rawDeathPointsPercentage >= 50) {
              dkpStatus = "Needs Improvement (Stay)";
              statusColor = 0xffa500;
              statusRemark = "\n📈 *Must improve next KvK.*";
            } else {
              dkpStatus = "Not Fulfilled";
              statusColor = 0xff0000;
            }
          }
        }

        let embedTitle = `📊 ${nickname} - KvK Stats Summary`;
        let embedDescription = `**ID:** \`${governorId}\`\nSummary of KvK performance and DKP status.`;
        if (requestedId && requestedId !== governorId) {
          embedDescription = `_(Stats shown for main account linked to requested farm ID: \`${requestedId}\`)_\n${embedDescription}`;
        }

        const statsEmbed = new EmbedBuilder()
          .setColor(statusColor)
          .setTitle(embedTitle)
          .setDescription(embedDescription)
          .setTimestamp()
          .setFooter({ text: "RoK Stats System • Kingdom 2921" });

        // --- Add Fields to Embed ---

        statsEmbed.addFields(
          {
            name: "**👤 Player Information**",
            value: `**Power:** ${formatNumber(power)}`,
            inline: false,
          },
          {
            name: "**🏆 Overall KvK Status**",
            value: `**KvK Score (KP):** ${formatNumber(
              currentScore
            )}\n**Status:** **${dkpStatus}**${statusRemark}`,
            inline: false,
          }
        );

        statsEmbed.addFields(separator, {
          name: "**🎯 Targets & Requirements**",
          value: `**Target KP:** ${formatNumber(
            actualTargetKP
          )} (${kpPercentage.toFixed(
            1
          )}%)\n**Target Death Points:** ${formatNumber(
            actualTargetDeathPoints
          )} (${finalDeathPointsPercentage.toFixed(
            1
          )}% Achieved)\n**Final Needed Death Points:** ${formatNumber(
            finalNeededDeathPoints,
            1
          )} ${
            finalNeededDeathPoints > 0 ? `_(After Fillers)_` : "_(Target Met)_"
          }`,
          inline: false,
        });

        const preKvkFormatted = formatPreKvkFarms(preKvk.farmsDetail);
        let preKvkSummary = `**Total Points:** ${formatNumber(
          preKvk.totalPoints
        )}\n**KP Equivalent:** ~${formatNumber(preKvk.equivalentKP)} KP`;
        if (
          preKvk.totalPoints === 0 &&
          preKvkFormatted === "*No farm data submitted.*"
        ) {
          preKvkSummary = "*No Pre-KvK data submitted.*";
        }
        statsEmbed.addFields(separator, {
          name: "**⭐ Pre-KvK Contribution**",
          value: preKvkSummary,
          inline: false,
        });
        if (preKvkFormatted !== "*No farm data submitted.*") {
          statsEmbed.addFields({
            name: "Farm Details (Pre-KvK)",
            value: preKvkFormatted.substring(0, 1024),
            inline: false,
          });
        }

        let zoneKpValue = formatZoneKpDetails(zoneKP.zonesDetail);
        let totalGainedKP = parseNumberSafe(zoneKP.totalGainedKP);
        let totalPowerReduce = parseNumberSafe(zoneKP.totalPowerReduce);

        statsEmbed.addFields(separator, {
          name: "**⚔️ Zone Performance**",
          value: `**Total KP Gained:** ${formatNumber(
            totalGainedKP
          )}\n**Total Power Reduced:** ${formatNumber(totalPowerReduce)}`,
          inline: false,
        });
        if (zoneKpValue !== "*No zone data submitted.*") {
          statsEmbed.addFields({
            name: "Zone Details",
            value: zoneKpValue.substring(0, 1024),
            inline: false,
          });
        }

        statsEmbed.addFields(separator, {
          name: "**☠️ Dead Troops (Main)**",
          value: `**T4:** ${formatNumber(
            deaths.mainT4
          )}\n**T5:** ${formatNumber(
            deaths.mainT5
          )}\n**Total Troops:** ${formatNumber(
            currentRawDeaths
          )}\n**Total Death Points:** ${formatNumber(
            currentMainDeathPoints,
            1
          )}`,
          inline: false,
        });

        let fillerValue = formatFillerDetails(fillers.fillersDetail);
        let fillerSummary = `**Total Filler Score:** ${formatNumber(
          fillers.totalFillerScore
        )}\n**Equivalent Death Points Covered:** ~${formatNumber(
          equivalentDeathPointsCovered,
          1
        )}`;
        if (
          fillers.totalFillerScore === 0 &&
          equivalentDeathPointsCovered === 0
        ) {
          fillerSummary = "*No filler contribution.*";
        }
        if (fillers && Array.isArray(fillers.fillersDetail)) {
          const detailsFormatted = formatFillerDetails(fillers.fillersDetail);
          if (detailsFormatted !== "*No filler data submitted.*") {
            fillerValue = detailsFormatted;
          }
        }
        statsEmbed.addFields(separator, {
          name: "**🧑‍🌾 Filler Contribution**",
          value: fillerSummary,
          inline: false,
        });
        if (fillerValue !== "*No filler data submitted.*") {
          statsEmbed.addFields({
            name: "Filler Details",
            value: fillerValue.substring(0, 1024),
            inline: false,
          });
        }

        // *** PERUBAHAN DI SINI: Tampilkan rank dengan fallback N/A (Data Missing) ***
        statsEmbed.addFields(
          separator,
          {
            name: "**🏅 Ranking**",
            value:
              `**DKP Rank (Zone KP):** ${rank.rankDKP}\n` + // Langsung tampilkan nilai dari backend
              `**Score Rank (KvK Score):** ${rank.rankScore}\n` +
              `**Pre-KvK Rank (Pre-KvK KP):** ${rank.rankPreKvk}`,
            inline: true,
          },
          {
            name: "**🔗 Linked Farms**",
            value: formatFarmList(linkedFarms).substring(0, 1024),
            inline: true,
          }
        );
        // *** Akhir Perubahan Ranking ***

        console.log(`[/mystats] Sending final embed for ${governorId}`);
        await interaction.editReply({
          embeds: [statsEmbed],
          content: "",
        });
        console.log(`[/mystats] Final embed sent successfully.`);
      } else {
        console.warn(
          `[/mystats] Reached unexpected state. Status: ${
            result?.status
          }, Details exist: ${!!result?.details}. Response:`,
          JSON.stringify(result, null, 2)
        );
        await interaction.editReply({
          content: `❌ Error retrieving stats: Received an unexpected response structure from the backend. Please check the bot logs.`,
        });
      }
    } catch (error) {
      console.error(
        `[ERROR] Unexpected error in /mystats command (after fetch):`,
        error
      );
      if (error.code === 10062) {
        console.error(
          "[/mystats] Interaction already acknowledged or failed. Cannot send final error message."
        );
      } else {
        try {
          let finalErrorMessage = `❌ An unexpected error occurred: ${
            error.message || "Please check the bot logs."
          }`;
          if (error.message && error.message.endsWith("is not registered.")) {
            finalErrorMessage = `❌ ${error.message} Please go to the <#${registrationChannelId}> channel to register.`;
          } else if (error.message && error.message.includes("is not linked")) {
            finalErrorMessage = `❌ ${error.message}`;
          }
          await interaction.editReply({
            content: finalErrorMessage,
            embeds: [],
            components: [],
          });
        } catch (editError) {
          console.error(
            "[ERROR] Failed to editReply in final catch block:",
            editError.message
          );
        }
      }
    }
  },
};
