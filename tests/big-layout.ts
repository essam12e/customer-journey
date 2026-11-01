// Prints a 216-product layout (12 categories) as JSON, for load tests.
import { buildLayout } from "../src/pipeline/index.ts";
const cats = ["قهوة", "شاي", "حلويات", "عطور", "ورد", "بخور", "هدايا", "أواني", "تمور", "عسل", "مكسرات", "شموع"];
console.log(JSON.stringify({ ok: true, stats: { found: 216 }, layout: buildLayout({
  platform: "jsonld", sourceUrl: "https://big.example", storeName: "متجر كبير", themeColorHints: ["#7a3b69"],
  products: Array.from({ length: 216 }, (_, i) => ({ id: `b${i}`, title: `${cats[i % 12]} ${i}`, price: 10 + i, category: cats[i % 12], imageUrl: `https://img.example/${i}.jpg` })),
}) }));
