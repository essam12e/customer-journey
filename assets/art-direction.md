# Art direction — Cozy Stylized 3D (create-game-assets brief)

- **Engine / view**: three.js via React Three Fiber, first-person, eye height 1.6 m, FOV 70°.
- **World scale**: 1 unit = 1 m. Props authored at real size, origin on the floor.
- **Shape language**: rounded boxes (2–3 cm bevel), chunky proportions, no sharp edges, low-poly
  foliage (icosahedron detail 1). Silhouettes must read at 3–5 m.
- **Palette roles**: wood `#B9784A` / dark wood `#8C5634`; store primary (from Theme stage, desaturated);
  saffron accent `#F2A541`; walls = primary hue at 22% sat / 86% light; dusk sky outside.
- **Materials**: MeshStandardMaterial only, roughness 0.5–0.95, metalness 0 except brass/iron. No textures
  on props (flat colour = small download, consistent look). Product labels are SVG art.
- **Lighting**: warm hemisphere fill + one shadow-casting directional "late sun" through the entrance +
  non-shadow warm point lights under pendant lamps. ACES tone mapping, soft fog.
- **Motion**: everything eased; nothing linear; idle product bob ≤ 2 cm.
- **Budgets**: ≤ 150 draw calls, ≤ 150k triangles, each GLB ≤ 100 KB, shadow map 1024² (512² on low tier).
- **Exclude**: logos of real brands, text baked into models (text is rendered at runtime from data).
