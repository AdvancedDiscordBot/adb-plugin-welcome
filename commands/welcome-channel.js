const { PermissionFlagsBits } = require("discord.js");
const { normalizeConfig } = require("../lib/config");
const { resolveMember, canManageGuild } = require("../lib/member");

const CHANNEL_TYPES = ["welcome", "goodbye", "rules", "verify"];

module.exports = {
	data: {
		name: "welcome-channel",
		description: "Bind welcome, goodbye, rules, and verify channels for the onboarding flow",
		options: [
			{
				name: "add",
				description: "Bind a channel to a step in the onboarding flow",
				type: 1,
				options: [
					{ name: "type", description: "Which step this channel is for", type: 3, required: true, choices: CHANNEL_TYPES.map((t) => ({ name: t, value: t })) },
					{ name: "channel", description: "The channel to bind", type: 7, required: true },
				],
			},
			{
				name: "remove",
				description: "Remove a channel binding",
				type: 1,
				options: [{ name: "type", description: "Which step to unbind", type: 3, required: true, choices: CHANNEL_TYPES.map((t) => ({ name: t, value: t })) }],
			},
			{ name: "list", description: "List current channel bindings", type: 1 },
		],
		toJSON() {
			return this;
		},
	},

	async execute(interaction, ctx) {
		const member = await resolveMember(interaction);
		if (!member) {
			return interaction.reply({ content: "❌ I couldn't resolve your server membership. Please try again in the server.", ephemeral: true });
		}
		if (!canManageGuild(member, PermissionFlagsBits.ManageGuild)) {
			return interaction.reply({ content: "❌ You need the **Manage Server** permission to use this command.", ephemeral: true });
		}

		const guildId = interaction.guildId;
		const config = await ctx.db.getPluginConfig(guildId, "adb-plugin-welcome");
		const data = normalizeConfig(config.data || {});
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === "add") {
			const type = interaction.options.getString("type");
			const channel = interaction.options.getChannel("channel");
			if (!channel.isTextBased()) {
				return interaction.reply({ content: "❌ Selected channel must be a text-based channel.", ephemeral: true });
			}

			if (type === "welcome") {
				if (!data.channels.welcome.includes(channel.id)) data.channels.welcome.push(channel.id);
			} else {
				data.channels[type] = channel.id;
			}

			await ctx.db.updatePluginConfig(guildId, "adb-plugin-welcome", data);
			return interaction.reply({ content: `✅ **${type}** channel bound to ${channel}.`, ephemeral: true });
		}

		if (subcommand === "remove") {
			const type = interaction.options.getString("type");
			if (type === "welcome") {
				data.channels.welcome = [];
			} else {
				data.channels[type] = null;
			}
			await ctx.db.updatePluginConfig(guildId, "adb-plugin-welcome", data);
			return interaction.reply({ content: `✅ **${type}** channel binding removed.`, ephemeral: true });
		}

		if (subcommand === "list") {
			const lines = [
				`📢 **welcome:** ${data.channels.welcome.length ? data.channels.welcome.map((id) => `<#${id}>`).join(", ") : "not set"}`,
				`🚪 **goodbye:** ${data.channels.goodbye ? `<#${data.channels.goodbye}>` : "not set"}`,
				`📜 **rules:** ${data.channels.rules ? `<#${data.channels.rules}>` : "not set"}`,
				`✅ **verify:** ${data.channels.verify ? `<#${data.channels.verify}>` : "not set"}`,
			];
			return interaction.reply({ content: `**Channel bindings:**\n${lines.join("\n")}`, ephemeral: true });
		}
	},
};
