const fs = require("fs");
const path = require("path");
const sharp = require(path.resolve("AgriCloudManager/node_modules/sharp"));

const iconsDir = path.resolve("AgriCloudManager/node_modules/lucide-static/icons");
const outDir = path.resolve("AgriCloudManager/src/static/tabbar");

const iconMap = {
  "my-field": "sprout",
  "market": "trending-up",
  "ai-consult": "camera",
  "buyer": "users",
  "ads": "megaphone"
};

const colors = {
  normal: "#999999",
  active: "#52a355"
};

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function renderPng(iconName, color, outFile) {
  const svgPath = path.join(iconsDir, `${iconName}.svg`);
  let svg = fs.readFileSync(svgPath, "utf8");
  svg = svg.replace(/stroke=\"currentColor\"/g, `stroke=\"${color}\"`);
  await sharp(Buffer.from(svg)).resize(40, 40, { fit: "contain" }).png().toFile(outFile);
}

(async () => {
  for (const [key, icon] of Object.entries(iconMap)) {
    await renderPng(icon, colors.normal, path.join(outDir, `${key}.png`));
    await renderPng(icon, colors.active, path.join(outDir, `${key}-active.png`));
  }
  console.log("tabbar png generated");
})();
