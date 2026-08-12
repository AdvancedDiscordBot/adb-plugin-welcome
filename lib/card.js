const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { getPreset } = require("./presets");

function hexToRgb(hex) {
	const clean = (hex || "").replace("#", "");
	const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
	const num = parseInt(full, 16);
	if (Number.isNaN(num) || full.length !== 6) return null;
	return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function shade(rgb, amount) {
	const clamp = (v) => Math.max(0, Math.min(255, v));
	return `rgb(${clamp(rgb.r + amount)}, ${clamp(rgb.g + amount)}, ${clamp(rgb.b + amount)})`;
}

/**
 * Draws the base card background: a custom uploaded image, a built-in
 * preset, or (default) the original gradient + diagonal-line design.
 */
async function drawBackground(ctx, width, height, { backgroundUrl, presetId, isWelcome }) {
	if (backgroundUrl) {
		try {
			const img = await loadImage(backgroundUrl);
			ctx.drawImage(img, 0, 0, width, height);
			// Darken slightly so text stays legible over arbitrary uploads.
			ctx.fillStyle = "rgba(0,0,0,0.35)";
			ctx.fillRect(0, 0, width, height);
			return;
		} catch (err) {
			console.error("Failed to load custom background image, falling back", err);
		}
	}

	if (presetId) {
		const preset = getPreset(presetId);
		if (preset) {
			preset.draw(ctx, width, height);
			return;
		}
	}

	// Default gradient (original look)
	const bgGrad = ctx.createLinearGradient(0, 0, width, height);
	if (isWelcome) {
		bgGrad.addColorStop(0, "#0f172a");
		bgGrad.addColorStop(0.5, "#1e1b4b");
		bgGrad.addColorStop(1, "#311042");
	} else {
		bgGrad.addColorStop(0, "#0f172a");
		bgGrad.addColorStop(0.5, "#450a0a");
		bgGrad.addColorStop(1, "#18000a");
	}
	ctx.fillStyle = bgGrad;
	ctx.fillRect(0, 0, width, height);

	ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
	ctx.lineWidth = 20;
	for (let i = -width; i < width * 2; i += 80) {
		ctx.beginPath();
		ctx.moveTo(i, 0);
		ctx.lineTo(i + height, height);
		ctx.stroke();
	}
}

/**
 * Generates a welcome or goodbye image card.
 * @param {object} options
 * @param {string} options.avatarUrl - URL to the user's avatar.
 * @param {string} options.username - The username of the member.
 * @param {string} [options.serverIconUrl] - URL to the guild icon.
 * @param {string} [options.serverName] - The name of the guild.
 * @param {number} [options.memberCount] - Member count of the guild.
 * @param {boolean} [options.isWelcome] - Whether this is a welcome card (true) or goodbye card (false).
 * @param {string} [options.backgroundUrl] - Custom uploaded background image URL.
 * @param {string} [options.presetId] - Built-in preset background id.
 * @param {string} [options.accentColor] - Hex accent color for the avatar ring / subtitle.
 * @param {object} [options.social] - Social links to render as a footer bar.
 * @returns {Promise<Buffer>} The generated image buffer.
 */
async function generateWelcomeCard({
	avatarUrl,
	username,
	serverIconUrl,
	serverName,
	memberCount,
	isWelcome = true,
	backgroundUrl = null,
	presetId = null,
	accentColor = null,
	social = null,
}) {
	const width = 1024;
	const height = 450;
	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext("2d");

	// 1. Background: custom image > preset > default gradient
	await drawBackground(ctx, width, height, { backgroundUrl, presetId, isWelcome });

	// 2. Draw a sleek Glassmorphism Panel
	ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
	ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
	ctx.lineWidth = 2;
	const margin = 24;
	const rx = margin;
	const ry = margin;
	const rw = width - margin * 2;
	const rh = height - margin * 2;
	const radius = 24;

	ctx.beginPath();
	ctx.roundRect(rx, ry, rw, rh, radius);
	ctx.fill();
	ctx.stroke();

	// 3. Draw Avatar
	const avatarX = 160;
	const avatarY = height / 2;
	const avatarRadius = 100;

	const accentRgb = accentColor ? hexToRgb(accentColor) : null;

	// Draw Avatar Outer Ring/Glow
	const ringGrad = ctx.createLinearGradient(
		avatarX - avatarRadius,
		avatarY - avatarRadius,
		avatarX + avatarRadius,
		avatarY + avatarRadius,
	);
	if (accentRgb) {
		ringGrad.addColorStop(0, shade(accentRgb, 40));
		ringGrad.addColorStop(1, shade(accentRgb, -30));
	} else if (isWelcome) {
		ringGrad.addColorStop(0, "#818cf8");
		ringGrad.addColorStop(1, "#c084fc");
	} else {
		ringGrad.addColorStop(0, "#f87171");
		ringGrad.addColorStop(1, "#fb923c");
	}

	ctx.shadowColor = accentRgb
		? `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.4)`
		: isWelcome
			? "rgba(129, 140, 248, 0.4)"
			: "rgba(248, 113, 113, 0.4)";
	ctx.shadowBlur = 15;
	ctx.strokeStyle = ringGrad;
	ctx.lineWidth = 6;
	ctx.beginPath();
	ctx.arc(avatarX, avatarY, avatarRadius + 4, 0, Math.PI * 2);
	ctx.stroke();
	ctx.shadowBlur = 0;

	let avatarImg;
	try {
		if (avatarUrl) {
			avatarImg = await loadImage(avatarUrl);
		}
	} catch (err) {
		console.error("Failed to load avatar image, using fallback", err);
	}

	ctx.save();
	ctx.beginPath();
	ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
	ctx.clip();

	if (avatarImg) {
		ctx.drawImage(avatarImg, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
	} else {
		ctx.fillStyle = accentRgb ? shade(accentRgb, -10) : isWelcome ? "#4f46e5" : "#dc2626";
		ctx.fillRect(avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);

		ctx.fillStyle = "#ffffff";
		ctx.font = 'bold 80px "Inter", "Segoe UI", sans-serif';
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		const initial = username ? username.charAt(0).toUpperCase() : "?";
		ctx.fillText(initial, avatarX, avatarY);
	}
	ctx.restore();

	// 4. Draw Server Badge (Icon + Server Name) in top-right
	const badgeX = width - 50;
	const badgeY = 60;

	let serverIconImg;
	if (serverIconUrl) {
		try {
			serverIconImg = await loadImage(serverIconUrl);
		} catch (err) {
			console.error("Failed to load server icon, using text fallback", err);
		}
	}

	ctx.save();
	ctx.textAlign = "right";
	ctx.textBaseline = "middle";

	const serverText = serverName || "Discord Server";
	ctx.font = 'bold 20px "Inter", "Segoe UI", sans-serif';
	ctx.fillStyle = "rgba(255, 255, 255, 0.9)";

	if (serverIconImg) {
		const iconRadius = 24;
		const iconX = badgeX - iconRadius;
		const iconY = badgeY;

		ctx.beginPath();
		ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
		ctx.clip();
		ctx.drawImage(serverIconImg, iconX - iconRadius, iconY - iconRadius, iconRadius * 2, iconRadius * 2);
		ctx.restore();

		ctx.fillText(serverText, badgeX - iconRadius * 2 - 12, badgeY);
	} else {
		ctx.fillText(serverText, badgeX, badgeY);
		ctx.restore();
	}

	// 5. Draw Main Texts (Right Column)
	const textStartX = 300;

	ctx.fillStyle = accentRgb ? shade(accentRgb, 60) : isWelcome ? "#c7d2fe" : "#fecaca";
	ctx.font = 'bold 22px "Inter", "Segoe UI", sans-serif';
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	const subtitleText = isWelcome ? "WELCOME TO THE SERVER" : "GOODBYE & FAREWELL";
	ctx.fillText(subtitleText, textStartX, 135);

	let fontSize = 56;
	ctx.font = `bold ${fontSize}px "Inter", "Segoe UI", sans-serif`;
	ctx.fillStyle = "#ffffff";

	let nameText = username || "NewMember";
	let textWidth = ctx.measureText(nameText).width;
	const maxTextWidth = width - textStartX - 80;
	while (textWidth > maxTextWidth && fontSize > 24) {
		fontSize -= 4;
		ctx.font = `bold ${fontSize}px "Inter", "Segoe UI", sans-serif`;
		textWidth = ctx.measureText(nameText).width;
	}

	ctx.fillText(nameText, textStartX, 175);

	ctx.font = '28px "Inter", "Segoe UI", sans-serif';
	ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
	let countText = "";
	if (memberCount !== undefined) {
		countText = isWelcome
			? `You are our ${getOrdinal(memberCount)} member!`
			: `We now have ${memberCount} members`;
	}
	ctx.fillText(countText, textStartX, 255);

	return canvas.toBuffer("image/png");
}

function getOrdinal(n) {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

module.exports = { generateWelcomeCard };
