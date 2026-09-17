// Run with: npm test  (or) node test/local-harness.js
//
// Loads the plugin against a bot-faithful mock ctx (test/mock-ctx.js), then
// exercises each registered command with a fake interaction.

const assert = require("node:assert");
const { load } = require("../index.js");
const { createMockCtx } = require("./mock-ctx");

// Minimal fake interaction. Add the option getters / fields your command reads.
function fakeInteraction(options = {}) {
	const replies = [];
	const testUser = {
		id: "test-user-id",
		username: "testuser",
		send: async (payload) => {
			replies.push({ type: "dm", payload });
			return payload;
		},
	};

	return {
		guildId: options._guildId ?? "test-guild-id",
		user: testUser,
		// `_member` overrides the whole member object — pass null to emulate the
		// isolated worker, which can hand the handler no member at all.
		member: "_member" in options ? options._member : {
			id: "test-member-id",
			user: {
				id: "test-member-id",
				username: "testusername",
				displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
			},
			guild: {
				name: "Test Guild",
				memberCount: 42,
				iconURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
				roles: { cache: options._guildRoles ?? new Map() },
			},
			roles: { cache: options._memberRoles ?? new Map() },
			permissions: {
				has: () => true, // Always has permissions for testing
			},
		},
		guild: {
			name: "Test Guild",
			memberCount: 42,
			iconURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
			channels: {
				fetch: async (id) => ({
					id,
					isTextBased: () => true,
					send: async (payload) => {
						replies.push({ type: "channel", channelId: id, payload });
						return payload;
					},
				}),
			},
			roles: {
				fetch: async (id) => (options._guildRoles?.has(id) ? options._guildRoles.get(id) : null),
			},
		},
		options: {
			getString: (name) => options[name] ?? null,
			getInteger: (name) => options[name] ?? null,
			getUser: (name) => options[name] ?? null,
			getChannel: (name) => options[name] ?? null,
			getRole: (name) => options[name] ?? null,
			getAttachment: (name) => options[name] ?? null,
			getSubcommand: () => options._subcommand ?? null,
			getSubcommandGroup: () => options._group ?? null,
		},
		reply: async (payload) => {
			replies.push({ type: "reply", payload });
			return payload;
		},
		deferReply: async () => {
			replies.push({ type: "defer" });
		},
		editReply: async (payload) => {
			replies.push({ type: "editReply", payload });
			return payload;
		},
		replies,
	};
}

// A member exactly as the isolated worker hands it to execute(): the core
// serializes `{ id, user, guildId, nickname, roles: [ids] }` — no permissions
// object, and `roles` is a plain array rather than a discord.js RoleManager.
function workerMember(roleIds = []) {
	return {
		id: "test-member-id",
		user: { id: "test-member-id", tag: "testuser#0001", username: "testusername" },
		guildId: "test-guild-id",
		nickname: null,
		roles: roleIds,
	};
}

async function main() {
	const { ctx, registeredCommands, registeredEvents, emitEvent, models } = createMockCtx({
		pluginName: "adb-plugin-welcome",
	});

	// Load the plugin
	await load(ctx);

	// 1. Verify commands and events registered
	assert.ok(registeredCommands.has("welcome"), "expected /welcome to be registered");
	assert.ok(registeredEvents.has("guildMemberAdd"), "expected guildMemberAdd event to be registered");
	assert.ok(registeredEvents.has("guildMemberRemove"), "expected guildMemberRemove event to be registered");

	const welcomeCommand = registeredCommands.get("welcome");

	const getContent = (payload) => typeof payload === "string" ? payload : (payload?.content || "");

	// 2. Test /welcome channel [#channel]
	const mockChannel = { id: "123456789", isTextBased: () => true, toString: () => "<#123456789>" };
	const intChannel = fakeInteraction({ _subcommand: "channel", channel: mockChannel });
	await welcomeCommand.execute(intChannel);
	assert.ok(
		intChannel.replies.some((r) => r.payload && getContent(r.payload).includes("123456789")),
		"expected reply indicating welcome channel was set",
	);

	// 3. Test /welcome message <text>
	const intMessage = fakeInteraction({ _subcommand: "message", text: "Welcome {user} to {server}!" });
	await welcomeCommand.execute(intMessage);
	assert.ok(
		intMessage.replies.some((r) => r.payload && getContent(r.payload).includes("Welcome {user} to {server}!")),
		"expected reply confirming message update",
	);

	// 4. Test /welcome goodbye-channel [#channel]
	const intGoodbyeChannel = fakeInteraction({ _subcommand: "goodbye-channel", channel: mockChannel });
	await welcomeCommand.execute(intGoodbyeChannel);
	assert.ok(
		intGoodbyeChannel.replies.some((r) => r.payload && getContent(r.payload).includes("123456789")),
		"expected reply indicating goodbye channel was set",
	);

	// 5. Test /welcome goodbye-message <text>
	const intGoodbyeMessage = fakeInteraction({ _subcommand: "goodbye-message", text: "Goodbye {username}!" });
	await welcomeCommand.execute(intGoodbyeMessage);
	assert.ok(
		intGoodbyeMessage.replies.some((r) => r.payload && getContent(r.payload).includes("Goodbye {username}!")),
		"expected reply confirming goodbye message update",
	);

	// 6. Test /welcome dm on
	const intDm = fakeInteraction({ _subcommand: "dm", status: "on" });
	await welcomeCommand.execute(intDm);
	assert.ok(
		intDm.replies.some((r) => r.payload && getContent(r.payload).includes("ON")),
		"expected reply indicating DMs are ON",
	);

	// 7. Test /welcome card on
	const intCard = fakeInteraction({ _subcommand: "card", status: "on" });
	await welcomeCommand.execute(intCard);
	assert.ok(
		intCard.replies.some((r) => r.payload && getContent(r.payload).includes("ON")),
		"expected reply indicating card is ON",
	);

	// 8. Test /welcome preview
	const intPreview = fakeInteraction({ _subcommand: "preview" });
	await welcomeCommand.execute(intPreview);
	assert.ok(
		intPreview.replies.some((r) => r.type === "editReply" && r.payload && r.payload.embeds),
		"expected preview to return embeds",
	);

	// 9. Test /welcome test
	const intTest = fakeInteraction({ _subcommand: "test" });
	await welcomeCommand.execute(intTest);
	assert.ok(
		intTest.replies.some((r) => r.type === "editReply" && r.payload && r.payload.content.includes("Simulations")),
		"expected test simulation report in reply",
	);

	// 10. Test real event triggers (guildMemberAdd / guildMemberRemove)
	// We'll simulate a mock member object
	const mockMember = {
		id: "member-456",
		user: {
			id: "member-456",
			tag: "NewUser#0001",
			username: "NewUser",
			displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
		},
		guild: {
			id: "test-guild-id",
			name: "Test Guild",
			memberCount: 43,
			iconURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
			channels: {
				fetch: async (id) => ({
					id,
					isTextBased: () => true,
					send: async (payload) => {
						mockMember._sentPayloads.push({ type: "channel", channelId: id, payload });
						return payload;
					},
				}),
			},
		},
		send: async (payload) => {
			mockMember._sentPayloads.push({ type: "dm", payload });
			return payload;
		},
		_sentPayloads: [],
	};

	// Emit guildMemberAdd
	await emitEvent("guildMemberAdd", mockMember);

	assert.ok(
		mockMember._sentPayloads.some((p) => p.type === "channel" && p.channelId === "123456789"),
		"expected welcome message to be sent to channel",
	);
	assert.ok(
		mockMember._sentPayloads.some((p) => p.type === "dm"),
		"expected welcome message to be sent to member DM",
	);

	// Join history doc created by guildMemberAdd
	const JoinHistoryModel = models.get("plugin_adb-plugin-welcome_joinHistory");
	assert.ok(JoinHistoryModel, "expected joinHistory model to be defined");

	const historyQuery = { guildId: "test-guild-id", userId: "member-456" };
	let history = await JoinHistoryModel.findOne(historyQuery);
	assert.ok(history, "expected join history doc after guildMemberAdd");
	assert.ok(history.joinedAt instanceof Date, "expected joinedAt to be set");
	assert.strictEqual(history.leftAt, null, "expected leftAt to be null after join");
	assert.strictEqual(history.welcomed, true, "expected welcomed to be true after welcome message sent");

	// Reset payloads
	mockMember._sentPayloads = [];

	// Emit guildMemberRemove
	await emitEvent("guildMemberRemove", mockMember);

	assert.ok(
		mockMember._sentPayloads.some((p) => p.type === "channel" && p.channelId === "123456789"),
		"expected goodbye message to be sent to channel",
	);

	// 11. /welcome embed-color / -title / etc
	const mockRole = { id: "role-1", name: "New Member", position: 5 };
	const guildRoles = new Map([["role-1", mockRole]]);

	const intColor = fakeInteraction({ _subcommand: "embed-color", hex: "#ABCDEF" });
	await welcomeCommand.execute(intColor);
	assert.ok(intColor.replies.some((r) => getContent(r.payload).includes("#ABCDEF")), "expected embed color to be accepted");

	const intBadColor = fakeInteraction({ _subcommand: "embed-color", hex: "not-a-color" });
	await welcomeCommand.execute(intBadColor);
	assert.ok(intBadColor.replies.some((r) => getContent(r.payload).includes("Invalid hex")), "expected invalid hex to be rejected");

	const intTitle = fakeInteraction({ _subcommand: "embed-title", text: "Hey {user}!" });
	await welcomeCommand.execute(intTitle);
	assert.ok(intTitle.replies.some((r) => getContent(r.payload).includes("title updated")), "expected embed title update");

	// 12. /welcome social <platform>
	const intSocial = fakeInteraction({ _subcommand: "github", _group: "social", url: "https://github.com/example" });
	await welcomeCommand.execute(intSocial);
	assert.ok(intSocial.replies.some((r) => getContent(r.payload).includes("GitHub")), "expected social link confirmation");

	// 13. /welcome button add / list / remove
	const intButtonLink = fakeInteraction({ _subcommand: "add", _group: "button", label: "Rules", url: "https://example.com/rules" });
	await welcomeCommand.execute(intButtonLink);
	assert.ok(intButtonLink.replies.some((r) => getContent(r.payload).includes("added")), "expected link button to be added");

	const intButtonRole = fakeInteraction({ _subcommand: "add", _group: "button", label: "Get Member Role", role: mockRole });
	await welcomeCommand.execute(intButtonRole);
	assert.ok(intButtonRole.replies.some((r) => getContent(r.payload).includes("added")), "expected role button to be added");

	const intButtonList = fakeInteraction({ _subcommand: "list", _group: "button" });
	await welcomeCommand.execute(intButtonList);
	assert.ok(intButtonList.replies.some((r) => getContent(r.payload).includes("Rules") && getContent(r.payload).includes("Get Member Role")), "expected both buttons to be listed");

	const intButtonRemove = fakeInteraction({ _subcommand: "remove", _group: "button", label: "Rules" });
	await welcomeCommand.execute(intButtonRemove);
	assert.ok(intButtonRemove.replies.some((r) => getContent(r.payload).includes("removed")), "expected button to be removed");

	// 14. /welcome background presets / upload / set
	const intPresets = fakeInteraction({ _subcommand: "presets", _group: "background" });
	await welcomeCommand.execute(intPresets);
	assert.ok(intPresets.replies.some((r) => getContent(r.payload).includes("gradient-1")), "expected preset list to include built-in presets");

	const intUpload = fakeInteraction({
		_subcommand: "upload",
		_group: "background",
		image: { url: "https://cdn.discordapp.com/attachments/1/2/bg.png", contentType: "image/png" },
	});
	await welcomeCommand.execute(intUpload);
	assert.ok(intUpload.replies.some((r) => getContent(r.payload).includes("Background uploaded")), "expected background upload confirmation");

	const intBgList = fakeInteraction({ _subcommand: "list", _group: "background" });
	await welcomeCommand.execute(intBgList);
	assert.ok(intBgList.replies.some((r) => getContent(r.payload).includes("1/10")), "expected uploaded background to be listed");

	const intBgSet = fakeInteraction({ _subcommand: "set", _group: "background", id: "gradient-3" });
	await welcomeCommand.execute(intBgSet);
	assert.ok(intBgSet.replies.some((r) => getContent(r.payload).includes("gradient-3")), "expected default background to be set");

	// 15. /welcome role
	const intRoleSet = fakeInteraction({
		_subcommand: "role",
		role: mockRole,
		channel: { id: "role-channel-1", isTextBased: () => true, toString: () => "<#role-channel-1>" },
	});
	await welcomeCommand.execute(intRoleSet);
	assert.ok(intRoleSet.replies.some((r) => getContent(r.payload).includes("set to")), "expected role override to be saved");

	const intRoleMsg = fakeInteraction({
		_subcommand: "role-message",
		role: mockRole,
		text: "Welcome VIP {user}!",
	});
	await welcomeCommand.execute(intRoleMsg);
	assert.ok(intRoleMsg.replies.some((r) => getContent(r.payload).includes("set")), "expected role message override to be saved");

	// A member with that role should be routed to the role-specific channel with the role-specific text.
	const roleMember = {
		id: "member-789",
		user: { id: "member-789", tag: "VipUser#0001", username: "VipUser", displayAvatarURL: () => "https://cdn.discordapp.com/embed/avatars/0.png" },
		guild: {
			id: "test-guild-id",
			name: "Test Guild",
			memberCount: 44,
			iconURL: () => "https://cdn.discordapp.com/embed/avatars/0.png",
			roles: { cache: guildRoles },
			channels: {
				fetch: async (id) => ({
					id,
					isTextBased: () => true,
					send: async (payload) => {
						roleMember._sentPayloads.push({ type: "channel", channelId: id, payload });
						return payload;
					},
				}),
			},
		},
		roles: { cache: new Map([["role-1", mockRole]]) },
		send: async () => {},
		_sentPayloads: [],
	};
	await emitEvent("guildMemberAdd", roleMember);
	assert.ok(
		roleMember._sentPayloads.some((p) => p.channelId === "role-channel-1" && getContent(p.payload).includes("Welcome VIP")),
		"expected role-based welcome message to be routed to the role's channel",
	);

	const intRoleRemove = fakeInteraction({ _subcommand: "role", role: mockRole });
	await welcomeCommand.execute(intRoleRemove);
	assert.ok(intRoleRemove.replies.some((r) => getContent(r.payload).includes("removed")), "expected role override to be removed");

	// 16. /welcome stats
	const intStats = fakeInteraction({ _subcommand: "stats" });
	await welcomeCommand.execute(intStats);
	assert.ok(intStats.replies.some((r) => getContent(r.payload).includes("Total welcomes")), "expected stats overview");

	const intStatsToday = fakeInteraction({ _subcommand: "stats", period: "today" });
	await welcomeCommand.execute(intStatsToday);
	assert.ok(intStatsToday.replies.some((r) => getContent(r.payload).includes("Welcomes today")), "expected today stats");

	// 17. /welcome-channel add / remove / list
	const welcomeChannelCommand = registeredCommands.get("welcome-channel");
	assert.ok(welcomeChannelCommand, "expected /welcome-channel to be registered");

	const intWcAdd = fakeInteraction({
		_subcommand: "add",
		type: "rules",
		channel: { id: "rules-channel-1", isTextBased: () => true, toString: () => "<#rules-channel-1>" },
	});
	await welcomeChannelCommand.execute(intWcAdd, ctx);
	assert.ok(intWcAdd.replies.some((r) => getContent(r.payload).includes("rules")), "expected rules channel binding confirmation");

	const intWcList = fakeInteraction({ _subcommand: "list" });
	await welcomeChannelCommand.execute(intWcList, ctx);
	assert.ok(intWcList.replies.some((r) => getContent(r.payload).includes("rules-channel-1")), "expected rules channel to show in bindings list");

	const intWcRemove = fakeInteraction({ _subcommand: "remove", type: "rules" });
	await welcomeChannelCommand.execute(intWcRemove, ctx);
	assert.ok(intWcRemove.replies.some((r) => getContent(r.payload).includes("removed")), "expected rules channel binding to be removed");

	// 18. Role button click assigns a role (interactionCreate)
	const { ROLE_BUTTON_PREFIX } = require("../lib/message-builder");
	let addedRole = null;
	const buttonInteraction = {
		isButton: () => true,
		customId: `${ROLE_BUTTON_PREFIX}role-1`,
		guild: { roles: { fetch: async (id) => (id === "role-1" ? mockRole : null) } },
		member: {
			roles: {
				cache: new Map(),
				add: async (role) => {
					addedRole = role;
				},
			},
		},
		reply: async (payload) => {
			buttonInteraction._replies.push(payload);
			return payload;
		},
		_replies: [],
	};
	await emitEvent("interactionCreate", buttonInteraction);
	assert.strictEqual(addedRole, mockRole, "expected clicking a role button to assign the role");
	assert.ok(buttonInteraction._replies.some((p) => getContent(p).includes("New Member")), "expected role-assignment confirmation reply");

	// Join history doc updated by guildMemberRemove
	history = await JoinHistoryModel.findOne(historyQuery);
	assert.ok(history.leftAt instanceof Date, "expected leftAt to be set after guildMemberRemove");

	// Rejoin updates the existing doc (leftAt reset)
	await emitEvent("guildMemberAdd", mockMember);
	history = await JoinHistoryModel.findOne(historyQuery);
	assert.strictEqual(history.leftAt, null, "expected leftAt to be reset to null on rejoin");
	assert.strictEqual(
		await JoinHistoryModel.countDocuments(historyQuery),
		1,
		"expected a single join history doc per member",
	);

	// 19. Isolated-worker interactions: the core serializes `member` without a
	// permissions object and with `roles` as a plain array (or omits the member
	// entirely). None of these may throw "Cannot read properties of undefined".
	const rejected = (r) => r.payload && getContent(r.payload).includes("Manage Server");

	// (a) worker-shaped member — roles array, no permissions object
	const intWorker = fakeInteraction({ _subcommand: "message", text: "hi", _member: workerMember(["role-1"]) });
	await welcomeCommand.execute(intWorker);
	assert.ok(intWorker.replies.length > 0, "expected a reply for a worker-shaped member");
	assert.ok(!rejected(intWorker.replies[0]), "worker-shaped member should be treated as authorized (permissions unavailable)");

	// (b) worker-shaped member with no roles at all
	const intWorkerNoRoles = fakeInteraction({ _subcommand: "message", text: "hi", _member: workerMember() });
	await welcomeCommand.execute(intWorkerNoRoles);
	assert.ok(intWorkerNoRoles.replies.length > 0, "expected a reply for a worker-shaped member with no roles");

	// (c) no member object at all — must degrade to a clear ephemeral error, not throw
	const intNoMember = fakeInteraction({ _subcommand: "message", text: "hi", _member: null });
	await welcomeCommand.execute(intNoMember);
	assert.ok(
		intNoMember.replies.some((r) => getContent(r.payload).includes("couldn't resolve")),
		"expected a clear error reply when the member is missing",
	);

	const welcomeChannelCmd = registeredCommands.get("welcome-channel");
	const intWcNoMember = fakeInteraction({ _subcommand: "list", _member: null });
	await welcomeChannelCmd.execute(intWcNoMember, ctx);
	assert.ok(
		intWcNoMember.replies.some((r) => getContent(r.payload).includes("couldn't resolve")),
		"expected /welcome-channel to reject a missing member too",
	);

	// (d) role-button click with a worker-shaped member (roles array, no .cache)
	let workerAddedRole = null;
	const workerButtonInteraction = {
		isButton: () => true,
		customId: `${ROLE_BUTTON_PREFIX}role-1`,
		guild: { roles: { fetch: async (id) => (id === "role-1" ? mockRole : null) } },
		member: {
			roles: {
				add: async (role) => {
					workerAddedRole = role;
				},
			},
		},
		reply: async (payload) => {
			workerButtonInteraction._replies.push(payload);
			return payload;
		},
		_replies: [],
	};
	await emitEvent("interactionCreate", workerButtonInteraction);
	assert.strictEqual(workerAddedRole, mockRole, "expected role button to work without a roles cache");
	assert.ok(workerButtonInteraction._replies.some((p) => getContent(p).includes("New Member")), "expected role-assignment confirmation");

	// (e) role button when the member cannot be resolved at all
	const noMemberButtonInteraction = {
		isButton: () => true,
		customId: `${ROLE_BUTTON_PREFIX}role-1`,
		guild: { roles: { fetch: async (id) => (id === "role-1" ? mockRole : null) } },
		member: null,
		user: { id: "test-user-id" },
		reply: async (payload) => {
			noMemberButtonInteraction._replies.push(payload);
			return payload;
		},
		_replies: [],
	};
	await emitEvent("interactionCreate", noMemberButtonInteraction);
	assert.ok(
		noMemberButtonInteraction._replies.some((p) => getContent(p).includes("❌")),
		"expected a clear error reply when the member is missing on a role button",
	);

	console.log("OK: all local-harness checks passed");
}

main().catch((error) => {
	console.error("Local harness failed:", error);
	process.exit(1);
});
