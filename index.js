const express = require("express");
const { createCanvas } = require("@napi-rs/canvas");
const GIFEncoder = require("gif-encoder-2");

const app = express();
app.use(express.json());

const API_KEY = process.env.RENDER_API_KEY || "changeme";

// Auth middleware
app.use("/generate-gif", (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${API_KEY}`) {
    return res.status(401).send("Unauthorized");
  }
  next();
});

app.post("/generate-gif", async (req, res) => {
  try {
    const { config, diffMs } = req.body;
    if (!config) return res.status(400).send("Missing config");

    const FRAMES = 30;
    const DELAY = 100; // 100ms per frame = ~3 seconds total

    // Determine which units to show
    const units = [];
    if (config.display_days) units.push("days");
    if (config.display_hours) units.push("hours");
    units.push("minutes", "seconds");

    const labels = {
      days: config.label_days || "Days",
      hours: config.label_hours || "Hours",
      minutes: config.label_minutes || "Minutes",
      seconds: config.label_seconds || "Seconds",
    };

    // Canvas sizing
    const boxSize = 80;
    const gap = 16;
    const padding = 24;
    const labelHeight = 20;
    const canvasW = padding * 2 + units.length * boxSize + (units.length - 1) * gap;
    const canvasH = padding * 2 + boxSize + labelHeight + 8;

    const encoder = new GIFEncoder(canvasW, canvasH);
    encoder.setDelay(DELAY);
    encoder.setRepeat(0);
    encoder.setQuality(10);
    encoder.start();

    for (let f = 0; f < FRAMES; f++) {
      const remaining = Math.max(0, diffMs - f * 1000);
      const totalSec = Math.floor(remaining / 1000);
      const days = Math.floor(totalSec / 86400);
      const hours = Math.floor((totalSec % 86400) / 3600);
      const minutes = Math.floor((totalSec % 3600) / 60);
      const seconds = totalSec % 60;

      const values = { days, hours, minutes, seconds };

      const canvas = createCanvas(canvasW, canvasH);
      const ctx = canvas.getContext("2d");

      // Background
      ctx.fillStyle = config.background_color || "#FFFFFF";
      ctx.fillRect(0, 0, canvasW, canvasH);

      const template = config.template || "square";
      const isCircle = template.includes("circle");
      const isBorder = template.includes("border");
      const isDigits = template === "square-digits";
      const isInside = template.includes("inside");

      // Determine corner radius
      let radius = 0;
      if (isCircle) radius = boxSize / 2;
      else if (template === "rounded-sm") radius = 4;
      else if (template === "rounded-md") radius = 8;
      else if (template === "rounded-lg") radius = 16;

      units.forEach((unit, i) => {
        const x = padding + i * (boxSize + gap);
        const y = padding;
        const val = String(values[unit]).padStart(2, "0");

        // Draw box
        if (!isDigits) {
          ctx.beginPath();
          if (isCircle) {
            ctx.arc(x + boxSize / 2, y + boxSize / 2, boxSize / 2, 0, Math.PI * 2);
          } else {
            roundRect(ctx, x, y, boxSize, boxSize, radius);
          }

          if (isBorder) {
            ctx.strokeStyle = config.box_color || "#FE8A22";
            ctx.lineWidth = 2;
            ctx.stroke();
          } else {
            ctx.fillStyle = config.box_color || "#FE8A22";
            ctx.fill();
          }
        }

        // Draw number
        const fontSize = 32;
        ctx.font = `bold ${fontSize}px ${config.font || "Arial"}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (isDigits) {
          ctx.fillStyle = config.box_color || "#FE8A22";
        } else if (isBorder) {
          ctx.fillStyle = config.box_color || "#FE8A22";
        } else {
          ctx.fillStyle = config.text_color || "#FFFFFF";
        }

        const textY = isInside ? y + boxSize / 2 - 8 : y + boxSize / 2;
        ctx.fillText(val, x + boxSize / 2, textY);

        // Draw label
        if (isInside) {
          ctx.font = `600 9px ${config.font || "Arial"}`;
          ctx.fillStyle = isBorder
            ? config.box_color || "#FE8A22"
            : config.text_color || "#FFFFFF";
          ctx.fillText(labels[unit].toUpperCase(), x + boxSize / 2, y + boxSize / 2 + 16);
        } else {
          ctx.font = `500 11px ${config.font || "Arial"}`;
          ctx.fillStyle = config.label_color || "#FE8A22";
          ctx.fillText(labels[unit].toUpperCase(), x + boxSize / 2, y + boxSize + labelHeight);
        }
      });

      encoder.addFrame(ctx);
    }

    encoder.finish();
    const buffer = encoder.out.getData();

    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(buffer);
  } catch (err) {
    console.error("GIF generation error:", err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Health check
app.get("/", (req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Countdown service running on port ${PORT}`));
