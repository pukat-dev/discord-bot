const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    InteractionType,
} = require("discord.js");
const fetch = require("node-fetch");

async function showConfirmation(interaction, data, farmNeedsModalId = false) {
    const confirmEmbed = new EmbedBuilder()
        .setColor(0xffff00)
        .setTitle("🔍 Confirm Registration Details")
        .addFields({
            name: "Account Type",
            value: data.tipeAkun || "N/A",
            inline: true,
        })
        .setFooter({
            text: "Please confirm the details below. This message is only visible to you.",
        })
        .setTimestamp();

    if (data.tipeAkun === "main") {
        confirmEmbed.addFields({
            name: "Status",
            value: data.statusMain || "N/A",
            inline: true,
        });
    } else {
        confirmEmbed.addFields({
            name: "Is Filler?",
            value: data.isFiller ? "Yes" : "No",
            inline: true,
        });
        if (farmNeedsModalId) {
            confirmEmbed.addFields({
                name: "Linked Main ID",
                value: "(Will be collected via modal)",
                inline: true,
            });
        } else {
            confirmEmbed.addFields({
                name: "Linked Main ID",
                value: data.idMainTerhubung || "N/A",
                inline: true,
            });
        }
    }

    if (data.attachment) {
        confirmEmbed.addFields({
            name: "Screenshot",
            value: `[View Attachment](${data.attachment.url})`,
        });
        confirmEmbed.setThumbnail(data.attachment.url);
    } else {
        confirmEmbed.addFields({
            name: "Screenshot",
            value: "Not provided yet.",
        });
    }

    const submitButton = new ButtonBuilder()
        .setCustomId("register_confirm_submit")
        .setLabel("Submit Registration")
        .setStyle(ButtonStyle.Success);
    const backButton = new ButtonBuilder()
        .setCustomId("register_confirm_back")
        .setLabel("Start Over")
        .setStyle(ButtonStyle.Secondary);
    const cancelButton = new ButtonBuilder()
        .setCustomId("register_cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger);

    const confirmRow = new ActionRowBuilder().addComponents(
        submitButton,
        backButton,
        cancelButton,
    );

    try {
        await interaction.editReply({
            content: "Please review the details and confirm:",
            embeds: [confirmEmbed],
            components: [confirmRow],
            ephemeral: true,
        });
        console.log(
            `[DEBUG] ${new Date().toISOString()} - Confirmation message shown.`,
        );
    } catch (editError) {
        console.error(
            `[ERROR] ${new Date().toISOString()} - Failed to show confirmation:`,
            editError,
        );
        // Attempt to send a simpler error message if edit fails
        if (interaction.editable) {
            await interaction
                .editReply({
                    content: "Error displaying confirmation. Please try again.",
                    embeds: [],
                    components: [],
                    ephemeral: true,
                })
                .catch((e) =>
                    console.error(
                        "Error sending confirmation error message:",
                        e,
                    ),
                );
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("register")
        .setDescription(
            "Press Enter or Send to start the interactive registration.",
        ),

    async execute(interaction, appsScriptUrl) {
        console.log(
            `[DEBUG] ${new Date().toISOString()} - /register invoked by ${interaction.user.id}`,
        );

        try {
            await interaction.deferReply({ ephemeral: true });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Interaction deferred ephemerally.`,
            );
        } catch (deferError) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Error deferring ephemeral reply:`,
                deferError,
            );
            return;
        }

        try {
            const initialEmbed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle("📝 New Account Registration")
                .setDescription(
                    "Please select the type of account you want to register:",
                )
                .setFooter({ text: "This message is only visible to you." })
                .setTimestamp();

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

            const cancelButton = new ButtonBuilder()
                .setCustomId("register_cancel")
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Danger);

            const selectRow = new ActionRowBuilder().addComponents(
                accountTypeSelect,
            );
            const buttonRow = new ActionRowBuilder().addComponents(
                cancelButton,
            );

            await interaction.editReply({
                embeds: [initialEmbed],
                components: [selectRow, buttonRow],
                ephemeral: true,
            });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Initial ephemeral registration message sent.`,
            );

            const filter = (i) => i.user.id === interaction.user.id;
            const collector =
                interaction.channel.createMessageComponentCollector({
                    filter,
                    time: 300000,
                });

            let registrationData = {
                discordUserId: interaction.user.id,
                discordUsername: interaction.user.username,
                tipeAkun: null,
                statusMain: null,
                isFiller: null,
                idMainTerhubung: null,
                imageBase64: null,
                attachment: null,
            };

            collector.on("collect", async (i) => {
                console.log(
                    `[DEBUG] ${new Date().toISOString()} - Collected interaction: ${i.customId}`,
                );
                try {
                    if (
                        i.type === InteractionType.ModalSubmit &&
                        i.customId === "register_farm_modal"
                    ) {
                        // Defer modal immediately
                        await i.deferUpdate({ ephemeral: true });
                        registrationData.idMainTerhubung =
                            i.fields.getTextInputValue("farm_linked_main_id");
                        console.log(
                            `[DEBUG] ${new Date().toISOString()} - Linked Main ID received from modal: ${registrationData.idMainTerhubung}`,
                        );

                        // Check if screenshot was already provided (it should have been)
                        if (registrationData.attachment) {
                            await showConfirmation(
                                interaction,
                                registrationData,
                            );
                        } else {
                            // This case might happen if the flow is interrupted, ask for screenshot again
                            await interaction.editReply({
                                content: `Linked Main ID set to ${registrationData.idMainTerhubung}. Now, please upload the FARM account's profile screenshot.`,
                                embeds: [],
                                components: [],
                                ephemeral: true,
                            });
                            const messageFilter = (m) =>
                                m.author.id === interaction.user.id &&
                                m.attachments.size > 0;
                            try {
                                const collectedMessages =
                                    await interaction.channel.awaitMessages({
                                        filter: messageFilter,
                                        max: 1,
                                        time: 120000,
                                        errors: ["time"],
                                    });
                                const attachment = collectedMessages
                                    .first()
                                    .attachments.first();
                                if (
                                    attachment &&
                                    attachment.contentType?.startsWith("image/")
                                ) {
                                    registrationData.attachment = attachment;
                                    console.log(
                                        `[DEBUG] ${new Date().toISOString()} - Farm screenshot received after modal: ${attachment.url}`,
                                    );
                                    await showConfirmation(
                                        interaction,
                                        registrationData,
                                    );
                                } else {
                                    throw new Error("Invalid file type.");
                                }
                            } catch (msgError) {
                                console.log(
                                    `[WARN] ${new Date().toISOString()} - Timed out waiting for farm screenshot after modal.`,
                                );
                                await interaction.editReply({
                                    content:
                                        "No valid screenshot uploaded within 2 minutes. Registration cancelled.",
                                    embeds: [],
                                    components: [],
                                    ephemeral: true,
                                });
                                collector.stop("timeout");
                            }
                        }
                        return; // Stop further processing for this modal interaction
                    }

                    // Defer other component interactions
                    if (!i.deferred) await i.deferUpdate({ ephemeral: true });

                    if (i.customId === "register_cancel") {
                        console.log(
                            `[DEBUG] ${new Date().toISOString()} - Registration cancelled by user.`,
                        );
                        await interaction.editReply({
                            content: "Registration cancelled.",
                            embeds: [],
                            components: [],
                            ephemeral: true,
                        });
                        collector.stop("cancelled");
                        return;
                    }

                    if (i.customId === "register_select_account_type") {
                        registrationData.tipeAkun = i.values[0];
                        console.log(
                            `[DEBUG] ${new Date().toISOString()} - Account type selected: ${registrationData.tipeAkun}`,
                        );

                        if (registrationData.tipeAkun === "main") {
                            const statusSelect = new StringSelectMenuBuilder()
                                .setCustomId("register_select_main_status")
                                .setPlaceholder("Select main account status...")
                                .addOptions(
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("DKP 2921 Old Player")
                                        .setValue("Old Player"),
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel("DKP Migrants")
                                        .setValue("Migrants"),
                                );
                            const statusRow =
                                new ActionRowBuilder().addComponents(
                                    statusSelect,
                                );
                            const backButton = new ButtonBuilder()
                                .setCustomId("register_back_to_type")
                                .setLabel("Back")
                                .setStyle(ButtonStyle.Secondary);
                            const buttonRowType =
                                new ActionRowBuilder().addComponents(
                                    backButton,
                                    cancelButton,
                                );

                            await interaction.editReply({
                                content: `You selected: **Main Account**. Please select your status:`,
                                embeds: [],
                                components: [statusRow, buttonRowType],
                                ephemeral: true,
                            });
                        } else if (registrationData.tipeAkun === "farm") {
                            const fillerYesButton = new ButtonBuilder()
                                .setCustomId("register_farm_filler_yes")
                                .setLabel("Yes, it IS a Filler")
                                .setStyle(ButtonStyle.Success);
                            const fillerNoButton = new ButtonBuilder()
                                .setCustomId("register_farm_filler_no")
                                .setLabel("No, it is NOT a Filler")
                                .setStyle(ButtonStyle.Secondary);
                            const backButton = new ButtonBuilder()
                                .setCustomId("register_back_to_type")
                                .setLabel("Back")
                                .setStyle(ButtonStyle.Secondary);
                            const fillerRow =
                                new ActionRowBuilder().addComponents(
                                    fillerYesButton,
                                    fillerNoButton,
                                );
                            const buttonRowType =
                                new ActionRowBuilder().addComponents(
                                    backButton,
                                    cancelButton,
                                );

                            await interaction.editReply({
                                content: `You selected: **Farm Account**. Is this account a Filler account?`,
                                embeds: [],
                                components: [fillerRow, buttonRowType],
                                ephemeral: true,
                            });
                        }
                    } else if (i.customId === "register_select_main_status") {
                        registrationData.statusMain = i.values[0];
                        console.log(
                            `[DEBUG] ${new Date().toISOString()} - Main status selected: ${registrationData.statusMain}`,
                        );
                        await interaction.editReply({
                            content: `Status selected: **${registrationData.statusMain}**. Please upload a screenshot of your Governor Profile now.`,
                            embeds: [],
                            components: [],
                            ephemeral: true,
                        });
                        const messageFilter = (m) =>
                            m.author.id === interaction.user.id &&
                            m.attachments.size > 0;
                        try {
                            const collectedMessages =
                                await interaction.channel.awaitMessages({
                                    filter: messageFilter,
                                    max: 1,
                                    time: 120000,
                                    errors: ["time"],
                                });
                            const attachment = collectedMessages
                                .first()
                                .attachments.first();
                            if (
                                attachment &&
                                attachment.contentType?.startsWith("image/")
                            ) {
                                registrationData.attachment = attachment;
                                console.log(
                                    `[DEBUG] ${new Date().toISOString()} - Screenshot received: ${attachment.url}`,
                                );
                                await showConfirmation(
                                    interaction,
                                    registrationData,
                                );
                            } else {
                                throw new Error(
                                    "Invalid file type. Please upload an image.",
                                );
                            }
                        } catch (msgError) {
                            console.log(
                                `[WARN] ${new Date().toISOString()} - Timed out waiting for screenshot or invalid file.`,
                            );
                            await interaction.editReply({
                                content:
                                    "No valid screenshot uploaded within 2 minutes. Registration cancelled.",
                                embeds: [],
                                components: [],
                                ephemeral: true,
                            });
                            collector.stop("timeout");
                        }
                    } else if (
                        i.customId === "register_farm_filler_yes" ||
                        i.customId === "register_farm_filler_no"
                    ) {
                        registrationData.isFiller =
                            i.customId === "register_farm_filler_yes";
                        console.log(
                            `[DEBUG] ${new Date().toISOString()} - Is Filler selected: ${registrationData.isFiller}`,
                        );

                        const modal = new ModalBuilder()
                            .setCustomId("register_farm_modal")
                            .setTitle("Farm Account Details");
                        const mainIdInput = new TextInputBuilder()
                            .setCustomId("farm_linked_main_id")
                            .setLabel(
                                "Enter the Governor ID of the Main Account",
                            )
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setMinLength(7)
                            .setMaxLength(10)
                            .setPlaceholder("e.g., 12345678");
                        const actionRowModal =
                            new ActionRowBuilder().addComponents(mainIdInput);
                        modal.addComponents(actionRowModal);
                        await i.showModal(modal);
                        // The actual ID is collected via the modal submit interaction handled above
                    } else if (i.customId === "register_confirm_submit") {
                        console.log(
                            `[DEBUG] ${new Date().toISOString()} - Submit confirmed by user.`,
                        );

                        // Final check for necessary data before submitting
                        if (!registrationData.attachment) {
                            await interaction.editReply({
                                content:
                                    "Error: Screenshot is missing. Please go back and upload it.",
                                embeds: [],
                                components: [],
                                ephemeral: true,
                            });
                            return; // Stop submission
                        }
                        if (
                            registrationData.tipeAkun === "farm" &&
                            !registrationData.idMainTerhubung
                        ) {
                            await interaction.editReply({
                                content:
                                    "Error: Linked Main ID is missing for farm account. Please go back and provide it.",
                                embeds: [],
                                components: [],
                                ephemeral: true,
                            });
                            return; // Stop submission
                        }

                        await interaction.editReply({
                            content: "Processing registration... Please wait.",
                            embeds: [],
                            components: [],
                            ephemeral: true,
                        });

                        try {
                            const response = await fetch(
                                registrationData.attachment.url,
                            );
                            if (!response.ok)
                                throw new Error(
                                    `Failed to fetch image: ${response.statusText}`,
                                );
                            const imageBuffer = await response.buffer();
                            registrationData.imageBase64 =
                                imageBuffer.toString("base64");
                            console.log(
                                `[DEBUG] ${new Date().toISOString()} - Image converted to base64.`,
                            );

                            const gasPayload = {
                                command: "register",
                                data: registrationData,
                            };
                            console.log(
                                `[DEBUG] ${new Date().toISOString()} - Sending payload to GAS: ${JSON.stringify(gasPayload).substring(0, 200)}...`,
                            );

                            const gasResponse = await fetch(appsScriptUrl, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify(gasPayload),
                            });

                            const result = await gasResponse.json();
                            console.log(
                                `[DEBUG] ${new Date().toISOString()} - Received response from GAS: ${JSON.stringify(result)}`,
                            );

                            if (result.status === "success") {
                                console.log(
                                    `[INFO] ${new Date().toISOString()} - Registration successful for user ${interaction.user.id}.`,
                                );
                                const successEmbed = new EmbedBuilder()
                                    .setColor(0x00ff00)
                                    .setTitle("✅ Registration Successful!")
                                    .setDescription(
                                        result.message || "Account registered.",
                                    )
                                    .addFields({
                                        name: "Governor ID",
                                        value: result.details?.govId || "N/A",
                                        inline: true,
                                    })
                                    .addFields({
                                        name: "Account Type",
                                        value: result.details?.type || "N/A",
                                        inline: true,
                                    })
                                    .setFooter({
                                        text: `Registered by ${interaction.user.tag}`,
                                    })
                                    .setTimestamp();
                                if (result.details?.targetKP) {
                                    successEmbed.addFields({
                                        name: "Target KP",
                                        value: result.details.targetKP.toLocaleString(
                                            "en-US",
                                        ),
                                        inline: true,
                                    });
                                }
                                if (result.details?.targetDeath) {
                                    successEmbed.addFields({
                                        name: "Target Deaths",
                                        value: result.details.targetDeath.toLocaleString(
                                            "en-US",
                                        ),
                                        inline: true,
                                    });
                                }

                                await interaction.followUp({
                                    embeds: [successEmbed],
                                    ephemeral: false,
                                });
                                await interaction
                                    .deleteReply()
                                    .catch((e) =>
                                        console.error(
                                            "Error deleting ephemeral reply:",
                                            e,
                                        ),
                                    ); // Attempt to delete ephemeral
                            } else {
                                console.error(
                                    `[ERROR] ${new Date().toISOString()} - Registration failed (GAS Error): ${result.message}`,
                                );
                                await interaction.editReply({
                                    content: `Registration failed: ${result.message || "An error occurred."}`,
                                    embeds: [],
                                    components: [],
                                    ephemeral: true,
                                });
                            }
                        } catch (processError) {
                            console.error(
                                `[ERROR] ${new Date().toISOString()} - Error processing registration or contacting GAS:`,
                                processError,
                            );
                            await interaction.editReply({
                                content: `An error occurred during processing: ${processError.message}`,
                                embeds: [],
                                components: [],
                                ephemeral: true,
                            });
                        }
                        collector.stop("processed");
                    } else if (
                        i.customId === "register_confirm_back" ||
                        i.customId === "register_back_to_type"
                    ) {
                        console.log(
                            `[DEBUG] ${new Date().toISOString()} - User clicked Back.`,
                        );
                        const initialEmbed = new EmbedBuilder()
                            .setColor(0x0099ff)
                            .setTitle("📝 New Account Registration")
                            .setDescription(
                                "Please select the type of account you want to register:",
                            )
                            .setFooter({
                                text: "This message is only visible to you.",
                            })
                            .setTimestamp();
                        const accountTypeSelect = new StringSelectMenuBuilder()
                            .setCustomId("register_select_account_type")
                            .setPlaceholder("Select account type...")
                            .addOptions(
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Main Account")
                                    .setDescription(
                                        "Register your primary account.",
                                    )
                                    .setValue("main"),
                                new StringSelectMenuOptionBuilder()
                                    .setLabel("Farm Account")
                                    .setDescription("Register a farm account.")
                                    .setValue("farm"),
                            );
                        const cancelButton = new ButtonBuilder()
                            .setCustomId("register_cancel")
                            .setLabel("Cancel")
                            .setStyle(ButtonStyle.Danger);
                        const selectRow = new ActionRowBuilder().addComponents(
                            accountTypeSelect,
                        );
                        const buttonRow = new ActionRowBuilder().addComponents(
                            cancelButton,
                        );
                        await interaction.editReply({
                            content: null,
                            embeds: [initialEmbed],
                            components: [selectRow, buttonRow],
                            ephemeral: true,
                        });
                        registrationData = {
                            discordUserId: interaction.user.id,
                            discordUsername: interaction.user.username,
                            tipeAkun: null,
                            statusMain: null,
                            isFiller: null,
                            idMainTerhubung: null,
                            imageBase64: null,
                            attachment: null,
                        };
                    }
                } catch (collectError) {
                    console.error(
                        `[ERROR] ${new Date().toISOString()} - Error handling collected interaction ${i.customId}:`,
                        collectError,
                    );
                    try {
                        if (interaction.editable) {
                            await interaction.editReply({
                                content:
                                    "An error occurred while processing your selection. Please try registering again.",
                                embeds: [],
                                components: [],
                                ephemeral: true,
                            });
                        }
                    } catch (errorReplyError) {
                        console.error(
                            `[ERROR] ${new Date().toISOString()} - Failed to send error message during collection error handling:`,
                            errorReplyError,
                        );
                    }
                    collector.stop("error");
                }
            });

            collector.on("end", (collected, reason) => {
                console.log(
                    `[DEBUG] ${new Date().toISOString()} - Registration collector ended. Reason: ${reason}. Collected items: ${collected.size}`,
                );
                if (reason === "time" && interaction.editable) {
                    interaction
                        .editReply({
                            content: "Registration timed out.",
                            embeds: [],
                            components: [],
                            ephemeral: true,
                        })
                        .catch((e) =>
                            console.error(
                                "Error editing reply on collector timeout:",
                                e,
                            ),
                        );
                } else if (
                    reason !== "processed" &&
                    reason !== "cancelled" &&
                    reason !== "timeout" &&
                    interaction.editable
                ) {
                    interaction
                        .editReply({
                            content: "Registration process ended unexpectedly.",
                            embeds: [],
                            components: [],
                            ephemeral: true,
                        })
                        .catch((e) =>
                            console.error(
                                "Error editing reply on collector unexpected end:",
                                e,
                            ),
                        );
                }
            });
        } catch (initialError) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Error setting up initial registration message:`,
                initialError,
            );
            if (interaction.editable) {
                try {
                    await interaction.editReply({
                        content:
                            "An error occurred setting up registration. Please try again.",
                        embeds: [],
                        components: [],
                        ephemeral: true,
                    });
                } catch (e) {
                    console.error("Error sending final error message:", e);
                }
            }
        }
    },
};
