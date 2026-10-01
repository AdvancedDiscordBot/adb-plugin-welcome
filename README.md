# Welcome & Goodbye Plugin for Advanced Discord Bot (ADB)

A highly customizable and premium welcome and goodbye plugin for [Advanced Discord Bot](https://github.com/AdvancedDiscordBot/Advanced-Discord-Bot). Displays beautifully styled cards, text embeds, and custom messages to welcome new members and farewell departing ones.

## Features

- **Welcome Messages:** Send custom welcome messages to a designated text channel.
- **Goodbye Messages:** Send custom goodbye messages to a designated text channel.
- **Direct Messages (DMs):** Direct message new members upon joining.
- **Image Cards:** Dynamically generate high-fidelity, modern welcome/goodbye image cards with:
  - User's avatar with gradient border and outer glow.
  - Custom uploaded backgrounds, 25 built-in presets (gradients, patterns, gaming, nature), or the original linear gradient.
  - Server icon and name in a clean header.
  - Username and member count with ordinal suffixes (e.g. 1st, 2nd, 3rd, 102nd member).
  - Social link footer bar (Discord, YouTube, X/Twitter, website, GitHub, Twitch).
- **Role-Based Routing:** Different welcome channels/messages per role — the highest-ranked matching role wins.
- **Multi-Channel Onboarding:** Bind separate channels for welcome, goodbye, rules (auto-link), and verification.
- **Interactive Buttons:** Link buttons (rules, website, socials) and role buttons (click to self-assign a role) on the welcome message.
- **Embed Customization:** Accent color, title, description, footer, and thumbnail source.
- **Stats & Milestones:** Track total/lifetime welcomes and goodbyes, and auto-announce member-count milestones.
- **Interactive Configuration:** Simple slash commands to set up the plugin.
- **Preview & Test Commands:** Instantly view changes and simulate real events before public deployment.

## Installation

Within your ADB installation directory, install the plugin:

```bash
npm install adb-plugin-welcome
```

## Runtime trust

This plugin explicitly declares `system:raw-client` in both `capabilities` and
`permissions`, with a persistent process, following ADB's moderation plugin
contract. Full Discord.js guild/member objects, channel and DM sends, role
buttons, and native canvas/image loading are not supported by the serialized
worker RPC surface. Do not disable global plugin isolation.

This requires owner-approved elevated host trust: the plugin runs in the bot's
main process and can access the raw client, host database and environment. Its
narrower permission lists are not a sandbox or a network boundary (card rendering
loads remote avatar/background images). The manifest also discloses native
addons for canvas. ADB's platform per-guild plugin enable toggle does not apply
to raw-client plugins. Clearing destinations stops future sends; remove role
buttons from configuration to invalidate existing copies.

Configuration commands require verified Manage Server permission. Role buttons
only grant roles still present in the guild's current `buttons` configuration;
removing a button invalidates old copies. Managed roles, `@everyone`, and roles
at or above the bot's highest role are never granted.

## Slash Commands

Configured commands are restricted to server administrators/managers:

| Command | Description |
|---|---|
| `/welcome channel [#channel]` | Sets the welcome text channel. Run without `#channel` to disable. |
| `/welcome message <text>` | Configures the welcome message text. |
| `/welcome goodbye-channel [#channel]` | Sets the goodbye text channel. Run without `#channel` to disable. |
| `/welcome goodbye-message <text>` | Configures the goodbye message text. |
| `/welcome dm on/off` | Toggles whether welcome messages are sent to new members in Direct Messages. |
| `/welcome card on/off` | Toggles canvas image card generation on welcome/goodbye actions. |
| `/welcome preview` | Generates and sends a welcome & goodbye preview in the current channel. |
| `/welcome test` | Simulates and delivers real welcome/goodbye events to the configured destinations. |
| `/welcome role set <role> [channel] [message]` | Sets a role-specific welcome channel and/or message. First match wins, ordered by role hierarchy. |
| `/welcome role remove <role>` | Removes a role-specific welcome entry. |
| `/welcome role list` | Lists role-specific welcome entries. |
| `/welcome background upload <image>` | Uploads a custom background image (PNG/JPG/GIF, up to 10 per server). |
| `/welcome background default` | Restores the default background. |
| `/welcome background list` | Lists uploaded backgrounds. |
| `/welcome background presets` | Lists built-in preset backgrounds (gradients, patterns, gaming, nature). |
| `/welcome background set <id> [role]` | Sets a background as the server default, or for a specific role. |
| `/welcome social set <platform> [value]` | Sets or clears a social link (discord, youtube, twitter, website, github, twitch). |
| `/welcome social list` | Lists configured social links. |
| `/welcome button add-link <label> <url>` | Adds a link button to the welcome message. |
| `/welcome button add-role <label> <role>` | Adds a button that assigns a role when clicked. |
| `/welcome button remove <label>` | Removes a button by label. |
| `/welcome button list` | Lists configured buttons. |
| `/welcome embed color <hex>` | Sets the embed/card accent color. |
| `/welcome embed title <text>` | Sets the welcome embed title. |
| `/welcome embed description <text>` | Sets extra text shown below the welcome message. |
| `/welcome embed footer <text>` | Sets the embed footer text. |
| `/welcome embed thumbnail <user\|server\|none>` | Chooses the embed thumbnail source. |
| `/welcome stats overview` | Shows total welcomes, goodbyes, and the active-since date. |
| `/welcome stats today` | Shows welcomes sent today. |
| `/welcome-channel add <welcome\|goodbye\|rules\|verify> <#channel>` | Binds a channel to a step in the onboarding flow. |
| `/welcome-channel remove <type>` | Removes a channel binding. |
| `/welcome-channel list` | Lists current channel bindings. |

## Placeholders

Use these variables within welcome and goodbye messages, and embed title/description/footer:

- `{user}` - Mentions the user (e.g., `<@123456789>`).
- `{user.name}` / `{username}` - Plaintext username of the user (e.g., `NewMember`).
- `{server}` / `{guild}` - Name of the Discord server (e.g., `My Awesome Server`).
- `{memberCount}` - Current member count of the server (e.g., `124`).
- `{rulesChannel}` - Mentions the configured rules channel (falls back to "the rules channel").

## Multi-Channel Onboarding Flow

When a member joins, the plugin can chain multiple steps:

1. **Welcome message** — sent to the role-specific channel (if the member matches a `/welcome role` entry) or the default welcome channel(s).
2. **Rules auto-link** — a short message posted in the configured rules channel.
3. **Verification** — a message posted in the verify channel with role buttons (added via `/welcome button add-role`) for self-service role assignment.
4. **DM** — an optional direct message to the new member.

Milestone member counts (1, 10, 25, 50, 100, 250, 500, 750, 1000, and every 1000 after) get an extra 🎉 announcement appended to the welcome message.

## Development and Local Testing

Run the test suite to verify command definitions and event behaviors:

```bash
npm install
npm test
```

## License

This plugin is licensed under the **GNU Affero General Public License v3.0**. See the [LICENSE](LICENSE) file.
