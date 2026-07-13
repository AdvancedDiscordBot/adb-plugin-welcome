const { AttachmentBuilder, EmbedBuilder } = require("discord.js");
const welcomeCommand = require("./commands/welcome");
const { generateWelcomeCard } = require("./lib/card");

/**
 * Every ADB plugin exports a single `load(ctx)` function. `ctx` is frozen
 * and namespaced to this plugin.
 */
async function load(ctx) {
	// --- Register slash command -----------------------------------------
	ctx.registerCommand({
		data: welcomeCommand.data,
		execute: (interaction) => welcomeCommand.execute(interaction, ctx),
	});

	// --- Listen to guildMemberAdd event -------------------------------------
	ctx.registerEvent("guildMemberAdd", async (member, client) => {
		try {
			const config = await ctx.db.getPluginConfig(member.guild.id, "adb-plugin-welcome");
			if (!config || !config.data) return;

			const data = config.data;
			const welcomeChannelId = data.welcomeChannelId;
			const welcomeText = data.welcomeMessage || "Welcome to the server, {user}! You are member #{memberCount}.";
			const cardEnabled = data.cardEnabled;
			const dmEnabled = data.dmEnabled;

			if (!welcomeChannelId && !dmEnabled) return;

			const formattedWelcome = welcomeCommand.formatWelcomeText(welcomeText, member);
			const welcomeEmbed = new EmbedBuilder()
				.setColor(0x5865f2)
				.setTitle(`Welcome to ${member.guild.name}!`)
				.setDescription(formattedWelcome)
				.setTimestamp();

			let welcomeAttachment;
			if (cardEnabled) {
				const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
				const serverIconUrl = member.guild.iconURL({ extension: "png", size: 128 });
				const welcomeBuffer = await generateWelcomeCard({
					avatarUrl,
					username: member.user.username,
					serverIconUrl,
					serverName: member.guild.name,
					memberCount: member.guild.memberCount,
					isWelcome: true,
				}).catch((err) => {
					ctx.logger.error("Failed to generate welcome card image", err);
					return null;
				});

				if (welcomeBuffer) {
					welcomeAttachment = new AttachmentBuilder(welcomeBuffer, { name: "welcome.png" });
					welcomeEmbed.setImage("attachment://welcome.png");
				}
			}

			// Send to welcome channel
			if (welcomeChannelId) {
				const welcomeChannel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
				if (welcomeChannel?.isTextBased()) {
					const sendPayload = {
						content: formattedWelcome,
						embeds: [welcomeEmbed],
					};
					if (welcomeAttachment) {
						sendPayload.files = [welcomeAttachment];
					}
					await welcomeChannel.send(sendPayload).catch((err) => {
						ctx.logger.error(`Failed to send welcome message to channel ${welcomeChannelId}`, err);
					});
				}
			}

			// Send to DM
			if (dmEnabled) {
				let dmAttachment;
				if (cardEnabled) {
					const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
					const serverIconUrl = member.guild.iconURL({ extension: "png", size: 128 });
					const welcomeBuffer = await generateWelcomeCard({
						avatarUrl,
						username: member.user.username,
						serverIconUrl,
						serverName: member.guild.name,
						memberCount: member.guild.memberCount,
						isWelcome: true,
					}).catch(() => null);

					if (welcomeBuffer) {
						dmAttachment = new AttachmentBuilder(welcomeBuffer, { name: "welcome-dm.png" });
						welcomeEmbed.setImage("attachment://welcome-dm.png");
					}
				}

				await member
					.send({
						content: formattedWelcome,
						embeds: [welcomeEmbed],
						files: dmAttachment ? [dmAttachment] : [],
					})
					.catch((err) => {
						ctx.logger.error(`Failed to send welcome DM to user ${member.user.tag}`, err);
					});
			}
		} catch (err) {
			ctx.logger.error("Error in guildMemberAdd event handler:", err);
		}
	});

	// --- Listen to guildMemberRemove event ----------------------------------
	ctx.registerEvent("guildMemberRemove", async (member, client) => {
		try {
			const config = await ctx.db.getPluginConfig(member.guild.id, "adb-plugin-welcome");
			if (!config || !config.data) return;

			const data = config.data;
			const goodbyeChannelId = data.goodbyeChannelId;
			const goodbyeText = data.goodbyeMessage || "Goodbye {username}! We will miss you.";
			const cardEnabled = data.cardEnabled;

			if (!goodbyeChannelId) return;

			const formattedGoodbye = welcomeCommand.formatWelcomeText(goodbyeText, member);
			const goodbyeEmbed = new EmbedBuilder()
				.setColor(0xed4245)
				.setTitle(`Goodbye from ${member.guild.name}!`)
				.setDescription(formattedGoodbye)
				.setTimestamp();

			let goodbyeAttachment;
			if (cardEnabled) {
				const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
				const serverIconUrl = member.guild.iconURL({ extension: "png", size: 128 });
				const goodbyeBuffer = await generateWelcomeCard({
					avatarUrl,
					username: member.user.username,
					serverIconUrl,
					serverName: member.guild.name,
					memberCount: member.guild.memberCount,
					isWelcome: false,
				}).catch((err) => {
					ctx.logger.error("Failed to generate goodbye card image", err);
					return null;
				});

				if (goodbyeBuffer) {
					goodbyeAttachment = new AttachmentBuilder(goodbyeBuffer, { name: "goodbye.png" });
					goodbyeEmbed.setImage("attachment://goodbye.png");
				}
			}

			const goodbyeChannel = await member.guild.channels.fetch(goodbyeChannelId).catch(() => null);
			if (goodbyeChannel?.isTextBased()) {
				const sendPayload = {
					content: formattedGoodbye,
					embeds: [goodbyeEmbed],
				};
				if (goodbyeAttachment) {
					sendPayload.files = [goodbyeAttachment];
				}
				await goodbyeChannel.send(sendPayload).catch((err) => {
					ctx.logger.error(`Failed to send goodbye message to channel ${goodbyeChannelId}`, err);
				});
			}
		} catch (err) {
			ctx.logger.error("Error in guildMemberRemove event handler:", err);
		}
	});

	ctx.logger.info("Welcome plugin loaded successfully");
}

module.exports = { load };
