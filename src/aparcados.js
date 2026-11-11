// Los coches aparcados en la plaza de Santa María (tools/blender/iglesia_plaza.py, iglesia_coches.json): en cada sitio, una
// copia de uno de los coches del pueblo (coche_<k> del .glb de la calle), que comparte su malla y sus materiales: no
// cuesta memoria de vértices ni de texturas. Se reparten por los coches del pueblo para que salgan de varios modelos y
// colores. Cada copia entra en la lista de vida.json, así que src/vida.js la cambia por su versión con más triángulos
// de cerca y la apaga de lejos, como a los demás. El relieve lo pone el juego en cada vértice (src/relieve.js): la
// copia va a la altura de la calle del .glb, como el original. ?aparcados=0 los quita
export function aparcar({ app, vida, sitios }) {
  const fuentes = (vida.coches || []).map((c) => ({ c, e: app.root.findByName(c.nodo) })).filter((f) => f.e?.render && f.e.parent);
  if (!fuentes.length || !sitios?.length) return 0;
  let n = 0;
  for (const s of sitios) {
    const f = fuentes[(s.n * 7919 + 13) % fuentes.length];
    // (hacia dónde va lo largo del coche en sus ejes: el modelo lo trae a lo largo de x o de z)
    let hx = 0, hz = 0;
    for (const mi of f.e.render.meshInstances) { const h = mi.mesh.aabb.halfExtents; hx = Math.max(hx, h.x); hz = Math.max(hz, h.z); }
    const giro = (hx >= hz ? Math.atan2(-s.dz, s.dx) : Math.atan2(s.dx, s.dz)) * 180 / Math.PI + (s.culo ? 180 : 0);
    const e = f.e.clone(); e.name = `coche_iglesia_${s.n}`;
    f.e.parent.addChild(e);
    e.setLocalPosition(s.x, f.e.getLocalPosition().y, s.z);
    e.setLocalEulerAngles(0, giro, 0);
    e.setLocalScale(f.e.getLocalScale());
    vida.coches.push({ nodo: e.name, tipo: f.c.tipo, pintura: f.c.pintura });
    n++;
  }
  return n;
}
