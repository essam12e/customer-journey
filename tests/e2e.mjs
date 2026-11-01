// End-to-end gameplay tests (desktop + mobile touch). Needs the app running: PORT=3100 npm start
// Run: node tests/e2e.mjs [baseUrl] [screenshotDir]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // uses the pre-installed Playwright

const BASE = process.argv[2] ?? "http://localhost:3100";
const SHOTS = process.argv[3];
const results = [];
let failed = 0;
async function t(name, fn) {
  const t0 = Date.now();
  try { const note = await fn(); results.push(`  ✓ ${name}${note ? ` — ${note}` : ""} (${((Date.now() - t0) / 1000).toFixed(1)}s)`); }
  catch (e) { failed++; results.push(`  ✗ ${name}\n      ${e.message.split("\n")[0]}`); }
  console.log(results[results.length - 1]);
}
const assert = (c, m) => { if (!c) throw new Error(m); };
const player = (page) => page.evaluate(() => window.__cj.debug.player());
const until = (page, fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout, polling: 100 });
const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

/** Place the player in front of a product, looking at it. */
async function faceProduct(page, id, dist = 1.25) {
  return page.evaluate(([id, dist]) => {
    const pp = window.__cj.game.getState().layout.products.find((p) => p.product.id === id);
    const [x, y, z] = pp.position;
    const nx = Math.sin(pp.rotationY), nz = Math.cos(pp.rotationY);
    const px = x + nx * dist, pz = z + nz * dist;
    const yaw = Math.atan2(-(x - px), -(z - pz)); // forward = (-sin yaw, -cos yaw)
    const pitch = Math.atan2(y + 0.15 - 1.52, dist);
    window.__cj.debug.teleport(px, pz, yaw, pitch);
    return { px, pz };
  }, [id, dist]);
}

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

// ---------------- Desktop ----------------
console.log("desktop (1024×640, keyboard + mouse)");
const ctx = await browser.newContext({ viewport: { width: 1024, height: 640 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await t("start screen renders the title and the 3D storefront behind it", async () => {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("h1.title");
  assert((await page.textContent("h1.title")).includes("رحلة العميل"), "title missing");
  await until(page, () => window.__cj?.debug.renderInfo?.().calls > 20);
  await page.waitForTimeout(1500);
  await shot(page, "d1-start");
});

await t("entering the demo store spawns the player outside the door, first-person", async () => {
  await page.click("#enter-demo");
  await until(page, () => !!window.__cj.debug.player);
  const p = await player(page);
  assert(p.z > 13 && Math.abs(p.x) < 0.5, `spawn at ${p.x.toFixed(2)},${p.z.toFixed(2)}`);
  return `spawn z=${p.z.toFixed(2)}`;
});

await t("WASD: holding W accelerates forward, releasing decelerates to a stop", async () => {
  const a = await player(page);
  await page.keyboard.down("KeyW");
  await until(page, () => window.__cj.debug.player().speed > 2.5, null, 20000);
  await until(page, (z0) => window.__cj.debug.player().z < z0 - 1.5, a.z, 30000);
  await page.keyboard.up("KeyW");
  await until(page, () => window.__cj.debug.player().speed < 0.05, null, 20000);
  const b = await player(page);
  assert(Math.abs(b.x - a.x) < 0.3, "drifted sideways");
  return `moved ${(a.z - b.z).toFixed(2)} m`;
});

await t("sliding door opens when the player approaches and lets them in", async () => {
  await page.evaluate(() => window.__cj.debug.teleport(0, 12.6, 0, 0));
  await until(page, () => window.__cj.debug.doorOpen > 0.9, null, 20000);
  await page.keyboard.down("KeyW");
  await until(page, () => window.__cj.debug.player().z < 8.5, null, 40000);
  await page.keyboard.up("KeyW");
  await shot(page, "d2-entered");
});

await t("collision: the back wall stops the player", async () => {
  await page.evaluate(() => window.__cj.debug.teleport(0, -8, 0, 0));
  await page.keyboard.down("KeyW");
  await until(page, () => window.__cj.debug.player().z < -9.3, null, 30000);
  await page.waitForTimeout(2500);
  const p = await player(page);
  await page.keyboard.up("KeyW");
  assert(p.z > -9.75, `went through the wall: z=${p.z}`);
  return `stopped at z=${p.z.toFixed(2)} (wall face −10.00, radius 0.30)`;
});

await t("collision: shelves block the player (island shelf front at z=−2.20)", async () => {
  await page.evaluate(() => window.__cj.debug.teleport(-3.2, 0.5, 0, 0));
  await page.keyboard.down("KeyW");
  await until(page, () => window.__cj.debug.player().z < -1.6, null, 30000);
  await page.waitForTimeout(2500);
  const p = await player(page);
  await page.keyboard.up("KeyW");
  assert(p.z > -2.0, `walked into the shelf: z=${p.z}`);
  return `stopped at z=${p.z.toFixed(2)}`;
});

await t("collision: walking diagonally into a wall slides along it", async () => {
  await page.evaluate(() => window.__cj.debug.teleport(6.5, 8, -Math.PI / 4, 0)); // facing +x/-z
  const a = await player(page);
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(4000);
  const b = await player(page);
  await page.keyboard.up("KeyW");
  assert(b.x < 7.71, `passed the right wall: x=${b.x}`);
  assert(a.z - b.z > 0.8, "stuck on the wall instead of sliding");
  return `x=${b.x.toFixed(2)}, slid ${(a.z - b.z).toFixed(2)} m`;
});

await t("mouse look: pointer lock + mouse moves rotate the camera, pitch is clamped to ±80°", async () => {
  await page.evaluate(() => window.__cj.debug.teleport(0, 3, 0, 0));
  await page.mouse.click(512, 320);
  const locked = await page.waitForFunction(() => window.__cj.game.getState().pointerLocked, null, { timeout: 5000 }).then(() => true, () => false);
  assert(locked, "pointer lock was not granted");
  // Headless Chromium reports movementX=0 for synthetic moves while locked, so dispatch real
  // MouseEvents carrying movementX/Y (pointer lock itself is real).
  const move = (dx, dy, n = 1) => page.evaluate(([dx, dy, n]) => {
    for (let i = 0; i < n; i++) document.dispatchEvent(new MouseEvent("mousemove", { movementX: dx, movementY: dy }));
  }, [dx, dy, n]);
  await page.waitForTimeout(300);
  const a = await player(page);
  assert(Math.abs(a.yaw) < 0.01, `camera jumped when the pointer was locked (yaw ${a.yaw})`);
  await move(20, 0, 5); // 100 px to the right
  await page.waitForTimeout(600);
  const b = await player(page);
  assert(b.yaw < a.yaw - 0.05, `yaw did not change (${a.yaw} → ${b.yaw})`);
  await move(0, -40, 40); // look far up
  await page.waitForTimeout(500);
  const c = await player(page);
  await move(900, 0, 1); // a single absurd spike (Chrome lock bug) must be ignored
  await page.waitForTimeout(400);
  const d = await player(page);
  assert(Math.abs(d.yaw - b.yaw) < 1e-9, "spike was not filtered");
  assert(Math.abs(c.pitch) <= (80 * Math.PI) / 180 + 1e-6, `pitch ${c.pitch}`);
  await page.keyboard.press("Escape");
  return `yaw Δ=${(a.yaw - b.yaw).toFixed(3)} rad, pitch clamped at ${((c.pitch * 180) / Math.PI).toFixed(1)}°`;
});

await t("interaction: looking at a product focuses it and shows the prompt", async () => {
  await page.evaluate(() => window.__cj.debug.teleport(0, 3, 0, 0));
  await faceProduct(page, "p01");
  await until(page, () => window.__cj.game.getState().focusedId === "p01", null, 20000);
  await page.waitForSelector("#prompt");
  await page.waitForTimeout(800);
  await shot(page, "d3-focus");
  return (await page.textContent("#prompt")).replace(/\s+/g, " ").trim();
});

await t("E opens the product card with image, name and price", async () => {
  await page.keyboard.press("KeyE");
  await page.waitForSelector("#product-card");
  const txt = await page.textContent("#product-card");
  assert(txt.includes("قهوة سعودية بالهيل") && /58/.test(txt.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d))), "card content");
  assert(await page.locator("#product-card img").evaluate((i) => i.complete && i.naturalWidth > 0), "image did not load");
  await shot(page, "d4-card");
});

await t("add to cart → badge shows 1; quantity stepper adds 2 more", async () => {
  await page.click("#add-to-cart");
  await until(page, () => document.querySelector("#cart-count")?.textContent === "1");
  await faceProduct(page, "p01");
  await until(page, () => window.__cj.game.getState().focusedId === "p01");
  await page.keyboard.press("KeyE");
  await page.waitForSelector("#product-card");
  await page.click('#product-card button[aria-label="زيادة"]');
  await page.click("#add-to-cart");
  await until(page, () => document.querySelector("#cart-count")?.textContent === "3");
});

await t("second product, open cart (C), totals are exact", async () => {
  await faceProduct(page, "p06"); // 39.50
  await until(page, () => window.__cj.game.getState().focusedId === "p06");
  await page.keyboard.press("KeyE");
  await page.click("#add-to-cart");
  await until(page, () => document.querySelector("#cart-count")?.textContent === "4");
  await page.keyboard.press("KeyC");
  await page.waitForSelector("#cart-panel");
  const lines = await page.locator("#cart-panel .line").count();
  const total = await page.evaluate(() => window.__cj.cart.getState().lines.reduce((n, l) => n + l.price * l.qty, 0));
  assert(lines === 2, `${lines} lines`);
  assert(Math.abs(total - (58 * 3 + 39.5)) < 1e-9, `total ${total}`);
  await shot(page, "d5-cart");
  return `2 lines, total ${total} SAR`;
});

await t("cart editing: decrement and remove", async () => {
  await page.click('#cart-panel .line[data-id="p01"] button[aria-label^="إنقاص"]');
  await until(page, () => document.querySelector("#cart-count")?.textContent === "3");
  await page.click('#cart-panel .line[data-id="p06"] button[aria-label^="حذف"]');
  await until(page, () => document.querySelectorAll("#cart-panel .line").length === 1);
});

await t("checkout is honest: demo store states no real purchase happens", async () => {
  await page.click("#checkout");
  await page.waitForSelector("#checkout-note.demo");
  const txt = await page.textContent("#checkout-note");
  assert(txt.includes("لن يتم تنفيذ أي عملية شراء"), txt);
  await page.keyboard.press("Escape");
});

await t("an out-of-stock product cannot be added", async () => {
  await faceProduct(page, "p10");
  await until(page, () => window.__cj.game.getState().focusedId === "p10");
  await page.keyboard.press("KeyE");
  await page.waitForSelector("#product-card");
  assert(await page.isDisabled("#add-to-cart"), "add button enabled for out-of-stock");
  await page.keyboard.press("Escape");
});

await t("cart persists across a reload", async () => {
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#enter-demo");
  await until(page, () => document.querySelector("#cart-count")?.textContent === "2");
});

await t("performance budget: draw calls and triangles", async () => {
  await page.evaluate(() => window.__cj.debug.teleport(0, 6, 0, -0.05));
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => ({ ...window.__cj.debug.renderInfo(), fps: window.__cj.debug.fps }));
  assert(info.calls <= 150, `${info.calls} draw calls`);
  assert(info.triangles <= 150000, `${info.triangles} triangles`);
  return `${info.calls} calls, ${info.triangles} tris, dpr ${info.dpr}, ${info.fps} fps (software renderer)`;
});

await t("store-link import: errors are explained, demo still playable", async () => {
  await page.click('button[aria-label="الخروج للبداية"]');
  await page.fill("#store-url", "https://salla.sa/some-store");
  await page.click(".import button");
  await page.waitForSelector(".import-msg.err");
  const a = await page.textContent(".import-msg");
  await page.fill("#store-url", "not a url");
  await page.click(".import button");
  await until(page, () => /تأكد من الرابط/.test(document.querySelector(".import-msg")?.textContent ?? ""));
  assert(a.includes("سلة"), a);
  return `salla → "${a.slice(0, 40)}…"`;
});

assert(errors.length === 0, errors.join("; "));
await ctx.close();

// ---------------- Mobile ----------------
console.log("mobile (390×844, touch)");
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mp = await m.newPage();
const cdp = await m.newCDPSession(mp);
const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });

await t("mobile: start screen fits, touch hints shown", async () => {
  await mp.goto(BASE, { waitUntil: "networkidle" });
  await until(mp, () => window.__cj?.game.getState().isTouch);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert(!overflow, "horizontal overflow");
  assert((await mp.textContent(".keys")).includes("العصا"), "touch hints missing");
  await mp.waitForTimeout(1500);
  await shot(mp, "m1-start");
});

await t("mobile: virtual joystick walks the player forward", async () => {
  await mp.tap("#enter-demo");
  await until(mp, () => !!window.__cj.debug.player);
  const box = await mp.locator("#joystick").boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const a = await player(mp);
  await touch("touchStart", [[cx, cy]]);
  await touch("touchMove", [[cx, cy - 30]]);
  await touch("touchMove", [[cx, cy - 60]]);
  await until(mp, (z0) => window.__cj.debug.player().z < z0 - 1.2, a.z, 40000);
  await touch("touchEnd", []);
  await until(mp, () => window.__cj.debug.player().speed < 0.05, null, 20000);
  const b = await player(mp);
  return `moved ${(a.z - b.z).toFixed(2)} m`;
});

await t("mobile: dragging on the scene turns the camera", async () => {
  const a = await player(mp);
  await touch("touchStart", [[300, 400]]);
  for (let i = 1; i <= 6; i++) await touch("touchMove", [[300 - i * 15, 400]]);
  await touch("touchEnd", []);
  await mp.waitForTimeout(600);
  const b = await player(mp);
  assert(b.yaw > a.yaw + 0.2, `yaw ${a.yaw} → ${b.yaw}`);
  return `yaw Δ=${(b.yaw - a.yaw).toFixed(2)} rad`;
});

await t("mobile: tap 'عرض المنتج' → card → add to cart", async () => {
  await faceProduct(mp, "p03");
  await until(mp, () => window.__cj.game.getState().focusedId === "p03", null, 20000);
  await mp.waitForSelector("#touch-interact");
  await mp.waitForTimeout(800);
  await shot(mp, "m2-focus");
  await mp.tap("#touch-interact");
  await mp.waitForSelector("#product-card");
  await shot(mp, "m3-card");
  await mp.tap("#add-to-cart");
  await until(mp, () => document.querySelector("#cart-count")?.textContent === "1");
  await mp.tap("#open-cart");
  await mp.waitForSelector("#cart-panel");
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert(!overflow, "cart overflows horizontally");
  await shot(mp, "m4-cart");
});

await m.close();
await browser.close();
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
