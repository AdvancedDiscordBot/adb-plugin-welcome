const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { generateWelcomeCard } = require("./card");
const { formatText, resolveRoleMessage, resolveBackgroundId } = require("./config");
const { SOCIAL_ORDER, SOCIAL_META } = require("./social");

const ROLE_BUTTON_PREFIX = "adb-welcome-role:";

/** Picks the welcome text + destination channel ids, honoring role-based overrides. */
function resolveWelcome(config, member) {
	const roleMatch = resolveRoleMessage(config, member);
	const text = roleMatch?.text || config.welcomeMessage;
	const channelIds = roleMatch?.channelId
		? [roleMatch.channelId]
		: config.channels.welcome.length > 0
			? config.channels.welcome
			: config.welcomeChannelId
				? [config.welcomeChannelId]
				: [];
	return { text, channelIds };
}

function resolveGoodbye(config, member) {
	const text = config.goodbyeMessage;
	const channelId = config.channels.goodbye || config.goodbyeChannelId || null;
	return { text, channelIds: channelId ? [channelId] : [] };
}

function resolveBackground(config, member, channelId) {
	const id = resolveBackgroundId(config, member, channelId);
	if (!id) return { presetId: null, backgroundUrl: null };
	const uploaded = (config.backgrounds || []).find((b) => b.id === id);
	if (uploaded) return { presetId: null, backgroundUrl: uploaded.url };
	return { presetId: id, backgroundUrl: null };
}

async function buildCardAttachment(config, member, isWelcome, channelId) {
	if (!config.cardEnabled) return null;
	const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
	const serverIconUrl = member.guild.iconURL({ extension: "png", size: 128 });
	const { presetId, backgroundUrl } = resolveBackground(config, member, channelId);

	try {
		const buffer = await generateWelcomeCard({
			avatarUrl,
			username: member.user.username,
			serverIconUrl,
			serverName: member.guild.name,
			memberCount: member.guild.memberCount,
			isWelcome,
			backgroundUrl,
			presetId,
			accentColor: config.embed.color,
			social: config.social,
		});
		const name = isWelcome ? "welcome.png" : "goodbye.png";
		return new AttachmentBuilder(buffer, { name });
	} catch {
		return null;
	}
}

function resolveThumbnail(config, member) {
	if (config.embed.thumbnail === "server") return member.guild.iconURL({ extension: "png", size: 256 }) || null;
	if (config.embed.thumbnail === "none") return null;
	return member.user.displayAvatarURL({ extension: "png", size: 256 });
}

function buildEmbed(config, member, { text, isWelcome }) {
	const color = config.embed.color || (isWelcome ? "#5865F2" : "#ED4245");
	const title = isWelcome
		? formatText(config.embed.title || "Welcome, {user}!", member)
		: `Goodbye from ${member.guild.name}!`;

	const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(text).setTimestamp();

	if (config.embed.footer) {
		embed.setFooter({ text: formatText(config.embed.footer, member) });
	} else if (isWelcome) {
		embed.setFooter({ text: `Member #${member.guild.memberCount}` });
	}

	if (config.embed.description && isWelcome) {
		embed.setDescription(`${text}\n\n${formatText(config.embed.description, member)}`);
	}

	const thumbnail = resolveThumbnail(config, member);
	if (thumbnail) embed.setThumbnail(thumbnail);

	return embed;
}

/** Splits configured buttons into ActionRows (max 5 buttons per row, max 5 rows). */
function buildButtonRows(buttons) {
	const list = (buttons || []).slice(0, 25);
	if (list.length === 0) return [];
	const rows = [];
	for (let i = 0; i < list.length; i += 5) {
		const row = new ActionRowBuilder();
		for (const button of list.slice(i, i + 5)) {
			if (button.type === "role") {
				row.addComponents(
					new ButtonBuilder()
						.setCustomId(`${ROLE_BUTTON_PREFIX}${button.roleId}`)
						.setLabel(button.label)
						.setStyle(ButtonStyle.Secondary),
				);
			} else {
				row.addComponents(new ButtonBuilder().setLabel(button.label).setURL(button.url).setStyle(ButtonStyle.Link));
			}
		}
		rows.push(row);
	}
	return rows;
}

function buildSocialRows(social) {
	const active = SOCIAL_ORDER.filter(platform => social?.[platform]);
	if (active.length === 0) return [];
	
	const rows = [];
	for (let i = 0; i < active.length; i += 5) {
		const row = new ActionRowBuilder();
		for (const platform of active.slice(i, i + 5)) {
			const meta = SOCIAL_META[platform];
			const url = social[platform];
			row.addComponents(new ButtonBuilder().setEmoji(meta.emoji).setLabel(meta.label).setURL(url).setStyle(ButtonStyle.Link));
		}
		rows.push(row);
	}
	return rows;
}

/** Builds the full embed + card + button payload for a welcome or goodbye event. */
async function buildEventPayload(config, member, isWelcome, targetChannelId = null) {
	const { text, channelIds } = isWelcome ? resolveWelcome(config, member) : resolveGoodbye(config, member);
	const formatted = formatText(text, member);
	const embed = buildEmbed(config, member, { text: formatted, isWelcome });
	const attachment = await buildCardAttachment(config, member, isWelcome, targetChannelId || channelIds[0]);
	if (attachment) embed.setImage(`attachment://${attachment.name}`);
	const components = isWelcome ? [...buildButtonRows(config.buttons), ...buildSocialRows(config.social)].slice(0, 5) : [];

	return { text: formatted, embed, attachment, components, channelIds };
}

module.exports = {
	ROLE_BUTTON_PREFIX,
	resolveWelcome,
	resolveGoodbye,
	resolveBackground,
	buildCardAttachment,
	buildEmbed,
	buildButtonRows,
	buildEventPayload,
};
