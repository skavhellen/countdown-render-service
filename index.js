const express = require("express");
const { createCanvas, GlobalFonts } = require("@napi-rs/canvas");
const GIFEncoder = require("gif-encoder-2");
const path = require("path");

// Register fonts
const fontsDir = path.join(__dirname, "fonts");
GlobalFonts.registerFromPath(path.join(fontsDir, "BebasNeue-Regular.ttf"), "Bebas Neue");
GlobalFonts.registerFromPath(path.join(fontsDir, "Inter-Regular.ttf"), "Inter");
GlobalFonts.registerFromPath(path.join(fontsDir, "Lato-Regular.ttf"), "Lato");
GlobalFonts.registerFromPath(path.join(fontsDir, "Montserrat-Regular.ttf"), "Montserrat");
GlobalFonts.registerFromPath(path.join(fontsDir, "OpenSansCondensed-Light.ttf"), "Open Sans Condensed");
GlobalFonts.registerFromPath(path.join(fontsDir, "Oswald-Regular.ttf"), "Oswald");
GlobalFonts.registerFromPath(path.join(fontsDir, "PlayfairDisplay-Regular.ttf"), "Playfair Display");
GlobalFonts.registerFromPath(path.join(fontsDir, "Roboto-Regular.ttf"), "Roboto");
GlobalFonts.registerFromPath(path.join(fontsDir, "RobotoSlab-Regular.ttf"), "Roboto Slab");
GlobalFonts.registerFromPath(path.join(fontsDir, "Verdana.ttf"), "Verdana");

const app = express();
app.use(express.json());

const API_KEY = process.env.RENDER_API_KEY;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/generate-gif", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (API_KEY && (!authHeader || authHeader !== `Bearer ${API_KEY}`)) {
      return res.status(401).send("Unauthorized");
    }

    const { config, diffMs } = req.body;
    if (!config || diffMs === undefined) {
      return res.status(400).send("Missing config or diffMs");
    }

    // Determine which units to show
    const units = [];
    if (config.display_days) units.push({ label: config.label_days || "Days", key: "days" });
    if (config.display_hours) units.push({ label: config.label_hours || "Hours", key: "hours" });
    units.push({ label: config.label_minutes || "Minutes", key: "minutes" });
    units.push({ label: config.label_seconds || "Seconds", key: "seconds" });

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

    // Canvas sizing
    const boxSize = 80;
    const gap = 16;
    const labelHeight = isInside ? 0 : 24;
    const padding = 24;
    const totalWidth = padding * 2 + units.length * boxSize + (units.length - 1) * gap;
    const totalHeight = padding * 2 + boxSize + labelHeight;

    const canvas = createCanvas(totalWidth, totalHeight);
    const ctx = canvas.getContext("2d");
    const encoder = new GIFEncoder(totalWidth, totalHeight);
    encoder.setDelay(1000);
    encoder.setRepeat(0);
    encoder.setQuality(10);
    encoder.start();

    const FRAMES = 30;

    for (let frame = 0; frame < FRAMES; frame++) {
      const remaining = Math.max(0, diffMs - frame * 1000);
      const totalSecs = Math.floor(remaining / 1000);
      const days = Math.floor(totalSecs / 86400);
      const hours = Math.floor((totalSecs % 86400) / 3600);
      const minutes = Math.floor((totalSecs % 3600) / 60);
      const seconds = totalSecs % 60;

      const values = { days, hours, minutes, seconds };

      // Draw background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      units.forEach((unit, i) => {
        const x = padding + i * (boxSize + gap);
        const y = padding;
        const val = String(values[unit.key]).padStart(2, "0");

        // Draw box shape
        if (!isDigits) {
          ctx.fillStyle = isBorder ? "transparent" : boxColor;
          ctx.strokeStyle = boxColor;
          ctx.lineWidth = 2;

          if (isCircle) {
            const cx = x + boxSize / 2;
            const cy = y + boxSize / 2;
            const r = boxSize / 2;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            if (isBorder) {
              ctx.stroke();
            } else {
              ctx.fill();
            }
          } else {
            // Square / rounded
            let radius = 0;
            if (template === "rounded-sm" || template === "square-inside") radius = 4;
            else if (template === "rounded-md") radius = 8;
            else if (template === "rounded-lg") radius = 16;

            if (radius > 0) {
              ctx.beginPath();
              ctx.moveTo(x + radius, y);
              ctx.lineTo(x + boxSize - radius, y);
              ctx.arcTo(x + boxSize, y, x + boxSize, y + radius, radius);
              ctx.lineTo(x + boxSize, y + boxSize - radius);
              ctx.arcTo(x + boxSize, y + boxSize, x + boxSize - radius, y + boxSize, radius);
              ctx.lineTo(x + radius, y + boxSize);
              ctx.arcTo(x, y + boxSize, x, y + boxSize - radius, radius);
              ctx.lineTo(x, y + radius);
              ctx.arcTo(x, y, x + radius, y, radius);
              ctx.closePath();
              if (isBorder) {
                ctx.stroke();
              } else {
                ctx.fill();
              }
            } else {
              if (isBorder) {
                ctx.strokeRect(x, y, boxSize, boxSize);
              } else {
                ctx.fillRect(x, y, boxSize, boxSize);
              }
            }
          }
        }

        // Draw digit text
        const digitColor = isDigits ? boxColor : isBorder ? boxColor : textColor;
        ctx.fillStyle = digitColor;
        ctx.font = `bold 36px "${font}"`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const textY = isInside ? y + boxSize / 2 - 6 : y + boxSize / 2;
        ctx.fillText(val, x + boxSize / 2, textY);

        // Draw label
        if (isInside) {
          // Label inside the box, below the digit
          ctx.fillStyle = isBorder ? boxColor : textColor;
          ctx.font = `9px "${font}"`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(unit.label.toUpperCase(), x + boxSize / 2, y + boxSize / 2 + 18);
        } else {
          // Label below the box
          ctx.fillStyle = labelColor;
          ctx.font = `11px "${font}"`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(unit.label.toUpperCase(), x + boxSize / 2, y + boxSize + 6);
        }
      });

      encoder.addFrame(ctx);
    }

    encoder.finish();
    const buffer = encoder.out.getData();

    res.set({
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    });
    res.send(buffer);
  } catch (err) {
    console.error("GIF generation error:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Countdown GIF service running on port ${PORT}`);
});
