// Los coches aparcados en la plaza de Santa María (tools/blender/iglesia_plaza.py, iglesia_coches.json): en cada sitio, una
// copia de uno de los coches del pueblo (coche_<k> del .glb de la calle), que comparte su malla y sus materiales: no
// cuesta memoria de vértices ni de texturas. Se reparten por los coches del pueblo para que salgan de varios modelos y
// colores. Cada copia entra en la lista de vida.json, así que src/vida.js la cambia por su versión con más triángulos
// de cerca y la apaga de lejos, como a los demás. El relieve lo pone el juego en cada vértice (src/relieve.js): la
// copia va a la altura de la calle del .glb, como el original. ?aparcados=0 los quita
import { Vec2 } from 'playcanvas';

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

// Los coches del pueblo comparten la malla de su modelo (cargar antes, 13-11-2026: tools/blender/coches_reales.py,
// compartir): cada uno la llevaba entera y eran 11 MB de lo que hay que bajar antes de empezar. La compartida trae la
// pintura del primero de ese modelo y la matrícula de la casilla 0 del atlas; aquí cada coche toma la suya, como era:
// su pintura (vida.json, «color», el nombre del material) y su matrícula («placa», la casilla del atlas de 4 × 4, con
// un material por casilla que corre la textura). La muestra con todas las pinturas no se dibuja. Antes de copiar los
// de la plaza de la iglesia (aparcar) y de cambiarlos de cerca (src/vida.js): toman los materiales de aquí
export function pintarCoches({ app, coches, materiales }) {
  const porNombre = new Map(materiales.filter(Boolean).map((m) => [m.name, m]));
  const placas = new Map();
  let n = 0;
  for (const c of coches || []) {
    if (!c.color) continue;
    const e = app.root.findByName(c.nodo);
    if (!e?.render) continue;
    const pintura = porNombre.get(c.color);
    for (const mi of e.render.meshInstances) {
      const nombre = mi.material?.name || '';
      if (pintura && nombre.startsWith('pintura_')) mi.material = pintura;
      else if (nombre === 'matricula' && c.placa) {
        let m = placas.get(c.placa);
        if (!m) {
          // (en las UV del juego, como en las de Blender: la casilla 0 es la de arriba a la izquierda; la i va a la
          // derecha y la j hacia abajo)
          m = mi.material.clone(); m.name = 'matricula_' + c.placa;
          const du = (c.placa % 4) / 4, dv = -Math.floor(c.placa / 4) / 4;
          for (const k of ['diffuse', 'emissive', 'normal', 'opacity', 'gloss', 'metalness', 'ao']) if (m[k + 'Map']) m[k + 'MapOffset'] = new Vec2(du, dv);
          m.update(); placas.set(c.placa, m);
        }
        mi.material = m;
      }
    }
    n++;
  }
  const muestra = app.root.findByName('muestra_coches');
  if (muestra) muestra.enabled = false;
  return n;
}
