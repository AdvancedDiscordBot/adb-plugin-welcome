const { Schema } = require("mongoose");

// Per-member join/leave record for the member-scope /me/join-history page.
// Written on every guildMemberAdd/Remove regardless of welcome config, so
// members always have visibility of their own history.
module.exports = new Schema({
	guildId: { type: String, required: true, index: true },
	userId: { type: String, required: true, index: true },
	joinedAt: { type: Date, required: true },
	leftAt: { type: Date, default: null },
	welcomed: { type: Boolean, default: false },
});
