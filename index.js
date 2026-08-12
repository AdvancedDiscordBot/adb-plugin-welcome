const welcomeCommand = require("./commands/welcome");
const welcomeChannelCommand = require("./commands/welcome-channel");
const { normalizeConfig, isMilestone } = require("./lib/config");
const { buildEventPayload, buildButtonRows, ROLE_BUTTON_PREFIX } = require("./lib/message-builder");

async function loadConfig(ctx, guildId) {
	const config = await ctx.db.getPluginConfig(guildId, "adb-plugin-welcome");
	return { config, data: normalizeConfig(config.data || {}) };
}

function recordStat(data, kind) {
	const today = new Date().toISOString().slice(0, 10);
	if (kind === "welcome") {
		data.stats.welcomeCount += 1;
		if (!data.stats.since) data.stats.since = new Date().toISOString();
		if (data.stats.today?.date === today) {
			data.stats.today.count += 1;
		} else {
			data.stats.today = { date: today, count: 1 };
		}
	} else {
		data.stats.goodbyeCount += 1;
	}
}

/**
 * Every ADB plugin exports a single `load(ctx)` function. `ctx` is frozen
 * and namespaced to this plugin.
 */
async function load(ctx) {
	ctx.registerCommand({ data: welcomeCommand.data, execute: (interaction) => welcomeCommand.execute(interaction, ctx) });
	ctx.registerCommand({ data: welcomeChannelCommand.data, execute: (interaction) => welcomeChannelCommand.execute(interaction, ctx) });

	// --- Listen to guildMemberAdd event -------------------------------------
	ctx.registerEvent("guildMemberAdd", async (member, client) => {
		try {
			const { data } = await loadConfig(ctx, member.guild.id);
			const hasAnyDestination =
				data.welcomeChannelId ||
				data.channels.welcome.length > 0 ||
				data.dmEnabled ||
				data.channels.rules ||
				data.channels.verify ||
				data.roleMessages.some((e) => e.channelId);
			if (!hasAnyDestination) return;

			const basePayload = await buildEventPayload(data, member, true);
			let milestoneHit = isMilestone(member.guild.memberCount);
			if (milestoneHit) {
				data.stats.lastMilestone = member.guild.memberCount;
			}

			// 1. Welcome channel(s)
			for (const channelId of basePayload.channelIds) {
				const channel = await member.guild.channels.fetch(channelId).catch(() => null);
				if (!channel?.isTextBased()) continue;
				
				const payload = await buildEventPayload(data, member, true, channelId);
				if (milestoneHit) {
					payload.text = `${payload.text}\n\n🎉 **You are the ${member.guild.memberCount}${ordinalSuffix(member.guild.memberCount)} member!** 🎉`;
				}

				const sendPayload = { content: payload.text, embeds: [payload.embed], components: payload.components };
				if (payload.attachment) sendPayload.files = [payload.attachment];
				await channel.send(sendPayload).catch((err) => ctx.logger.error(`Failed to send welcome message to channel ${channelId}`, err));
			}

			// 2. Rules channel auto-link
			if (data.channels.rules) {
				const rulesChannel = await member.guild.channels.fetch(data.channels.rules).catch(() => null);
				if (rulesChannel?.isTextBased()) {
					await rulesChannel
						.send(`👋 <@${member.id}>, welcome! Please take a moment to read through the rules here.`)
						.catch((err) => ctx.logger.error("Failed to send rules link message", err));
				}
			}

			// 3. Verification step
			if (data.channels.verify) {
				const verifyChannel = await member.guild.channels.fetch(data.channels.verify).catch(() => null);
				if (verifyChannel?.isTextBased()) {
					const verifyComponents = buildButtonRows(data.buttons.filter((b) => b.type === "role"));
					await verifyChannel
						.send({
							content: `✅ <@${member.id}>, click a button below to verify and get your role.`,
							components: verifyComponents.length ? verifyComponents : undefined,
						})
						.catch((err) => ctx.logger.error("Failed to send verify message", err));
				}
			}

			// 4. DM
			if (data.dmEnabled) {
				const dmPayload = await buildEventPayload(data, member, true, "dm");
				if (milestoneHit) {
					dmPayload.text = `${dmPayload.text}\n\n🎉 **You are the ${member.guild.memberCount}${ordinalSuffix(member.guild.memberCount)} member!** 🎉`;
				}
				const dmSendPayload = { content: dmPayload.text, embeds: [dmPayload.embed] };
				if (dmPayload.attachment) dmSendPayload.files = [dmPayload.attachment];
				await member.send(dmSendPayload).catch((err) => ctx.logger.error(`Failed to send welcome DM to user ${member.user.tag}`, err));
			}

			recordStat(data, "welcome");
			await ctx.db.updatePluginConfig(member.guild.id, "adb-plugin-welcome", data);
		} catch (err) {
			ctx.logger.error("Error in guildMemberAdd event handler:", err);
		}
	});

	// --- Listen to guildMemberRemove event ----------------------------------
	ctx.registerEvent("guildMemberRemove", async (member, client) => {
		try {
			const { data } = await loadConfig(ctx, member.guild.id);
			if (!data.goodbyeChannelId && !data.channels.goodbye) return;

			const payload = await buildEventPayload(data, member, false);
			for (const channelId of payload.channelIds) {
				const channel = await member.guild.channels.fetch(channelId).catch(() => null);
				if (!channel?.isTextBased()) continue;
				const sendPayload = { content: payload.text, embeds: [payload.embed] };
				if (payload.attachment) sendPayload.files = [payload.attachment];
				await channel.send(sendPayload).catch((err) => ctx.logger.error(`Failed to send goodbye message to channel ${channelId}`, err));
			}

			recordStat(data, "goodbye");
			await ctx.db.updatePluginConfig(member.guild.id, "adb-plugin-welcome", data);
		} catch (err) {
			ctx.logger.error("Error in guildMemberRemove event handler:", err);
		}
	});

	// --- Role buttons (onboarding + verify) ---------------------------------
	ctx.registerEvent("interactionCreate", async (interaction) => {
		if (!interaction.isButton?.() || !interaction.customId?.startsWith(ROLE_BUTTON_PREFIX)) return;
		try {
			const roleId = interaction.customId.slice(ROLE_BUTTON_PREFIX.length);
			const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
			if (!role) {
				return interaction.reply({ content: "❌ That role no longer exists.", ephemeral: true });
			}
			if (interaction.member.roles.cache.has(roleId)) {
				return interaction.reply({ content: `You already have **${role.name}**.`, ephemeral: true });
			}
			await interaction.member.roles.add(role);
			return interaction.reply({ content: `✅ You've been given the **${role.name}** role!`, ephemeral: true });
		} catch (err) {
			ctx.logger.error("Failed to assign role from welcome button", err);
			return interaction
				.reply({ content: "❌ I couldn't assign that role. Check my permissions and role position.", ephemeral: true })
				.catch(() => {});
		}
	});

	ctx.logger.info("Welcome plugin loaded successfully");
}

function ordinalSuffix(n) {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return s[(v - 20) % 10] || s[v] || s[0];
}

module.exports = { load };
