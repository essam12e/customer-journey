// Load test: inject a 216-product store through the import endpoint and measure the renderer.
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const [base, json, shot] = process.argv.slice(2);
  const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 1024, height: 640 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.route("**/api/store/import**", (r) => r.fulfill({ contentType: "application/json", body: fs.readFileSync(json, "utf8") }));
  await p.route("https://img.example/**", (r) => r.fulfill({ status: 404 }));
  await p.route("**/api/image**", (r) => r.fulfill({ status: 404 }));
  await p.goto(base + "/?store=https://big.example", { waitUntil: "networkidle" });
  await p.waitForFunction(() => document.querySelector("#enter-demo")?.textContent.includes("متجر كبير"), null, { timeout: 30000 });
  await p.click("#enter-demo");
  await p.waitForFunction(() => !!window.__cj.debug.player);
  await p.evaluate(() => window.__cj.debug.teleport(0, 4, 0, -0.08));
  await p.waitForTimeout(5000);
  const info = await p.evaluate(() => ({ ...window.__cj.debug.renderInfo(), fps: window.__cj.debug.fps, products: window.__cj.game.getState().layout.products.length }));
  if (shot) await p.screenshot({ path: shot });
  // walk the market to check collisions with the denser fit-out
  await p.evaluate(() => window.__cj.debug.teleport(0, 0, 0, 0));
  await p.keyboard.down("KeyW"); await p.waitForTimeout(5000); await p.keyboard.up("KeyW");
  const pos = await p.evaluate(() => window.__cj.debug.player());
  console.log(JSON.stringify({ ...info, walkedTo: pos.z.toFixed(2), errors: errs }));
  await b.close();
})();
