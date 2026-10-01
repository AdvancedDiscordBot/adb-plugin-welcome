/**
 * Helpers for reading the invoking member off an interaction.
 *
 * The raw-client contract supplies Discord.js members. Incomplete/serialized
 * members may lack permissions and cannot authorize configuration writes.
 * Missing members are fetched from the guild when that API is available.
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

/** Configuration writes require a verified Manage Server permission. */
function canManageGuild(member, flag) {
	if (!member) return false;
	return hasPermission(member, flag) === true;
}

module.exports = { resolveMember, hasPermission, canManageGuild };
