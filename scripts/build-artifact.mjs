// Static single-page build of the game (no server: store-link import is hidden).
// Output: dist-artifact/index.html (page fragment + inline CSS), app.js, models/, products/
import { build } from "esbuild";
import { NodeIO } from "@gltf-transform/core";
import { readdirSync } from "node:fs";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const OUT = "dist-artifact";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const src = fileURLToPath(new URL("../src", import.meta.url));

await build({
  entryPoints: ["src/artifact/main.tsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: `${OUT}/app.js`,
  jsx: "automatic",
  loader: { ".woff2": "dataurl", ".woff": "empty" },
  alias: { "@": src, "next/dynamic": `${src}/artifact/next-dynamic-shim.tsx` },
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_STATIC": '"1"' },
  logLevel: "warning",
  legalComments: "none",
});

const css = readFileSync(`${OUT}/app.css`, "utf8");
rmSync(`${OUT}/app.css`);
writeFileSync(`${OUT}/index.html`, `<title>رحلة العميل</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}
#cj-root{position:fixed;inset:0}</style>
<div id="cj-root"></div>
<script src="app.js"></script>
`);
mkdirSync(`${OUT}/models`, { recursive: true });
const io = new NodeIO();
for (const f of readdirSync("public/models").filter((f) => f.endsWith(".glb"))) {
  // GLB → glTF JSON with the binary buffer embedded as a data URI (same content, text container)
  const { json, resources } = await io.writeJSON(await io.read(`public/models/${f}`));
  for (const b of json.buffers ?? []) {
    b.uri = `data:application/octet-stream;base64,${Buffer.from(resources[b.uri]).toString("base64")}`;
  }
  writeFileSync(`${OUT}/models/${f.replace(/\.glb$/, ".gltf.json")}`, JSON.stringify(json));
}
cpSync("public/products", `${OUT}/products`, { recursive: true });
console.log("built", OUT);
