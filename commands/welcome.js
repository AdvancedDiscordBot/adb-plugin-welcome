const { PermissionFlagsBits } = require("discord.js");
const { normalizeConfig, formatText } = require("../lib/config");
const { listPresets, getPreset } = require("../lib/presets");
const { SOCIAL_ORDER, SOCIAL_META } = require("../lib/social");
const { buildEventPayload } = require("../lib/message-builder");
const { resolveMember, canManageGuild } = require("../lib/member");

const MANAGE_GUILD_DENIED = "❌ You need the **Manage Server** permission to use this command.";
const MEMBER_UNRESOLVED = "❌ I couldn't resolve your server membership. Please try again in the server.";

const MAX_BACKGROUNDS = 10;
const ALLOWED_BACKGROUND_TYPES = ["image/png", "image/jpeg", "image/gif"];

async function loadConfig(ctx, guildId) {
	const config = await ctx.db.getPluginConfig(guildId, "adb-plugin-welcome");
	return { config, data: normalizeConfig(config.data || {}) };
}

async function save(ctx, guildId, data) {
	await ctx.db.updatePluginConfig(guildId, "adb-plugin-welcome", data);
}

module.exports = {
	data: {
		name: "welcome",
		description: "Configure welcome and goodbye messages/cards",
		options: [
			{
				name: "channel",
				description: "Set or clear the default welcome channel",
				type: 1,
				options: [{ name: "channel", description: "The channel to send welcome messages in (leave empty to disable)", type: 7, required: false }],
			},
			{
				name: "message",
				description: "Set the default welcome message text",
				type: 1,
				options: [{ name: "text", description: "Welcome text. Use placeholders: {user}, {username}, {server}, {memberCount}, {rulesChannel}", type: 3, required: true }],
			},
			{
				name: "goodbye-channel",
				description: "Set or clear the goodbye channel",
				type: 1,
				options: [{ name: "channel", description: "The channel to send goodbye messages in (leave empty to disable)", type: 7, required: false }],
			},
			{
				name: "goodbye-message",
				description: "Set the goodbye message text",
				type: 1,
				options: [{ name: "text", description: "Goodbye text. Use placeholders: {username}, {server}, {memberCount}", type: 3, required: true }],
			},
			{
				name: "dm",
				description: "Toggle welcome messages in Direct Messages (DM)",
				type: 1,
				options: [{ name: "status", description: "Choose ON or OFF", type: 3, required: true, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] }],
			},
			{
				name: "card",
				description: "Toggle welcome/goodbye image cards",
				type: 1,
				options: [{ name: "status", description: "Choose ON or OFF", type: 3, required: true, choices: [{ name: "on", value: "on" }, { name: "off", value: "off" }] }],
			},
			{ name: "preview", description: "Preview the welcome card/message in the current channel", type: 1 },
			{ name: "test", description: "Simulate a real welcome and goodbye event", type: 1 },
			{
				name: "role",
				description: "Set a role-specific welcome channel",
				type: 1,
				options: [
					{ name: "role", description: "The role to match", type: 8, required: true },
					{ name: "channel", description: "Welcome channel for this role (leave empty to remove)", type: 7, required: false },
				],
			},
			{
				name: "role-message",
				description: "Set a role-specific welcome message",
				type: 1,
				options: [
					{ name: "role", description: "The role to match", type: 8, required: true },
					{ name: "text", description: "Welcome text for this role", type: 3, required: true },
				],
			},
			{
				name: "background",
				description: "Custom welcome card backgrounds",
				type: 2,
				options: [
					{ name: "upload", description: "Upload a custom background image (PNG/JPG/GIF)", type: 1, options: [{ name: "image", description: "The background image", type: 11, required: true }] },
					{ name: "default", description: "Restore the default background", type: 1 },
					{ name: "list", description: "List uploaded backgrounds", type: 1 },
					{
						name: "set",
						description: "Set a background as server default or for a specific role/channel",
						type: 1,
						options: [
							{ name: "id", description: "Background id (uploaded id or preset id)", type: 3, required: true },
							{ name: "channel", description: "Apply only to this channel", type: 7, required: false },
							{ name: "role", description: "Apply only to this role", type: 8, required: false },
						],
					},
					{ name: "presets", description: "List built-in preset backgrounds", type: 1 },
				],
			},
			{
				name: "social",
				description: "Social media links shown on the welcome card",
				type: 2,
				options: SOCIAL_ORDER.map(platform => ({
					name: platform,
					description: `Set or clear ${SOCIAL_META[platform].label} link`,
					type: 1,
					options: [{ name: "url", description: "Invite / URL / handle (leave empty to clear)", type: 3, required: false }]
				})),
			},
			{
				name: "button",
				description: "Interactive buttons on the welcome message",
				type: 2,
				options: [
					{
						name: "add",
						description: "Add a link or role button",
						type: 1,
						options: [
							{ name: "label", description: "Button label", type: 3, required: true },
							{ name: "url", description: "URL the button links to (if link button)", type: 3, required: false },
							{ name: "role", description: "Role to assign on click (if role button)", type: 8, required: false },
						],
					},
					{ name: "remove", description: "Remove a button by label", type: 1, options: [{ name: "label", description: "Label of the button to remove", type: 3, required: true }] },
					{ name: "list", description: "List configured buttons", type: 1 },
				],
			},
			{ name: "embed-color", description: "Accent color as a hex code, e.g. #FF69B4", type: 1, options: [{ name: "hex", description: "Hex color code", type: 3, required: true }] },
			{ name: "embed-title", description: "Custom welcome title", type: 1, options: [{ name: "text", description: "Use {user}, {username}, {server}, {memberCount}", type: 3, required: true }] },
			{ name: "embed-description", description: "Extra text below the welcome message", type: 1, options: [{ name: "text", description: "Extra description text", type: 3, required: true }] },
			{ name: "embed-footer", description: "Footer text", type: 1, options: [{ name: "text", description: "Use {user}, {username}, {server}, {memberCount}", type: 3, required: true }] },
			{
				name: "embed-thumbnail",
				description: "Choose the embed thumbnail",
				type: 1,
				options: [{ name: "source", description: "Thumbnail source", type: 3, required: true, choices: [{ name: "user", value: "user" }, { name: "server", value: "server" }, { name: "none", value: "none" }] }],
			},
			{
				name: "stats",
				description: "Welcome/goodbye statistics",
				type: 1,
				options: [
					{ name: "period", description: "Filter period", type: 3, required: false, choices: [{ name: "today", value: "today" }] }
				],
			},
		],
		toJSON() {
			return this;
		},
	},

	async execute(interaction, ctx) {
		const member = await resolveMember(interaction);
		if (!member) {
			return interaction.reply({ content: MEMBER_UNRESOLVED, ephemeral: true });
		}
		if (!canManageGuild(member, PermissionFlagsBits.ManageGuild)) {
			return interaction.reply({ content: MANAGE_GUILD_DENIED, ephemeral: true });
		}

		const group = interaction.options.getSubcommandGroup(false);
		const subcommand = interaction.options.getSubcommand();
		const guildId = interaction.guildId;
		const { data } = await loadConfig(ctx, guildId);

		if (group === "background") return handleBackground(interaction, ctx, guildId, data, subcommand);
		if (group === "social") return handleSocial(interaction, ctx, guildId, data, subcommand);
		if (group === "button") return handleButton(interaction, ctx, guildId, data, subcommand);

		if (subcommand === "role" || subcommand === "role-message") return handleRole(interaction, ctx, guildId, data, subcommand);
		if (subcommand.startsWith("embed-")) return handleEmbed(interaction, ctx, guildId, data, subcommand);
		if (subcommand === "stats") return handleStats(interaction, data);

		return handleLegacy(interaction, member, ctx, guildId, data, subcommand);
	},

	formatWelcomeText: formatText,
};

// --- Legacy top-level subcommands (backward compatible) --------------------

async function handleLegacy(interaction, member, ctx, guildId, data, subcommand) {
	if (subcommand === "channel") {
		const channel = interaction.options.getChannel("channel");
		if (channel) {
			if (!channel.isTextBased()) {
				return interaction.reply({ content: "❌ Selected channel must be a text-based channel.", ephemeral: true });
			}
			data.welcomeChannelId = channel.id;
			await save(ctx, guildId, data);
			return interaction.reply({ content: `✅ Welcome messages will now be sent in ${channel}.`, ephemeral: true });
		}
		data.welcomeChannelId = null;
		await save(ctx, guildId, data);
		return interaction.reply({ content: "✅ Welcome channel disabled.", ephemeral: true });
	}

	if (subcommand === "message") {
		const text = interaction.options.getString("text");
		data.welcomeMessage = text;
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Welcome message updated.\n**Preview:** ${text}`, ephemeral: true });
	}

	if (subcommand === "goodbye-channel") {
		const channel = interaction.options.getChannel("channel");
		if (channel) {
			if (!channel.isTextBased()) {
				return interaction.reply({ content: "❌ Selected channel must be a text-based channel.", ephemeral: true });
			}
			data.goodbyeChannelId = channel.id;
			await save(ctx, guildId, data);
			return interaction.reply({ content: `✅ Goodbye messages will now be sent in ${channel}.`, ephemeral: true });
		}
		data.goodbyeChannelId = null;
		await save(ctx, guildId, data);
		return interaction.reply({ content: "✅ Goodbye channel disabled.", ephemeral: true });
	}

	if (subcommand === "goodbye-message") {
		const text = interaction.options.getString("text");
		data.goodbyeMessage = text;
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Goodbye message updated.\n**Preview:** ${text}`, ephemeral: true });
	}

	if (subcommand === "dm") {
		const status = interaction.options.getString("status");
		data.dmEnabled = status === "on";
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Welcome DMs are now turned **${status.toUpperCase()}**.`, ephemeral: true });
	}

	if (subcommand === "card") {
		const status = interaction.options.getString("status");
		data.cardEnabled = status === "on";
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Welcome/Goodbye image cards are now turned **${status.toUpperCase()}**.`, ephemeral: true });
	}

	if (subcommand === "preview") {
		await interaction.deferReply();
		const welcomePayload = await buildEventPayload(data, member, true);
		const goodbyePayload = await buildEventPayload(data, member, false);

		const files = [welcomePayload.attachment, goodbyePayload.attachment].filter(Boolean);
		return interaction.editReply({
			content: "🎨 **Welcome & Goodbye Preview:**",
			embeds: [welcomePayload.embed, goodbyePayload.embed],
			files,
			components: welcomePayload.components,
		});
	}

	if (subcommand === "test") {
		await interaction.deferReply();
		if (!interaction.guild) {
			return interaction.editReply({ content: "❌ This command can only be run inside a server." });
		}
		const welcomePayload = await buildEventPayload(data, member, true);
		const goodbyePayload = await buildEventPayload(data, member, false);

		let welcomeSent = false;
		let welcomeDmSent = false;
		let goodbyeSent = false;

		for (const channelId of welcomePayload.channelIds) {
			const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
			if (channel?.isTextBased()) {
				await channel
					.send({ content: welcomePayload.text, embeds: [welcomePayload.embed], files: welcomePayload.attachment ? [welcomePayload.attachment] : [], components: welcomePayload.components })
					.then(() => { welcomeSent = true; })
					.catch(() => {});
			}
		}

		if (data.dmEnabled && typeof interaction.user?.send === "function") {
			await interaction.user
				.send({ content: welcomePayload.text, embeds: [welcomePayload.embed], files: welcomePayload.attachment ? [welcomePayload.attachment] : [] })
				.then(() => {
					welcomeDmSent = true;
				})
				.catch(() => {});
		}

		for (const channelId of goodbyePayload.channelIds) {
			const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
			if (channel?.isTextBased()) {
				await channel.send({ content: goodbyePayload.text, embeds: [goodbyePayload.embed], files: goodbyePayload.attachment ? [goodbyePayload.attachment] : [] })
					.then(() => { goodbyeSent = true; })
					.catch(() => {});
			}
		}

		const statusLines = [
			`📢 **Welcome Channel:** ${welcomePayload.channelIds.length ? (welcomeSent ? "✅ Sent successfully" : "❌ Failed to send") : "⏸️ Not configured"}`,
			`📥 **Welcome DM:** ${data.dmEnabled ? (welcomeDmSent ? "✅ Sent successfully" : "❌ Failed (DMs blocked?)") : "⏸️ Disabled"}`,
			`🚪 **Goodbye Channel:** ${goodbyePayload.channelIds.length ? (goodbyeSent ? "✅ Sent successfully" : "❌ Failed to send") : "⏸️ Not configured"}`,
		];

		return interaction.editReply({ content: `🧪 **Test Simulations Completed!**\n\n${statusLines.join("\n")}` });
	}
}

async function handleRole(interaction, ctx, guildId, data, subcommand) {
	if (subcommand === "role") {
		const role = interaction.options.getRole("role");
		const channel = interaction.options.getChannel("channel");

		let entry = data.roleMessages.find((e) => e.roleId === role.id);
		if (!entry) {
			if (!channel) return interaction.reply({ content: `❌ No existing welcome override found for ${role}.`, ephemeral: true });
			entry = { roleId: role.id, text: "", channelId: "" };
			data.roleMessages.push(entry);
		}
		
		if (!channel) {
			// Remove channel override. If text is also empty, remove entry entirely.
			entry.channelId = "";
			if (!entry.text) {
				data.roleMessages = data.roleMessages.filter(e => e.roleId !== role.id);
			}
			await save(ctx, guildId, data);
			return interaction.reply({ content: `✅ Welcome channel override removed for ${role}.`, ephemeral: true });
		}

		entry.channelId = channel.id;
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Welcome channel for ${role} set to ${channel}.`, ephemeral: true });
	}

	if (subcommand === "role-message") {
		const role = interaction.options.getRole("role");
		const message = interaction.options.getString("text");

		let entry = data.roleMessages.find((e) => e.roleId === role.id);
		if (!entry) {
			entry = { roleId: role.id, text: "", channelId: "" };
			data.roleMessages.push(entry);
		}
		entry.text = message;

		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Welcome message override set for ${role}.`, ephemeral: true });
	}
}

// --- /welcome background -----------------------------------------------------

async function handleBackground(interaction, ctx, guildId, data, subcommand) {
	if (subcommand === "upload") {
		const attachment = interaction.options.getAttachment("image");
		if (!attachment) return interaction.reply({ content: "❌ No image provided.", ephemeral: true });
		if (attachment.contentType && !ALLOWED_BACKGROUND_TYPES.includes(attachment.contentType)) {
			return interaction.reply({ content: "❌ Unsupported file type. Use PNG, JPG, or GIF.", ephemeral: true });
		}
		if (data.backgrounds.length >= MAX_BACKGROUNDS) {
			return interaction.reply({ content: `❌ You already have ${MAX_BACKGROUNDS} backgrounds uploaded. Remove one first (\`/welcome background list\`).`, ephemeral: true });
		}

		const id = `bg-${Date.now().toString(36)}`;
		data.backgrounds.push({ id, url: attachment.url, uploadedBy: interaction.user.id });
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Background uploaded. Use \`/welcome background set ${id}\` to apply it.`, ephemeral: true });
	}

	if (subcommand === "default") {
		data.defaultBackground = null;
		await save(ctx, guildId, data);
		return interaction.reply({ content: "✅ Restored the default background.", ephemeral: true });
	}

	if (subcommand === "list") {
		if (data.backgrounds.length === 0) {
			return interaction.reply({ content: "No custom backgrounds uploaded yet.", ephemeral: true });
		}
		const lines = data.backgrounds.map((b) => `• \`${b.id}\` — uploaded by <@${b.uploadedBy}>`);
		return interaction.reply({ content: `**Uploaded backgrounds (${data.backgrounds.length}/${MAX_BACKGROUNDS}):**\n${lines.join("\n")}`, ephemeral: true });
	}

	if (subcommand === "presets") {
		const byCategory = new Map();
		for (const preset of listPresets()) {
			if (!byCategory.has(preset.category)) byCategory.set(preset.category, []);
			byCategory.get(preset.category).push(preset);
		}
		const lines = [...byCategory.entries()].map(([category, presets]) => `**${category}:** ${presets.map((p) => `\`${p.id}\` (${p.label})`).join(", ")}`);
		return interaction.reply({ content: `**Built-in presets:**\n${lines.join("\n")}`, ephemeral: true });
	}

	if (subcommand === "set") {
		const id = interaction.options.getString("id");
		const channel = interaction.options.getChannel("channel");
		const role = interaction.options.getRole("role");
		const isUploaded = data.backgrounds.some((b) => b.id === id);
		const isPreset = Boolean(getPreset(id));
		if (!isUploaded && !isPreset) {
			return interaction.reply({ content: `❌ Unknown background id \`${id}\`. Check \`/welcome background list\` or \`/welcome background presets\`.`, ephemeral: true });
		}

		if (channel) {
			data.channelBackgrounds[channel.id] = id;
			await save(ctx, guildId, data);
			return interaction.reply({ content: `✅ Background \`${id}\` set for channel ${channel}.`, ephemeral: true });
		}

		if (role) {
			data.roleBackgrounds[role.id] = id;
			await save(ctx, guildId, data);
			return interaction.reply({ content: `✅ Background \`${id}\` set for ${role}.`, ephemeral: true });
		}

		data.defaultBackground = id;
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Server default background set to \`${id}\`.`, ephemeral: true });
	}
}

// --- /welcome social ----------------------------------------------------------

async function handleSocial(interaction, ctx, guildId, data, platform) {
	const value = interaction.options.getString("url") || "";
	data.social[platform] = value;
	await save(ctx, guildId, data);
	return interaction.reply({ content: value ? `✅ ${SOCIAL_META[platform].label} link set.` : `✅ ${SOCIAL_META[platform].label} link cleared.`, ephemeral: true });
}

// --- /welcome button ----------------------------------------------------------

async function handleButton(interaction, ctx, guildId, data, subcommand) {
	if (subcommand === "add") {
		const label = interaction.options.getString("label");
		const url = interaction.options.getString("url");
		const role = interaction.options.getRole("role");
		
		if (!url && !role) {
			return interaction.reply({ content: `❌ You must provide either a URL (for a link button) or a Role (for a role button).`, ephemeral: true });
		}

		if (data.buttons.some((b) => b.label === label)) {
			return interaction.reply({ content: `❌ A button labeled "${label}" already exists.`, ephemeral: true });
		}
		if (data.buttons.length >= 25) {
			return interaction.reply({ content: "❌ Maximum of 25 buttons reached.", ephemeral: true });
		}

		if (url) {
			data.buttons.push({ label, url, type: "link", roleId: "" });
		} else {
			data.buttons.push({ label, url: "", type: "role", roleId: role.id });
		}

		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Button "${label}" added.`, ephemeral: true });
	}

	if (subcommand === "remove") {
		const label = interaction.options.getString("label");
		const before = data.buttons.length;
		data.buttons = data.buttons.filter((b) => b.label !== label);
		await save(ctx, guildId, data);
		return interaction.reply({ content: before === data.buttons.length ? `❌ No button labeled "${label}" found.` : `✅ Button "${label}" removed.`, ephemeral: true });
	}

	if (subcommand === "list") {
		if (data.buttons.length === 0) {
			return interaction.reply({ content: "No buttons configured.", ephemeral: true });
		}
		const lines = data.buttons.map((b) => (b.type === "role" ? `• 🎭 "${b.label}" → <@&${b.roleId}>` : `• 🔗 "${b.label}" → ${b.url}`));
		return interaction.reply({ content: `**Welcome buttons:**\n${lines.join("\n")}`, ephemeral: true });
	}
}

// --- /welcome embed ----------------------------------------------------------

async function handleEmbed(interaction, ctx, guildId, data, subcommand) {
	if (subcommand === "embed-color") {
		const hex = interaction.options.getString("hex");
		if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
			return interaction.reply({ content: "❌ Invalid hex color. Example: `#FF69B4`.", ephemeral: true });
		}
		data.embed.color = hex.startsWith("#") ? hex : `#${hex}`;
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Embed color set to \`${data.embed.color}\`.`, ephemeral: true });
	}

	if (subcommand === "embed-title") {
		data.embed.title = interaction.options.getString("text");
		await save(ctx, guildId, data);
		return interaction.reply({ content: "✅ Embed title updated.", ephemeral: true });
	}

	if (subcommand === "embed-description") {
		data.embed.description = interaction.options.getString("text");
		await save(ctx, guildId, data);
		return interaction.reply({ content: "✅ Embed description updated.", ephemeral: true });
	}

	if (subcommand === "embed-footer") {
		data.embed.footer = interaction.options.getString("text");
		await save(ctx, guildId, data);
		return interaction.reply({ content: "✅ Embed footer updated.", ephemeral: true });
	}

	if (subcommand === "embed-thumbnail") {
		data.embed.thumbnail = interaction.options.getString("source");
		await save(ctx, guildId, data);
		return interaction.reply({ content: `✅ Embed thumbnail set to \`${data.embed.thumbnail}\`.`, ephemeral: true });
	}
}

// --- /welcome stats ----------------------------------------------------------

async function handleStats(interaction, data) {
	const period = interaction.options.getString("period");
	if (period === "today") {
		const today = new Date().toISOString().slice(0, 10);
		const count = data.stats.today && data.stats.today.date === today ? data.stats.today.count : 0;
		return interaction.reply({ content: `📊 Welcomes today: **${count}**`, ephemeral: true });
	}

	const since = data.stats.since ? `<t:${Math.floor(new Date(data.stats.since).getTime() / 1000)}:D>` : "N/A";
	return interaction.reply({
		content: `📊 **Welcome Stats**\n👋 Total welcomes: **${data.stats.welcomeCount}**\n🚪 Total goodbyes: **${data.stats.goodbyeCount}**\n📅 Active since: ${since}`,
		ephemeral: true,
	});
}
