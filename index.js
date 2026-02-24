const express = require("express");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const GIFEncoder = require("gif-encoder-2");
const path = require("path");

// ── Register fonts ──────────────────────────────────────────────────
const fontsDir = path.join(__dirname, "fonts");
GlobalFonts.registerFromPath(path.join(fontsDir, "BebasNeue-Regular.ttf"), "Bebas Neue");
GlobalFonts.registerFromPath(path.join(fontsDir, "Inter-Bold.ttf"), "Inter");
GlobalFonts.registerFromPath(path.join(fontsDir, "Lato-Bold.ttf"), "Lato");
GlobalFonts.registerFromPath(path.join(fontsDir, "Montserrat-Bold.ttf"), "Montserrat");
GlobalFonts.registerFromPath(path.join(fontsDir, "OpenSansCondensed-Bold.ttf"), "Open Sans Condensed");
GlobalFonts.registerFromPath(path.join(fontsDir, "Oswald-Bold.ttf"), "Oswald");
GlobalFonts.registerFromPath(path.join(fontsDir, "PlayfairDisplay-Bold.ttf"), "Playfair Display");
GlobalFonts.registerFromPath(path.join(fontsDir, "Roboto-Bold.ttf"), "Roboto");
GlobalFonts.registerFromPath(path.join(fontsDir, "RobotoSlab-Bold.ttf"), "Roboto Slab");
GlobalFonts.registerFromPath(path.join(fontsDir, "Verdana-Bold.ttf"), "Verdana");

// ── App ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

const API_KEY = process.env.RENDER_API_KEY || "";

app.post("/generate-gif", (req, res) => {
  // Auth check
  const auth = req.headers.authorization || "";
  if (API_KEY && auth !== `Bearer ${API_KEY}`) {
    return res.status(401).send("Unauthorized");
  }

  try {
    const { config, diffMs } = req.body;
    if (!config) return res.status(400).send("Missing config");

    const FRAMES = 30;
    const DELAY = 1000;
    const WIDTH = 470;
    const HEIGHT = 176;

    const encoder = new GIFEncoder(WIDTH, HEIGHT);
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext("2d");

    // Start encoding
    const stream = encoder.createReadStream();
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => {
      const gif = Buffer.concat(chunks);
      res.set("Content-Type", "image/gif");
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(gif);
    });

    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(DELAY);
    encoder.setQuality(10);

    // Build unit list
    const buildUnits = (remainMs) => {
      const totalSec = Math.max(0, Math.floor(remainMs / 1000));
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;

      const units = [];
      if (config.display_days !== false)
        units.push({ value: d, label: config.label_days || "Days" });
      if (config.display_hours !== false)
        units.push({ value: h, label: config.label_hours || "Hours" });
      units.push({ value: m, label: config.label_minutes || "Minutes" });
      units.push({ value: s, label: config.label_seconds || "Seconds" });
      return units;
    };

    const template = config.template || "square";
    const font = config.font || "Roboto";
    const bgColor = config.background_color || "#FFFFFF";
    const boxColor = config.box_color || "#FE8A22";
    const textColor = config.text_color || "#FFFFFF";
    const labelColor = config.label_color || "#FE8A22";

    const isBorder = template.includes("border");
    const isInside = template.includes("inside");
    const isDigits = template === "square-digits";
    const isCircle = template.includes("circle");

    // Get border radius
    const getRadius = () => {
      if (isCircle) return 999;
      switch (template) {
        case "rounded-sm": return 6;
        case "rounded-md": return 12;
        case "rounded-lg": return 20;
        default: return 3;
      }
    };

    const radius = getRadius();

    // Draw rounded rect helper
    const roundRect = (x, y, w, h, r) => {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    };

    for (let i = 0; i < FRAMES; i++) {
      const remaining = diffMs - i * 1000;
      const units = buildUnits(remaining);

      // Clear background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      const boxSize = 80;
      const gap = 16;
      const totalW = units.length * boxSize + (units.length - 1) * gap;
      const startX = (WIDTH - totalW) / 2;
      const boxY = isInside ? (HEIGHT - boxSize) / 2 : (HEIGHT - boxSize - 24) / 2;

      units.forEach((unit, idx) => {
        const x = startX + idx * (boxSize + gap);

        // Draw box
        if (!isDigits) {
          roundRect(x, boxY, boxSize, boxSize, radius);
          if (isBorder) {
            ctx.strokeStyle = boxColor;
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            ctx.fillStyle = boxColor;
            ctx.fill();
          }
        }

        // Draw digit
        const digitColor = isDigits ? boxColor : isBorder ? boxColor : textColor;
        ctx.fillStyle = digitColor;
        ctx.font = `bold 36px "${font}"`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const digitY = isInside ? boxY + boxSize / 2 - 8 : boxY + boxSize / 2;
        ctx.fillText(
          String(unit.value).padStart(2, "0"),
          x + boxSize / 2,
          digitY
        );

        // Draw label
        if (isInside) {
          // Label inside the box
          const insideLabelColor = isBorder ? boxColor : textColor;
          ctx.fillStyle = insideLabelColor;
          ctx.font = `bold 9px "${font}"`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            unit.label.toUpperCase(),
            x + boxSize / 2,
            boxY + boxSize / 2 + 20
          );
        } else {
          // Label below the box
          ctx.fillStyle = labelColor;
          ctx.font = `bold 11px "${font}"`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(unit.label.toUpperCase(), x + boxSize / 2, boxY + boxSize + 6);
        }
      });

      encoder.addFrame(ctx);
    }

    encoder.finish();
  } catch (err) {
    console.error("GIF generation error:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

app.get("/health", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Countdown service running on port ${PORT}`));
