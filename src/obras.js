// Las obras (15-11-2026; el usuario: «añade contenedores de escombros típicos de obras, 4 en todo el pueblo»). Un
// contenedor de obra de los de toda la vida —la caja de chapa de unos 5 m³, con los extremos en rampa, los refuerzos
// verticales, el borde redondo y los ganchos para el camión—, pintado y gastado, con su rótulo genérico, y lleno de
// escombros: cascotes, ladrillos, alguna tabla y un tubo asomando. Cada uno ocupa el sitio de un coche aparcado (donde
// está en la calle, pegado al bordillo, sin pisar acera ni casa: lo que se pone en una plaza de aparcamiento), repartidos
// por el pueblo: el primero, cerca de la plaza de España; los demás, lo más lejos posible entre sí. Con su caja de choque,
// como un coche, para la chica, el coche que se conduce y la gente. Siempre los mismos. ?obras=0, sin ellos.
import { Color, Entity, MeshInstance, Quat, StandardMaterial, Texture, Vec3, createMesh, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';

const COLORES = ['#e0a81c', '#d0661f', '#2f6b3a', '#24508a'];   // (amarillo, naranja, verde y azul: los de las empresas de la zona)

// un generador de números siempre igual (para que los contenedores y sus escombros salgan cada vez igual)
const semilla = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

function texturaChapa(device, color, r) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 512, 256);
  // (la pintura, gastada: manchas más claras y más oscuras, regueros de óxido desde el borde y golpes)
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.06})`; const x = r() * 512, y = r() * 256, w = 8 + r() * 60; g.fillRect(x, y, w, w * (0.3 + r())); }
  for (let i = 0; i < 26; i++) { const x = r() * 512, l = 30 + r() * 150, w = 2 + r() * 6; const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, 'rgba(110,52,22,0.75)'); gr.addColorStop(1, 'rgba(110,52,22,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, l); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${70 + r() * 40},${45 + r() * 20},${30},${0.35 + r() * 0.4})`; g.beginPath(); g.arc(r() * 512, 40 + r() * 216, 1 + r() * 5, 0, 7); g.fill(); }
  const pie = g.createLinearGradient(0, 180, 0, 256); pie.addColorStop(0, 'rgba(60,50,40,0)'); pie.addColorStop(1, 'rgba(60,50,40,0.55)'); g.fillStyle = pie; g.fillRect(0, 180, 512, 76);   // (barro abajo)
  // (el rótulo, genérico y algo desconchado)
  g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(245,245,240,0.88)'; g.fillText('CONTENEDORES', 256, 110);
  g.font = 'bold 22px Arial, sans-serif'; g.fillText('ESCOMBROS · OBRAS', 256, 142);
  for (let i = 0; i < 70; i++) { g.fillStyle = color; g.fillRect(130 + r() * 250, 80 + r() * 70, 1 + r() * 4, 1 + r() * 3); }
  const t = new Texture(device, { width: 512, height: 256, mipmaps: true, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'contenedor_chapa' }); t.setSource(c); return t;
}
function texturaEscombro(device, r) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#6d675e'; g.fillRect(0, 0, 256, 256);
  const tonos = ['#8f8b83', '#a9a59b', '#7b766d', '#b8ad96', '#9a4b33', '#8b3f2a', '#c7bba1', '#6f5a43', '#55524c'];
  for (let i = 0; i < 900; i++) {   // (cascotes de hormigón, trozos de ladrillo, yeso, polvo y alguna astilla de madera)
    const x = r() * 256, y = r() * 256, s = 2 + r() * 13; g.fillStyle = tonos[Math.floor(r() * tonos.length)];
    g.beginPath(); g.moveTo(x, y); for (let k = 1; k < 6; k++) { const a = k / 6 * 6.28 + r() * 0.6, d = s * (0.5 + r() * 0.6); g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); g.fill();
    if (r() < 0.3) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x + s * 0.4, y + s * 0.4, s * 0.5, 1.5); }
  }
  for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(220,210,190,0.18)'; g.fillRect(r() * 256, r() * 256, 4 + r() * 18, 2 + r() * 8); }   // (polvo de yeso)
  const t = new Texture(device, { width: 256, height: 256, mipmaps: true, name: 'contenedor_escombro' }); t.setSource(c); return t;
}

// la caja: chapa por fuera y por dentro, con el fondo, el borde de arriba y las dos rampas de los extremos
function mallaCaja(device) {
  const L0 = 1.5, L1 = 1.8, W = 0.82, Y0 = 0.1, Y1 = 1.18, e = 0.05;   // (abajo 3 m, arriba 3,6; 1,64 de ancho; 1,08 de alto)
  const pos = [], nor = [], uv = [], ind = [];
  const cara = (P, n, uvs) => { const b = pos.length / 3; for (const p of P) pos.push(...p); for (let i = 0; i < 4; i++) nor.push(...n); uv.push(...uvs); ind.push(b, b + 1, b + 2, b, b + 2, b + 3); };
  const lateral = (z, sg, dentro) => {   // (un costado: un trapecio, con la textura del rótulo)
    const a = dentro ? L0 - e : L0, b = dentro ? L1 - e : L1, y0 = dentro ? Y0 + e : Y0;
    const P = [[-a, y0, z], [a, y0, z], [b, Y1, z], [-b, Y1, z]];
    const n = [0, 0, dentro ? -sg : sg];
    // (la u, de izquierda a derecha según se mira la cara: en las que miran a -z la x crece hacia la izquierda, y con la
    // misma u que las otras el rótulo salía al revés, como en un espejo)
    const u = (x) => (n[2] > 0 ? x + 1.8 : 1.8 - x) / 3.6;
    const U = [u(-a), 0.92, u(a), 0.92, u(b), 0.08, u(-b), 0.08];
    if ((sg > 0) !== dentro) cara(P, n, U); else cara([P[1], P[0], P[3], P[2]], n, [U[2], U[3], U[0], U[1], U[6], U[7], U[4], U[5]]);
  };
  lateral(W, 1, false); lateral(-W, -1, false); lateral(W - e, 1, true); lateral(-W + e, -1, true);
  const k = (L1 - L0) / (Y1 - Y0), nl = Math.hypot(1, k);
  for (const sx of [1, -1]) {   // (las rampas de los extremos, por fuera y por dentro)
    const n = [sx / nl, -k / nl, 0];
    const fuera = [[sx * L0, Y0, -W], [sx * L0, Y0, W], [sx * L1, Y1, W], [sx * L1, Y1, -W]];
    cara(sx > 0 ? fuera : [fuera[1], fuera[0], fuera[3], fuera[2]], n, [0.05, 0.95, 0.95, 0.95, 0.95, 0.05, 0.05, 0.05]);
    const dentro = [[sx * (L0 - e), Y0 + e, -W + e], [sx * (L0 - e), Y0 + e, W - e], [sx * (L1 - e), Y1, W - e], [sx * (L1 - e), Y1, -W + e]];
    cara(sx > 0 ? [dentro[1], dentro[0], dentro[3], dentro[2]] : dentro, [-n[0], -n[1], 0], [0.05, 0.95, 0.95, 0.95, 0.95, 0.05, 0.05, 0.05]);
  }
  cara([[-L0, Y0, W], [L0, Y0, W], [L0, Y0, -W], [-L0, Y0, -W]], [0, -1, 0], [0, 1, 1, 1, 1, 0, 0, 0]);   // (el fondo, por debajo)
  cara([[-L0 + e, Y0 + e, -W + e], [L0 - e, Y0 + e, -W + e], [L0 - e, Y0 + e, W - e], [-L0 + e, Y0 + e, W - e]], [0, 1, 0], [0, 1, 1, 1, 1, 0, 0, 0]);   // (y por dentro)
  // (el canto de arriba: una tira de chapa de 5 cm por los cuatro lados)
  cara([[-L1, Y1, W], [L1, Y1, W], [L1 - e, Y1, W - e], [-L1 + e, Y1, W - e]], [0, 1, 0], [0, 0, 1, 0, 1, 0.02, 0, 0.02]);
  cara([[L1, Y1, -W], [-L1, Y1, -W], [-L1 + e, Y1, -W + e], [L1 - e, Y1, -W + e]], [0, 1, 0], [0, 0, 1, 0, 1, 0.02, 0, 0.02]);
  cara([[L1, Y1, W], [L1, Y1, -W], [L1 - e, Y1, -W + e], [L1 - e, Y1, W - e]], [0, 1, 0], [0, 0, 1, 0, 1, 0.02, 0, 0.02]);
  cara([[-L1, Y1, -W], [-L1, Y1, W], [-L1 + e, Y1, W - e], [-L1 + e, Y1, -W + e]], [0, 1, 0], [0, 0, 1, 0, 1, 0.02, 0, 0.02]);
  return createMesh(device, pos, { normals: nor, uvs: uv, indices: ind });
}
// los escombros: un montón, más alto en el medio que en los bordes, con cascotes y huecos
function mallaEscombro(device, r) {
  const NX = 16, NZ = 8, LX = 1.7, LZ = 0.76, pos = [], uv = [], ind = [];
  for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NZ, x = (u * 2 - 1) * LX, z = (v * 2 - 1) * LZ;
    const borde = Math.min(u, 1 - u, v, 1 - v) * 2, monte = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
    const y = 0.92 + 0.36 * monte + (r() - 0.5) * 0.14 * Math.min(1, borde * 3) - (borde < 0.08 ? 0.05 : 0);
    pos.push(x, Math.min(y, borde < 0.1 ? 1.12 : 1.42), z); uv.push(u * 2.2, v * 1.1);
  }
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; ind.push(a, c, b, b, c, d); }
  const nor = new Array(pos.length).fill(0);
  for (let t = 0; t < ind.length; t += 3) {   // (las normales, de las caras)
    const [a, b, c] = [ind[t] * 3, ind[t + 1] * 3, ind[t + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const q of [a, b, c]) { nor[q] += nx; nor[q + 1] += ny; nor[q + 2] += nz; }
  }
  for (let q = 0; q < nor.length; q += 3) { const l = Math.hypot(nor[q], nor[q + 1], nor[q + 2]) || 1; nor[q] /= l; nor[q + 1] /= l; nor[q + 2] /= l; if (nor[q + 1] < 0) { nor[q] *= -1; nor[q + 1] *= -1; nor[q + 2] *= -1; } }
  return createMesh(device, pos, { normals: nor, uvs: uv, indices: ind });
}

function caja(padre, mat, sx, sy, sz, x, y, z, rx = 0, ry = 0, rz = 0, sombra = true) {
  const e = new Entity('pieza'); e.addComponent('render', { type: 'box', material: mat, castShadows: sombra });
  e.setLocalScale(sx, sy, sz); e.setLocalPosition(x, y, z); e.setLocalEulerAngles(rx, ry, rz); padre.addChild(e); return e;
}
let escombroTex = null;
function contenedor(app, n, r) {
  const d = app.graphicsDevice, raiz = new Entity('contenedor_obra');
  const color = COLORES[n % COLORES.length];
  const chapa = new StandardMaterial(); chapa.diffuseMap = texturaChapa(d, color, r); chapa.useMetalness = true; chapa.metalness = 0.35; chapa.gloss = 0.32; chapa.cull = 0; chapa.update();
  const chapaLisa = new StandardMaterial(), base = new Color().fromString(color); chapaLisa.diffuse = new Color(base.r * 0.82, base.g * 0.82, base.b * 0.82); chapaLisa.useMetalness = true; chapaLisa.metalness = 0.4; chapaLisa.gloss = 0.3; chapaLisa.update();
  const hierro = new StandardMaterial(); hierro.diffuse = new Color(0.16, 0.13, 0.11); hierro.useMetalness = true; hierro.metalness = 0.6; hierro.gloss = 0.35; hierro.update();
  // (el escombro, una sola textura para los cuatro: con una cada uno eran 1,4 MB de gráfica, y el móvil va justo)
  if (!escombroTex || escombroTex.device !== d) escombroTex = texturaEscombro(d, semilla(3882));
  const esc = new StandardMaterial(); esc.diffuseMap = escombroTex; esc.gloss = 0.08; esc.update();
  const madera = new StandardMaterial(); madera.diffuse = new Color(0.47, 0.34, 0.21); madera.gloss = 0.15; madera.update();
  const ladrillo = new StandardMaterial(); ladrillo.diffuse = new Color(0.62, 0.3, 0.2); ladrillo.gloss = 0.1; ladrillo.update();
  const tubo = new StandardMaterial(); tubo.diffuse = new Color(0.85, 0.45, 0.2); tubo.gloss = 0.4; tubo.update();   // (el naranja de los tubos de desagüe)
  const e = new Entity('chapa'); e.addComponent('render', { meshInstances: [new MeshInstance(mallaCaja(d), chapa)], castShadows: true }); raiz.addChild(e);
  // (los refuerzos verticales de los costados, el tubo del borde de arriba, los patines de abajo y los ganchos)
  for (const z of [0.835, -0.835]) for (const x of [-1.05, -0.35, 0.35, 1.05]) caja(raiz, chapaLisa, 0.09, 1.05, 0.04, x, 0.63, z);
  for (const z of [0.82, -0.82]) caja(raiz, chapaLisa, 3.66, 0.07, 0.07, 0, 1.2, z);
  for (const x of [1.8, -1.8]) caja(raiz, chapaLisa, 0.07, 0.07, 1.7, x, 1.2, 0);
  for (const z of [0.55, -0.55]) caja(raiz, hierro, 3.1, 0.1, 0.12, 0, 0.05, z);
  for (const x of [1.62, -1.62]) for (const z of [0.6, -0.6]) caja(raiz, hierro, 0.08, 0.16, 0.05, x, 0.85, z, 0, 0, x > 0 ? -16 : 16);
  const m = new Entity('escombro'); m.addComponent('render', { meshInstances: [new MeshInstance(mallaEscombro(d, r), esc)], castShadows: true }); raiz.addChild(m);
  // (lo que asoma: tablas, un tubo, ladrillos y unos cascotes grandes)
  for (let i = 0; i < 3; i++) caja(raiz, madera, 1.4 + r() * 0.8, 0.03, 0.16, (r() - 0.5) * 1.6, 1.25 + r() * 0.15, (r() - 0.5) * 0.9, (r() - 0.5) * 20, r() * 180, 8 + r() * 22);
  const t = new Entity('tubo'); t.addComponent('render', { type: 'cylinder', material: tubo, castShadows: true }); t.setLocalScale(0.1, 1.5, 0.1); t.setLocalPosition((r() - 0.5) * 1.2, 1.38, (r() - 0.5) * 0.6); t.setLocalEulerAngles(80, r() * 180, 0); raiz.addChild(t);
  for (let i = 0; i < 6; i++) caja(raiz, ladrillo, 0.24, 0.07, 0.115, (r() - 0.5) * 2.6, 1.3 + r() * 0.12, (r() - 0.5) * 1.1, r() * 30, r() * 180, r() * 25);
  for (let i = 0; i < 7; i++) { const s = 0.12 + r() * 0.2; caja(raiz, esc, s, s * 0.6, s * 0.8, (r() - 0.5) * 2.8, 1.25 + r() * 0.15, (r() - 0.5) * 1.2, r() * 40, r() * 180, r() * 40); }
  return raiz;
}

export function ponerObras({ app, coches, q }) {
  if (q.get('obras') === '0' || !coches?.coches?.length) return null;
  const N = 4, r = semilla(3881);
  const lista = coches.coches.filter((k) => k.caja && !k.conducido && !/^coche_iglesia/.test(k.c.nodo));
  // (de la calle, no de un aparcamiento lleno: con menos de nueve coches a 15 m)
  const d2 = (a, b) => Math.hypot(a.caja.x - b.caja.x, a.caja.z - b.caja.z);
  const enCalle = lista.filter((k) => lista.filter((o) => o !== k && d2(o, k) < 15).length < 9);
  if (enCalle.length < N) return null;
  // (el primero, el más cercano a la plaza de España —unos 25 m al este de su centro—; los demás, cada uno lo más lejos de
  // los ya elegidos, sin salir de unos 450 m del centro: el pueblo, no las afueras)
  const centro = [-122, 232], cerca = enCalle.filter((k) => Math.hypot(k.caja.x - centro[0], k.caja.z - centro[1]) < 450);
  const elegidos = [cerca.sort((a, b) => Math.hypot(a.caja.x - centro[0], a.caja.z - centro[1]) - Math.hypot(b.caja.x - centro[0], b.caja.z - centro[1]))[0]];
  while (elegidos.length < N) elegidos.push(cerca.filter((k) => !elegidos.includes(k)).sort((a, b) => Math.min(...elegidos.map((e) => d2(e, b))) - Math.min(...elegidos.map((e) => d2(e, a))))[0]);
  const hechos = [];
  elegidos.forEach((k, n) => {
    const c = k.caja, giro = new Quat().setFromEulerAngles(0, Math.atan2(-c.dz, c.dx) * 180 / Math.PI, 0);
    // (fuera el coche: el de lejos, el de cerca y su caja)
    k.lejos.enabled = false; k.cerca?.destroy(); c.e.destroy(); coches.coches.splice(coches.coches.indexOf(k), 1);
    const e = contenedor(app, n, r); e.setPosition(c.x, c.y0, c.z); e.setRotation(giro); app.root.addChild(e);
    // (su caja de choque, como la de un coche —y con su nombre: la gente la rodea igual y los rayos de las paredes no la
    // cuentan como pared—, y en la lista de los coches para que la rodeen los vecinos; sin poder subirse a ella)
    const cajaE = new Entity('caja_coche'); cajaE.setPosition(c.x, c.y0 + 0.62, c.z); cajaE.setRotation(giro); app.root.addChild(cajaE);
    cajaE.addComponent('rigidbody', { type: 'static', friction: 0.5, restitution: 0 });
    cajaE.addComponent('collision', { type: 'box', halfExtents: new Vec3(1.82, 0.62, 0.86) });
    const nueva = { e: cajaE, x: c.x, z: c.z, y0: c.y0, y1: c.y0 + 1.24, L: 3.64, W: 1.72, dx: c.dx, dz: c.dz };
    coches.coches.push({ c: { nodo: 'contenedor_obra_' + n, tipo: 'contenedor' }, lejos: e, caja: nueva, obra: true, mis: [] });
    hechos.push({ sustituye: k.c.nodo, x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, color: COLORES[n % COLORES.length] });
  });
  return hechos;
}
