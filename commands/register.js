// commands/register.js (Refactored - Added Back Button - English)
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  InteractionType,
  MessageFlags,
} = require("discord.js");
const fetch = require("node-fetch");

// --- Configuration ---
const MESSAGE_AWAIT_TIMEOUT = 300000; // 5 minutes to wait for screenshot/modal
const COLLECTOR_IDLE_TIMEOUT = 360000; // 6 minutes collector timeout

// --- Helper Function ---
/** Sends an ephemeral error message */
async function sendEphemeralError(interaction, message) {
  try {
    if (!interaction || !interaction.reply || !interaction.followUp) return;
    const options = {
      content: `❌ Error: ${message}`,
      flags: [MessageFlags.Ephemeral],
    };
    if (interaction.isRepliable()) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply(options);
      } else {
        await interaction.followUp(options);
      }
    } else {
      console.warn(
        `[WARN] Attempted to send ephemeral error to non-repliable interaction ${interaction.id}`
      );
    }
  } catch (error) {
    if (error.code !== 10062 && error.code !== 40060) {
      // Ignore Unknown Interaction / Already Ack
      console.error(
        `[ERROR] Failed to send ephemeral error "${message}":`,
        error
      );
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("register")
    .setDescription("Starts the interactive account registration process."),

  /**
   * Executes the registration command.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction.
   * @param {string} appsScriptUrl - The Google Apps Script URL.
   */
  async execute(interaction, appsScriptUrl) {
    const userId = interaction.user.id;
    const username = interaction.user.username;
    const channelId = interaction.channel.id;

    console.log(
      `[DEBUG] /register invoked by ${userId} (${username}) in channel ${channelId}`
    );

    // --- Initial Defer Reply ---
    try {
      await interaction.deferReply({ ephemeral: false });
      console.log(`[DEBUG] Interaction ${interaction.id} publicly deferred.`);
    } catch (deferError) {
      console.error(
        `[ERROR] Error deferring public reply for ${interaction.id}:`,
        deferError
      );
      return;
    }

    // --- Local State ---
    let registrationData = {
      discordUserId: userId,
      discordUsername: username,
      attachment: null,
      attachmentUrl: null,
      tipeAkun: null,
      statusMain: null,
      isFiller: null,
      idMainTerhubung: null,
      step: "await_screenshot",
    };

    // --- Request Screenshot ---
    const initialEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("📝 New Account Registration (Step 1)")
      .setDescription(
        `Hello ${username}!\n\nPlease **upload your Governor profile screenshot** in this channel.\n\n*(You have ${
          MESSAGE_AWAIT_TIMEOUT / 60000
        } minutes)*`
      )
      .setTimestamp();
    // No Back button needed here, only Cancel
    const cancelRowInitial = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`register_cancel_${userId}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger)
    );

    let promptMessage;
    try {
      promptMessage = await interaction.editReply({
        embeds: [initialEmbed],
        components: [cancelRowInitial],
        fetchReply: true,
      });
      console.log(
        `[DEBUG] Screenshot prompt sent for interaction ${interaction.id}. Message ID: ${promptMessage.id}`
      );
    } catch (editErr) {
      console.error(
        `[ERROR] Failed to send screenshot prompt for ${interaction.id}:`,
        editErr
      );
      return;
    }

    // --- Wait for Screenshot Message ---
    const messageFilter = (m) =>
      m.author.id === userId &&
      m.channel.id === channelId &&
      m.attachments.size > 0 &&
      m.attachments.first().contentType?.startsWith("image/");
    let collectedMessage;
    try {
      console.log(`[DEBUG] Awaiting screenshot message from user ${userId}...`);
      const collectedMessages = await interaction.channel.awaitMessages({
        filter: messageFilter,
        max: 1,
        time: MESSAGE_AWAIT_TIMEOUT,
        errors: ["time"],
      });
      collectedMessage = collectedMessages.first();
      registrationData.attachment = collectedMessage.attachments.first();
      registrationData.attachmentUrl = registrationData.attachment.url;
      registrationData.step = "select_account_type";
      console.log(
        `[DEBUG] Screenshot received from user ${userId}: ${registrationData.attachmentUrl}`
      );
      await collectedMessage.react("👍").catch(console.error);
    } catch (error) {
      console.log(
        `[WARN] Timed out waiting for screenshot from user ${userId}.`
      );
      await interaction
        .editReply({
          content: `⏰ Timed out waiting for screenshot. Registration cancelled.`,
          embeds: [],
          components: [],
        })
        .catch((e) =>
          console.warn("Failed to edit reply on screenshot timeout:", e.message)
        );
      return;
    }

    // --- Ask Account Type ---
    // Function to display this step (to be called when going back)
    const displayAccountTypeStep = async (i) => {
      registrationData.step = "select_account_type";
      registrationData.tipeAkun = null; // Reset selection
      const typeEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 New Account Registration (Step 2)")
        .setDescription(
          "Screenshot received! 👍\n\nNow, please select the account type you want to register:"
        )
        .setThumbnail(registrationData.attachmentUrl)
        .setTimestamp();
      const accountTypeSelect = new StringSelectMenuBuilder()
        .setCustomId(`register_type_${userId}`)
        .setPlaceholder("Select account type...")
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Main Account")
            .setValue("main"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Farm Account")
            .setValue("farm")
        );
      // Only Cancel button here, no "Back" from the first question after screenshot
      const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`register_cancel_${userId}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Danger)
      );
      const rowTypeSelect = new ActionRowBuilder().addComponents(
        accountTypeSelect
      );

      const interactionToEdit = i || interaction; // Use component interaction 'i' if available, otherwise the original command interaction

      await interactionToEdit.editReply({
        embeds: [typeEmbed],
        components: [rowTypeSelect, cancelRow],
        fetchReply: true, // Important to keep collector attached
      });
      console.log(
        `[DEBUG] Displayed account type step via interaction ${interactionToEdit.id}.`
      );
    };

    // Display the account type step initially
    let currentPromptMessage = await interaction.editReply({
      fetchReply: true,
    }); // Re-fetch the message reference
    await displayAccountTypeStep(interaction); // Use original interaction here
    currentPromptMessage = await interaction.fetchReply(); // Fetch again after edit

    // --- Collector for Subsequent Component Interactions (Buttons/Menus) ---
    const collectorFilter = (i) =>
      i.user.id === userId && i.message.id === currentPromptMessage.id;

    // Create collector on the message reference we have
    const collector = currentPromptMessage.createMessageComponentCollector({
      filter: collectorFilter,
      idle: COLLECTOR_IDLE_TIMEOUT,
    });

    console.log(
      `[DEBUG] Component Collector created for message ${currentPromptMessage.id}, user ${userId}.`
    );

    collector.on("collect", async (i) => {
      console.log(
        `[DEBUG] Collector collected component interaction: ${i.customId} (interaction ID: ${i.id})`
      );

      try {
        let isModalTrigger =
          i.isStringSelectMenu() && i.customId === `register_filler_${userId}`;

        // Defer ONLY if NOT a modal trigger
        if (!isModalTrigger && !i.deferred && !i.replied) {
          await i.deferUpdate();
          console.log(
            `[DEBUG] Component Interaction ${i.customId} (${i.id}) deferred.`
          );
        } else {
          console.log(
            `[DEBUG] Skipping defer for ${i.customId} (isModalTrigger: ${isModalTrigger}, deferred: ${i.deferred}, replied: ${i.replied})`
          );
        }

        // --- Cancel Button ---
        if (i.customId === `register_cancel_${userId}`) {
          console.log(
            `[DEBUG] Registration cancelled by user ${userId} via button.`
          );
          await i.editReply({
            content: "❌ Registration cancelled.",
            embeds: [],
            components: [],
          });
          collector.stop("cancelled");
          return;
        }

        // --- Back Button Handler (to Account Type) ---
        if (i.customId === `register_back_to_type_${userId}`) {
          console.log(`[DEBUG] User ${userId} clicked Back to Account Type.`);
          await displayAccountTypeStep(i); // Call the function to display the step
          return; // Let collector continue
        }

        // --- Back Button Handler (to Details Step) ---
        if (i.customId === `register_back_to_details_${userId}`) {
          console.log(`[DEBUG] User ${userId} clicked Back from Confirmation.`);
          // Determine the previous step based on account type
          if (registrationData.tipeAkun === "main") {
            // Go back to main status selection
            registrationData.step = "select_main_status";
            registrationData.statusMain = null; // Reset status
            await displayMainStatusStep(i, registrationData); // Call function to display this step
          } else {
            // Go back to filler status selection
            registrationData.step = "select_filler_status";
            registrationData.isFiller = null; // Reset filler status
            registrationData.idMainTerhubung = null; // Reset linked ID
            await displayFillerStatusStep(i, registrationData); // Call function to display this step
          }
          return; // Let collector continue
        }

        // --- Account Type Selection ---
        if (
          i.customId === `register_type_${userId}` &&
          registrationData.step === "select_account_type"
        ) {
          registrationData.tipeAkun = i.values[0];
          console.log(
            `[DEBUG] User ${userId} selected account type: ${registrationData.tipeAkun}`
          );

          if (registrationData.tipeAkun === "main") {
            await displayMainStatusStep(i, registrationData);
          } else {
            // Farm
            await displayFillerStatusStep(i, registrationData);
          }
        }

        // --- Main Status Selection ---
        else if (
          i.customId === `register_status_${userId}` &&
          registrationData.step === "select_main_status"
        ) {
          registrationData.statusMain = i.values[0];
          registrationData.step = "confirm_submission";
          console.log(
            `[DEBUG] User ${userId} selected main status: ${registrationData.statusMain}`
          );
          await showConfirmation(i, registrationData);
        }

        // --- Farm Filler Status Selection ---
        else if (
          i.customId === `register_filler_${userId}` &&
          registrationData.step === "select_filler_status"
        ) {
          // Interaction 'i' (SelectMenu) was NOT deferred
          registrationData.isFiller = i.values[0] === "true";
          registrationData.step = "await_modal_farm";
          console.log(
            `[DEBUG] User ${userId} selected filler status: ${registrationData.isFiller}`
          );

          const modal = new ModalBuilder()
            .setCustomId(`register_farm_modal_${userId}`)
            .setTitle("Enter Main Account ID");
          const mainIdInput = new TextInputBuilder()
            .setCustomId("farm_linked_main_id")
            .setLabel("Linked Main Account Governor ID")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Example: 12345678")
            .setRequired(true)
            .setMinLength(7)
            .setMaxLength(10);
          modal.addComponents(
            new ActionRowBuilder().addComponents(mainIdInput)
          );

          await i.showModal(modal);
          console.log(
            `[DEBUG] Modal shown for farm ID input (interaction: ${i.id}). Awaiting submission...`
          );

          // --- Use awaitModalSubmit ---
          try {
            const modalSubmitInteraction = await i.awaitModalSubmit({
              filter: (modalInt) =>
                modalInt.customId === `register_farm_modal_${userId}` &&
                modalInt.user.id === userId,
              time: MESSAGE_AWAIT_TIMEOUT,
            });
            console.log(
              `[DEBUG] Modal submitted (interaction ID: ${modalSubmitInteraction.id})`
            );

            // Defer the modal submit interaction BEFORE processing
            await modalSubmitInteraction.deferUpdate();
            console.log(
              `[DEBUG] Modal Submit Interaction ${modalSubmitInteraction.id} deferred.`
            );

            const linkedId = modalSubmitInteraction.fields.getTextInputValue(
              "farm_linked_main_id"
            );
            if (!/^\d+$/.test(linkedId)) {
              await sendEphemeralError(
                modalSubmitInteraction,
                "Invalid Governor ID format. Please enter numbers only."
              );
              collector.stop("invalid_modal_input");
              await interaction
                .editReply({
                  content: "❌ Invalid ID format. Registration cancelled.",
                  embeds: [],
                  components: [],
                })
                .catch(() => {});
              return;
            }
            registrationData.idMainTerhubung = linkedId;
            registrationData.step = "confirm_submission";
            console.log(
              `[DEBUG] User ${userId} submitted main ID via modal: ${registrationData.idMainTerhubung}`
            );

            await showConfirmation(modalSubmitInteraction, registrationData);
          } catch (modalError) {
            console.log(
              `[WARN] Modal submission timed out or failed for interaction ${i.id}:`,
              modalError instanceof Error ? modalError.message : modalError
            );
            collector.stop("modal_timeout");
            await interaction
              .editReply({
                content: `⏰ Modal submission timed out. Registration cancelled.`,
                embeds: [],
                components: [],
              })
              .catch((e) =>
                console.warn(
                  "Failed to edit reply on modal timeout:",
                  e.message
                )
              );
          }
        }

        // --- Confirmation Submit Button ---
        else if (
          i.customId === `register_confirm_${userId}` &&
          registrationData.step === "confirm_submission"
        ) {
          console.log(`[DEBUG] User ${userId} confirmed submission.`);
          await processRegistration(i, registrationData, appsScriptUrl);
          collector.stop("processed");
        }

        // --- Handle unexpected interactions or wrong step ---
        else {
          console.warn(
            `[WARN] Collector received unexpected interaction: ${i.customId} or wrong step: ${registrationData.step}`
          );
          await sendEphemeralError(
            i,
            "Unexpected action or out of sequence. Please follow the prompts."
          );
        }
      } catch (collectError) {
        console.error(
          `[ERROR] Error handling collected interaction ${i?.customId} (${i?.id}):`,
          collectError
        );
        if (collectError.code !== 10062) {
          await sendEphemeralError(
            i || interaction,
            "An error occurred while processing your action."
          );
        }
      }
    }); // End collector.on('collect')

    // --- Collector End Logic ---
    collector.on("end", (collected, reason) => {
      console.log(
        `[DEBUG] Registration collector ended for message ${currentPromptMessage?.id}. Reason: ${reason}. Items collected: ${collected.size}`
      );
      const handledEndReasons = [
        "processed",
        "cancelled",
        "invalid_modal_input",
        "modal_timeout",
      ];
      if (!handledEndReasons.includes(reason) && currentPromptMessage) {
        console.log(
          `[DEBUG] Collector ended with reason '${reason}', attempting to clear components.`
        );
        interaction.editReply({ components: [] }).catch((e) => {
          if (e.code !== 10008 && e.code !== 10062) {
            console.warn(
              `[WARN] Failed to clear components on collector end (reason: ${reason}):`,
              e.code
            );
          }
        });
      }
    }); // End collector.on('end')
  }, // End execute function
}; // End module.exports

/** Displays the Main account status selection step */
async function displayMainStatusStep(i, data) {
  data.step = "select_main_status";
  const embedDesc =
    "Account Type: **Main**.\n\nNow, please select your Main account status:";
  const statusSelect = new StringSelectMenuBuilder()
    .setCustomId(`register_status_${data.discordUserId}`)
    .setPlaceholder("Select status...")
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel("DKP 2921 Old Player")
        .setValue("Old Player"),
      new StringSelectMenuOptionBuilder()
        .setLabel("DKP Migrants")
        .setValue("Migrants")
    );
  const selectRow = new ActionRowBuilder().addComponents(statusSelect);
  // Add Back button to go to Account Type selection
  const backButton = new ButtonBuilder()
    .setCustomId(`register_back_to_type_${data.discordUserId}`)
    .setLabel("Back")
    .setStyle(ButtonStyle.Secondary);
  const cancelButton = new ButtonBuilder()
    .setCustomId(`register_cancel_${data.discordUserId}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger);
  const buttonRow = new ActionRowBuilder().addComponents(
    backButton,
    cancelButton
  );

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("📝 New Account Registration (Step 3)")
    .setDescription(embedDesc)
    .setThumbnail(data.attachmentUrl)
    .setTimestamp();

  await i.editReply({ embeds: [embed], components: [selectRow, buttonRow] });
  console.log(`[DEBUG] Displayed main status step via interaction ${i.id}.`);
}

/** Displays the Farm filler status selection step */
async function displayFillerStatusStep(i, data) {
  data.step = "select_filler_status";
  const embedDesc =
    "Account Type: **Farm**.\n\nIs this Farm account a Filler account?";
  const fillerSelect = new StringSelectMenuBuilder()
    .setCustomId(`register_filler_${data.discordUserId}`)
    .setPlaceholder("Is this a filler account?")
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel("Yes").setValue("true"),
      new StringSelectMenuOptionBuilder().setLabel("No").setValue("false")
    );
  const selectRow = new ActionRowBuilder().addComponents(fillerSelect);
  // Add Back button to go to Account Type selection
  const backButton = new ButtonBuilder()
    .setCustomId(`register_back_to_type_${data.discordUserId}`)
    .setLabel("Back")
    .setStyle(ButtonStyle.Secondary);
  const cancelButton = new ButtonBuilder()
    .setCustomId(`register_cancel_${data.discordUserId}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger);
  const buttonRow = new ActionRowBuilder().addComponents(
    backButton,
    cancelButton
  );

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle("📝 New Account Registration (Step 3)")
    .setDescription(embedDesc)
    .setThumbnail(data.attachmentUrl)
    .setTimestamp();

  await i.editReply({ embeds: [embed], components: [selectRow, buttonRow] });
  console.log(`[DEBUG] Displayed filler status step via interaction ${i.id}.`);
}

/** Displays the confirmation screen */
async function showConfirmation(i, data) {
  console.log(
    `[DEBUG] Showing confirmation screen via interaction ${
      i.id
    }. Data: ${JSON.stringify(data)}`
  );
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xffff00) // Yellow
    .setTitle("🔍 Confirm Registration Details")
    .setDescription("Please review the details below before submitting:")
    .setThumbnail(data.attachmentUrl)
    .addFields({
      name: "Account Type",
      value: data.tipeAkun === "main" ? "Main" : "Farm",
      inline: true,
    });

  if (data.tipeAkun === "main") {
    confirmEmbed.addFields({
      name: "Status",
      value: data.statusMain || "N/A",
      inline: true,
    });
  } else {
    // Farm
    confirmEmbed.addFields(
      {
        name: "Is Filler?",
        value: data.isFiller ? "Yes" : "No",
        inline: true,
      },
      {
        name: "Linked Main ID",
        value: data.idMainTerhubung || "N/A",
        inline: true,
      }
    );
  }
  confirmEmbed.addFields({
    name: "Screenshot",
    value: `[View Attachment](${data.attachmentUrl})`,
  });
  confirmEmbed.setTimestamp();
  confirmEmbed.setFooter({ text: `Requested by: ${data.discordUsername}` });

  const submitButton = new ButtonBuilder()
    .setCustomId(`register_confirm_${data.discordUserId}`)
    .setLabel("Submit Registration")
    .setStyle(ButtonStyle.Success);
  // --- Add Back Button Here ---
  const backButton = new ButtonBuilder()
    .setCustomId(`register_back_to_details_${data.discordUserId}`) // New ID for back from confirm
    .setLabel("Back")
    .setStyle(ButtonStyle.Secondary);
  const cancelButton = new ButtonBuilder()
    .setCustomId(`register_cancel_${data.discordUserId}`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger);

  // Add Back button to the row
  const confirmRow = new ActionRowBuilder().addComponents(
    submitButton,
    backButton,
    cancelButton
  );

  try {
    if (i.isRepliable()) {
      await i.editReply({
        content: null,
        embeds: [confirmEmbed],
        components: [confirmRow], // Use the row with the Back button
      });
      console.log(
        `[DEBUG] Confirmation message shown/updated via interaction ${i.id}.`
      );
    } else {
      console.warn(
        `[WARN] Attempted to edit non-repliable interaction ${i.id} for confirmation.`
      );
    }
  } catch (editError) {
    console.error(
      `[ERROR] Failed to show/update confirmation message via interaction ${i.id}:`,
      editError
    );
    await sendEphemeralError(i, "Failed to display confirmation screen.");
  }
}

/** Processes the data submission to Google Apps Script */
async function processRegistration(i, data, appsScriptUrl) {
  // ... (fungsi processRegistration sama seperti sebelumnya) ...
  try {
    if (i.isRepliable()) {
      await i.editReply({
        content: "⏳ Processing your registration... Please wait.",
        embeds: [],
        components: [],
      });
    } else {
      console.warn(
        `[WARN] Could not edit message to processing for user ${data.discordUserId} via interaction ${i.id} (not repliable).`
      );
    }
  } catch (e) {
    console.warn(
      `[WARN] Could not edit message to processing for user ${data.discordUserId}:`,
      e.message
    );
  }

  let result = {
    status: "error",
    message: "Failed to contact the registration server.",
  };
  try {
    const imageResponse = await fetch(data.attachmentUrl);
    if (!imageResponse.ok)
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    const imageBuffer = await imageResponse.buffer();
    const imageBase64 = imageBuffer.toString("base64");
    console.log(
      `[DEBUG] Image converted to base64 for submission. User: ${data.discordUserId}`
    );

    const payloadData = { ...data };
    delete payloadData.attachment;
    delete payloadData.step;
    payloadData.imageBase64 = imageBase64;

    Object.keys(payloadData).forEach(
      (key) => payloadData[key] == null && delete payloadData[key]
    );

    const gasPayload = { command: "register", data: payloadData };

    console.log(
      `[DEBUG] Sending payload to GAS for user ${data.discordUserId}. Base64 size: ${imageBase64.length}`
    );
    const gasResponse = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gasPayload),
    });

    if (!gasResponse.ok) {
      const errorText = await gasResponse.text();
      throw new Error(`GAS Error (${gasResponse.status}): ${errorText}`);
    }
    result = await gasResponse.json();
    console.log(
      `[DEBUG] GAS Response for user ${data.discordUserId}: ${JSON.stringify(
        result
      )}`
    );
  } catch (processError) {
    console.error(
      `[ERROR] Error processing registration for user ${data.discordUserId}:`,
      processError
    );
    result = {
      status: "error",
      message: `An internal error occurred: ${processError.message}`,
    };
  }

  // --- Display Final Result ---
  try {
    const finalEmbed = new EmbedBuilder();
    if (result.status === "success") {
      finalEmbed.setColor(0x00ff00).setTitle("✅ Registration Successful!");
      finalEmbed
        .setDescription(
          result.message || "Your account has been successfully registered."
        )
        .setThumbnail(data.attachmentUrl);
      if (result.details) {
        if (result.details.govId)
          finalEmbed.addFields({
            name: "Governor ID",
            value: result.details.govId.toString(),
            inline: true,
          });
        if (result.details.type)
          finalEmbed.addFields({
            name: "Account Type",
            value: result.details.type,
            inline: true,
          });
        if (result.details.status)
          finalEmbed.addFields({
            name: "Status",
            value: result.details.status,
            inline: true,
          });
        if (result.details.isFiller !== undefined)
          finalEmbed.addFields({
            name: "Is Filler?",
            value: result.details.isFiller ? "Yes" : "No",
            inline: true,
          });
        if (result.details.linkedMainId)
          finalEmbed.addFields({
            name: "Linked Main ID",
            value: result.details.linkedMainId.toString(),
            inline: true,
          });
        if (result.details.targetKP)
          finalEmbed.addFields({
            name: "Target KP",
            value: result.details.targetKP.toLocaleString(),
            inline: true,
          });
        if (result.details.targetDeath)
          finalEmbed.addFields({
            name: "Target Deaths",
            value: result.details.targetDeath.toLocaleString(),
            inline: true,
          });
      }
      finalEmbed
        .setTimestamp()
        .setFooter({ text: `User: ${data.discordUsername}` });

      if (i.isRepliable()) {
        await i.editReply({
          content: null,
          embeds: [finalEmbed],
          components: [],
        });
      } else {
        console.warn(
          `[WARN] Cannot edit final success reply for interaction ${i.id} (not repliable).`
        );
      }
    } else {
      finalEmbed.setColor(0xff0000).setTitle("❌ Registration Failed");
      finalEmbed
        .setDescription(result.message || "An unknown error occurred.")
        .setTimestamp();
      if (i.isRepliable()) {
        await i.editReply({
          content: null,
          embeds: [finalEmbed],
          components: [],
        });
      } else {
        console.warn(
          `[WARN] Cannot edit final fail reply for interaction ${i.id} (not repliable).`
        );
      }
    }
  } catch (finalEditError) {
    console.error(
      `[ERROR] Failed to edit final reply for user ${data.discordUserId}:`,
      finalEditError
    );
    await i
      .followUp({
        content: `Registration Result: ${
          result.message || "Finished with unknown status."
        }`,
        ephemeral: true,
      })
      .catch(() => {});
  }
}
