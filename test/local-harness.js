// Run with: npm test  (or) node test/local-harness.js
//
// Loads the plugin against a bot-faithful mock ctx (test/mock-ctx.js), then
// exercises each registered command with a fake interaction.

const assert = require("node:assert");
const { ButtonInteraction, Client } = require("discord.js");
// Keep real canvas rendering but replace remote image I/O with a local image.
const canvas = require("@napi-rs/canvas");
const image = canvas.createCanvas(2, 2).toBuffer("image/png");
const loadImage = canvas.loadImage;
canvas.loadImage = () => loadImage(image);
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
				id: options._guildId ?? "test-guild-id",
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
		guild: options._guild ?? {
			id: options._guildId ?? "test-guild-id",
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
			members: {
				fetchMe: async () => ({ permissions: { has: () => true }, roles: { highest: { position: 10 } } }),
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
	assert.strictEqual(require("../lib/config").formatText("", null), "", "empty templates need no member data");
	await ctx.db.updatePluginConfig("test-guild-id", "adb-plugin-welcome", { customSetting: { keep: true } });

	// 2. Test /welcome channel [#channel]
	const mockChannel = { id: "123456789", isTextBased: () => true, toString: () => "<#123456789>" };
	const intChannel = fakeInteraction({ _subcommand: "channel", channel: mockChannel });
	await welcomeCommand.execute(intChannel, ctx.client);
	assert.ok(
		intChannel.replies.some((r) => r.payload && getContent(r.payload).includes("123456789")),
		"expected reply indicating welcome channel was set",
	);
	assert.strictEqual((await ctx.db.getPluginConfig("test-guild-id", "adb-plugin-welcome")).data.welcomeChannelId, mockChannel.id);

	// 3. Test /welcome message <text>
	const intMessage = fakeInteraction({ _subcommand: "message", text: "Welcome {user} to {server}!" });
	await welcomeCommand.execute(intMessage, ctx.client);
	assert.ok(
		intMessage.replies.some((r) => r.payload && getContent(r.payload).includes("Welcome {user} to {server}!")),
		"expected reply confirming message update",
	);
	assert.strictEqual((await ctx.db.getPluginConfig("test-guild-id", "adb-plugin-welcome")).data.welcomeMessage, "Welcome {user} to {server}!");

	// 4. Test /welcome goodbye-channel [#channel]
	const intGoodbyeChannel = fakeInteraction({ _subcommand: "goodbye-channel", channel: mockChannel });
	await welcomeCommand.execute(intGoodbyeChannel, ctx.client);
	assert.ok(
		intGoodbyeChannel.replies.some((r) => r.payload && getContent(r.payload).includes("123456789")),
		"expected reply indicating goodbye channel was set",
	);

	// 5. Test /welcome goodbye-message <text>
	const intGoodbyeMessage = fakeInteraction({ _subcommand: "goodbye-message", text: "Goodbye {username}!" });
	await welcomeCommand.execute(intGoodbyeMessage, ctx.client);
	assert.ok(
		intGoodbyeMessage.replies.some((r) => r.payload && getContent(r.payload).includes("Goodbye {username}!")),
		"expected reply confirming goodbye message update",
	);

	// 6. Test /welcome dm on
	const intDm = fakeInteraction({ _subcommand: "dm", status: "on" });
	await welcomeCommand.execute(intDm, ctx.client);
	assert.ok(
		intDm.replies.some((r) => r.payload && getContent(r.payload).includes("ON")),
		"expected reply indicating DMs are ON",
	);

	// 7. Test /welcome card on
	const intCard = fakeInteraction({ _subcommand: "card", status: "on" });
	await welcomeCommand.execute(intCard, ctx.client);
	assert.ok(
		intCard.replies.some((r) => r.payload && getContent(r.payload).includes("ON")),
		"expected reply indicating card is ON",
	);

	// 8. Test /welcome preview
	const intPreview = fakeInteraction({ _subcommand: "preview" });
	await welcomeCommand.execute(intPreview, ctx.client);
	assert.ok(
		intPreview.replies.some((r) => r.type === "editReply" && r.payload && r.payload.embeds),
		"expected preview to return embeds",
	);
	const previewFiles = intPreview.replies.find((r) => r.type === "editReply").payload.files;
	assert.strictEqual(previewFiles.length, 2, "preview renders both welcome and goodbye image attachments");
	assert.ok(previewFiles.every((file) => Buffer.isBuffer(file.attachment)), "use real canvas rendering with offline image inputs");

	// 9. Test /welcome test
	const intTest = fakeInteraction({ _subcommand: "test" });
	await welcomeCommand.execute(intTest, ctx.client);
	assert.ok(
		intTest.replies.some((r) => r.type === "editReply" && r.payload && r.payload.content.includes("Simulations")),
		"expected test simulation report in reply",
	);
	const refusedTest = fakeInteraction({ _subcommand: "test", _guild: {
		channels: { fetch: async () => ({ isTextBased: () => true, send: async () => {
			throw Object.assign(new Error("Missing Permissions"), { code: 50013 });
		} }) },
	} });
	await welcomeCommand.execute(refusedTest, ctx.client);
	const refusedReport = refusedTest.replies.find((r) => r.type === "editReply").payload.content;
	assert.match(refusedReport, /Welcome Channel:.*Failed to send/, "test must not report a rejected welcome delivery as successful");
	assert.match(refusedReport, /Goodbye Channel:.*Failed to send/, "test must not report a rejected goodbye delivery as successful");

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
	await welcomeCommand.execute(intColor, ctx.client);
	assert.ok(intColor.replies.some((r) => getContent(r.payload).includes("#ABCDEF")), "expected embed color to be accepted");

	const intBadColor = fakeInteraction({ _subcommand: "embed-color", hex: "not-a-color" });
	await welcomeCommand.execute(intBadColor, ctx.client);
	assert.ok(intBadColor.replies.some((r) => getContent(r.payload).includes("Invalid hex")), "expected invalid hex to be rejected");

	const intTitle = fakeInteraction({ _subcommand: "embed-title", text: "Hey {user}!" });
	await welcomeCommand.execute(intTitle, ctx.client);
	assert.ok(intTitle.replies.some((r) => getContent(r.payload).includes("title updated")), "expected embed title update");

	// 12. /welcome social <platform>
	const intSocial = fakeInteraction({ _subcommand: "github", _group: "social", url: "https://github.com/example" });
	await welcomeCommand.execute(intSocial, ctx.client);
	assert.ok(intSocial.replies.some((r) => getContent(r.payload).includes("GitHub")), "expected social link confirmation");

	// 13. /welcome button add / list / remove
	const intButtonLink = fakeInteraction({ _subcommand: "add", _group: "button", label: "Rules", url: "https://example.com/rules" });
	await welcomeCommand.execute(intButtonLink, ctx.client);
	assert.ok(intButtonLink.replies.some((r) => getContent(r.payload).includes("added")), "expected link button to be added");

	const intButtonRole = fakeInteraction({ _subcommand: "add", _group: "button", label: "Get Member Role", role: mockRole });
	await welcomeCommand.execute(intButtonRole, ctx.client);
	assert.ok(intButtonRole.replies.some((r) => getContent(r.payload).includes("added")), "expected role button to be added");

	const intButtonList = fakeInteraction({ _subcommand: "list", _group: "button" });
	await welcomeCommand.execute(intButtonList, ctx.client);
	assert.ok(intButtonList.replies.some((r) => getContent(r.payload).includes("Rules") && getContent(r.payload).includes("Get Member Role")), "expected both buttons to be listed");

	const intButtonRemove = fakeInteraction({ _subcommand: "remove", _group: "button", label: "Rules" });
	await welcomeCommand.execute(intButtonRemove, ctx.client);
	assert.ok(intButtonRemove.replies.some((r) => getContent(r.payload).includes("removed")), "expected button to be removed");

	// 14. /welcome background presets / upload / set
	const intPresets = fakeInteraction({ _subcommand: "presets", _group: "background" });
	await welcomeCommand.execute(intPresets, ctx.client);
	assert.ok(intPresets.replies.some((r) => getContent(r.payload).includes("gradient-1")), "expected preset list to include built-in presets");

	const intUpload = fakeInteraction({
		_subcommand: "upload",
		_group: "background",
		image: { url: "https://cdn.discordapp.com/attachments/1/2/bg.png", contentType: "image/png" },
	});
	await welcomeCommand.execute(intUpload, ctx.client);
	assert.ok(intUpload.replies.some((r) => getContent(r.payload).includes("Background uploaded")), "expected background upload confirmation");

	const intBgList = fakeInteraction({ _subcommand: "list", _group: "background" });
	await welcomeCommand.execute(intBgList, ctx.client);
	assert.ok(intBgList.replies.some((r) => getContent(r.payload).includes("1/10")), "expected uploaded background to be listed");

	const intBgSet = fakeInteraction({ _subcommand: "set", _group: "background", id: "gradient-3" });
	await welcomeCommand.execute(intBgSet, ctx.client);
	assert.ok(intBgSet.replies.some((r) => getContent(r.payload).includes("gradient-3")), "expected default background to be set");

	// 15. /welcome role
	const intRoleSet = fakeInteraction({
		_subcommand: "role",
		role: mockRole,
		channel: { id: "role-channel-1", isTextBased: () => true, toString: () => "<#role-channel-1>" },
	});
	await welcomeCommand.execute(intRoleSet, ctx.client);
	assert.ok(intRoleSet.replies.some((r) => getContent(r.payload).includes("set to")), "expected role override to be saved");

	const intRoleMsg = fakeInteraction({
		_subcommand: "role-message",
		role: mockRole,
		text: "Welcome VIP {user}!",
	});
	await welcomeCommand.execute(intRoleMsg, ctx.client);
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
	await welcomeCommand.execute(intRoleRemove, ctx.client);
	assert.ok(intRoleRemove.replies.some((r) => getContent(r.payload).includes("removed")), "expected role override to be removed");

	// 16. /welcome stats
	const intStats = fakeInteraction({ _subcommand: "stats" });
	await welcomeCommand.execute(intStats, ctx.client);
	assert.ok(intStats.replies.some((r) => getContent(r.payload).includes("Total welcomes")), "expected stats overview");

	const intStatsToday = fakeInteraction({ _subcommand: "stats", period: "today" });
	await welcomeCommand.execute(intStatsToday, ctx.client);
	assert.ok(intStatsToday.replies.some((r) => getContent(r.payload).includes("Welcomes today")), "expected today stats");

	// 17. /welcome-channel add / remove / list
	const welcomeChannelCommand = registeredCommands.get("welcome-channel");
	assert.ok(welcomeChannelCommand, "expected /welcome-channel to be registered");

	const intWcAdd = fakeInteraction({
		_subcommand: "add",
		type: "rules",
		channel: { id: "rules-channel-1", isTextBased: () => true, toString: () => "<#rules-channel-1>" },
	});
	await welcomeChannelCommand.execute(intWcAdd, ctx.client);
	assert.ok(intWcAdd.replies.some((r) => getContent(r.payload).includes("rules")), "expected rules channel binding confirmation");

	const intWcList = fakeInteraction({ _subcommand: "list" });
	await welcomeChannelCommand.execute(intWcList, ctx.client);
	assert.ok(intWcList.replies.some((r) => getContent(r.payload).includes("rules-channel-1")), "expected rules channel to show in bindings list");

	const intWcRemove = fakeInteraction({ _subcommand: "remove", type: "rules" });
	await welcomeChannelCommand.execute(intWcRemove, ctx.client);
	assert.ok(intWcRemove.replies.some((r) => getContent(r.payload).includes("removed")), "expected rules channel binding to be removed");

	// 18. Role button click assigns a role (interactionCreate)
	const { ROLE_BUTTON_PREFIX } = require("../lib/message-builder");
	let addedRole = null;
	const buttonInteraction = {
		isButton: () => true,
		customId: `${ROLE_BUTTON_PREFIX}role-1`,
		guildId: "test-guild-id",
		guild: {
			id: "test-guild-id",
			roles: { fetch: async (id) => (id === "role-1" ? mockRole : null) },
			members: { fetchMe: async () => ({ permissions: { has: () => true }, roles: { highest: { position: 10 } } }) },
		},
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
	buttonInteraction.deferReply = async () => {};
	buttonInteraction.editReply = buttonInteraction.reply;
	await emitEvent("interactionCreate", buttonInteraction);
	assert.strictEqual(addedRole, mockRole, "expected clicking a role button to assign the role");
	assert.ok(buttonInteraction._replies.some((p) => getContent(p).includes("New Member")), "expected role-assignment confirmation reply");

	// A previously sent button stops granting a role once its config is removed.
	await welcomeCommand.execute(fakeInteraction({ _subcommand: "remove", _group: "button", label: "Get Member Role" }), ctx.client);
	addedRole = null;
	await emitEvent("interactionCreate", buttonInteraction);
	assert.strictEqual(addedRole, null, "a stale welcome button must not grant a removed role");
	await welcomeCommand.execute(intButtonRole, ctx.client);
	const fetchRole = buttonInteraction.guild.roles.fetch;
	for (const invalid of [
		{ id: "unconfigured", name: "Arbitrary", position: 1 },
		{ ...mockRole, managed: true },
		{ ...mockRole, position: 10 },
		{ ...mockRole, position: 11 },
		null,
	]) {
		addedRole = null;
		buttonInteraction.guild.roles.fetch = async () => invalid;
		await emitEvent("interactionCreate", { ...buttonInteraction, customId: `${ROLE_BUTTON_PREFIX}${invalid?.id || mockRole.id}` });
		assert.strictEqual(addedRole, null, "only current, assignable welcome roles may be granted");
	}
	buttonInteraction.guild.roles.fetch = fetchRole;
	addedRole = null;
	await emitEvent("interactionCreate", { ...buttonInteraction, guild: null, guildId: null });
	assert.strictEqual(addedRole, null, "DM role buttons must not grant roles");
	const fetchMe = buttonInteraction.guild.members.fetchMe;
	buttonInteraction.guild.members.fetchMe = async () => ({ permissions: { has: () => false }, roles: { highest: { position: 10 } } });
	await emitEvent("interactionCreate", buttonInteraction);
	assert.strictEqual(addedRole, null, "Manage Roles is required even when the role is below the bot");
	buttonInteraction.guild.members.fetchMe = fetchMe;
	buttonInteraction.member.roles.cache.set(mockRole.id, mockRole);
	await emitEvent("interactionCreate", buttonInteraction);
	assert.strictEqual(addedRole, null, "welcome role buttons must be idempotent");
	buttonInteraction.member.roles.cache.clear();

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

	// 19. Incomplete interactions must fail closed, not authorize config writes.
	const rejected = (r) => r.payload && getContent(r.payload).includes("Manage Server");
	const savedConfig = (await ctx.db.getPluginConfig("test-guild-id", "adb-plugin-welcome")).data;
	assert.deepStrictEqual(savedConfig.customSetting, { keep: true });
	assert.strictEqual(savedConfig.goodbyeChannelId, mockChannel.id);
	assert.strictEqual(savedConfig.goodbyeMessage, "Goodbye {username}!");
	assert.strictEqual(savedConfig.dmEnabled, true);
	assert.strictEqual(savedConfig.cardEnabled, true);
	assert.strictEqual(savedConfig.embed.color, "#ABCDEF");
	assert.strictEqual(savedConfig.social.github, "https://github.com/example");
	assert.strictEqual(savedConfig.defaultBackground, "gradient-3");
	assert.deepStrictEqual(savedConfig.buttons, [{ label: "Get Member Role", url: "", type: "role", roleId: mockRole.id }]);
	assert.deepStrictEqual(savedConfig.roleMessages, [{ roleId: mockRole.id, text: "Welcome VIP {user}!", channelId: "" }]);

	// (a) worker-shaped member — roles array, no permissions object
	const intWorker = fakeInteraction({ _subcommand: "message", text: "hi", _member: workerMember(["role-1"]) });
	await welcomeCommand.execute(intWorker, ctx.client);
	assert.ok(intWorker.replies.length > 0, "expected a reply for a worker-shaped member");
	assert.ok(rejected(intWorker.replies[0]), "missing permissions must not authorize configuration writes");

	// (b) worker-shaped member with no roles at all
	const intWorkerNoRoles = fakeInteraction({ _subcommand: "message", text: "hi", _member: workerMember() });
	await welcomeCommand.execute(intWorkerNoRoles, ctx.client);
	assert.ok(intWorkerNoRoles.replies.length > 0, "expected a reply for a worker-shaped member with no roles");
	assert.deepStrictEqual((await ctx.db.getPluginConfig("test-guild-id", "adb-plugin-welcome")).data, savedConfig);

	// (c) no member object at all — must degrade to a clear ephemeral error, not throw
	const intNoMember = fakeInteraction({ _subcommand: "message", text: "hi", _member: null });
	await welcomeCommand.execute(intNoMember, ctx.client);
	assert.ok(
		intNoMember.replies.some((r) => getContent(r.payload).includes("couldn't resolve")),
		"expected a clear error reply when the member is missing",
	);

	const welcomeChannelCmd = registeredCommands.get("welcome-channel");
	const intWcNoMember = fakeInteraction({ _subcommand: "list", _member: null });
	await welcomeChannelCmd.execute(intWcNoMember, ctx.client);
	assert.ok(
		intWcNoMember.replies.some((r) => getContent(r.payload).includes("couldn't resolve")),
		"expected /welcome-channel to reject a missing member too",
	);

	// (d) role-button click with a worker-shaped member (roles array, no .cache)
	let workerAddedRole = null;
	const workerButtonInteraction = {
		isButton: () => true,
		customId: `${ROLE_BUTTON_PREFIX}role-1`,
		guildId: buttonInteraction.guildId,
		guild: buttonInteraction.guild,
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
	workerButtonInteraction.deferReply = async () => {};
	workerButtonInteraction.editReply = workerButtonInteraction.reply;
	await emitEvent("interactionCreate", workerButtonInteraction);
	assert.strictEqual(workerAddedRole, mockRole, "expected role button to work without a roles cache");
	assert.ok(workerButtonInteraction._replies.some((p) => getContent(p).includes("New Member")), "expected role-assignment confirmation");

	// (e) role button when the member cannot be resolved at all
	const noMemberButtonInteraction = {
		isButton: () => true,
		customId: `${ROLE_BUTTON_PREFIX}role-1`,
		guildId: buttonInteraction.guildId,
		guild: buttonInteraction.guild,
		member: null,
		user: { id: "test-user-id" },
		reply: async (payload) => {
			noMemberButtonInteraction._replies.push(payload);
			return payload;
		},
		_replies: [],
	};
	noMemberButtonInteraction.deferReply = async () => {};
	noMemberButtonInteraction.editReply = noMemberButtonInteraction.reply;
	await emitEvent("interactionCreate", noMemberButtonInteraction);
	assert.ok(
		noMemberButtonInteraction._replies.some((p) => getContent(p).includes("❌")),
		"expected a clear error reply when the member is missing on a role button",
	);

	console.log("Testing configured onboarding from registered commands through member events");
	const runOnboarding = async (name, options) => {
		const interaction = fakeInteraction({ _guildId: "onboarding-guild", ...options });
		await registeredCommands.get(name).execute(interaction, ctx.client);
		return interaction;
	};
	await runOnboarding("welcome", { _subcommand: "message", text: "Welcome {user}! Read {rulesChannel}." });
	await runOnboarding("welcome", { _subcommand: "dm", status: "on" });
	await runOnboarding("welcome", { _group: "button", _subcommand: "add", label: "Verify", role: mockRole });
	await runOnboarding("welcome", { _group: "button", _subcommand: "add", label: "Site", url: "https://example.com" });
	for (const [type, id] of [["welcome", "welcome-1"], ["welcome", "welcome-2"], ["rules", "rules"], ["verify", "verify"], ["goodbye", "goodbye"]]) {
		await runOnboarding("welcome-channel", { _subcommand: "add", type, channel: { id, isTextBased: () => true } });
	}
	let onboardingConfig = (await ctx.db.getPluginConfig("onboarding-guild", "adb-plugin-welcome")).data;
	assert.deepStrictEqual(onboardingConfig.channels, { welcome: ["welcome-1", "welcome-2"], rules: "rules", verify: "verify", goodbye: "goodbye" });
	const deliveries = [];
	const onboardingMember = {
		...mockMember,
		id: "onboarding-user",
		user: { ...mockMember.user, id: "onboarding-user" },
		guild: {
			...mockMember.guild,
			id: "onboarding-guild",
			memberCount: 50,
			channels: {
				fetch: async (id) => ({
					isTextBased: () => true,
					send: async (payload) => { deliveries.push({ channelId: id, payload }); return payload; },
				}),
			},
		},
		send: async (payload) => { deliveries.push({ channelId: "dm", payload }); },
	};
	await emitEvent("guildMemberAdd", onboardingMember);
	assert.deepStrictEqual(deliveries.map((d) => d.channelId), ["welcome-1", "welcome-2", "rules", "verify", "dm"]);
	assert.ok(deliveries[0].payload.content.includes("<@onboarding-user>! Read <#rules>"), "onboarding text uses the configured rules channel");
	assert.ok(deliveries[0].payload.content.includes("50th member"));
	assert.strictEqual(deliveries[0].payload.embeds[0].data.description, "Welcome <@onboarding-user>! Read <#rules>.");
	assert.strictEqual(deliveries[0].payload.components[0].components.length, 2, "welcome messages retain link and role buttons");
	const verifyButtons = deliveries[3].payload.components.flatMap((row) => row.toJSON().components);
	assert.deepStrictEqual(verifyButtons.map((button) => button.custom_id), [`${ROLE_BUTTON_PREFIX}role-1`], "verification contains only role buttons");
	assert.strictEqual(deliveries[4].payload.components, undefined, "DMs must not expose guild role buttons");
	onboardingConfig = (await ctx.db.getPluginConfig("onboarding-guild", "adb-plugin-welcome")).data;
	assert.strictEqual(onboardingConfig.stats.welcomeCount, 1);
	assert.strictEqual(onboardingConfig.stats.today.count, 1);
	assert.strictEqual(onboardingConfig.stats.lastMilestone, 50);
	const onboardingQuery = { guildId: "onboarding-guild", userId: "onboarding-user" };
	assert.strictEqual((await JoinHistoryModel.findOne(onboardingQuery)).welcomed, true);
	deliveries.length = 0;
	await emitEvent("guildMemberRemove", onboardingMember);
	assert.deepStrictEqual(deliveries.map((d) => d.channelId), ["goodbye"]);
	assert.ok((await JoinHistoryModel.findOne(onboardingQuery)).leftAt instanceof Date);
	assert.strictEqual((await ctx.db.getPluginConfig("onboarding-guild", "adb-plugin-welcome")).data.stats.goodbyeCount, 1);

	for (const type of ["welcome", "rules", "verify", "goodbye"]) {
		await runOnboarding("welcome-channel", { _subcommand: "remove", type });
	}
	await runOnboarding("welcome", { _subcommand: "dm", status: "off" });
	deliveries.length = 0;
	await emitEvent("guildMemberAdd", onboardingMember);
	assert.strictEqual(deliveries.length, 0, "cleared onboarding bindings must stop sends");
	const rejoin = await JoinHistoryModel.findOne(onboardingQuery);
	assert.strictEqual(rejoin.leftAt, null);
	assert.strictEqual(rejoin.welcomed, false, "a previous successful welcome must not mark an unwelcomed rejoin");

	console.log("Testing welcome buttons across Discord's initial response deadline");
	const client = new Client({ intents: [] });
	const callbacks = [];
	const edits = [];
	let elapsed = 0;
	client.rest.post = async (route, { body }) => {
		if (elapsed >= 3000) throw Object.assign(new Error("Unknown interaction"), { code: 10062 });
		callbacks.push(body);
		return {};
	};
	const buttonGuild = client.guilds._add({ id: buttonInteraction.guildId, name: "Boundary guild", roles: [] });
	buttonGuild.roles.fetch = buttonInteraction.guild.roles.fetch;
	buttonGuild.members.fetchMe = buttonInteraction.guild.members.fetchMe;
	buttonGuild.members.fetch = async () => buttonInteraction.member;
	const slowButton = new ButtonInteraction(client, {
		id: "100000000000000001", application_id: "100000000000000002", token: "offline", type: 3,
		guild_id: buttonInteraction.guildId, user: { id: "100000000000000003", username: "member", discriminator: "0" },
		data: { component_type: 2, custom_id: `${ROLE_BUTTON_PREFIX}role-1` }, entitlements: [],
		message: { id: "100000000000000004", channel_id: "100000000000000005", guild_id: buttonInteraction.guildId },
	});
	slowButton.webhook.editMessage = async (id, payload) => { edits.push(payload); return payload; };
	const getConfig = ctx.db.getPluginConfig;
	ctx.db.getPluginConfig = async (...args) => { elapsed += 4000; return getConfig(...args); };
	try {
		await emitEvent("interactionCreate", slowButton);
		assert.strictEqual(callbacks.length, 1, "slow role assignment must acknowledge before the initial token expires");
		assert.strictEqual(callbacks[0].type, 5);
		assert.strictEqual(callbacks[0].data.flags, 64);
		assert.strictEqual(edits.length, 1);
		assert.match(edits[0].content, /given.*role/);
	} finally {
		ctx.db.getPluginConfig = getConfig;
		client.destroy();
	}

	const manifest = require("../plugin.json");
	assert.deepStrictEqual(manifest.capabilities.system, ["raw-client"]);
	assert.deepStrictEqual(manifest.permissions.system, manifest.capabilities.system);
	assert.strictEqual(manifest.process.model, "persistent");
	assert.match(manifest.process.persistentReason, /raw-client/);
	assert.strictEqual(manifest.permissions.nativeAddons, true);
	console.log("OK: all local-harness checks passed");
}

main().catch((error) => {
	console.error("Local harness failed:", error);
	process.exit(1);
});
