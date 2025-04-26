// Import necessary modules from discord.js and node-fetch
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder, // Although not used directly here, might be useful later
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
  InteractionType,
} = require("discord.js");
const fetch = require("node-fetch"); // Ensure node-fetch v2 is installed (npm install node-fetch@2)

// --- CHANNEL LOCK & TIMEOUT ---
// Set to track channels with active registrations
const activeRegistrationChannels = new Set();
// Set global timeout (5 minutes in milliseconds)
const MESSAGE_AWAIT_TIMEOUT = 300000; // 300,000 ms = 5 minutes

/**
 * Displays the registration data confirmation embed to the user.
 * (Matches original structure, translated)
 * @param {import('discord.js').ChatInputCommandInteraction} originalInteraction - The original command interaction to edit.
 * @param {object} data - The object containing collected registration data.
 * @param {boolean} [farmNeedsModalId=false] - Original flag, kept for consistency.
 */
async function showConfirmationPublic(
  originalInteraction,
  data,
  farmNeedsModalId = false
) {
  // Create the confirmation embed
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xffff00) // Yellow color
    .setTitle("🔍 Confirm Registration Details") // Original title
    .addFields({
      name: "Account Type", // Original field name
      value: data.tipeAkun
        ? data.tipeAkun === "main"
          ? "Main"
          : "Farm"
        : "N/A", // Translate value
      inline: true,
    })
    .setTimestamp();

  // Add specific fields based on account type (matches original structure)
  if (data.tipeAkun === "main") {
    confirmEmbed.addFields({
      name: "Status", // Original field name
      value: data.statusMain || "N/A",
      inline: true,
    });
  } else {
    // If account type is 'farm'
    confirmEmbed.addFields({
      name: "Is Filler?", // Original field name
      value: data.isFiller === null ? "N/A" : data.isFiller ? "Yes" : "No", // Handle null case
      inline: true,
    });
    // Display the linked Main ID (matches original logic)
    if (farmNeedsModalId) {
      // This flag might not be relevant anymore if modal always follows filler selection
      confirmEmbed.addFields({
        name: "Linked Main ID",
        value: "(Will be collected via modal)", // Original text
        inline: true,
      });
    } else {
      confirmEmbed.addFields({
        name: "Linked Main ID", // Original field name
        value: data.idMainTerhubung || "N/A",
        inline: true,
      });
    }
  }

  // Add screenshot information if available (matches original structure)
  if (data.attachment) {
    confirmEmbed.addFields({
      name: "Screenshot", // Original field name
      value: `[View Attachment](${data.attachment.url})`, // Original text
    });
    confirmEmbed.setThumbnail(data.attachment.url);
  } else {
    confirmEmbed.addFields({
      name: "Screenshot",
      value: "Not provided yet.", // Original text
    });
  }

  // Create confirmation buttons (matches original structure)
  const submitButton = new ButtonBuilder()
    .setCustomId("register_confirm_submit")
    .setLabel("Submit Registration") // Original label
    .setStyle(ButtonStyle.Success);
  const backButton = new ButtonBuilder()
    .setCustomId("register_confirm_back")
    .setLabel("Start Over") // Original label
    .setStyle(ButtonStyle.Secondary);
  const cancelButton = new ButtonBuilder()
    .setCustomId("register_cancel")
    .setLabel("Cancel") // Original label
    .setStyle(ButtonStyle.Danger);

  // Create an action row for the buttons
  const confirmRow = new ActionRowBuilder().addComponents(
    submitButton,
    backButton,
    cancelButton
  );

  // Send or edit the message with the confirmation embed and buttons
  try {
    // Use editReply on the original interaction
    if (!originalInteraction.editable) {
      console.warn(
        `[WARN] ${new Date().toISOString()} - Original interaction is no longer editable for confirmation.`
      );
      return; // Cannot edit the main message
    }
    await originalInteraction.editReply({
      content: "Please review your registration details below and confirm:", // Original text
      embeds: [confirmEmbed],
      components: [confirmRow], // Add the buttons
    });
    console.log(
      `[DEBUG] ${new Date().toISOString()} - Public confirmation message shown in channel ${
        originalInteraction.channel.id
      }.`
    );
  } catch (editError) {
    console.error(
      `[ERROR] ${new Date().toISOString()} - Failed to show public confirmation in channel ${
        originalInteraction.channel.id
      }:`,
      editError
    );
    // Simple text error handling, matching original style but removing components
    if (originalInteraction.editable) {
      await originalInteraction
        .editReply({
          content: "Error displaying confirmation. Please try again.", // Original error text
          embeds: [],
          components: [], // Remove buttons on error
        })
        .catch((e) =>
          console.error("Error sending confirmation error message:", e)
        );
    }
  }
}

// Export the command module
module.exports = {
  // Slash Command definition (matches original structure)
  data: new SlashCommandBuilder().setName("register").setDescription(
    "Press Enter or Send to start the interactive registration." // Original description
  ),

  /**
   * The main function executed when the /register command is run.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction - The command interaction.
   * @param {string} appsScriptUrl - Your Google Apps Script Web App URL.
   */
  async execute(interaction, appsScriptUrl) {
    // 'interaction' here is the original ChatInputCommandInteraction
    const channelId = interaction.channel.id;
    const userId = interaction.user.id;
    const username = interaction.user.username;

    console.log(
      `[DEBUG] ${new Date().toISOString()} - /register invoked by ${userId} (${username}) in channel ${channelId}`
    );

    // --- CHANNEL LOCK CHECK ---
    if (activeRegistrationChannels.has(channelId)) {
      await interaction.reply({
        content:
          "⚠️ Sorry, another registration process is already active in this channel. Please wait until it's completed or cancelled.", // Lock message in English
        ephemeral: true,
      });
      console.log(
        `[WARN] ${new Date().toISOString()} - /register blocked in channel ${channelId} due to active registration.`
      );
      return; // Stop execution if channel is locked
    }
    // --- END CHANNEL LOCK CHECK ---

    // If not locked, add the channel to the Set (lock the channel)
    activeRegistrationChannels.add(channelId);
    console.log(
      `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} locked for registration.`
    );

    // Use try...finally to ensure the lock is always released
    try {
      // --- START MAIN LOGIC ---

      // Defer reply (PUBLIC) to allow time for subsequent processing
      try {
        await interaction.deferReply({ ephemeral: false }); // Public
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Interaction publicly deferred in channel ${channelId}.`
        );
      } catch (deferError) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Error deferring public reply in channel ${channelId}:`,
          deferError
        );
        // Simple text error reply if possible
        if (!interaction.replied && !interaction.deferred) {
          await interaction
            .reply({
              content:
                "❌ Failed to start the registration process due to an internal error.", // Simple error text
              ephemeral: true,
            })
            .catch((e) =>
              console.error("Error sending initial defer error reply:", e)
            );
        }
        return; // Stop execution (finally will still run)
      }

      // --- STEP 1: ACCOUNT TYPE SELECTION (Matches original structure) ---
      const initialEmbed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle("📝 New Account Registration") // Original title
        .setDescription(
          "Please select the type of account you want to register:" // Original description
        )
        .setTimestamp();

      const accountTypeSelect = new StringSelectMenuBuilder()
        .setCustomId("register_select_account_type")
        .setPlaceholder("Select account type...") // Original placeholder
        .addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel("Main Account") // Original label
            .setDescription("Register your primary account.") // Original description
            .setValue("main"),
          new StringSelectMenuOptionBuilder()
            .setLabel("Farm Account") // Original label
            .setDescription("Register a farm account.") // Original description
            .setValue("farm")
        );

      const cancelButtonInitial = new ButtonBuilder()
        .setCustomId("register_cancel")
        .setLabel("Cancel") // Original label
        .setStyle(ButtonStyle.Danger);

      const selectRow = new ActionRowBuilder().addComponents(accountTypeSelect);
      const buttonRowInitial = new ActionRowBuilder().addComponents(
        cancelButtonInitial
      );

      // Send the initial message
      let initialReply;
      try {
        initialReply = await interaction.editReply({
          embeds: [initialEmbed],
          components: [selectRow, buttonRowInitial], // Show menu and cancel button
          fetchReply: true,
        });
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Initial public registration message sent in channel ${channelId}.`
        );
      } catch (editErr) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Failed to send initial registration message in channel ${channelId}:`,
          editErr
        );
        if (interaction.editable) {
          await interaction
            .editReply({
              content:
                "An error occurred setting up registration. Please try again.", // Original error text
              embeds: [],
              components: [],
            })
            .catch((e) =>
              console.error("Error sending initial setup error message:", e)
            );
        }
        return; // Stop execution (finally will still run)
      }

      // Interaction filter: only from the user who initiated the command
      const filter = (i) => i.user.id === userId;

      // Create a collector for message components (menu, buttons)
      const collector = initialReply.createMessageComponentCollector({
        filter,
        time: MESSAGE_AWAIT_TIMEOUT, // Use the global timeout
      });

      // Object to store temporary registration data (matches original structure)
      let registrationData = {
        discordUserId: userId,
        discordUsername: username,
        tipeAkun: null,
        statusMain: null,
        isFiller: null,
        idMainTerhubung: null,
        imageBase64: null,
        attachment: null,
      };

      // --- COLLECTOR LOGIC ---
      collector.on("collect", async (i) => {
        // 'i' is the component/modal interaction
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Interaction collected: ${
            i.customId
          } from user ${i.user.id} in channel ${channelId}`
        );

        try {
          // --- MODIFIED: Defer Component Interaction First ---
          // Defer update for component/modal interactions ('i') first to acknowledge
          if (!i.deferred) {
            await i.deferUpdate();
            console.log(`[DEBUG] Interaction ${i.customId} deferred.`);
          }
          // --- END MODIFICATION ---

          // --- Handle Modal Submit (Farm ID) (Matches original structure) ---
          if (
            i.type === InteractionType.ModalSubmit &&
            i.customId === "register_farm_modal"
          ) {
            // Note: deferUpdate was already called above
            registrationData.idMainTerhubung = i.fields.getTextInputValue(
              "farm_linked_main_id"
            );
            console.log(
              `[DEBUG] ${new Date().toISOString()} - Linked Main ID received from modal: ${
                registrationData.idMainTerhubung
              } in channel ${channelId}`
            );

            // Request screenshot upload AFTER modal submission
            try {
              // Edit the original interaction reply
              await interaction.editReply({
                content: `Linked Main ID set to **${
                  registrationData.idMainTerhubung
                }**. Now, please upload the **FARM** account's profile screenshot. (You have ${
                  MESSAGE_AWAIT_TIMEOUT / 60000
                } minutes)`, // Text + timeout info
                embeds: [],
                components: [], // Remove previous components
              });
            } catch (editErr) {
              console.error(
                `[ERROR] ${new Date().toISOString()} - Failed to edit reply before awaiting farm screenshot in channel ${channelId}:`,
                editErr
              );
              if (interaction.editable) {
                await interaction
                  .editReply({
                    content:
                      "An error occurred preparing the next step. Please try again.",
                    embeds: [],
                    components: [],
                  })
                  .catch((e) => console.error(e));
              }
              collector.stop("error_editing_reply"); // Stop collector if edit fails
              return; // Exit collect handler
            }

            // Wait for a message with an image attachment from the user
            const messageFilter = (m) =>
              m.author.id === userId && m.attachments.size > 0;
            try {
              const collectedMessages = await interaction.channel.awaitMessages(
                {
                  filter: messageFilter,
                  max: 1,
                  time: MESSAGE_AWAIT_TIMEOUT,
                  errors: ["time"],
                }
              );

              const userMessage = collectedMessages.first();
              const attachment = userMessage.attachments.first();

              // Validate that the attachment is an image
              if (attachment && attachment.contentType?.startsWith("image/")) {
                registrationData.attachment = attachment;
                console.log(
                  `[DEBUG] ${new Date().toISOString()} - Farm screenshot received after modal: ${
                    attachment.url
                  } in channel ${channelId}`
                );
                // Show the final confirmation step
                await showConfirmationPublic(interaction, registrationData); // Use original interaction
              } else {
                // If the attachment is not an image
                await interaction.editReply({
                  content:
                    "Invalid file type. Please upload an image. Registration cancelled.", // Original error text
                  embeds: [],
                  components: [], // Remove buttons
                });
                collector.stop("invalid_file"); // Stop the collector
              }
            } catch (msgError) {
              // Handle timeout waiting for the screenshot
              console.log(
                `[WARN] ${new Date().toISOString()} - Timed out waiting for farm screenshot after modal in channel ${channelId}.`
              );
              await interaction.editReply({
                content: `No valid screenshot uploaded within ${
                  MESSAGE_AWAIT_TIMEOUT / 60000
                } minutes. Registration cancelled. Click /register to try again.`, // Timeout message + instruction
                embeds: [],
                components: [], // Remove buttons
              });
              collector.stop("timeout"); // Stop the collector
            }
            return; // End handling for this modal submit
          } // End of if (ModalSubmit)

          // Defer update was handled at the beginning of the try block

          // --- Handle Cancel Button (Matches original structure) ---
          if (i.customId === "register_cancel") {
            console.log(
              `[DEBUG] ${new Date().toISOString()} - Registration cancelled by user ${userId} in channel ${channelId}.`
            );
            await interaction.editReply({
              // Edit original interaction
              content: "Registration cancelled.", // Original text
              embeds: [],
              components: [], // Remove all components
            });
            collector.stop("cancelled"); // Stop the collector
            return;
          }

          // --- Handle Back Button (Matches original structure) ---
          if (
            i.customId === "register_confirm_back" ||
            i.customId === "register_back_to_type"
          ) {
            console.log(
              `[DEBUG] ${new Date().toISOString()} - User ${userId} clicked Back in channel ${channelId}. Resetting to start.`
            );
            // Reset registration data
            registrationData = {
              discordUserId: userId,
              discordUsername: username,
              tipeAkun: null,
              statusMain: null,
              isFiller: null,
              idMainTerhubung: null,
              imageBase64: null,
              attachment: null,
            };
            // Show the initial account type selection message again
            await interaction.editReply({
              // Edit original interaction
              content: null,
              embeds: [initialEmbed],
              components: [selectRow, buttonRowInitial], // Show initial components
            });
            return; // Let collector continue
          }

          // --- Handle Account Type Selection (Matches original structure) ---
          if (i.customId === "register_select_account_type") {
            registrationData.tipeAkun = i.values[0];
            console.log(
              `[DEBUG] ${new Date().toISOString()} - Account type selected: ${
                registrationData.tipeAkun
              } by user ${userId} in channel ${channelId}`
            );

            // Prepare Back and Cancel buttons
            const backButtonComp = new ButtonBuilder()
              .setCustomId("register_back_to_type")
              .setLabel("Back") // Original label
              .setStyle(ButtonStyle.Secondary);
            const cancelButtonComp = new ButtonBuilder()
              .setCustomId("register_cancel")
              .setLabel("Cancel") // Original label
              .setStyle(ButtonStyle.Danger);
            const buttonRowType = new ActionRowBuilder().addComponents(
              backButtonComp,
              cancelButtonComp
            );

            let nextContent = "";
            let nextComponents = [];

            if (registrationData.tipeAkun === "main") {
              // --- STEP 2a: MAIN ACCOUNT STATUS SELECTION (Matches original structure) ---
              const statusSelect = new StringSelectMenuBuilder()
                .setCustomId("register_select_main_status")
                .setPlaceholder("Select main account status...") // Original placeholder
                .addOptions(
                  new StringSelectMenuOptionBuilder()
                    .setLabel("DKP 2921 Old Player") // Original label
                    .setValue("Old Player"),
                  new StringSelectMenuOptionBuilder()
                    .setLabel("DKP Migrants") // Original label
                    .setValue("Migrants")
                );
              const statusRow = new ActionRowBuilder().addComponents(
                statusSelect
              );
              nextContent = `You selected: **Main Account**. Please select your status:`; // Original text
              nextComponents = [statusRow, buttonRowType]; // Show status menu + back/cancel buttons
            } else if (registrationData.tipeAkun === "farm") {
              // --- STEP 2b: FARM FILLER SELECTION (Using Dropdown like original) ---
              const fillerSelect = new StringSelectMenuBuilder() // Use Select Menu
                .setCustomId("register_select_farm_filler") // New Custom ID for the menu
                .setPlaceholder("Is this account a Filler account?") // Placeholder
                .addOptions(
                  new StringSelectMenuOptionBuilder()
                    .setLabel("Yes, it IS a Filler") // Option Label
                    .setValue("yes"), // Simple value
                  new StringSelectMenuOptionBuilder()
                    .setLabel("No, it is NOT a Filler") // Option Label
                    .setValue("no") // Simple value
                );
              const fillerRow = new ActionRowBuilder().addComponents(
                fillerSelect
              ); // Row for the select menu
              nextContent = `You selected: **Farm Account**. Is this account a Filler account?`; // Original text
              nextComponents = [fillerRow, buttonRowType]; // Display select menu + back/cancel buttons
            }

            // Update the message with the next step
            await interaction.editReply({
              // Edit original interaction
              content: nextContent,
              embeds: [],
              components: nextComponents,
            });
            console.log(
              `[DEBUG] Original interaction edited for ${i.customId}.`
            ); // Log edit success
          }
          // --- Handle Main Status Selection (Matches original structure) ---
          else if (i.customId === "register_select_main_status") {
            registrationData.statusMain = i.values[0];
            console.log(
              `[DEBUG] ${new Date().toISOString()} - Main status selected: ${
                registrationData.statusMain
              } by user ${userId} in channel ${channelId}`
            );

            // Request screenshot upload
            try {
              await interaction.editReply({
                // Edit original interaction
                content: `Status selected: **${
                  registrationData.statusMain
                }**. Please upload a screenshot of your Governor Profile now. (You have ${
                  MESSAGE_AWAIT_TIMEOUT / 60000
                } minutes)`, // Text + timeout info
                embeds: [],
                components: [], // Remove previous components
              });
            } catch (editErr) {
              console.error(
                `[ERROR] ${new Date().toISOString()} - Failed to edit reply before awaiting main screenshot in channel ${channelId}:`,
                editErr
              );
              if (interaction.editable) {
                await interaction
                  .editReply({
                    content:
                      "An error occurred preparing the next step. Please try again.",
                    embeds: [],
                    components: [],
                  })
                  .catch((e) => console.error(e));
              }
              collector.stop("error_editing_reply"); // Stop collector if edit fails
              return; // Exit collect handler
            }

            // Wait for message with image attachment
            const messageFilter = (m) =>
              m.author.id === userId && m.attachments.size > 0;
            try {
              const collectedMessages = await interaction.channel.awaitMessages(
                {
                  filter: messageFilter,
                  max: 1,
                  time: MESSAGE_AWAIT_TIMEOUT,
                  errors: ["time"],
                }
              );
              const userMessage = collectedMessages.first();
              const attachment = userMessage.attachments.first();

              if (attachment && attachment.contentType?.startsWith("image/")) {
                registrationData.attachment = attachment;
                console.log(
                  `[DEBUG] ${new Date().toISOString()} - Main screenshot received: ${
                    attachment.url
                  } in channel ${channelId}`
                );
                // Show confirmation
                await showConfirmationPublic(interaction, registrationData); // Use original interaction
              } else {
                await interaction.editReply({
                  content:
                    "Invalid file type. Please upload an image. Registration cancelled.", // Original error text
                  embeds: [],
                  components: [], // Remove buttons
                });
                collector.stop("invalid_file");
              }
            } catch (msgError) {
              console.log(
                `[WARN] ${new Date().toISOString()} - Timed out waiting for main screenshot in channel ${channelId}.`
              );
              await interaction.editReply({
                content: `No valid screenshot uploaded within ${
                  MESSAGE_AWAIT_TIMEOUT / 60000
                } minutes. Registration cancelled. Click /register to try again.`, // Timeout message + instruction
                embeds: [],
                components: [], // Remove buttons
              });
              collector.stop("timeout");
            }
          }
          // --- Handle Farm Filler Selection (Using Dropdown) ---
          else if (i.customId === "register_select_farm_filler") {
            // Check for the new select menu ID
            const selectedValue = i.values[0]; // Get the selected value ("yes" or "no")
            registrationData.isFiller = selectedValue === "yes"; // Set boolean based on value
            console.log(
              `[DEBUG] ${new Date().toISOString()} - Filler status selected: ${
                registrationData.isFiller
              } by user ${userId} in channel ${channelId}`
            );

            // Show the modal to ask for the Linked Main ID
            const modal = new ModalBuilder()
              .setCustomId("register_farm_modal")
              .setTitle("Farm Account Details"); // Original title

            const mainIdInput = new TextInputBuilder()
              .setCustomId("farm_linked_main_id")
              .setLabel("Enter the Governor ID of the Main Account") // Original label
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(7)
              .setMaxLength(10)
              .setPlaceholder("e.g., 12345678"); // Original placeholder

            const actionRowModal = new ActionRowBuilder().addComponents(
              mainIdInput
            );
            modal.addComponents(actionRowModal);

            // Display the modal to the user ('i' is the select menu interaction)
            await i.showModal(modal);
            // The flow continues when the modal is submitted
          }
          // --- Handle Confirmation Submit Button (Matches original structure + simple error handling) ---
          else if (i.customId === "register_confirm_submit") {
            console.log(
              `[DEBUG] ${new Date().toISOString()} - Submit confirmed by user ${userId} in channel ${channelId}.`
            );

            // Validate data before sending to GAS
            if (!registrationData.attachment) {
              await interaction.editReply({
                // Edit original interaction
                content:
                  "Error: Screenshot is missing. Please go back and upload it.", // Original error text
                embeds: [],
                components: [], // Remove buttons
              });
              collector.stop("validation_error"); // Stop collector
              return; // Stop the submission process
            }
            if (
              registrationData.tipeAkun === "farm" &&
              !registrationData.idMainTerhubung
            ) {
              await interaction.editReply({
                // Edit original interaction
                content:
                  "Error: Linked Main ID is missing for farm account. Please use the Back button and try again.", // Original error text
                embeds: [],
                components: [], // Remove buttons
              });
              collector.stop("validation_error"); // Stop collector
              return; // Stop the submission process
            }

            // Show processing message
            await interaction.editReply({
              // Edit original interaction
              content: "Processing registration... Please wait.", // Original text
              embeds: [],
              components: [], // Remove confirmation buttons
            });

            // Process sending data to Google Apps Script
            let result = {
              status: "error",
              message: "Failed to contact the registration server.",
            }; // Default result
            try {
              // Fetch the image from the URL and convert to base64
              const imageResponse = await fetch(
                registrationData.attachment.url
              );
              if (!imageResponse.ok) {
                throw new Error(
                  `Failed to fetch image: ${imageResponse.statusText}`
                );
              }
              const imageBuffer = await imageResponse.buffer();
              registrationData.imageBase64 = imageBuffer.toString("base64");
              console.log(
                `[DEBUG] ${new Date().toISOString()} - Image converted to base64 for user ${userId} in channel ${channelId}.`
              );

              // Prepare payload for GAS
              const payloadData = { ...registrationData };
              const attachmentUrl = payloadData.attachment?.url;
              delete payloadData.attachment;
              payloadData.attachmentUrl = attachmentUrl;

              const gasPayload = {
                command: "register",
                data: payloadData,
              };

              // Send data to Google Apps Script
              console.log(
                `[DEBUG] ${new Date().toISOString()} - Sending payload to GAS for user ${userId}. Base64 size: ${
                  payloadData.imageBase64.length
                } bytes.`
              );
              const gasResponse = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(gasPayload),
              });

              if (!gasResponse.ok) {
                const errorText = await gasResponse.text();
                throw new Error(
                  `GAS Error ${gasResponse.status}: ${errorText}`
                );
              }

              result = await gasResponse.json();
              console.log(
                `[DEBUG] ${new Date().toISOString()} - Received response from GAS for user ${userId}: ${JSON.stringify(
                  result
                )}`
              );
            } catch (processError) {
              console.error(
                `[ERROR] ${new Date().toISOString()} - Error processing registration or contacting GAS for user ${userId} in channel ${channelId}:`,
                processError
              );
              result = {
                status: "error",
                message: `An error occurred during processing: ${processError.message}`,
              }; // Simple error message
            }

            // Display the final result to the user (based on GAS response)
            if (result.status === "success") {
              console.log(
                `[INFO] ${new Date().toISOString()} - Registration successful for user ${userId} (via GAS).`
              );
              const successEmbed = new EmbedBuilder()
                .setColor(0x00ff00)
                .setTitle("✅ Registration Successful!") // Original title
                .setDescription(result.message || "Account registered.") // Original text
                .addFields(
                  {
                    name: "Governor ID",
                    value:
                      result.details?.govId ||
                      registrationData.idMainTerhubung ||
                      "N/A",
                    inline: true,
                  },
                  {
                    name: "Account Type",
                    value:
                      result.details?.type ||
                      (registrationData.tipeAkun === "main"
                        ? "Main"
                        : "Farm") ||
                      "N/A",
                    inline: true,
                  }
                  // Add other fields if needed
                )
                .setFooter({
                  text: `Registered by ${interaction.user.tag}`,
                }) // Original footer
                .setTimestamp();
              if (registrationData.attachment?.url) {
                successEmbed.setThumbnail(registrationData.attachment.url);
              }

              await interaction.editReply({
                // Edit original interaction
                content: null,
                embeds: [successEmbed],
                components: [], // Remove buttons
              });
              collector.stop("processed"); // Stop collector successfully
            } else {
              // If GAS returned an error or an error occurred during processing
              console.error(
                `[ERROR] ${new Date().toISOString()} - Registration failed for user ${userId} (GAS/Process Error): ${
                  result.message
                }`
              );
              await interaction.editReply({
                // Edit original interaction
                content: `Registration failed: ${
                  result.message || "An error occurred."
                }`, // Simple error text
                embeds: [],
                components: [], // Remove buttons
              });
              collector.stop("gas_error"); // Stop the collector due to failure
            }
            return; // End handling for this submit
          }
        } catch (collectError) {
          // Handle errors occurring within collector.on('collect')
          console.error(
            `[ERROR] ${new Date().toISOString()} - Error handling interaction ${
              i?.customId
            } from user ${userId} in channel ${channelId}:`,
            collectError
          );
          // Simple text error handling
          try {
            if (interaction.editable) {
              await interaction.editReply({
                // Edit original interaction
                content:
                  "An error occurred while processing your selection. Please try registering again.", // Original error text
                embeds: [],
                components: [], // Remove buttons
              });
            }
          } catch (errorReplyError) {
            console.error(
              `[ERROR] ${new Date().toISOString()} - Failed to send error message during collection error handling:`,
              errorReplyError
            );
          }
          collector.stop("error"); // Stop the collector due to an internal error
        }
      }); // End collector.on('collect')

      // --- COLLECTOR END LOGIC (Matches original structure + simple error handling) ---
      collector.on("end", (collected, reason) => {
        console.log(
          `[DEBUG] ${new Date().toISOString()} - Registration collector ended in channel ${channelId}. Reason: ${reason}. Items collected: ${
            collected.size
          }`
        );

        // Only clean up/send a final message if the process hasn't ended normally
        const handledReasons = [
          "processed",
          "cancelled",
          "gas_error",
          "error",
          "invalid_file",
          "error_editing_reply",
          "validation_error",
          "timeout",
        ]; // Add timeout here as it's handled in catch

        // --- MODIFIED: Explicitly handle timeout here to ensure message is sent ---
        if (reason === "timeout" && interaction.editable) {
          interaction
            .editReply({
              content: `Registration timed out after ${
                MESSAGE_AWAIT_TIMEOUT / 60000
              } minutes. Click /register to try again.`, // Consistent timeout message
              embeds: [],
              components: [], // Remove components
            })
            .catch((e) =>
              console.error(
                `[ERROR] ${new Date().toISOString()} - Failed to edit reply on collector end (reason: ${reason}):`,
                e
              )
            );
        } else if (interaction.editable && !handledReasons.includes(reason)) {
          // Handle other unexpected end reasons
          let endContent =
            "Registration process ended unexpectedly. Please try /register again."; // Default unexpected
          interaction
            .editReply({
              content: endContent,
              embeds: [],
              components: [], // Remove components
            })
            .catch((e) =>
              console.error(
                `[ERROR] ${new Date().toISOString()} - Failed to edit reply at collector end (reason: ${reason}):`,
                e
              )
            );
        } else if (reason === "invalid_file" && interaction.editable) {
          // Message already sent in collect's awaitMessages logic
          console.log(
            `[INFO] ${new Date().toISOString()} - Registration process stopped due to invalid file for user ${userId} in channel ${channelId}.`
          );
        }
        // The channel lock will be released by the finally block
      }); // End collector.on('end')
    } catch (error) {
      // Handle major errors outside the collector (e.g., deferReply failed)
      console.error(
        `[ERROR] ${new Date().toISOString()} - Major error during registration process in channel ${channelId}:`,
        error
      );
      // Simple text error handling
      try {
        if (interaction.editable) {
          await interaction.editReply({
            content:
              "An internal error occurred during the registration setup. Please try again later.", // Simple error text
            embeds: [],
            components: [], // Remove components
          });
        } else if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "❌ Failed to start the registration process.", // Simple error text
            ephemeral: true,
          });
        }
      } catch (e) {
        console.error(
          `[ERROR] ${new Date().toISOString()} - Failed to send final error feedback message:`,
          e
        );
      }
    } finally {
      // --- CLEANUP BLOCK (ALWAYS RUNS) ---
      // Always remove the channel lock when the process finishes/errors/times out
      activeRegistrationChannels.delete(channelId);
      console.log(
        `[DEBUG] ${new Date().toISOString()} - Channel ${channelId} unlocked.`
      );
      // --- END CLEANUP BLOCK ---
    }
  }, // End execute function
}; // End module.exports
