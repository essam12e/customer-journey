import type { RawStoreData } from "./types.ts";

// Demo catalogue used for the playable prototype and as the fallback when extraction fails.
export const DEMO_STORE: RawStoreData = {
  platform: "demo",
  sourceUrl: "demo://bait-alhail",
  storeName: "بيت الهيل",
  themeColorHints: ["#1F5E5B", "#F2A541"],
  currency: "SAR",
  locale: "ar-SA",
  products: [
    { id: "p01", title: "قهوة سعودية بالهيل", price: "58.00", category: "القهوة", description: "تحميص أشقر مع هيل مطحون طازج، 250 جرام.", available: true },
    { id: "p02", title: "بن إثيوبي يرغاتشيفي", price: "72.00", category: "القهوة", description: "نكهات زهرية وحمضية خفيفة، مناسب للتقطير.", available: true },
    { id: "p03", title: "دلة نحاسية صغيرة", price: "149.00", category: "أدوات الضيافة", description: "دلة نحاس مطروق يدويًا، سعة 600 مل.", available: true },
    { id: "p04", title: "فناجين خزف (6 قطع)", price: "95.00", category: "أدوات الضيافة", description: "طقم فناجين بزخرفة ذهبية رقيقة.", available: true },
    { id: "p05", title: "تمر سكري فاخر", price: "45.00", category: "الحلويات", description: "علبة 800 جرام من تمر القصيم.", available: true },
    { id: "p06", title: "معمول بالفستق", price: "39.50", category: "الحلويات", description: "12 قطعة طازجة بالفستق الحلبي.", available: true },
    { id: "p07", title: "شاي أحمر بالزعفران", price: "34.00", category: "الشاي والأعشاب", description: "خلطة شاي سيلاني مع خيوط زعفران.", available: true },
    { id: "p08", title: "بابونج وليمون", price: "27.00", category: "الشاي والأعشاب", description: "أعشاب مجففة لمساء هادئ، 20 كيس.", available: true },
    { id: "p09", title: "شمعة عود وورد", price: "68.00", category: "أدوات الضيافة", description: "شمعة صويا معطرة، تشتعل 40 ساعة.", available: true },
    { id: "p10", title: "عسل سدر جبلي", price: "185.00", category: "الحلويات", description: "عسل سدر خام، 500 جرام.", available: false },
  ],
};
