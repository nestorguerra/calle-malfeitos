// La sombra de contacto (15-11-2026; el usuario: «cuando el personaje está quieto está como levitando… asegúrate de que
// está bien asentado en el suelo»): una mancha oscura y suave en el suelo, bajo los pies de la chica y de los vecinos que
// hay cerca. La sombra del sol sale algo separada de los pies (el sesgo que evita las rayas en las paredes la despega
// unos centímetros) y sin esta mancha parecía que flotaban. Una sola malla con un recuadro por persona, rehecha en cada
// fotograma; el relieve se le pone como a todo (src/relieve.js). ?contacto=0 la quita.
import { BLEND_NORMAL, Color, CULLFACE_NONE, Entity, Mesh, MeshInstance, PRIMITIVE_TRIANGLES, StandardMaterial, Texture, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';

function texturaMancha(device) {
  const n = 64, datos = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = Math.hypot((i + 0.5) / n * 2 - 1, (j + 0.5) / n * 2 - 1), a = Math.max(0, 1 - d) ** 1.6, k = (j * n + i) * 4;
    datos[k] = 0; datos[k + 1] = 0; datos[k + 2] = 0; datos[k + 3] = Math.round(255 * a);
  }
  const t = new Texture(device, { width: n, height: n, mipmaps: true, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'sombra_contacto' });
  t.lock().set(datos); t.unlock(); return t;
}

export function montarSombras({ app, muneco, ctrl, camara, gente, reloj, q }) {
  if (q.get('contacto') === '0') return null;
  const MAX = 16;
  const mat = new StandardMaterial(); mat.diffuse = new Color(0, 0, 0); mat.emissive = new Color(0, 0, 0); mat.useLighting = false; mat.useFog = true;
  const tx = texturaMancha(app.graphicsDevice); mat.opacityMap = tx; mat.opacityMapChannel = 'a'; mat.blendType = BLEND_NORMAL; mat.depthWrite = false; mat.cull = CULLFACE_NONE; mat.update();
  const pos = new Float32Array(MAX * 12), uv = new Float32Array(MAX * 8), nor = new Float32Array(MAX * 12), ind = new Uint32Array(MAX * 6);
  for (let i = 0; i < MAX; i++) { uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); for (let k = 0; k < 4; k++) nor.set([0, 1, 0], (i * 4 + k) * 3); ind.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
  const mesh = new Mesh(app.graphicsDevice); mesh.setPositions(pos); mesh.setUvs(0, uv); mesh.setNormals(nor); mesh.setIndices(ind); mesh.update(PRIMITIVE_TRIANGLES);
  const e = new Entity('sombras_contacto'); const mi = new MeshInstance(mesh, mat); mi.cull = false;
  e.addComponent('render', { meshInstances: [mi], castShadows: false, receiveShadows: false }); app.root.addChild(e);
  const quad = (k, x, y, z, yaw, largo, ancho) => {
    const c = Math.cos(yaw), s = Math.sin(yaw), o = k * 12;
    const P = [[-ancho, -largo], [ancho, -largo], [ancho, largo], [-ancho, largo]];
    for (let i = 0; i < 4; i++) { const [a, b] = P[i]; pos[o + i * 3] = x + a * c + b * s; pos[o + i * 3 + 1] = y; pos[o + i * 3 + 2] = z - a * s + b * c; }
  };
  app.on('update', () => {
    let k = 0;
    // la chica (no mientras conduce), con su cuerpo: un poco más larga hacia donde mira
    if (ctrl.enabled && muneco.enabled) {
      const p = muneco.getPosition(), f = muneco.forward, y = Math.atan2(f.x, f.z);   // (el rumbo, del vector: los ángulos de Euler, pasados los 90°, salen reflejados y la mancha se torcía)
      quad(k++, p.x, p.y + 0.015, p.z, y, 0.34, 0.27);
    }
    // los vecinos de cerca
    const g = gente?.(), c = camara.getPosition();
    if (g?.lista) {
      const cerca = g.lista.filter((v) => v.raiz?.enabled !== false && Math.abs(v.x - c.x) < 28 && Math.abs(v.z - c.z) < 28)
        .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z)).slice(0, MAX - k);
      for (const v of cerca) { const s = (v.info?.alto || 1.7) / 1.7; quad(k++, v.x, v.y + 0.015, v.z, v.yaw || 0, 0.36 * s, 0.28 * s); }
    }
    pos.fill(0, k * 12);
    mesh.setPositions(pos); mesh.update(PRIMITIVE_TRIANGLES, false);
    // (más marcada de día y a la sombra que de noche)
    mat.opacity = 0.5 - 0.18 * (reloj?.noche || 0); mat.update();
    e.enabled = k > 0;
  });
  return e;
}
