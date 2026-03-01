const OWNER_ID = "1031037788579176528";
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const fs = require("fs");
const axios = require("axios");

// ================= GIVEAWAY STORAGE =================
const GIVEAWAY_FILE = "./giveaways.json";

function loadGiveaways() {
    try {
        return JSON.parse(fs.readFileSync(GIVEAWAY_FILE, "utf8"));
    } catch {
        return [];
    }
}

function saveGiveaways(data) {
    fs.writeFileSync(GIVEAWAY_FILE, JSON.stringify(data, null, 2));
}

let giveaways = loadGiveaways();

// ⚠️ DÁN COOKIE .ROBLOSECURITY CỦA BẠN
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const prefix = "!";

// ================= ECONOMY DATA =================
let money = {};
try {
    money = JSON.parse(fs.readFileSync("./money.json", "utf8"));
} catch {
    money = {};
}

function saveMoney() {
    fs.writeFileSync("./money.json", JSON.stringify(money, null, 2));
}

function getUser(id) {
    if (!money[id]) {
        money[id] = {
            money: 0,
            lastWork: 0,
            lastDaily: 0
        };
    }
    return money[id];
}

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;

// ================= CONFIG =================
const AUTO_ROLE_ID = "1453003778700742808";
const WELCOME_CHANNEL_ID = "1475192723484180570";

// 🔥 AUTO PENDING CONFIG
const AUTO_PENDING_CHANNEL = "1453002723170586635"; // đổi nếu muốn
const AUTO_PENDING_INTERVAL = 3 * 60 * 1000; // 3 phút

let cachedRobloxUsername = null;
let cachedRobloxUserId = null;
let lastPendingRobux = null;
let lastGiveaway = null;
let lastPendingMessage = null; // 🔥 lưu message pending cuối
let cachedRobloxAvatar = null;

// ===== AUTO PENDING STATUS =====
let autoPendingStatus = {
    running: false,
    lastCheck: null,
    lastValue: null
};

// ================= AUTO PENDING FUNCTION =================
async function getRobloxPending() {
    if (!ROBLOX_COOKIE) return null;

    try {
        if (!cachedRobloxUserId || !cachedRobloxUsername) {
            const userRes = await axios.get(
                "https://users.roblox.com/v1/users/authenticated",
                {
                    headers: {
                        Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                        "User-Agent": "Mozilla/5.0"
                    }
                }
            );
            cachedRobloxUserId = userRes.data.id;
			cachedRobloxUsername = userRes.data.name;
			
			if (!cachedRobloxAvatar) {
                cachedRobloxAvatar = await getRobloxAvatar(cachedRobloxUserId);
            }
        }

        const res = await axios.get(
            `https://economy.roblox.com/v2/users/${cachedRobloxUserId}/transaction-totals?timeFrame=Year&transactionType=Sale`,
            {
                headers: {
                    Cookie: `.ROBLOSECURITY=${ROBLOX_COOKIE}`,
                    "User-Agent": "Mozilla/5.0"
                }
            }
        );

        return res.data.pendingRobuxTotal || 0;
    } catch (err) {
        console.error("❌ Auto Pending error:", err.response?.data || err.message);
        return null;
    }
}

async function getRobloxAvatar(userId) {
    try {
        const res = await axios.get(
            `https://thumbnails.roblox.com/v1/users/avatar-headshot`,
            {
                params: {
                    userIds: userId,
                    size: "420x420",
                    format: "Png",
                    isCircular: false
                }
            }
        );
		
		const url = res.data?.data?.[0]?.imageUrl;
		
		// ✅ nếu API fail → fallback link cũ
		return (
		    url ||
			`https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`
	    );
    } catch (err) {
		console.error("Avatar fetch error:", err.response?.data || err.message);
		
		// ✅ fallback luôn
		return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=420&height=420&format=png`;
    }
}

async function endGiveaway(client, data) {
    try {
        const channel = await client.channels.fetch(data.channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) return;

        const msg = await channel.messages.fetch(data.messageId).catch(() => null);
        if (!msg) return;

        const reaction = msg.reactions.cache.get("🎉");
        if (!reaction) {
            await channel.send("❌ Không có người tham gia.");
            return;
        }

        const users = await reaction.users.fetch();
        const validUsers = users.filter(u => !u.bot);

        if (validUsers.size === 0) {
            await channel.send("❌ Không có người tham gia.");
            return;
        }

        const winner = validUsers.random();
        await channel.send(`🏆 Chúc mừng ${winner} thắng **${data.prize}**!`);

        // 🧹 remove khỏi list
        giveaways = giveaways.filter(g => g.messageId !== data.messageId);
        saveGiveaways(giveaways);

    } catch (err) {
        console.error("❌ End giveaway error:", err);
    }
}

function isOwner(message) {
    return message.author.id === OWNER_ID;
}

// ================= READY =================
client.once('ready', () => {
    console.log(`✅ Bot đã online: ${client.user.tag}`);

    autoPendingStatus.running = true;

    setInterval(async () => {
        try {
            autoPendingStatus.lastCheck = Date.now();

            const pending = await getRobloxPending();
            if (pending === null) return;

            autoPendingStatus.lastValue = pending;

            if (lastPendingRobux === pending) return;
            lastPendingRobux = pending;

            const channel = await client.channels.fetch(AUTO_PENDING_CHANNEL).catch(() => null);
            if (!channel || !channel.isTextBased()) return;

            const embed = new EmbedBuilder()
                .setColor("#2dd4bf")
                .setTitle("🔄 Auto Pending Update")
                .addFields(
				    { name: "👤 Account", value: cachedRobloxUsername || "Unknown", inline: true },
					{ name: "<:robux:1414051222922461204> Pending", value: `${pending.toLocaleString()} Robux`, inline: true }
				)
				.setThumbnail(
				    cachedRobloxAvatar ||
					(cachedRobloxUserId
					    ? `https://www.roblox.com/headshot-thumbnail/image?userId=${cachedRobloxUserId}&width=420&height=420&format=png`
					    : null)
                )
				.setTimestamp();

        try {
            // 🚀 nếu đã có message → EDIT cho mượt
            if (lastPendingMessage?.editable) {
                await lastPendingMessage.edit({ embeds: [embed] });
            } else {
                // 🆕 chưa có thì gửi mới
                lastPendingMessage = await channel.send({ embeds: [embed] });
            }
        } catch (err) { 
            // 🧹 nếu edit fail thì xóa và gửi lại
            if (lastPendingMessage) {
                await lastPendingMessage.delete().catch(() => {});
            }
            lastPendingMessage = await channel.send({ embeds: [embed] }).catch(() => null);
        }

            } catch (err) {
                console.error("❌ Auto pending loop error:", err);
            }
        }, AUTO_PENDING_INTERVAL);
	
	    // 🔄 resume giveaways sau restart
        for (const g of giveaways) {
            const remaining = g.endAt - Date.now();

            if (remaining <= 0) {
                endGiveaway(client, g);
            } else {
                setTimeout(() => endGiveaway(client, g), remaining);
            }
        }
});

// ================= MEMBER JOIN =================
client.on("guildMemberAdd", async member => {
    try {
        const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
        if (role) await member.roles.add(role).catch(() => {});

        const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor("#00bfff")
            .setTitle("🎉 Thành viên mới!")
            .setDescription(`Chào mừng ${member} đến với **${member.guild.name}**!`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `ID: ${member.id}` })
            .setTimestamp();

        await channel.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
        console.error("❌ Lỗi member join:", err);
    }
});

// ================= MESSAGE =================
client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

// ===== ROBUX PENDING (manual) =====
if (command === "pendingrbx" || command === "pending") {
	
	// 🔒 check NGAY đầu
	if (!isOwner(message)) {
		return message.reply("❌ K có quyền công dân nhá :)) ");
	}
	
    const pending = await getRobloxPending();
    if (pending === null) return message.reply("❌ Không lấy được pending.");
	
	if (!cachedRobloxAvatar && cachedRobloxUserId) {
		cachedRobloxAvatar = await getRobloxAvatar(cachedRobloxUserId);
	}

    const embed = new EmbedBuilder()
        .setColor("#2dd4bf")
        .setTitle("⏳ Robux đang chờ xử lý")
		.addFields(
            { name: "👤 Account", value: cachedRobloxUsername || "Unknown", inline: true },
			{ name: "<:robux:1414051222922461204> Pending", value: `${pending.toLocaleString()} Robux`, inline: true }
		)
		.setThumbnail(
			cachedRobloxAvatar ||
			(cachedRobloxUserId
				? `https://www.roblox.com/headshot-thumbnail/image?userId=${cachedRobloxUserId}&width=420&height=420&format=png`
				: null)
	    )
		.setTimestamp();

    return message.reply({ embeds: [embed] });
}

// ===== AUTO PENDING STATUS =====
if (command === "pendingst") {
	
	// 🔒 check trước tiên
	if (!isOwner(message)) {
		return message.reply("❌ K có quyền công dân nhá :)) ");
    }
	
    if (!autoPendingStatus.running) {
        return message.reply("❌ Auto pending chưa chạy.");
    }

    const last = autoPendingStatus.lastCheck
        ? `<t:${Math.floor(autoPendingStatus.lastCheck / 1000)}:R>`
        : "Chưa có";

    const value = autoPendingStatus.lastValue ?? "Chưa có";

    const embed = new EmbedBuilder()
        .setColor("#00ff99")
        .setTitle("📊 Trạng thái Auto Pending")
        .addFields(
            { name: "🟢 Trạng thái", value: "ĐANG CHẠY", inline: true },
            { name: "⏱️ Check lần cuối", value: last, inline: true },
            { name: "💰 Pending gần nhất", value: `${value} Robux`, inline: true }
        )
        .setTimestamp();

    return message.reply({ embeds: [embed] });
}

    // ===== COIN =====
    if (command === "coin" || command === "bal") {
        const userData = getUser(message.author.id);
		
        const embed = new EmbedBuilder()
            .setColor("#ffd700")
            .setAuthor({
                name: `💰 Ví tiền của ${message.author.username}`,
                iconURL: message.author.displayAvatarURL({ dynamic: true })
            })
            .setDescription(`🪙 **Số dư:** \`${userData.money.toLocaleString()} coin\``)
            .setFooter({ text: "Hệ thống tiền ảo" })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
}

    // ===== DAILY =====
    if (command === "daily") {
        const userData = getUser(message.author.id);
        const now = Date.now();

        if (now - userData.lastDaily < DAILY_COOLDOWN) {
            const wait = Math.ceil((DAILY_COOLDOWN - (now - userData.lastDaily)) / 3600000);
            return message.reply(`⏳ Quay lại sau **${wait} giờ** nữa.`);
        }

        const earn = 1;
        userData.money += earn;
        userData.lastDaily = now;
        saveMoney();

        return message.reply(`🎁 Bạn nhận **${earn}** coin daily!`);
    }

    // ===== PAY =====
    if (command === "pay") {
        const user = message.mentions.users.first();
        const amount = parseInt(args.find(a => !isNaN(a)));

        if (!user) return message.reply("❌ Tag người nhận.");
        if (isNaN(amount) || amount <= 0) return message.reply("❌ Nhập số tiền hợp lệ.");
		if (user.id === message.author.id) return message.reply("❌ Không thể tự chuyển tiền.");

        const sender = getUser(message.author.id);
        const receiver = getUser(user.id);

        if (sender.money < amount) return message.reply("❌ Nghèo mà đòi mr beast.");

        sender.money -= amount;
        receiver.money += amount;
        saveMoney();

        return message.reply({
            content: `💸 Đã chuyển **${amount}** coin cho ${user}`,
            allowedMentions: { users: [user.id] }
		});
	}

    // ===== TOP =====
    if (command === "top") {
        const sorted = Object.entries(money)
            .sort((a, b) => b[1].money - a[1].money)
            .slice(0, 10);

        if (sorted.length === 0) return message.reply("Chưa có dữ liệu.");

        const lines = [];
		
		for (let i = 0; i < sorted.length; i++) {
            const u = sorted[i];
			
			let tag = "Unknown";
			try {
				const user = await client.users.fetch(u[0]);
				tag = user.tag;
			} catch {}
		    
			lines.push(`${i + 1}. ${tag} — ${u[1].money}`);
        }
		
        const text = lines.join("\n");

        return message.channel.send(`🏆 **TOP GIÀU NHẤT**\n${text}`);
    }

    // ===== GIVEAWAY =====
    if (command === "ga") {
        const time = parseInt(args[0]);
        const prize = args.slice(1).join(" ");
		
		// 🔒 check quyền trước khi làm gì
		if (!isOwner(message)) {
			return message.reply("❌ K có quyền công dân nhá :)) ");
		}

        if (isNaN(time) || !prize) {
            return message.reply("❌ Dùng: !ga <giây> <phần thưởng>");
        }
		
		if (time <= 0) {
            return message.reply("❌ Thời gian phải > 0.");
		}
		
        const embed = new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY 🎉")
            .setDescription(
                `**Phần thưởng:** ${prize}\n⏳ Thời gian: ${time}s\nReact 🎉 để tham gia!`
            )
            .setColor("#ff0000")
            .setTimestamp();

        const giveawayMsg = await message.channel.send({ embeds: [embed] });
        await giveawayMsg.react("🎉");

        lastGiveaway = {
            messageId: giveawayMsg.id,
            channelId: message.channel.id,
            prize
        };

        const ms = time * 1000;
        const endAt = Date.now() + ms;

        // 💾 lưu giveaway
        giveaways.push({
            messageId: giveawayMsg.id,
            channelId: message.channel.id,
            prize,
            endAt
        });
        saveGiveaways(giveaways);

        // ⏳ schedule
        setTimeout(() => endGiveaway(client, {
            messageId: giveawayMsg.id,
            channelId: message.channel.id,
            prize,
            endAt
        }), ms);
	}

    // ===== REROLL =====
    if (command === "rr") {
		
		if (!isOwner(message)) {
			return message.reply("❌ K có quyền công dân nhá :)) ");
		}
		
        if (!lastGiveaway) return message.reply("❌ Không có giveaway để reroll.");
		


        try {
            const channel = await client.channels.fetch(lastGiveaway.channelId);
            const msg = await channel.messages.fetch(lastGiveaway.messageId);
            const reaction = msg.reactions.cache.get("🎉");
            if (!reaction) return message.reply("❌ Không tìm thấy reaction.");

            const users = await reaction.users.fetch();
            const validUsers = users.filter(u => !u.bot);
            if (validUsers.size === 0) return message.reply("❌ Không có người tham gia.");

            const winner = validUsers.random();
            message.channel.send(`🔁 Reroll! ${winner} thắng **${lastGiveaway.prize}**!`);
        } catch (err) {
            console.error("❌ Reroll error:", err);
            message.reply("❌ Lỗi khi reroll.");
        }
    }
});

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);
console.log("TOKEN length:", process.env.TOKEN?.length);
client.login(process.env.TOKEN);
