const {
    SlashCommandBuilder,
    EmbedBuilder,
    AttachmentBuilder,
} = require("discord.js");
const fetch = require("node-fetch");
const XLSX = require("xlsx");

const adminChannelId = process.env.ADMIN_CHANNEL_ID;

function getColIndex(headers, colName) {
    return headers.findIndex(
        (header) => header?.toString().toLowerCase() === colName.toLowerCase(),
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("get-registration")
        .setDescription(
            "Downloads specific registration data as an XLSX file (Admin Only).",
        ),

    async execute(interaction, appsScriptUrl) {
        console.log(
            `[DEBUG] ${new Date().toISOString()} - /get-registration command invoked by ${interaction.user.tag} in channel ${interaction.channelId}`,
        );

        if (!adminChannelId) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Replit Secret 'ADMIN_CHANNEL_ID' not set! Cannot perform channel check.`,
            );
            try {
                await interaction.reply({
                    content:
                        "Configuration Error: Admin channel ID is not set.",
                    ephemeral: true,
                });
            } catch (replyError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send config error message:`,
                    replyError,
                );
            }
            return;
        }
        if (interaction.channelId !== adminChannelId) {
            console.log(
                `[WARN] ${new Date().toISOString()} - /get-registration blocked for user ${interaction.user.tag} in channel ${interaction.channelId}. Not the admin channel.`,
            );
            try {
                await interaction.reply({
                    content:
                        "This command can only be used in the designated admin channel.",
                    ephemeral: true,
                });
            } catch (replyError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send unauthorized channel message:`,
                    replyError,
                );
            }
            return;
        }
        console.log(
            `[DEBUG] ${new Date().toISOString()} - Channel check passed for /get-registration in channel ${interaction.channelId}.`,
        );

        try {
            await interaction.deferReply({ ephemeral: false });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Interaction deferred for /get-registration.`,
            );
        } catch (deferError) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Failed to defer reply for /get-registration:`,
                deferError,
            );
            try {
                if (!interaction.replied)
                    await interaction.reply({
                        content: "Failed to start the data retrieval process.",
                        ephemeral: true,
                    });
                else
                    await interaction.followUp({
                        content:
                            "Failed to start the data retrieval process (defer error).",
                        ephemeral: true,
                    });
            } catch (replyError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send error after defer failure:`,
                    replyError,
                );
            }
            return;
        }

        const payload = {
            command: "get_registration_data",
            data: {},
        };

        try {
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Sending request to Apps Script URL for get_registration_data: ${appsScriptUrl}`,
            );
            const response = await fetch(appsScriptUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            console.log(
                `[DEBUG] ${new Date().toISOString()} - Received response status from GAS: ${response.status}`,
            );

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Apps Script returned error ${response.status}: ${errorText.substring(0, 500)}`,
                );
                throw new Error(
                    `Google Apps Script returned an error (${response.status}).`,
                );
            }

            const result = await response.json();
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Parsed response from GAS (get_registration_data): status=${result.status}`,
            );

            if (
                result.status !== "success" ||
                !result.details ||
                !result.details.registrationData
            ) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - GAS did not return successful data. Message: ${result.message}`,
                );
                throw new Error(
                    result.message ||
                        "Failed to retrieve registration data from Google Sheet.",
                );
            }

            const registrationData = result.details.registrationData;

            if (!registrationData || registrationData.length <= 1) {
                console.log(
                    `[INFO] ${new Date().toISOString()} - Registration data is empty or only contains header, sending message instead of file.`,
                );
                await interaction.editReply({
                    content: "Registration data is empty. No file generated.",
                });
                return;
            }

            const worksheet = XLSX.utils.aoa_to_sheet(registrationData);

            const headers = registrationData[0];
            const numberColumns = [
                "last recorded power",
                "target kp",
                "target dead troops",
            ];
            const numberFormat = "#,##0";
            const idColName = "governo id";

            const colIndicesToFormat = numberColumns
                .map((colName) => getColIndex(headers, colName))
                .filter((index) => index !== -1);
            const idColIndex = getColIndex(headers, idColName);

            for (
                let rowIndex = 1;
                rowIndex < registrationData.length;
                rowIndex++
            ) {
                for (const colIndex of colIndicesToFormat) {
                    const cellAddress = XLSX.utils.encode_cell({
                        r: rowIndex,
                        c: colIndex,
                    });
                    const cell = worksheet[cellAddress];
                    if (cell && typeof cell.v === "number") {
                        cell.t = "n";
                        cell.z = numberFormat;
                    }
                }
                if (idColIndex !== -1) {
                    const idCellAddress = XLSX.utils.encode_cell({
                        r: rowIndex,
                        c: idColIndex,
                    });
                    const idCell = worksheet[idCellAddress];
                    if (idCell) {
                        idCell.t = "s";
                        if (typeof idCell.v === "number") {
                            idCell.v = String(idCell.v);
                        }
                    }
                } else {
                    if (rowIndex === 1) {
                        console.warn(
                            `[WARN] Column "${idColName}" not found in the received data headers. ID column not formatted as text.`,
                        );
                    }
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(
                workbook,
                worksheet,
                "Registration Data",
            );

            const excelBuffer = XLSX.write(workbook, {
                bookType: "xlsx",
                type: "buffer",
            });

            const fileName = `List DKP Target Players.xlsx`;
            const attachment = new AttachmentBuilder(excelBuffer, {
                name: fileName,
            });

            await interaction.editReply({
                content:
                    "Here is the requested registration data in XLSX format:",
                files: [attachment],
            });
            console.log(
                `[DEBUG] ${new Date().toISOString()} - Sent registration data XLSX file: ${fileName}`,
            );
        } catch (error) {
            console.error(
                `[ERROR] ${new Date().toISOString()} - Error during /get-registration execution:`,
                error,
            );
            try {
                await interaction.editReply({
                    content: `An error occurred while retrieving data: ${error.message}`,
                    files: [],
                });
            } catch (editError) {
                console.error(
                    `[ERROR] ${new Date().toISOString()} - Failed to send error message via editReply in catch block:`,
                    editError,
                );
            }
        }
    },
};
