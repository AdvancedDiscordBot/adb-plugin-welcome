const DEFAULT_WELCOME_MESSAGE = "Welcome to the server, {user}! You are member #{memberCount}.";
const DEFAULT_GOODBYE_MESSAGE = "Goodbye {username}! We will miss you.";

function defaultConfig() {
	return {
		welcomeChannelId: null,
		welcomeMessage: DEFAULT_WELCOME_MESSAGE,
		goodbyeChannelId: null,
		goodbyeMessage: DEFAULT_GOODBYE_MESSAGE,
		dmEnabled: false,
		cardEnabled: false,
		channels: { welcome: [], goodbye: null, rules: null, verify: null },
		roleMessages: [],
		backgrounds: [],
		defaultBackground: null,
		roleBackgrounds: {},
		channelBackgrounds: {},
		social: { discord: "", youtube: "", twitter: "", website: "", github: "", twitch: "" },
		buttons: [],
		embed: { color: "#5865F2", title: "Welcome, {user}!", description: "", footer: "", thumbnail: "user" },
		stats: { welcomeCount: 0, goodbyeCount: 0, since: null, lastMilestone: 0, today: { date: null, count: 0 } },
	};
}

/** Fills in any fields missing from a stored config with defaults, without touching what's already set. */
function normalizeConfig(data) {
	const defaults = defaultConfig();
	const merged = { ...defaults, ...data };
	merged.channels = { ...defaults.channels, ...(data.channels || {}) };
	merged.social = { ...defaults.social, ...(data.social || {}) };
	merged.embed = { ...defaults.embed, ...(data.embed || {}) };
	merged.stats = { ...defaults.stats, ...(data.stats || {}) };
	merged.roleMessages = Array.isArray(data.roleMessages) ? data.roleMessages : [];
	merged.backgrounds = Array.isArray(data.backgrounds) ? data.backgrounds : [];
	merged.roleBackgrounds = data.roleBackgrounds && typeof data.roleBackgrounds === "object" ? data.roleBackgrounds : {};
	merged.channelBackgrounds = data.channelBackgrounds && typeof data.channelBackgrounds === "object" ? data.channelBackgrounds : {};
	merged.buttons = Array.isArray(data.buttons) ? data.buttons : [];
	if (!Array.isArray(merged.channels.welcome)) {
		merged.channels.welcome = merged.channels.welcome ? [merged.channels.welcome] : [];
	}
	return merged;
}

function formatText(text, member) {
	if (!text) return "";
	const guild = member.guild;
	const rulesChannelId = member._rulesChannelId;
	const rulesMention = rulesChannelId ? `<#${rulesChannelId}>` : "the rules channel";
	return text
		.replace(/{user\.name}/g, member.user.username)
		.replace(/{user}/g, `<@${member.id}>`)
		.replace(/{username}/g, member.user.username)
		.replace(/{server}/g, guild.name)
		.replace(/{guild}/g, guild.name)
		.replace(/{memberCount}/g, guild.memberCount)
		.replace(/{rulesChannel}/g, rulesMention);
}

/**
 * Returns the role IDs a member has. Handles all three shapes seen in practice:
 * a discord.js RoleManager, a plain array of ids (isolated-worker payloads), and
 * a missing member/roles entirely.
 */
function memberRoleIds(member) {
	if (!member || !member.roles) return [];
	if (Array.isArray(member.roles)) return member.roles;
	if (member.roles.cache) return [...member.roles.cache.keys()];
	return [];
}

/** Returns the position of a role in the guild's hierarchy (higher = more senior), or -1 if unknown. */
function rolePosition(guild, roleId) {
	const role = guild?.roles?.cache?.get?.(roleId);
	return role ? role.position : -1;
}

/**
 * Picks the highest-hierarchy role-specific entry whose roleId the member has.
 * `entries` is an array of objects each carrying a `roleId` field (roleMessages, etc).
 */
function pickByHighestRole(entries, member) {
	const memberRoles = new Set(memberRoleIds(member));
	const matches = (entries || []).filter((e) => e.roleId && memberRoles.has(e.roleId));
	if (matches.length === 0) return null;
	const guild = member?.guild;
	matches.sort((a, b) => rolePosition(guild, b.roleId) - rolePosition(guild, a.roleId));
	return matches[0];
}

function resolveRoleMessage(config, member) {
	return pickByHighestRole(config.roleMessages, member);
}

/** Resolves which background to use for a member's card: channel override > role override > server default > none (gradient). */
function resolveBackgroundId(config, member, channelId) {
	if (channelId && config.channelBackgrounds?.[channelId]) {
		return config.channelBackgrounds[channelId];
	}
	const memberRoles = new Set(memberRoleIds(member));
	const guild = member?.guild;
	const overrideEntries = Object.entries(config.roleBackgrounds || {})
		.filter(([roleId]) => memberRoles.has(roleId))
		.sort(([a], [b]) => rolePosition(guild, b) - rolePosition(guild, a));
	if (overrideEntries.length > 0) return overrideEntries[0][1];
	return config.defaultBackground || null;
}

const MILESTONES = [1, 10, 25, 50, 100, 250, 500, 750, 1000];

function isMilestone(memberCount) {
	if (MILESTONES.includes(memberCount)) return true;
	if (memberCount > 1000 && memberCount % 1000 === 0) return true;
	return false;
}

module.exports = {
	DEFAULT_WELCOME_MESSAGE,
	DEFAULT_GOODBYE_MESSAGE,
	defaultConfig,
	normalizeConfig,
	formatText,
	memberRoleIds,
	rolePosition,
	pickByHighestRole,
	resolveRoleMessage,
	resolveBackgroundId,
	isMilestone,
};
