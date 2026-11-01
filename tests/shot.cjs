// quick visual check: node tests/shot.cjs <outdir>
const { chromium } = require("playwright");
(async () => {
  const out = process.argv[2] || ".";
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const logs = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${out}/01-start.png` });
  await page.click("#enter-demo");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/02-spawn.png` });
  await page.evaluate(() => window.__cj.debug.teleport(0, 6, 0, -0.05));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/03-inside.png` });
  console.log(JSON.stringify(await page.evaluate(() => ({ p: window.__cj.debug.player(), info: window.__cj.debug.renderInfo(), fps: window.__cj.debug.fps }))));
  console.log(logs.slice(0, 15).join("\n"));
  await browser.close();
})();
