/**
 * Built-in background presets for welcome/goodbye cards. Each preset draws
 * directly onto the card canvas (no external image fetch), so they always
 * render even for servers that never upload a custom background.
 */

function diagonalGradient(ctx, width, height, stops) {
	const grad = ctx.createLinearGradient(0, 0, width, height);
	stops.forEach(([offset, color]) => grad.addColorStop(offset, color));
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, width, height);
}

function withDots(ctx, width, height, color, spacing = 36, radius = 2) {
	ctx.fillStyle = color;
	for (let y = spacing / 2; y < height; y += spacing) {
		for (let x = spacing / 2; x < width; x += spacing) {
			ctx.beginPath();
			ctx.arc(x, y, radius, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}

function withGrid(ctx, width, height, color, spacing = 48) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 1;
	for (let x = 0; x < width; x += spacing) {
		ctx.beginPath();
		ctx.moveTo(x, 0);
		ctx.lineTo(x, height);
		ctx.stroke();
	}
	for (let y = 0; y < height; y += spacing) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
}

function withDiagonalStripes(ctx, width, height, color, spacing = 60, lineWidth = 14) {
	ctx.strokeStyle = color;
	ctx.lineWidth = lineWidth;
	for (let i = -height; i < width; i += spacing) {
		ctx.beginPath();
		ctx.moveTo(i, height);
		ctx.lineTo(i + height, 0);
		ctx.stroke();
	}
}

function withHexagons(ctx, width, height, color, size = 34) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	const rowHeight = size * 1.5;
	const colWidth = size * Math.sqrt(3);
	for (let row = -1, ry = -size; ry < height + size; row++, ry += rowHeight) {
		const offsetX = row % 2 === 0 ? 0 : colWidth / 2;
		for (let rx = -size + offsetX; rx < width + size; rx += colWidth) {
			drawHexagon(ctx, rx, ry, size);
		}
	}
}

function drawHexagon(ctx, cx, cy, size) {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i;
		const x = cx + size * Math.cos(angle);
		const y = cy + size * Math.sin(angle);
		if (i === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.stroke();
}

function withWaves(ctx, width, height, color, amplitude = 18, waveLength = 140) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 2;
	for (let baseY = 40; baseY < height; baseY += 44) {
		ctx.beginPath();
		for (let x = 0; x <= width; x += 4) {
			const y = baseY + Math.sin((x / waveLength) * Math.PI * 2) * amplitude;
			if (x === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}
}

function withScanlines(ctx, width, height, color, spacing = 6) {
	ctx.strokeStyle = color;
	ctx.lineWidth = 1;
	for (let y = 0; y < height; y += spacing) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
}

function withMountains(ctx, width, height, color) {
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(0, height);
	const peaks = 6;
	for (let i = 0; i <= peaks; i++) {
		const x = (width / peaks) * i;
		const y = height - 60 - Math.abs(Math.sin(i * 1.7)) * 140;
		ctx.lineTo(x, y);
	}
	ctx.lineTo(width, height);
	ctx.closePath();
	ctx.fill();
}

function withSun(ctx, width, height, color, cx, cy, radius) {
	ctx.save();
	ctx.globalAlpha = 0.8;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function makeGradientPreset(id, label, stops) {
	return { id, label, category: "gradient", draw: (ctx, width, height) => diagonalGradient(ctx, width, height, stops) };
}

const GRADIENT_PACK = [
	makeGradientPreset("gradient-1", "Midnight Indigo", [[0, "#0f172a"], [0.5, "#1e1b4b"], [1, "#312e81"]]),
	makeGradientPreset("gradient-2", "Sunset Blaze", [[0, "#7c2d12"], [0.5, "#c2410c"], [1, "#f97316"]]),
	makeGradientPreset("gradient-3", "Emerald Depths", [[0, "#022c22"], [0.5, "#065f46"], [1, "#10b981"]]),
	makeGradientPreset("gradient-4", "Berry Punch", [[0, "#4a044e"], [0.5, "#a21caf"], [1, "#ec4899"]]),
	makeGradientPreset("gradient-5", "Ocean Deep", [[0, "#082f49"], [0.5, "#0369a1"], [1, "#38bdf8"]]),
	makeGradientPreset("gradient-6", "Crimson Night", [[0, "#1c0a0a"], [0.5, "#7f1d1d"], [1, "#ef4444"]]),
	makeGradientPreset("gradient-7", "Golden Hour", [[0, "#451a03"], [0.5, "#b45309"], [1, "#fbbf24"]]),
	makeGradientPreset("gradient-8", "Steel Slate", [[0, "#0f172a"], [0.5, "#334155"], [1, "#64748b"]]),
	makeGradientPreset("gradient-9", "Violet Storm", [[0, "#1e1b4b"], [0.5, "#4c1d95"], [1, "#8b5cf6"]]),
	makeGradientPreset("gradient-10", "Rose Quartz", [[0, "#3b0764"], [0.5, "#9d174d"], [1, "#fb7185"]]),
];

const PATTERNS = [
	{
		id: "pattern-1",
		label: "Dot Grid",
		category: "pattern",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#0f172a"], [1, "#1e293b"]]);
			withDots(ctx, width, height, "rgba(255,255,255,0.12)");
		},
	},
	{
		id: "pattern-2",
		label: "Grid Lines",
		category: "pattern",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#111827"], [1, "#1f2937"]]);
			withGrid(ctx, width, height, "rgba(255,255,255,0.06)");
		},
	},
	{
		id: "pattern-3",
		label: "Diagonal Stripes",
		category: "pattern",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#1e1b4b"], [1, "#312e81"]]);
			withDiagonalStripes(ctx, width, height, "rgba(255,255,255,0.04)");
		},
	},
	{
		id: "pattern-4",
		label: "Honeycomb",
		category: "pattern",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#082f49"], [1, "#0c4a6e"]]);
			withHexagons(ctx, width, height, "rgba(255,255,255,0.10)");
		},
	},
	{
		id: "pattern-5",
		label: "Waveform",
		category: "pattern",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#0f172a"], [1, "#1e1b4b"]]);
			withWaves(ctx, width, height, "rgba(255,255,255,0.10)");
		},
	},
];

const GAMING = [
	{
		id: "gaming-1",
		label: "Neon Grid",
		category: "gaming",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#0a0014"], [1, "#1a0033"]]);
			withGrid(ctx, width, height, "rgba(168,85,247,0.18)", 40);
		},
	},
	{
		id: "gaming-2",
		label: "Scanline CRT",
		category: "gaming",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#001a0a"], [1, "#003318"]]);
			withScanlines(ctx, width, height, "rgba(74,222,128,0.10)");
		},
	},
	{
		id: "gaming-3",
		label: "Pixel Circuit",
		category: "gaming",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#020617"], [1, "#0f172a"]]);
			withGrid(ctx, width, height, "rgba(56,189,248,0.14)", 24);
		},
	},
	{
		id: "gaming-4",
		label: "Lava Arena",
		category: "gaming",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#1a0000"], [0.5, "#450a0a"], [1, "#7f1d1d"]]);
			withDiagonalStripes(ctx, width, height, "rgba(251,146,60,0.12)", 50, 8);
		},
	},
	{
		id: "gaming-5",
		label: "Cyber Punch",
		category: "gaming",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#0f0326"], [0.5, "#3b0764"], [1, "#831843"]]);
			withHexagons(ctx, width, height, "rgba(236,72,153,0.14)", 26);
		},
	},
];

const NATURE = [
	{
		id: "nature-1",
		label: "Mountain Dusk",
		category: "nature",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#1e1b4b"], [1, "#7c2d12"]]);
			withMountains(ctx, width, height, "rgba(15,23,42,0.6)");
		},
	},
	{
		id: "nature-2",
		label: "Sunny Sky",
		category: "nature",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#0369a1"], [1, "#38bdf8"]]);
			withSun(ctx, width, height, "rgba(253,224,71,0.85)", width * 0.82, height * 0.28, 70);
		},
	},
	{
		id: "nature-3",
		label: "Forest Canopy",
		category: "nature",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#022c22"], [1, "#14532d"]]);
			withDots(ctx, width, height, "rgba(134,239,172,0.10)", 30, 3);
		},
	},
	{
		id: "nature-4",
		label: "Ocean Waves",
		category: "nature",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#082f49"], [1, "#0e7490"]]);
			withWaves(ctx, width, height, "rgba(165,243,252,0.14)", 22, 110);
		},
	},
	{
		id: "nature-5",
		label: "Autumn Fields",
		category: "nature",
		draw(ctx, width, height) {
			diagonalGradient(ctx, width, height, [[0, "#451a03"], [0.5, "#9a3412"], [1, "#ca8a04"]]);
			withMountains(ctx, width, height, "rgba(69,26,3,0.5)");
		},
	},
];

const ALL_PRESETS = [...GRADIENT_PACK, ...PATTERNS, ...GAMING, ...NATURE];
const PRESETS_BY_ID = new Map(ALL_PRESETS.map((p) => [p.id, p]));

function getPreset(id) {
	return PRESETS_BY_ID.get(id) || null;
}

function listPresets() {
	return ALL_PRESETS.map(({ id, label, category }) => ({ id, label, category }));
}

module.exports = { ALL_PRESETS, getPreset, listPresets };
