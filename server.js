// server.js
const express = require("express");
const app = express();
// Replit biasanya menyediakan PORT di environment variable
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.send("KvK Stats Bot is running!");
});

app.listen(port, () => {
  console.log(`Server keep-alive aktif di port ${port}`);
});
