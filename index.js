import express from "express";
import fs from "fs";
import axios from "axios";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Discord Token ----
const TOKEN = "MTQzNDU2NDYzOTYwMDkzNDkxMg.GlgL15.2imSzH1h72h2X_CnZBITVNL70uA-XhXnc5jp-E"; // Paste your bot token here

// ---- Channel ID for Help Menu ----
const HELP_CHANNEL_ID = "1434593660577517628";

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

client.once("ready", async () => {
  console.log(`TG's Bot is active as ${client.user.tag}`);
  try {
    const channel = await client.channels.fetch(HELP_CHANNEL_ID);
    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle("TG's Bot — Help Menu")
        .setDescription(
          [
            "**!add <cfx.link/join/...> <shortname>** → Add a server",
            "**!remove <shortname>** → Remove a saved server",
            "**!list** → Show saved servers",
            "**!<shortname>** → Show basic info",
            "**!pl <shortname>** → Show player list with ping",
            "**!r <shortname>** → Show resource list",
            "**!ip <shortname>** → IP lookup (live)",
            "**!paping <ip> <port>** → Continuous ping (Stop with button)",
            "",
            "All messages auto-delete after 50 seconds."
          ].join("\n")
        )
        .setColor(0x00aaff);

      // Try to find an existing help message to edit
      const messages = await channel.messages.fetch({ limit: 10 });
      const existing = messages.find((m) =>
        m.author.id === client.user.id && m.embeds[0]?.title?.includes("Help Menu")
      );
      if (existing) await existing.edit({ embeds: [embed] });
      else await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Could not post help menu:", err);
  }
});

// ---- Command Handler ----
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  message.delete().catch(() => {});

  // ---- ADD SERVER ----
  if (content.toLowerCase().startsWith("!add ")) {
    const parts = content.split(/\s+/);
    if (parts.length < 3) {
      const msg = await message.channel.send("Usage: !add <cfx.link/join/...> <shortname>");
      return setTimeout(() => msg.delete().catch(() => {}), 10000);
    }

    const link = parts[1];
    const name = parts[2].toLowerCase();
    const endpoint = link.split("/").pop();

    if (!endpoint) {
      const msg = await message.channel.send("Could not extract endpoint from that link.");
      return setTimeout(() => msg.delete().catch(() => {}), 10000);
    }

    servers[name] = endpoint;
    saveServers();
    const embed = new EmbedBuilder()
      .setTitle("Server Added")
      .setDescription(`Server "${name}" added successfully.`)
      .setColor(0x00ff00);
    const reply = await message.channel.send({ embeds: [embed] });
    return setTimeout(() => reply.delete().catch(() => {}), 10000);
  }

  // ---- REMOVE SERVER ----
  if (content.toLowerCase().startsWith("!remove ")) {
    const name = content.split(/\s+/)[1]?.toLowerCase();
    if (!name || !servers[name]) {
      const msg = await message.channel.send("That server name does not exist.");
      return setTimeout(() => msg.delete().catch(() => {}), 10000);
    }
    delete servers[name];
    saveServers();
    const embed = new EmbedBuilder()
      .setTitle("Server Removed")
      .setDescription(`Removed server "${name}".`)
      .setColor(0xff0000);
    const reply = await message.channel.send({ embeds: [embed] });
    return setTimeout(() => reply.delete().catch(() => {}), 10000);
  }

  // ---- LIST SERVERS ----
  if (content === "!list") {
    const keys = Object.keys(servers);
    const embed = new EmbedBuilder()
      .setTitle("Saved Servers")
      .setDescription(
        keys.length
          ? keys.map((k) => `• ${k}`).join("\n")
          : "No servers saved. Add one with !add."
      )
      .setColor(0x00aaff);
    const reply = await message.channel.send({ embeds: [embed] });
    return setTimeout(() => reply.delete().catch(() => {}), 15000);
  }

  // ---- Fetch Info by Command ----
  if (content.startsWith("!")) {
    const cmd = content.slice(1).split(" ")[0].toLowerCase();
    const arg = content.split(" ")[1]?.toLowerCase();

    if (cmd === "ip" && arg) return getIP(message, arg);
    if (cmd === "pl" && arg) return getPlayers(message, arg);
    if (cmd === "r" && arg) return getResources(message, arg);
    if (servers[cmd]) return getBasicInfo(message, cmd);
  }
});

// ---- BASIC INFO ----
async function getBasicInfo(message, name) {
  const endpoint = servers[name];
  const url = `https://servers-frontend.fivem.net/api/servers/single/${endpoint}`;
  try {
    const res = await axios.get(url, { timeout: 8000 });
    const info = res.data?.Data ?? {};
    const online = info.clients ?? 0;
    const max = info.sv_maxclients ?? 0;
    const serverName = info.hostname ?? name;
    const build = info.vars?.sv_enforceGameBuild ?? "Unknown";
    const status = online > 0 ? "Online" : "Offline";

    const embed = new EmbedBuilder()
      .setTitle(serverName)
      .setDescription(
        `Players: ${online}/${max}\nBuild: ${build}\nStatus: ${status}\nConnect: cfx.re/join/${endpoint}`
      )
      .setColor(online > 0 ? 0x00ff66 : 0xff0000)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    const replyMsg = await message.channel.send({ embeds: [embed] });
    setTimeout(() => replyMsg.delete().catch(() => {}), 50000);
  } catch {
    const embed = new EmbedBuilder()
      .setTitle(name)
      .setDescription("Could not fetch server info — it may be offline or invalid.")
      .setColor(0xff0000);
    const msg = await message.channel.send({ embeds: [embed] });
    setTimeout(() => msg.delete().catch(() => {}), 10000);
  }
}

// ---- PLAYER LIST ----
async function getPlayers(message, name) {
  if (!servers[name]) return;
  const endpoint = servers[name];
  const url = `https://servers-frontend.fivem.net/api/servers/single/${endpoint}`;
  try {
    const res = await axios.get(url);
    const players = res.data?.Data?.players ?? [];
    const list =
      players.length > 0
        ? players.map((p) => `${p.name} (Ping: ${p.ping})`).join("\n")
        : "No players online.";

    const embed = new EmbedBuilder()
      .setTitle(`Players in ${name}`)
      .setDescription(list)
      .setColor(0x00ffff);

    const reply = await message.channel.send({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 50000);
  } catch {
    const embed = new EmbedBuilder()
      .setTitle("Error")
      .setDescription("Unable to fetch player list.")
      .setColor(0xff0000);
    message.channel.send({ embeds: [embed] });
  }
}

// ---- RESOURCES ----
async function getResources(message, name) {
  if (!servers[name]) return;
  const endpoint = servers[name];
  const url = `https://servers-frontend.fivem.net/api/servers/single/${endpoint}`;
  try {
    const res = await axios.get(url);
    const resources = res.data?.Data?.resources ?? [];
    const list =
      resources.length > 0
        ? resources.map((r) => r).join("\n")
        : "No resources found.";

    const embed = new EmbedBuilder()
      .setTitle(`Resources in ${name}`)
      .setDescription(list)
      .setColor(0x0099ff);

    const reply = await message.channel.send({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 50000);
  } catch {
    const embed = new EmbedBuilder()
      .setTitle("Error")
      .setDescription("Unable to fetch resources.")
      .setColor(0xff0000);
    message.channel.send({ embeds: [embed] });
  }
}

// ---- Get Server IP & Port ----
async function getIP(message, name) {
  if (!servers[name]) return;
  const endpoint = servers[name];
  const embedLoading = new EmbedBuilder()
    .setTitle(`Fetching IP for ${name}...`)
    .setColor(0x0099ff);
  const loadingMsg = await message.channel.send({ embeds: [embedLoading] });

  try {
    const apiUrl = `https://servers-frontend.fivem.net/api/servers/single/${endpoint}`;
    const res = await axios.get(apiUrl, { timeout: 8000 });
    const ip = res.data?.Data?.connectEndPoints?.[0] ?? "Unavailable";
    const serverName = res.data?.Data?.hostname ?? name;

    await loadingMsg.delete().catch(() => {});
    const embed = new EmbedBuilder()
      .setTitle(serverName)
      .setDescription(`IP & Port: ${ip}\nConnect: cfx.re/join/${endpoint}`)
      .setColor(0x00ff66)
      .setFooter({ text: `Requested by ${message.author.username}` })
      .setTimestamp();

    const reply = await message.channel.send({ embeds: [embed] });
    setTimeout(() => reply.delete().catch(() => {}), 50000);
  } catch {
    await loadingMsg.delete().catch(() => {});
    const embed = new EmbedBuilder()
      .setTitle("IP Lookup Failed")
      .setDescription(`Unable to fetch IP & Port for ${name}.`)
      .setColor(0xff0000);
    const msg = await message.channel.send({ embeds: [embed] });
    setTimeout(() => msg.delete().catch(() => {}), 15000);
  }
}

// ---- Keep Alive ----
app.get("/", (req, res) => res.send("TG's Bot is online"));
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// ---- Start Bot ----
client.login(TOKEN).catch((err) => {
  console.error("Failed to login Discord client:", err);
  process.exit(1);
});
