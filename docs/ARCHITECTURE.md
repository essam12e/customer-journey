# رحلة العميل | Customer Journey — المعمارية

## المهارات المستخدمة (من gamedev@awesome-gamedev-agent-skills، عبر router)
| المهارة | أين طُبّقت |
|---|---|
| threejs-scene-setup | Canvas/Renderer، pixelRatio ≤ 1.5، حلقة الرسم، dt مقيّد [0, 0.1] |
| threejs-materials-lighting | MeshStandardMaterial، Hemisphere + Directional واحد بظل، كاميرا ظل مضبوطة، tone mapping |
| threejs-gltf-loading | تحميل GLB (useGLTF) تدريجيًا داخل Suspense مع بديل إجرائي، والتحقق بـ gltf-transform validate |
| camera-systems | منظور أول: yaw/pitch، تقييد ±80°، تنعيم 1-exp(-k·dt)، تحديث بعد الفيزياء |
| input-systems | أفعال move/look/interact/cart، مفاتيح فيزيائية (KeyW)، منطقة ميتة دائرية للعصا |
| physics-tuning | Rapier بخطوة ثابتة 1/60 مع interpolation، Kinematic Character Controller |
| game-feel | تسارع/تباطؤ، هزّة رأس خفيفة، نبضة عند الإضافة للسلة، تنعيم كل الحركات |
| game-ui-ux | شاشات كمكدّس (start → play → card/cart)، HUD يتحدث بالأحداث (Zustand subscribe)، safe-area |
| audio-design | ناقلات Master ← {SFX, UI, Ambience} بالديسيبل، تنويع pitch للخطوات |
| performance-optimization | ميزانيات: < 150 draw call، instancing للأرفف، PerformanceMonitor لخفض الدقة |
| level-design | blockout بمقاييس اللاعب (ارتفاع عين 1.6م، ممرات ≥ 2.4م)، مسار حرج من الباب للسلة |
| create-game-assets | ملف art-direction + asset-manifest، أصول GLB مولّدة بسكربت حتمي |

## الطبقات (منفصلة تمامًا)
```
URL المتجر
  │
  ▼ 1. Extraction     src/pipeline/extract/*      محولات: demo · shopify(public products.json) · jsonld(schema.org عام) · salla · zid (OAuth رسمي)
  ▼ 2. Normalization  src/pipeline/normalize.ts   → NormalizedStore (منتجات/أقسام/عملة موحّدة)
  ▼ 3. Theme          src/pipeline/theme.ts       → StoreTheme (ألوان/هوية) من البيانات أو الافتراضي
  ▼ 4. Template       src/pipeline/templates.ts   → StoreTemplate (أبعاد، أقسام، أرفف)
  ▼ 5. Placement      src/pipeline/placement.ts   → StoreLayout (موقع كل منتج على رف، مُحدد حتميًا)
  ▼ 6. FP Engine      src/engine/*                يقرأ StoreLayout فقط — لا يعرف شيئًا عن المصدر
  ▼ 7. Cart           src/cart/cartStore.ts       Zustand، محفوظ محليًا
  ▼ 8. Checkout       src/cart/checkout.ts        مزوّدون: demo (لا شراء حقيقي) · shopify cart permalink
```
- كل مرحلة دالة نقية تأخذ مخرجات السابقة → قابلة للاختبار بشكل منفصل.
- الاستخراج يعيد `Result` (نجاح أو خطأ مصنّف: blocked / auth_required / not_found / unsupported)، والمحرك يرجع لقالب العرض عند الفشل.
- لا يوجد شراء حقيقي إلا عبر مزوّد checkout موثّق؛ مزوّد demo يقول ذلك صراحة للمستخدم.

## خطة التنفيذ (كل مرحلة تُختبر قبل التالية)
1. Scaffold: Next.js + TS + R3F + drei + Rapier + Zustand → اختبار: build ينجح.
2. Pipeline بالبيانات التجريبية (10 منتجات) → اختبار: وحدات node للمراحل 2-5.
3. الأصول GLB (سكربت) + validate.
4. العالم: مدخل، باب، أقسام، أرفف، إضاءة → اختبار: لقطة شاشة.
5. اللاعب: حركة + تصادم + كاميرا → اختبار Playwright: الحركة تغيّر الموقع، الجدار يوقفه.
6. التفاعل + البطاقة + السلة → اختبار: إضافة منتج تزيد العدد.
7. الجوال: عصا + سحب للنظر → اختبار Playwright بمحاكاة لمس.
8. الأداء: قياس fps/draw calls.
9. مرحلة الروابط الحقيقية: API route + محولات + معالجة الفشل.
