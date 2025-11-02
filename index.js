import 'dotenv/config';
import express from "express";
import fs from "fs";
import axios from "axios";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Discord Token ----
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error("ERROR: TOKEN not found. Add it to Replit secrets as key 'TOKEN'.");
  process.exit(1);
}

// ---- Server Storage ----
const FILE = "./servers.json";
let servers = {};
try {
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({}));
  servers = JSON.parse(fs.readFileSync(FILE));
} catch {
  servers = {};
}
const saveServers = () => fs.writeFileSync(FILE, JSON.stringify(servers, null, 2));

// ---- Discord Client ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => console.log(`✅ Maya bot active as ${client.user.tag}`));

// ---- Command Handler ----
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim();

  // Instantly delete user message
  message.delete().catch(() => {});

  // ---- ADD SERVER ----
  if (content.toLowerCase().startsWith("!add ")) {
    const parts = content.split(/\s+/);
    if (parts.length < 3) {
      const msg = await message.channel.send("Usage: !add <cfx.link/join/abcd> <shortname>");
      return setTimeout(() => msg.delete().catch(() => {}), 10 * 1000);
    }

    const link = parts[1];
    const name = parts[2].toLowerCase();
    const endpoint = link.split("/").pop();

    if (!endpoint) {
      const msg = await message.channel.send("Could not extract endpoint from that link.");
      return setTimeout(() => msg.delete().catch(() => {}), 10 * 1000);
    }

    servers[name] = endpoint;
    saveServers();
    const replyMsg = await message.channel.send(`Added server **${name}**`);
    return setTimeout(() => replyMsg.delete().catch(() => {}), 10 * 1000);
  }

  // ---- REMOVE SERVER ----
  if (content.toLowerCase().startsWith("!remove ")) {
    const parts = content.split(/\s+/);
    const name = (parts[1] || "").toLowerCase();

    if (!name || !servers[name]) {
      const msg = await message.channel.send("That server name does not exist.");
      return setTimeout(() => msg.delete().catch(() => {}), 10 * 1000);
    }

    delete servers[name];
    saveServers();
    const replyMsg = await message.channel.send(`Removed **${name}**`);
    return setTimeout(() => replyMsg.delete().catch(() => {}), 10 * 1000);
  }

  // ---- LIST SERVERS ----
  if (content === "!list") {
    const keys = Object.keys(servers);
    const replyMsg = await message.channel.send(
      keys.length
        ? `Saved servers:\n${keys.map((k) => `• ${k}`).join("\n")}`
        : "No servers saved. Add one with !add."
    );
    return setTimeout(() => replyMsg.delete().catch(() => {}), 10 * 1000);
  }

  // ---- FETCH SERVER INFO ----
  if (content.startsWith("!")) {
    const name = content.slice(1).toLowerCase();
    if (!servers[name]) return;

    const endpoint = servers[name];
    const url = `https://servers-frontend.fivem.net/api/servers/single/${endpoint}`;

    try {
      const res = await axios.get(url, { timeout: 8000 });
      const info = res.data?.Data ?? {};
      const online = info.clients ?? 0;
      const max = info.sv_maxclients ?? 0;
      const serverName = info.hostname ?? name;
      const build = info.vars?.sv_enforceGameBuild ?? info.vars?.sv_enforceGameBuild ?? "Unknown";
      const status = online > 0 ? "Online" : "Offline";

      // ---- Logo ----
      let files = [];
      let thumbnailUrl =
        "https://cdn.discordapp.com/attachments/1417557499627835422/1434588393160966275/WhatsApp_Image_2025-10-04_at_19.52.51_9c143534.jpg";

      if (info.icon) {
        try {
          const base64 = info.icon.replace(/^data:image\/png;base64,/, "");
          const buffer = Buffer.from(base64, "base64");
          files.push({ attachment: buffer, name: "server.png" });
          thumbnailUrl = "attachment://server.png";
        } catch {
          console.warn("Failed to decode base64 icon.");
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`${serverName}`)
        .setDescription(
          `Players: ${online}/${max}\nBuild: ${build}\nStatus: ${status}`
        )
        .setThumbnail(thumbnailUrl)
        .setColor(online > 0 ? 0x00ff66 : 0xff0000)
        .setFooter({ text: `Requested by ${message.author.username}` })
        .setTimestamp();

      const replyMsg = await message.channel.send({ embeds: [embed], files });
      setTimeout(() => replyMsg.delete().catch(() => {}), 5 * 1000);
    } catch (err) {
      console.error("Fetch error:", err?.message ?? err);
      const embed = new EmbedBuilder()
        .setTitle(`${name}`)
        .setDescription("Could not fetch server info — it may be offline or invalid.")
        .setColor(0xff0000)
        .setTimestamp();
      const msg = await message.channel.send({ embeds: [embed] });
      setTimeout(() => msg.delete().catch(() => {}), 5 * 1000);
    }
  }
});

// ---- Keep Alive ----
app.get("/", (req, res) => res.send("FiveM Tracker Bot is online"));
app.listen(PORT, () => console.log(`🌐 Web server running on port ${PORT}`));

// ---- Start Bot ----
client.login(TOKEN).catch((err) => {
  console.error("Failed to login Discord client:", err);
  process.exit(1);
});
