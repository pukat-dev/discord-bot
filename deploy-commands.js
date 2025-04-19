// deploy-commands.js
// Script ini dijalankan manual via Shell untuk mendaftarkan slash commands ke Discord

const { REST, Routes } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");

// Muat environment variables/secrets
// Pastikan kamu punya DISCORD_BOT_TOKEN dan DISCORD_CLIENT_ID di Replit Secrets
const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
// Opsional: Jika mau deploy ke satu server (guild) saja saat development (lebih cepat update)
// const guildId = process.env.DEV_GUILD_ID; // Tambahkan DEV_GUILD_ID ke Secrets jika perlu

if (!token) {
    throw new Error(
        "Error: DISCORD_BOT_TOKEN tidak ditemukan di environment variables/secrets!",
    );
}
if (!clientId) {
    throw new Error(
        "Error: DISCORD_CLIENT_ID tidak ditemukan di environment variables/secrets!",
    );
}
// if (!guildId && process.env.NODE_ENV !== 'production') {
//     console.warn("Warning: DEV_GUILD_ID tidak diset. Command akan didaftarkan secara global (mungkin butuh waktu update lebih lama).");
// }

const commands = [];
// Ambil semua file command dari folder commands
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

// Ambil definisi SlashCommandBuilder#toJSON() dari setiap command untuk deployment
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
            commands.push(command.data.toJSON());
            console.log(
                `[INFO] Menyiapkan command "${command.data.name}" untuk deployment.`,
            );
        } else {
            console.log(
                `[WARNING] Command di ${filePath} tidak valid (kurang 'data' atau 'execute').`,
            );
        }
    } catch (error) {
        console.error(
            `[ERROR] Gagal memuat command di ${filePath} untuk deployment:`,
            error,
        );
    }
}

// Buat instance dari REST module
const rest = new REST().setToken(token);

// Deploy commands!
(async () => {
    try {
        console.log(
            `Memulai refresh ${commands.length} application (/) commands.`,
        );

        // Tentukan route: global atau spesifik guild
        let route;
        // if (guildId && process.env.NODE_ENV !== 'production') {
        //     // Selama development, lebih cepat deploy ke satu guild saja
        //     route = Routes.applicationGuildCommands(clientId, guildId);
        //     console.log(`Mendaftarkan commands ke guild ID: ${guildId}`);
        // } else {
        // Untuk production, daftarkan secara global
        route = Routes.applicationCommands(clientId);
        console.log("Mendaftarkan commands secara global.");
        // }

        // Method 'put' digunakan untuk me-refresh semua command dengan set yang sekarang
        const data = await rest.put(
            route,
            { body: commands }, // Kirim array definisi command
        );

        console.log(
            `Berhasil me-refresh ${data.length} application (/) commands.`,
        );
    } catch (error) {
        // Pastikan menangkap dan log error dengan baik
        console.error("Gagal mendaftarkan commands:", error);
    }
})();
