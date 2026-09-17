/**
 * Helpers for reading the invoking member off an interaction.
 *
 * In isolated (worker) mode the core serializes `member` down to
 * `{ id, user, guildId, nickname, roles: [ids] }` — there is no
 * `permissions` object and `roles` is a plain array, not a RoleManager.
 * The member may also be missing entirely. Every member read on a command
 * path goes through here so no call site has to know that.
 */

/** Resolves the invoking member, falling back to a guild fetch when the interaction carried none. */
async function resolveMember(interaction) {
	if (interaction?.member) return interaction.member;
	const guild = interaction?.guild;
	const userId = interaction?.user?.id;
	if (!guild?.members?.fetch || !userId) return null;
	return guild.members.fetch(userId).catch(() => null);
}

/**
 * Whether the member holds `flag`.
 * Returns `true`/`false` when permissions are readable, or `null` when they
 * aren't (isolated mode) — callers decide how to treat "unknown".
 */
function hasPermission(member, flag) {
	const permissions = member?.permissions;
	if (!permissions || typeof permissions.has !== "function") return null;
	return permissions.has(flag);
}

/** Whether the member may run a Manage Server command. Unknown permissions are allowed through. */
function canManageGuild(member, flag) {
	if (!member) return false;
	return hasPermission(member, flag) !== false;
}

module.exports = { resolveMember, hasPermission, canManageGuild };
