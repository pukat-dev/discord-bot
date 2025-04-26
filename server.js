// server.js - Simple Express server to keep the Replit instance alive

const express = require("express");
const app = express();
const port = 3000; // Port yang sama seperti di log index.js Anda

// Handle GET requests ke root path ('/')
app.get("/", (req, res) => {
  console.log("Ping diterima dari Uptime Robot atau browser.");
  res.send("Bot keep-alive server is running!"); // Respons sederhana untuk menunjukkan server aktif
});

// Endpoint untuk ping dari Uptime Robot
app.get("/ping", (req, res) => {
  console.log("Ping diterima dari Uptime Robot.");
  res.sendStatus(200); // Respons OK (status 200)
});

// Mulai server dan listen pada port yang ditentukan
function keepAlive() {
  app.listen(port, () => {
    console.log(`Keep-alive server listening on port ${port}`);
  });
}

// Ekspor fungsi agar bisa dipanggil dari index.js
module.exports = keepAlive;

// Pastikan express sudah terinstal:
// Di tab Shell Replit, jalankan: npm install express