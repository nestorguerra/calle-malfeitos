// La gente de Guareña (docs/pueblo_vivo.md, tareas 9 a 11; las cuentas, en docs/gente.md). El usuario, el 14-11-2026:
// «un volumen de personas proporcional a los habitantes […] en función de la hora del día […] como si fuera un GTA, pero
// que la gente se mueva en la proporción normal que suele ocurrir en Guareña […] con un sentido lógico y una coherencia
// humana».
// - Cuántos: Guareña tiene 6.665 vecinos; la parte que está en la calle sale de la hora (CURVA), del día de la semana y
//   de la estación. Se reparten por las calles según lo cerca que están del centro, más en las plazas y junto a las
//   tiendas; los que tocan a la chica son los de las calles de su alrededor (RADIO), con un tope para el aparato.
// - Quién: los mayores salen por la mañana y a la caída de la tarde, los niños a la salida del colegio y por la tarde a
//   jugar, los adultos a sus recados y al paseo, los jóvenes por la tarde y la noche (MEZCLA).
// - Qué hace cada uno: andar por la acera de un sitio a otro (de un portal a una tienda, a la plaza, a otro portal, a la
//   iglesia), pasear, pararse a charlar en corro, sentarse en los bancos, los niños jugar a correr en las plazas por la
//   tarde, ir a misa a su hora (y, durante la misa, la iglesia con gente en los bancos).
// - Como en los juegos de mundo abierto, solo existen los de alrededor: aparecen donde la chica no mira (detrás de ella,
//   tras una esquina o lejos) y se van cuando quedan lejos o entran en un portal, una tienda o la iglesia sin que se vea.
// - Andan con su paso medido (sin patinar: andar 1,33 m/s, pasear 1,07, los niños corriendo 2,16), se apartan de la chica
//   y del coche, y los más cercanos llevan una cápsula para que la chica no los atraviese.
// - Con otras personas jugando cerca (el multijugador, src/multi_gente.js; docs/multijugador.md, fase 2), los mismos
//   vecinos para todos: los mueve el juego del primero que llegó (el «anfitrión»), alrededor de su chica y de la de cada
//   uno de los que le siguen —sin aparecer ni irse a la vista de ninguno—, y los demás (las «réplicas») los ven con lo que
//   les llega, 300 ms por detrás. Lo que se hace con un vecino ajeno (hablarle, que te acompañe…) se le pide al anfitrión.
// Para las pruebas y para hablar con ellos (src/acciones.js): window.foto.gente. ?gente=0, sin gente; ?gente=2, el doble;
// ?gentetope=, ?genteradio=.
import { Asset, BLEND_NONE, Color, Entity, Quat, StandardMaterial, Vec3 } from 'playcanvas';
import { brazoSaludo } from './gestos.js';

export const VECINOS = 6665; // (INE, padrón de 2024)
// la parte de los vecinos que está en la calle a cada hora de un día de diario (hora, fracción): casi nadie de
// madrugada; la mañana de recados, con el pico al mediodía (la salida del colegio a las dos); la siesta, vacía; la tarde
// de los niños en las plazas y el paseo al caer la tarde; la cena, en casa (docs/gente.md)
const CURVA = [[0, 0.004], [2, 0.0015], [5, 0.001], [6.5, 0.004], [7.5, 0.014], [8.5, 0.024], [9.5, 0.026], [10.5, 0.034], [11.5, 0.042], [12.5, 0.046],
  [13.5, 0.048], [14.5, 0.026], [15.5, 0.012], [16.5, 0.018], [17.5, 0.034], [18.5, 0.046], [19.5, 0.052], [20.5, 0.044], [21.5, 0.026], [22.5, 0.014], [23.5, 0.007], [24, 0.004]];
// quién está en la calle a cada hora (mayores, adultos, jóvenes, niños), por tramos
const MEZCLA = [[0, [0.05, 0.45, 0.5, 0]], [7, [0.12, 0.6, 0.12, 0.16]], [9.5, [0.45, 0.43, 0.06, 0.06]], [13.5, [0.24, 0.4, 0.1, 0.26]], [15, [0.2, 0.5, 0.2, 0.1]],
  [17, [0.3, 0.25, 0.15, 0.3]], [20.5, [0.25, 0.42, 0.28, 0.05]], [22.5, [0.04, 0.46, 0.5, 0]]];
const TIPOS = ['mayor', 'adulto', 'joven', 'nino'];
// los clips, por número (lo que se manda a los demás jugadores)
export const CLIPS = ['quieto', 'andar', 'pasear', 'correr', 'charla', 'sentado', 'charla_sentado', 'sentarse', 'levantarse', 'sentado_iglesia'];
const PASO = { andar: 1.33, pasear: 1.07, correr: 2.16 }; // (m/s a los que pisan sus clips sin patinar: medido con el pie que apoya)
// la misa (Santa María): de diario a las siete de la tarde (en verano, a las ocho) y el domingo a las doce
const misaHora = (dia, mes) => (dia === 0 ? 12 : (mes >= 6 && mes <= 9) ? 20 : 19);

function interpolar(tabla, h) {
  for (let i = 0; i + 1 < tabla.length; i++) {
    const [h0, v0] = tabla[i], [h1, v1] = tabla[i + 1];
    if (h >= h0 && h <= h1) return v0 + (v1 - v0) * (h - h0) / (h1 - h0);
  }
  return tabla[tabla.length - 1][1];
}
// la fracción de los vecinos en la calle: la de la hora, con el día de la semana y la estación
export function enLaCalle(h, dia, mes) {
  let f = interpolar(CURVA, h);
  if (dia === 0) f *= h < 10 ? 0.45 : h < 14.5 ? 1.25 : h > 17 && h < 21.5 ? 1.1 : 1; // (el domingo: mañana tarde, misa y aperitivo, paseo)
  if (dia === 6) f *= h < 9 ? 0.6 : h > 21 ? 1.6 : 1.05; // (el sábado: sin madrugar, y la noche de los jóvenes)
  if (mes === 11 || mes === 12 || mes <= 2) f *= h > 18.5 ? 0.72 : h > 12 && h < 16 ? 1.1 : 1; // (en invierno: al sol del mediodía sí, de noche con frío no)
  if (mes >= 6 && mes <= 8) f *= h > 14 && h < 18.5 ? 0.35 : h > 21 || h < 1 ? 2 : 1; // (en verano: la siesta con el calor, nadie; de noche, al fresco)
  return f;
}
const mezclaDe = (h, dia, oscuro = false) => {
  let m = MEZCLA[0][1];
  for (const [h0, v] of MEZCLA) if (h >= h0) m = v;
  m = m.slice();
  if (dia === 0 || dia === 6) { if (h > 10 && h < 14) m[3] += 0.12; } // (el fin de semana, los niños también por la mañana)
  if (oscuro && h > 12) m[3] *= 0.4; // (de noche, los niños a casa: en invierno anochece a las seis y media)
  return m;
};

const azar = (a, b) => a + Math.random() * (b - a);
const elegir = (l) => l[Math.floor(Math.random() * l.length)];
const pesar = (pesos) => { let s = 0; for (const p of pesos) s += p; let r = Math.random() * s; for (let i = 0; i < pesos.length; i++) { r -= pesos[i]; if (r <= 0) return i; } return pesos.length - 1; };
const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export async function montarGente({ app, vida, carpeta, glb, camara, chica, reloj, q, movil, iglesia, conducir }) {
  const fq = q.get('gente');
  if (fq === '0' || !vida?.calles?.length) return null;
  const FACTOR = fq && !isNaN(parseFloat(fq)) ? parseFloat(fq) : 1;
  const TOPE = parseInt(q.get('gentetope') || (movil ? '16' : '40'), 10);
  const RADIO = parseFloat(q.get('genteradio') || (movil ? '60' : '80'));
  const info = await (await fetch(carpeta + 'gente.json')).json();
  const sitiosIglesia = iglesia ? await fetch(iglesia).then((r) => r.json()).catch(() => null) : null;
  // (en el móvil, seis de los doce: uno y una de cada edad, menos de los jóvenes y los niños, que salen menos; cada cuerpo
  // son unos 2 MB de gráfica y otros tantos de JavaScript. ?gentecuerpos= cuántos)
  let personas = Object.keys(info).map(Number).sort((a, b) => a - b);
  const nCuerpos = parseInt(q.get('gentecuerpos') || (movil ? '6' : '12'), 10);
  if (nCuerpos < personas.length) {
    const orden = []; const por = (t, sx) => personas.filter((i) => info[i].tipo === t && (sx == null || info[i].sexo === sx));
    for (const [t, sx] of [['mayor', 1], ['mayor', 0], ['adulto', 1], ['adulto', 0], ['joven', null], ['nino', null], ['adulto', 1], ['adulto', 0], ['mayor', 1], ['mayor', 0], ['joven', null], ['nino', null]]) {
      const c = por(t, sx).find((i) => !orden.includes(i)); if (c != null) orden.push(c);
    }
    personas = orden.slice(0, nCuerpos).sort((a, b) => a - b);
  }
  const deTipo = Object.fromEntries(TIPOS.map((t) => [t, personas.filter((i) => info[i].tipo === t)]));

  // ---- las aceras: cada calle, un punto cada 4 m con la distancia del eje al bordillo y a la pared a cada lado
  // (vida.calles: [x, z, bordillo izq., bordillo der., pared izq., pared der.]); por dónde se anda: por el medio de la
  // acera; si no hay acera, por el borde de la calzada junto a la pared, como en las calles estrechas de verdad
  const C = vida.calles; let n = 0; for (const c of C) n += c.p.length;
  const X = new Float32Array(n), Z = new Float32Array(n), NX = new Float32Array(n), NZ = new Float32Array(n), OF = [new Float32Array(n), new Float32Array(n)];
  const BORDE = [new Float32Array(n), new Float32Array(n)]; // (la distancia del eje al bordillo a cada lado: en una plaza, lo que hay de explanada)
  const PARED = [new Float32Array(n), new Float32Array(n)], W = new Float32Array(n), CALLE = new Int32Array(n), PLAZA = new Uint8Array(n), VEC = Array.from({ length: n }, () => []);
  const acera = (c, w) => {
    if (c != null && w != null && w > c + 0.4) return c + Math.max(0.3, Math.min(1.6, (w - c) / 2));
    if (c != null && w == null) return c + 0.8;
    if (w != null) return Math.max(w * 0.5, w - 0.8);
    return 2.5;
  };
  let id = 0; const tramos = [];
  for (let ci = 0; ci < C.length; ci++) {
    const p = C[ci].p, b = id, esPlaza = /^Plaza/.test(C[ci].nombre);
    tramos.push([b, b + p.length]);
    for (let k = 0; k < p.length; k++, id++) {
      X[id] = p[k][0]; Z[id] = p[k][1]; CALLE[id] = ci; PLAZA[id] = esPlaza ? 1 : 0;
      const a = p[Math.max(0, k - 1)], c = p[Math.min(p.length - 1, k + 1)]; let dx = c[0] - a[0], dz = c[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      NX[id] = dz; NZ[id] = -dx; // (la normal del lado «izquierdo» de vida.calles; el otro lado, la contraria)
      OF[0][id] = acera(p[k][2], p[k][4]); OF[1][id] = acera(p[k][3], p[k][5]);
      PARED[0][id] = p[k][4] ?? 30; PARED[1][id] = p[k][5] ?? 30;
      BORDE[0][id] = p[k][2] ?? 2.5; BORDE[1][id] = p[k][3] ?? 2.5;
      if (k > 0) { VEC[id].push(id - 1); VEC[id - 1].push(id); }
    }
    // (sin saltos: la mediana de tres, que en los cruces la pared desaparece y vuelve)
    for (const o of OF) { const v = Array.from(o.subarray(b, id)); for (let k = 1; k + 1 < v.length; k++) o[b + k] = [v[k - 1], v[k], v[k + 1]].sort((x, y) => x - y)[1]; }
  }
  // la rejilla, para buscar cerca
  const CEL = 8, rej = new Map(), clave = (a, b) => (a + 2000) * 5000 + b + 2000;
  for (let i = 0; i < n; i++) { const k = clave(Math.floor(X[i] / CEL), Math.floor(Z[i] / CEL)); let l = rej.get(k); if (!l) rej.set(k, (l = [])); l.push(i); }
  const cerca = (x, z, r, f) => {
    for (let a = Math.floor((x - r) / CEL); a <= Math.floor((x + r) / CEL); a++) for (let b = Math.floor((z - r) / CEL); b <= Math.floor((z + r) / CEL); b++) {
      const l = rej.get(clave(a, b)); if (l) for (const j of l) f(j);
    }
  };
  const nodoCerca = (x, z, r = 30, f = null) => { let m = -1, dm = r; cerca(x, z, r, (j) => { const d = Math.hypot(X[j] - x, Z[j] - z); if (d < dm && (!f || f(j))) { dm = d; m = j; } }); return m; };
  // los cruces: cada punto, con el más cercano de cada otra calle a menos de 6 m
  for (let i = 0; i < n; i++) {
    const mejor = new Map();
    cerca(X[i], Z[i], 6, (j) => { if (CALLE[j] === CALLE[i]) return; const d = Math.hypot(X[j] - X[i], Z[j] - Z[i]); if (d < 6 && (!mejor.has(CALLE[j]) || mejor.get(CALLE[j])[1] > d)) mejor.set(CALLE[j], [j, d]); });
    for (const [, [j]] of mejor) if (!VEC[i].includes(j)) { VEC[i].push(j); VEC[j].push(i); }
  }
  // el peso de cada punto: más cerca del centro (la plaza de España), en las plazas y junto a las tiendas
  const pEsp = vida.plazas?.find((p) => /España/.test(p.nombre))?.p, centro = pEsp ? pEsp[Math.floor(pEsp.length / 2)] : [0, 0];
  const tiendasCerca = new Uint8Array(n);
  for (const t of vida.tiendas || []) cerca(t.p[0], t.p[2], 15, (j) => { if (Math.hypot(X[j] - t.p[0], Z[j] - t.p[2]) < 15) tiendasCerca[j] = 1; });
  let WT = 0;
  for (let i = 0; i < n; i++) { W[i] = 4 * (1 + 5 * Math.exp(-Math.hypot(X[i] - centro[0], Z[i] - centro[1]) / 220)) * (PLAZA[i] ? 3 : 1) * (tiendasCerca[i] ? 1.4 : 1); WT += W[i]; }

  // el camino de un punto a otro por las calles (A*, con un tope)
  function caminoEntre(a, b, tope = 6000) {
    if (a < 0 || b < 0) return null; if (a === b) return [a];
    const dist = new Map([[a, 0]]), de = new Map(), heap = [[Math.hypot(X[a] - X[b], Z[a] - Z[b]), a]];
    const sube = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const baja = (i) => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } };
    let vistos = 0;
    while (heap.length && vistos++ < tope) {
      const [, u] = heap[0]; const ult = heap.pop(); if (heap.length) { heap[0] = ult; baja(0); }
      if (u === b) { const r = [b]; let k = b; while (de.has(k)) { k = de.get(k); r.push(k); } return r.reverse(); }
      const du = dist.get(u);
      for (const v of VEC[u]) {
        const nd = du + Math.hypot(X[v] - X[u], Z[v] - Z[u]) + (CALLE[v] !== CALLE[u] ? 3 : 0); // (cambiar de calle cuesta algo: no se zigzaguea)
        if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); de.set(v, u); heap.push([nd + Math.hypot(X[v] - X[b], Z[v] - Z[b]), v]); sube(heap.length - 1); }
      }
    }
    return null;
  }
  // (el sitio de la acera de un punto de la calle; la primera vez que se usa, con la pared medida de verdad: un rayo desde el
  // eje hacia ese lado, a 1,5 m del suelo (por encima de bolardos, bancos y jardineras). Donde el plano de calles no sabe a
  // qué distancia está la pared, la acera salía de los puntos de al lado y a veces caía dentro de una casa)
  const medida = new Uint8Array(n * 2), va3 = new Vec3(), vb3 = new Vec3();
  const medir = (i, lado) => {
    medida[i * 2 + lado] = 1;
    const sg = lado ? -1 : 1, o = OF[lado][i], h = app.systems.rigidbody?.raycastFirst(va3.set(X[i], 1.66, Z[i]), vb3.set(X[i] + NX[i] * sg * (o + 0.45), 1.66, Z[i] + NZ[i] * sg * (o + 0.45)), soloParedes);
    if (h) OF[lado][i] = Math.max(0.25, Math.min(o, Math.hypot(h.point.x - X[i], h.point.z - Z[i]) - 0.45));
  };
  const carril = (i, lado, o = [0, 0]) => { if (!medida[i * 2 + lado]) medir(i, lado); const d = lado ? -OF[1][i] : OF[0][i]; o[0] = X[i] + NX[i] * d; o[1] = Z[i] + NZ[i] * d; return o; };
  const ladoDe = (i, x, z) => ((x - X[i]) * NX[i] + (z - Z[i]) * NZ[i] >= 0 ? 0 : 1);
  // un punto al azar en la explanada de una plaza, a la altura del punto i (de bordillo a bordillo, con un metro de margen)
  // ---- si se puede ir en línea recta de un punto a otro, a la altura de la cintura: sin una pared ni un coche en medio
  const va2 = new Vec3(), vb2 = new Vec3();
  // (solo las paredes: los coches aparcados se esquivan aparte, y rodear por el centro de la calle a un coche que está
  // entre la acera y el centro era atravesarlo; tools/prueba_gente.py)
  const soloParedes = { filterCallback: (e) => e.name !== 'caja_coche' && e.name !== 'coche_que_pasa' && e.name !== 'controlador' && !e.tags?.has('gente') };
  const hayPaso = (x0, z0, x1, z1, y) => !app.systems.rigidbody.raycastFirst(va2.set(x0, y + 0.9, z0), vb2.set(x1, y + 0.9, z1), soloParedes);
  // (sin caer encima de un coche aparcado: la caja de cada uno, de src/conducir.js, con 0,7 m de margen)
  const libreDeCoches = (x, z, margen = 0.7) => {
    for (const k of window.foto?.coches?.coches || []) {
      const c = k.caja; if (!c || k.conducido || Math.abs(c.x - x) > 4 || Math.abs(c.z - z) > 4) continue;
      const rx = x - c.x, rz = z - c.z, lx = rx * c.dx + rz * c.dz, lz = -rx * c.dz + rz * c.dx;
      if (Math.abs(lx) < c.L / 2 + margen && Math.abs(lz) < c.W / 2 + margen) return false;
    }
    return true;
  };
  // las plazas cuyo eje es un anillo cerrado (la de España): su interior es la explanada; se busca dentro, a más de 2 m del borde
  const anillos = new Map();
  for (const pl of vida.plazas || []) { const q_ = pl.p; if (q_.length > 3 && Math.hypot(q_[0][0] - q_[q_.length - 1][0], q_[0][1] - q_[q_.length - 1][1]) < 6) anillos.set(pl.nombre, q_); }
  const dentroAnillo = (an, x, z) => { let d = false; for (let a = 0, b = an.length - 1; a < an.length; b = a++) { const [xa, za] = an[a], [xb, zb] = an[b]; if ((za > z) !== (zb > z) && x < xa + (z - za) * (xb - xa) / (zb - za)) d = !d; } return d; };
  const lejosDelBorde = (an, x, z, m) => { for (let a = 0, b = an.length - 1; a < an.length; b = a++) { const [xa, za] = an[a], [xb, zb] = an[b], dx = xb - xa, dz = zb - za, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - xa) * dx + (z - za) * dz) / l2)); if (Math.hypot(x - xa - dx * t, z - za - dz * t) < m) return false; } return true; };
  const enExplanada = (i) => {
    const an = anillos.get(C[CALLE[i]].nombre);
    if (an) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const [x, z] of an) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
      for (let t = 0; t < 20; t++) { const x = azar(x0, x1), z = azar(z0, z1); if (dentroAnillo(an, x, z) && lejosDelBorde(an, x, z, 2) && libreDeCoches(x, z)) return [x, z]; }
    }
    // (de bordillo a bordillo, pero nunca más allá de la pared, y sin una pared entre el eje y el punto)
    const a = Math.max(0, Math.min(BORDE[0][i], PARED[0][i]) - 1), b = Math.max(0, Math.min(BORDE[1][i], PARED[1][i]) - 1);
    for (let t = 0; t < 8; t++) { const u = azar(-b, a), q_ = [X[i] + NX[i] * u, Z[i] + NZ[i] * u]; if (libreDeCoches(q_[0], q_[1]) && hayPaso(X[i], Z[i], q_[0], q_[1], 0)) return q_; }
    return [X[i], Z[i]];
  };

  // ---- la altura del suelo (la física es plana; el relieve se pone al dibujar): un rayo, sin la gente ni los techos de los coches
  const va = new Vec3(), vb = new Vec3();
  const suelo = (x, z, ref = 0) => {
    const hits = app.systems.rigidbody.raycastAll(va.set(x, ref + 1.6, z), vb.set(x, ref - 3, z));
    let y = ref, hay = false;
    for (const h of hits) { if (h.entity?.tags?.has('gente') || h.entity?.name === 'controlador') continue; if (h.point.y < ref + 0.95 && (!hay || h.point.y > y)) { y = h.point.y; hay = true; } }
    return hay ? y : ref;
  };

  // ---- los cuerpos: se cargan los doce, y cada uno se copia las veces que haga falta (y se guarda al irse, para no rehacerlo)
  const ASSETS = {}, POOL = Object.fromEntries(personas.map((i) => [i, []]));
  await Promise.all(personas.map((i) => new Promise((ok) => {
    const asset = new Asset('persona' + i, 'container', { url: glb(carpeta + 'persona' + i + (movil ? '_movil' : '') + '.glb') }); // (en el móvil, con la textura a 512: tools/gente_movil.py)
    asset.once('load', () => { ASSETS[i] = asset; ok(); }); asset.once('error', (e) => { console.warn('gente:', e); ok(); });
    app.assets.add(asset); app.assets.load(asset);
  })));
  const listos = personas.filter((i) => ASSETS[i]);
  if (!listos.length) return null;
  const arreglados = new Set();
  function crear(pi) {
    const pool = POOL[pi];
    if (pool.length) { const v = pool.pop(); v.raiz.enabled = true; return v; }
    const a = ASSETS[pi]; const e = a.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    const raiz = new Entity('vecino_' + info[pi].nombre); raiz.addChild(e); app.root.addChild(raiz);
    e.addComponent('anim', { activate: true });
    for (const an of a.resource.animations) e.anim.assignAnimation(an.resource.name, an.resource, undefined, 1, !/sentarse|levantarse/.test(an.resource.name)); // (en el componente, el tercero es la capa)
    for (const r of e.findComponents('render')) for (const mi of r.meshInstances) {
      const m = mi.material; if (arreglados.has(m)) continue; arreglados.add(m);
      m.blendType = BLEND_NONE; m.depthWrite = true; if (!m.alphaTest) m.alphaTest = 0.5; m.update();
    }
    return { raiz, e, pi, info: info[pi], cabeza: e.findByName('mixamorig:Head'), cuello: e.findByName('mixamorig:Neck'), saludo: brazoSaludo(e) };
  }
  const poner = (v, clip, mezcla = 0.3) => {
    if (v.clip === clip) return; v.clip = clip;
    const capa = v.e.anim.baseLayer; if (!capa) return;
    if (!v.clipYa) { capa.transition(clip, 0); capa.activeStateCurrentTime = Math.random() * 2; v.clipYa = true; } else capa.transition(clip, mezcla);
  };

  // ---- quién hay
  const gente = []; // (los vecinos que existen ahora)
  // (el multijugador: «solo» o «anfitrion», los mueve este juego —alrededor de la chica y de «otros», los que le siguen:
  // [{id, x, y, z, r}]—; «replica», los mueve el de otro y aquí se ven con lo que llega)
  let modo = 'solo', otros = [], sigId = 1, alPedir = null;
  const replicas = new Map();
  const bancosLibres = (vida.bancos || []).map((b) => ({ ...b, sitios: (b.largo > 2 ? [-0.65, 0, 0.65] : [-0.45, 0.45]).map((u) => ({ u, quien: null })) }));
  const sillas = (vida.sillas || []).map((s) => ({ ...s, quien: null }));
  const asientosIglesia = (sitiosIglesia?.bancos || []).map((s) => ({ ...s, quien: null }));
  const tiendas = vida.tiendas || [], portales = vida.portales || [];
  // (las puertas, en una rejilla de 20 m, para buscar las de cerca de la chica: de dónde sale alguien de casa)
  const rejPuertas = new Map();
  for (const t of portales) { const k = clave(Math.floor(t.p[0] / 20), Math.floor(t.p[2] / 20)); let l = rejPuertas.get(k); if (!l) rejPuertas.set(k, (l = [])); l.push(t); }
  const puertaCerca = (x, z, dmin, dmax) => {
    const c = []; for (let a = Math.floor((x - dmax) / 20); a <= Math.floor((x + dmax) / 20); a++) for (let b = Math.floor((z - dmax) / 20); b <= Math.floor((z + dmax) / 20); b++) for (const t of rejPuertas.get(clave(a, b)) || []) { const d = Math.hypot(t.p[0] - x, t.p[2] - z); if (d > dmin && d < dmax) c.push(t); }
    for (let k = 0; k < 8 && c.length; k++) {
      const t = c.splice(Math.floor(Math.random() * c.length), 1)[0], fx = t.p[0] + t.n[0] * 0.6, fz = t.p[2] + t.n[1] * 0.6;
      if (abiertas.some((d) => d.pt === t) || dentroIglesia(fx, fz) || !libreDeCoches(fx, fz, 0.4) || !llegada(t)) continue;
      if (gente.some((v) => Math.abs(v.x - fx) < 1.2 && Math.abs(v.z - fz) < 1.2)) continue;
      return t;
    }
    return null;
  };
  const plazasNodos = []; for (let i = 0; i < n; i++) if (PLAZA[i]) plazasNodos.push(i);
  const vecinosQueAndan = () => gente.filter((v) => v.estado === 'andar').length;

  const cam = () => camara.getPosition(), yo = () => chica.getPosition();
  // (si se le ve, aunque sea un poco: la cabeza, la cintura o los pies dentro de la vista y sin una casa delante. Con un solo
  // rayo a la cabeza, un balcón, una farola o un árbol en medio daban por tapado a alguien que se veía entero, y aparecía o
  // desaparecía delante de la chica, junto a una pared: «la gente sale de las paredes y de los edificios», 15-11-2026)
  const enMiVista = (x, y, z) => {
    const c = cam();
    if (Math.hypot(x - c.x, z - c.z) > 110) return false;
    const fr = camara.camera.frustum;
    if (!fr.containsPoint(va.set(x, y + 1.7, z)) && !fr.containsPoint(va.set(x, y + 0.15, z)) && !fr.containsPoint(va.set(x + 0.4, y + 1, z)) && !fr.containsPoint(va.set(x - 0.4, y + 1, z))) return false;
    for (const alto of [1.65, 1.0, 0.3]) {
      const h = app.systems.rigidbody.raycastFirst(c, va.set(x, y + alto, z));
      if (!(h && Math.hypot(h.point.x - x, h.point.z - z) > 1.5 && !h.entity?.tags?.has('gente'))) return true;
    }
    return false;
  };

  // (y si lo ve alguno de los que siguen a este juego: a menos de 25 m, siempre —su cámara puede mirar a cualquier lado—;
  // más lejos, hasta 110 m, si está hacia donde va, a menos de 80° a cada lado, y sin una casa en medio)
  const vistaDe = (o, x, y, z) => {
    const dx = x - o.x, dz = z - o.z, d = Math.hypot(dx, dz);
    if (d > 110) return false; if (d < 25) return true;
    const r = (o.r || 0) * Math.PI / 180;
    if ((dx * Math.sin(r) + dz * Math.cos(r)) / d < 0.17) return false;
    const h = app.systems.rigidbody.raycastFirst(va.set(o.x, (o.y ?? 0) + 0.6, o.z), vb.set(x, y + 1.2, z));
    return !(h && Math.hypot(h.point.x - x, h.point.z - z) > 1.5 && !h.entity?.tags?.has('gente'));
  };
  const enVista = (x, y, z) => enMiVista(x, y, z) || (otros.length > 0 && otros.some((o) => vistaDe(o, x, y, z)));
  // (los sitios alrededor de los que hay vecinos: la chica y los que siguen a este juego)
  const centros = () => (otros.length ? [yo(), ...otros] : [yo()]);
  const dCentro = (x, z) => { const p = yo(); let d = Math.hypot(x - p.x, z - p.z); for (const o of otros) d = Math.min(d, Math.hypot(x - o.x, z - o.z)); return d; };
  const personaCerca = (x, z, p) => { let m = p, d = Math.hypot(x - p.x, z - p.z); for (const o of otros) { const e = Math.hypot(x - o.x, z - o.z); if (e < d) { d = e; m = o; } } return m; };
  const tope = () => (otros.length ? Math.min(60, Math.round(TOPE * 1.5)) : TOPE);

  // la hora, el día y el mes del juego
  const ahora = () => {
    const h = reloj ? reloj.hora : 12, d = reloj ? ((reloj.diaSemana + reloj.dia) % 7 + 7) % 7 : new Date().getDay(), m = new Date().getMonth() + 1;
    return { h, d, m };
  };
  const enMisa = () => { const { h, d, m } = ahora(), mh = misaHora(d, m); return { antes: h > mh - 0.6 && h < mh - 0.05, durante: h >= mh - 0.05 && h < mh + 0.7, salida: h >= mh + 0.7 && h < mh + 0.95 }; };
  const lluvia = () => Math.min(1, (reloj?.clima?.lluvia || 0) * 1.6);   // (de 0 a 1: 1 mm/h ya es 0,4; src/tiempo.js)
  // el paraguas: una cúpula y un mango, encima de la cabeza y algo a la derecha, como llevado con esa mano; uno por vecino,
  // que se guarda con él
  const colPar = ['#1d2230', '#2b1f24', '#18222a', '#3a2a22', '#22262a', '#5a1f24'].map((c) => { const m = new StandardMaterial(); m.diffuse = new Color().fromString(c); m.gloss = 0.35; m.update(); return m; });
  const matMango = new StandardMaterial(); matMango.diffuse = new Color(0.08, 0.07, 0.06); matMango.update();
  function ponerParaguas(v, si) {
    if (si && !v.paraguas) {
      const e = new Entity('paraguas'), alto = (v.info?.alto || 1.7);
      const cup = new Entity('cupula'); cup.addComponent('render', { type: 'cone', material: colPar[Math.floor(Math.random() * colPar.length)], castShadows: true });
      cup.setLocalScale(1.05, 0.26, 1.05); cup.setLocalPosition(0, 0, 0); e.addChild(cup);
      const man = new Entity('mango'); man.addComponent('render', { type: 'cylinder', material: matMango, castShadows: false });
      man.setLocalScale(0.022, 0.62, 0.022); man.setLocalPosition(0, -0.38, 0); e.addChild(man);
      e.setLocalPosition(-0.14, alto + 0.33, 0.1); v.raiz.addChild(e); v.paraguas = e;
    }
    if (v.paraguas && v.paraguas.enabled !== !!si) v.paraguas.enabled = !!si;
  }
  const iglesiaCentro = sitiosIglesia ? (() => { const s = sitiosIglesia.bancos; return [s.reduce((a, b) => a + b.asiento[0], 0) / s.length, s.reduce((a, b) => a + b.asiento[1], 0) / s.length]; })() : null;
  const dentroIglesia = (x, z) => window.foto?.reloj?.enPlanta?.(x, z) ?? (iglesiaCentro && Math.hypot(x - iglesiaCentro[0], z - iglesiaCentro[1]) < 17);   // (con la planta, como todos)

  // ---- nacer: uno nuevo en un sitio, con lo que va a hacer
  // dónde van los pies de un vecino sentado: en el clip la cadera queda 26 cm (a la altura de la chica, 1,6 m) por detrás
  // de los pies, y con los pies en el asiento se sentaba detrás del respaldo, con los muslos dentro de la madera. Ahora, la
  // cadera a «atras» m por delante del respaldo del sitio (15-11-2026, como la chica: src/acciones.js)
  const pies = (pi, x, z, mira, cadera = -0.09) => { const k = 0.26 * ((info[pi]?.alto || 1.6) / 1.6) + cadera; return [x + mira[0] * k, z + mira[1] * k]; };
  const clipMisa = (v) => (v.info.clips || []).includes('sentado_iglesia') ? 'sentado_iglesia' : 'sentado';
  function nacer(pi, x, z, y = null) {
    const v = crear(pi); v.clip = null; v.clipYa = false;
    Object.assign(v, { id: sigId++, replica: false, buf: null, sigueA: null, ocupadoPor: null, x, z, y: y ?? suelo(x, z), yaw: Math.random() * Math.PI * 2, estado: 'quieto', ruta: null, k: 0, lado: 0, fin: null, hasta: 0, desvio: 0, ocupado: false, sitio: null, grupo: null, t: 0, alturaT: 0, mira: null, giroCab: 0, quiereIrse: false, puntos: null, trasSentarse: 0, kVisto: -1, rodeo: null, pareja: null, objetivo: null, parado: 0, turno: 0, yObj: null, sombra: undefined, antes: null, pt: null, puerta: null, fase: 0 });
    v.paso = PASO[v.info.tipo === 'mayor' ? 'pasear' : 'andar'] * azar(0.95, 1.04); v.clipAndar = v.info.tipo === 'mayor' ? 'pasear' : 'andar';
    v.raiz.setPosition(x, v.y, z); gente.push(v); return v;
  }
  function morir(v) {
    if (v.sitio) v.sitio.quien = null;
    if (v.puerta) { cerrarPuerta(v.puerta); v.puerta = null; }
    v.raiz.enabled = false; POOL[v.pi].push(v);
    const i = gente.indexOf(v); if (i >= 0) gente.splice(i, 1);
    if (v.grupo) { v.grupo.miembros = v.grupo.miembros.filter((o) => o !== v); }
  }
  // echar a andar hacia un sitio (x, z), con lo que hace al llegar
  function irA(v, x, z, fin) {
    // (si el sitio está cerca y a la vista, sin una pared en medio, derecho a él: por las calles, a veces se daba un rodeo
    // de cientos de metros para llegar a una puerta que estaba ahí mismo)
    if (Math.hypot(x - v.x, z - v.z) < 25 && hayPaso(v.x, v.z, x, z, v.y)) { v.ruta = null; v.puntos = null; v.t = 0; v.fin = { x, z, ...fin }; v.estado = 'andar_directo'; poner(v, v.clipAndar); return true; }
    const a = nodoCerca(v.x, v.z, 30), b = fin?.nodo ?? nodoCerca(x, z, 40);
    const r = caminoEntre(a, b);
    if (!r) return false;
    v.ruta = r; v.k = 0; v.lado = ladoDe(r[0], v.x, v.z); v.fin = { x, z, ...fin }; v.estado = 'andar'; poner(v, v.clipAndar); return true;
  }
  // a dónde va uno que pasa: a un portal, a una tienda, a la plaza o a la iglesia (si es la hora de misa)
  function destino(v) {
    const { antes } = enMisa();
    if (antes && sitiosIglesia && v.info.tipo !== 'nino' && Math.random() < (v.info.tipo === 'mayor' ? 0.7 : 0.25)) {
      const p = elegir(sitiosIglesia.puertas); return [p.fuera[0], p.fuera[1], { tipo: 'iglesia' }];
    }
    const r = Math.random();
    if (r < 0.32 && tiendas.length) { const t = cercaDe(tiendas, v.x, v.z, 40, 260, llegada); if (t) return [t.p[0] + t.n[0] * 0.6, t.p[2] + t.n[1] * 0.6, { tipo: 'tienda', mira: [-t.n[0], -t.n[1]], pt: t, nodo: t._nodo }]; }
    if (r < 0.7 && portales.length) { const t = cercaDe(portales, v.x, v.z, 30, 220, llegada); if (t) return [t.p[0] + t.n[0] * 0.5, t.p[2] + t.n[1] * 0.5, { tipo: 'portal', mira: [-t.n[0], -t.n[1]], pt: t, nodo: t._nodo }]; }
    if (plazasNodos.length && Math.random() < 0.6) { const j = cercaNodo(plazasNodos, v.x, v.z, 40, 300); if (j >= 0) { const c = enExplanada(j); return [c[0], c[1], { tipo: 'paseo' }]; } } // (cruzando la plaza)
    const j = Math.floor(Math.random() * n); if (Math.hypot(X[j] - v.x, Z[j] - v.z) < 300) { const c = carril(j, 0); return [c[0], c[1], { tipo: 'paseo' }]; }
    return null;
  }
  const cercaDe = (lista, x, z, dmin, dmax, f = null) => {
    for (let t = 0; t < 12; t++) { const s = elegir(lista), d = Math.hypot(s.p[0] - x, s.p[2] - z); if (d > dmin && d < dmax && (!f || f(s))) return s; }
    return null;
  };
  // (el punto de la calle desde el que se llega a una puerta: el más cercano con la puerta a la vista, sin una pared en
  // medio. Antes se iba al punto de calle más cercano, que podía ser el de la calle de detrás de la manzana, y de allí en
  // línea recta a la puerta: atravesando la casa. Se apunta en la puerta, que no cambia; null si no hay ninguno a 15 m)
  const llegada = (t) => {
    if (t._nodo !== undefined) return t._nodo !== null;
    const fx = t.p[0] + t.n[0] * 0.6, fz = t.p[2] + t.n[1] * 0.6, c = [0, 0];
    t._nodo = null; let dm = 15;
    cerca(fx, fz, 15, (j) => { const d = Math.hypot(X[j] - fx, Z[j] - fz); if (d >= dm) return; carril(j, ladoDe(j, fx, fz), c); if (hayPaso(c[0], c[1], fx, fz, t.p[1]) && hayPaso(X[j], Z[j], c[0], c[1], t.p[1])) { dm = d; t._nodo = j; } });
    return t._nodo !== null;
  };
  const cercaNodo = (lista, x, z, dmin, dmax) => {
    for (let t = 0; t < 12; t++) { const s = elegir(lista), d = Math.hypot(X[s] - x, Z[s] - z); if (d > dmin && d < dmax) return s; }
    return -1;
  };

  // los papeles: andar (de un sitio a otro), charlar (un corro de dos o tres), sentado (en un banco o una silla), jugar (los niños)
  function nuevoAndando(pi, i, lado) {
    const c = carril(i, lado); const v = nacer(pi, c[0], c[1]); v.lado = lado;
    const d = destino(v); if (!d || !irA(v, d[0], d[1], d[2])) { morir(v); return null; }
    return v;
  }
  function nuevoCorro(i, tipos) {
    const lado = Math.random() < 0.5 ? 0 : 1, N_ = tipos.length, r = N_ === 2 ? 0.48 : 0.62, a0 = Math.random() * Math.PI * 2;
    // (en la acera, el corro con sitio entre la pared y el bordillo: si la acera es estrecha, el centro, más afuera)
    const dLado = Math.max(0.5, Math.min(OF[lado][i], PARED[lado][i] - r - 0.45)) * (lado ? -1 : 1);
    const c = PLAZA[i] && Math.random() < 0.6 ? enExplanada(i) : [X[i] + NX[i] * dLado, Z[i] + NZ[i] * dLado];
    if (!libreDeCoches(c[0], c[1], 1.0)) return null; // (el corro, con sitio alrededor: no pegado a un coche aparcado)
    const g = { x: c[0], z: c[1], miembros: [], hasta: performance.now() / 1000 + azar(40, 200) };
    const usados = new Set();
    tipos.forEach((t, k) => {
      const lista = deTipo[t].filter((p) => ASSETS[p] && !usados.has(p)); if (!lista.length) return; const pi = elegir(lista); usados.add(pi);
      const a = a0 + k * Math.PI * 2 / N_, v = nacer(pi, c[0] + Math.sin(a) * r, c[1] + Math.cos(a) * r);
      v.yaw = Math.atan2(c[0] - v.x, c[1] - v.z); v.estado = 'charla'; v.grupo = g; v.lado = lado; poner(v, k === 0 ? 'charla' : 'quieto'); g.miembros.push(v);
    });
    return g;
  }
  function sentar(pi, b, s) {
    const tx = -b.mira[1], tz = b.mira[0]; // (a lo largo del banco)
    const [x, z] = pies(pi, b.p[0] + tx * s.u, b.p[2] + tz * s.u, b.mira);
    const v = nacer(pi, x, z, b.p[1] - 0.46); v.yaw = Math.atan2(b.mira[0], b.mira[1]); v.estado = 'sentado'; v.sitio = s; s.quien = v;
    v.hasta = performance.now() / 1000 + azar(60, 400); poner(v, Math.random() < 0.4 ? 'charla_sentado' : 'sentado'); return v;
  }
  function nuevoJugando(i) {
    const lista = deTipo.nino.filter((p) => ASSETS[p]); if (!lista.length) return;
    const g = { x: X[i], z: Z[i], nodo: i, miembros: [], hasta: performance.now() / 1000 + azar(120, 400), jugar: true };
    for (let k = 0, N_ = 2 + Math.floor(Math.random() * 3); k < N_; k++) {
      const v = nacer(elegir(lista), X[i] + azar(-2, 2), Z[i] + azar(-2, 2)); v.estado = 'jugar'; v.grupo = g; v.paso = PASO.correr * azar(0.85, 1); g.miembros.push(v); poner(v, 'quieto'); v.hasta = 0;
    }
  }
  // un sitio para jugar en la plaza: cerca de su eje, dentro de lo que hay de bordillo a bordillo
  const sitioJuego = (g) => {
    const i = g.nodo, cerc = []; cerca(X[i], Z[i], 10, (j) => { if (PLAZA[j] && CALLE[j] === CALLE[i]) cerc.push(j); });
    return enExplanada(cerc.length ? elegir(cerc) : i);
  };

  // ---- cuántos tocan alrededor de la chica, y el reparto de los papeles
  let objetivo = 0, ultimaCuenta = -1e9, pesoLocal = 0, marca = 0;
  const contado = new Uint32Array(n);
  function contar() {
    pesoLocal = 0; marca++;
    // (alrededor de la chica y de los que siguen a este juego, sin contar dos veces lo que comparten)
    const cs = centros();
    for (const p of cs) cerca(p.x, p.z, RADIO, (j) => { if (contado[j] !== marca && Math.hypot(X[j] - p.x, Z[j] - p.z) < RADIO) { contado[j] = marca; pesoLocal += W[j]; } });
    const p = cs.find((c) => iglesiaCentro && Math.hypot(c.x - iglesiaCentro[0], c.z - iglesiaCentro[1]) < 45) || cs[0];
    const { h, d, m } = ahora(), TOPE = tope();
    objetivo = Math.min(TOPE, Math.round(VECINOS * enLaCalle(h, d, m) * pesoLocal / WT * FACTOR * 2.2 * (1 - 0.65 * lluvia())));   // (con lluvia, menos en la calle)
    // (×2,2: los que se ven son los de la calle de verdad más los que están en la puerta de casa, en las terrazas y en los
    // corros, que en el plano de calles no cuentan; ver docs/gente.md)
    const misa = enMisa();
    if (misa.durante && iglesiaCentro && Math.hypot(p.x - iglesiaCentro[0], p.z - iglesiaCentro[1]) < 45) objetivo = Math.min(TOPE, objetivo + (d === 0 ? 34 : 18));
  }

  // un sitio para que aparezca alguien: en la acera, a una distancia, donde no se vea
  function sitioOculto(dmin, dmax, f = null, p = yo()) {
    for (let t = 0; t < 25; t++) {
      const a = Math.random() * Math.PI * 2, r = azar(dmin, dmax), x = p.x + Math.sin(a) * r, z = p.z + Math.cos(a) * r;
      const i = nodoCerca(x, z, 10, f); if (i < 0) continue;
      const lado = Math.random() < 0.5 ? 0 : 1, c = carril(i, lado);
      if (dentroIglesia(c[0], c[1]) || !libreDeCoches(c[0], c[1], 0.4)) continue;
      if (!enVista(c[0], 0, c[1])) return { i, lado, x: c[0], z: c[1] };
    }
    return null;
  }
  function poblar(inicial = false, p = yo()) {
    const { h, d } = ahora(), oscuro = (reloj?.noche ?? 0) > 0.6, mezcla = mezclaDe(h, d, oscuro), misa = enMisa();
    const dmin = inicial ? 6 : 28, dmax = RADIO * 0.95;
    // la misa: los bancos de la iglesia se van llenando desde 35 minutos antes (si la chica anda cerca). Donde no se ve,
    // aparecen ya sentados; si no, entran por una puerta, van por el pasillo hasta su fila y se sientan
    if ((misa.durante || misa.antes) && asientosIglesia.length && iglesiaCentro && Math.hypot(p.x - iglesiaCentro[0], p.z - iglesiaCentro[1]) < 45) {
      const total = d === 0 ? 34 : 18, falta = misaHora(d, ahora().m) - h;
      const quiere = misa.durante ? total : Math.round(total * Math.max(0.15, 1 - falta / 0.6));
      const ocupados = asientosIglesia.filter((s) => s.quien).length;
      if (ocupados < quiere) {
        const libres = asientosIglesia.filter((s) => !s.quien), t = pesar([0.6, 0.3, 0.05, 0.05]), lista = deTipo[TIPOS[t]].filter((x) => ASSETS[x]);
        if (libres.length && lista.length) {
          const ocultos = inicial ? libres : libres.filter((s) => !enVista(s.asiento[0], 0.3, s.asiento[1]));
          if (ocultos.length && (inicial || Math.random() < 0.5)) {
            const s = elegir(ocultos), pi_ = elegir(lista), [x_, z_] = pies(pi_, s.asiento[0], s.asiento[1], s.mira, -0.10), v = nacer(pi_, x_, z_, s.asiento[2] - 0.46);
            v.yaw = Math.atan2(s.mira[0], s.mira[1]); v.estado = 'misa'; v.sitio = s; s.quien = v; poner(v, clipMisa(v));
          } else {
            const s = elegir(libres), pta = elegir(sitiosIglesia.puertas), v = nacer(elegir(lista), pta.dentro[0], pta.dentro[1], 0);
            v.puntos = [...(pta.via || []), s.pasillo, s.fila]; v.estado = 'andar_directo'; v.sitio = s; s.quien = v;
            v.fin = { x: s.rodillas[0], z: s.rodillas[1], tipo: 'asiento_misa', sitio: s }; poner(v, v.clipAndar);
          }
          return;
        }
      }
    }
    const t = pesar(mezcla), tipo = TIPOS[t], lista = deTipo[tipo].filter((x) => ASSETS[x]);
    if (!lista.length) return;
    // los niños por la tarde, a jugar a la plaza (si hay plaza cerca); si no, con un mayor de la mano... andando cerca
    // (un grupo son de 2 a 4: para que los niños sean los que tocan y no el triple, solo una vez de cada tres)
    const llueve = lluvia() > 0.15;   // (con lluvia: ni niños jugando, ni bancos, ni sillas a la puerta, y pocos corros)
    if (!llueve && tipo === 'nino' && Math.random() < (oscuro ? 0.15 : 0.34) && (h > 16.5 && h < 21 || (d === 0 || d === 6) && h > 10.5 && h < 14) && plazasNodos.length) {
      const s = sitioOculto(inicial ? 6 : 20, dmax, (j) => PLAZA[j] === 1, p);
      if (s) { nuevoJugando(s.i); return; }
    }
    const r = Math.random();
    // sentarse en un banco libre (sobre todo los mayores, y de día)
    const quiereBanco = tipo === 'mayor' ? 0.4 : tipo === 'joven' ? 0.15 : 0.08;
    if (!llueve && r < quiereBanco && h > 9 && h < 22) {
      const libres = [];
      for (const b of bancosLibres) {
        const dd = Math.hypot(b.p[0] - p.x, b.p[2] - p.z); if (dd > dmax || dd < (inicial ? 3 : 18)) continue;
        for (const s of b.sitios) if (!s.quien) libres.push([b, s]);
      }
      const ok = libres.filter(([b]) => inicial || !enVista(b.p[0], b.p[1], b.p[2]));
      if (ok.length) { const [b, s] = elegir(ok); sentar(elegir(lista), b, s); return; }
    }
    // a la puerta de casa, en una silla: los mayores, al sol del mediodía en invierno y al fresco de la tarde el resto del año
    const { m } = ahora(), invierno = m >= 11 || m <= 3;
    if (!llueve && tipo === 'mayor' && sillas.length && Math.random() < 0.35 && (invierno ? h > 11 && h < 15.5 : h > 18 && h < 22.5)) {
      const libres = sillas.filter((s) => !s.quien && Math.hypot(s.p[0] - p.x, s.p[2] - p.z) < dmax && (inicial || !enVista(s.p[0], s.p[1], s.p[2])));
      if (libres.length) {
        const s = elegir(libres), v = nacer(elegir(lista), s.p[0] - s.mira[0] * 0.04, s.p[2] - s.mira[1] * 0.04, s.p[1]);
        v.yaw = Math.atan2(s.mira[0], s.mira[1]); v.estado = 'sentado'; v.sitio = s; s.quien = v; v.hasta = performance.now() / 1000 + azar(300, 1200); poner(v, Math.random() < 0.5 ? 'sentado' : 'charla_sentado');
        return;
      }
    }
    // un corro (más a media mañana, a la salida de misa y al paseo de la tarde)
    if ((!llueve || Math.random() < 0.2) && r < quiereBanco + (tipo === 'mayor' ? 0.25 : 0.18)) {
      const s = sitioOculto(inicial ? 5 : 22, dmax, null, p);
      if (s) { const N_ = Math.random() < 0.65 ? 2 : 3, tipos = Array.from({ length: N_ }, (_, k) => (k === 0 ? tipo : TIPOS[pesar(mezcla.map((m, i) => (i === 3 ? 0 : m)))])); nuevoCorro(s.i, tipos); return; }
    }
    // salir de casa por la puerta, cerca de la chica (de día y a la tarde: de madrugada, casi nadie)
    if (!inicial && q.get('puertas') !== '0' && tipo !== 'nino' && Math.random() < (oscuro ? 0.15 : 0.4)) {
      const pt = puertaCerca(p.x, p.z, 8, 45);
      if (pt) { salirPorPuerta(elegir(lista), pt); return; }
    }
    // andar: de dos en dos alguna vez (una pareja, una madre con su niño)
    const s = sitioOculto(dmin, dmax, null, p); if (!s) return;
    const v = nuevoAndando(elegir(lista), s.i, s.lado);
    if (v && Math.random() < 0.22) {
      const t2 = tipo === 'nino' ? 'adulto' : Math.random() < 0.15 && tipo === 'adulto' ? 'nino' : tipo, l2 = deTipo[t2].filter((x) => ASSETS[x] && x !== v.pi);
      if (l2.length) {
        const c = carril(s.i, s.lado); const w = nacer(elegir(l2), c[0], c[1]); w.lado = s.lado; w.pareja = v; w.paso = v.paso;
        w.ruta = v.ruta; w.k = 0; w.fin = v.fin; w.estado = 'andar'; w.clipAndar = v.clipAndar; poner(w, w.clipAndar);
      }
    }
  }

  // ---- cada fotograma
  const qa = new Quat(), tmp = [0, 0];
  let reloj_ = 0, cuentaAltura = 0, cuentaGente = 0;
  const salirDeMisa = (v) => {
    // al acabar la misa, se levantan y salen (los que están a la vista, despacio; los demás, se van sin más)
    if (!sitiosIglesia) return morir(v);
    const pta = elegir(sitiosIglesia.puertas), st = v.sitio; v.sitio && (v.sitio.quien = null); v.sitio = null;
    // (por su fila al pasillo, por el pasillo a la puerta —por el que cruza entre los bancos, si es una del lado— y fuera)
    v.puntos = st ? [st.rodillas, st.fila, st.pasillo, ...[...(pta.via || [])].reverse(), pta.dentro] : [pta.dentro];
    v.estado = 'andar_directo'; v.fin = { x: pta.fuera[0], z: pta.fuera[1], tipo: 'fuera_misa', luego: pta }; poner(v, 'levantarse', 0.2); v.t = 1.1;
  };

  app.on('update', (dt) => {
    if (!listos.length) return;
    dt = Math.min(dt, 0.1);
    const tt = performance.now() / 1000, p = yo(), ec = conducir?.(), conduce = ec?.modo === 'conduciendo' && ec.pos ? { x: ec.pos[0], z: ec.pos[2] } : null;
    // (los que mueve el juego de otro: solo verlos)
    if (modo === 'replica') { moverReplicas(dt, tt, p); capsulas(p, conduce); return; }
    // contar y poblar, cada medio segundo (al principio, todos de golpe)
    reloj_ -= dt;
    if (reloj_ <= 0) {
      reloj_ = 0.5;
      if (tt - ultimaCuenta > 2) { contar(); ultimaCuenta = tt; }
      const inicial = cuentaGente === 0, cs = centros();
      if (inicial) { for (let k = 0; k < objetivo * 2 && gente.length < objetivo; k++) poblar(true); cuentaGente = 1; }
      else if (gente.length < objetivo) poblar(false, cs[Math.floor(Math.random() * cs.length)]);
      // irse: lejos (de la chica y de los que siguen a este juego) y sin que se vea, o demasiados
      for (const v of gente.slice()) {
        const d = dCentro(v.x, v.z);
        if (v.ocupado) continue;
        if ((d > RADIO + 15 && !enVista(v.x, v.y, v.z)) || d > RADIO + 45) { if (v.grupo) { for (const o of v.grupo.miembros.slice()) morir(o); } else morir(v); }
      }
      if (gente.length > objetivo + 4) {
        const lejos = gente.filter((v) => !v.ocupado && !enVista(v.x, v.y, v.z)).sort((a, b) => dCentro(b.x, b.z) - dCentro(a.x, a.z));
        if (lejos[0]) morir(lejos[0]);
      }
      // (lo que pidió alguien que ya no sigue a este juego —se fue, o se alejó—: se suelta; y nadie ocupado más de 3 minutos)
      for (const v of gente) {
        if (v.ocupadoPor && (!otros.some((o) => o.id === v.ocupadoPor) || tt - (v.ocupadoT || 0) > 180)) { v.ocupadoPor = null; api.soltar(v); }
        if (v.sigueA && !otros.some((o) => o.id === v.sigueA)) { v.sigueA = null; v.seguirHasta = 0; }
      }
      // la misa: al acabar, a la calle
      const misa = enMisa();
      if (!misa.durante) for (const v of gente.slice()) if (v.estado === 'misa' && !v.ocupado) { if (!enVista(v.x, v.y, v.z) && Math.random() < 0.5) morir(v); else salirDeMisa(v); }   // (al que está hablando con la chica, no: se le sacaba del banco o desaparecía a mitad de charla)
      // con lluvia: los sentados se levantan y se van, los niños que juegan, a casa, los corros duran poco; y el paraguas,
      // abierto para los que están de pie en la calle (15-11-2026, la revisión del juego: con lluvia seguía la plaza llena,
      // con gente en los bancos y niños jugando, y nadie con paraguas)
      const ll = lluvia();
      if (ll > 0.15) for (const v of gente) {
        if (v.ocupado) continue;
        if ((v.estado === 'sentado') && Math.random() < 0.12) { v.sitio && (v.sitio.quien = null); v.sitio = null; poner(v, 'levantarse', 0.2); v.estado = 'levantandose'; v.t = 1.1; }
        else if (v.grupo?.jugar && Math.random() < 0.2) { const g = v.grupo; for (const o of g.miembros) { o.grupo = null; const dd = destino(o); if (!dd || !irA(o, dd[0], dd[1], dd[2])) o.quiereIrse = true; } }
        else if (v.grupo && !v.grupo.jugar) v.grupo.hasta = Math.min(v.grupo.hasta, tt + azar(2, 9));
      }
      for (const v of gente) ponerParaguas(v, ll > 0.15 && v.info.tipo !== 'nino' && !/sentado|misa|levantandose|sentarse/.test(v.estado) && !dentroIglesia(v.x, v.z));
      // las sombras, solo de los cercanos
      for (const v of gente) { const cs = Math.hypot(v.x - p.x, v.z - p.z) < 32; if (v.sombra !== cs) { v.sombra = cs; for (const r of v.e.findComponents('render')) r.castShadows = cs; } }
    }

    // (cada uno mira y se aparta de la persona que tiene más cerca; el que acompaña a alguien, a esa)
    for (const v of gente) {
      const q_ = !otros.length ? p : v.sigueA ? (otros.find((o) => o.id === v.sigueA) || p) : (v.estado === 'seguir' || v.fin?.tipo === 'seguir') ? p : personaCerca(v.x, v.z, p);
      actualizar(v, dt, tt, q_, q_ === p ? conduce : null);
    }
    // los corros que se deshacen: cada uno, a lo suyo
    for (const v of gente) if (v.grupo && !v.grupo.jugar && tt > v.grupo.hasta && v.estado === 'charla' && !v.ocupado) {
      const g = v.grupo; for (const o of g.miembros) { o.grupo = null; if (o.ocupado) continue; const d = destino(o); if (!d || !irA(o, d[0], d[1], d[2])) o.quiereIrse = true; }   // (el que está hablando con la chica se queda: con una charla larga se ponía a «andar» sin moverse)
    }
    cuentaAltura++;
    capsulas(p, conduce);
  });

  function actualizar(v, dt, tt, p, conduce) {
    if (v.ocupado) { girarHacia(v, v.mira, dt, 5); v.raiz.setPosition(v.x, v.y, v.z); v.raiz.setEulerAngles(0, v.yaw * 180 / Math.PI, 0); return; }
    const dChica = Math.hypot(v.x - p.x, v.z - p.z);
    // acompañar a la chica (lo decide el vecino hablando con ella, src/ia.js): a 1,3 m detrás de ella mientras dure;
    // cerca, quieto y mirándola; si conduce o se acaba el rato, se va a lo suyo
    if (v.estado === 'seguir' || v.fin?.tipo === 'seguir') {
      if (tt > (v.seguirHasta || 0) || conduce) { v.fin = null; v.estado = 'quieto'; v.quiereIrse = true; poner(v, 'quieto', 0.3); mover(v, dt); return; }
      const ux = (p.x - v.x) / (dChica || 1), uz = (p.z - v.z) / (dChica || 1);
      if (v.estado === 'seguir') {
        if (dChica > 2.2) { v.fin = { x: p.x - ux * 1.3, z: p.z - uz * 1.3, tipo: 'seguir' }; v.puntos = null; v.ruta = null; v.t = 0; v.estado = 'andar_directo'; poner(v, v.clipAndar, 0.25); }
        else { girarHacia(v, [ux, uz], dt, 4); mirarChica(v, p, dChica, dt); mover(v, dt); return; }
      } else { v.fin.x = p.x - ux * 1.3; v.fin.z = p.z - uz * 1.3; }
    }
    if (v.estado === 'entrando' || v.estado === 'saliendo') { porLaPuerta(v, dt, tt); return; }
    if (v.estado === 'andar' || v.estado === 'andar_directo') {
      // el punto al que va: el de la acera del siguiente punto de su calle o, al final, el sitio
      let tx, tz;
      // (yendo a una puerta por las calles: en cuanto la ve cerca, sin una pared en medio, va derecho)
      if (v.estado === 'andar' && v.fin?.pt && (v.atajo = (v.atajo || 0) - dt) <= 0) {
        v.atajo = 0.8;
        if (Math.hypot(v.fin.x - v.x, v.fin.z - v.z) < 25 && hayPaso(v.x, v.z, v.fin.x, v.fin.z, v.y)) { v.ruta = null; v.estado = 'andar_directo'; v.t = 0; }
      }
      if (v.estado === 'andar' && v.ruta && v.k < v.ruta.length) {
        const i = v.ruta[v.k];
        if (v.k > 0 && CALLE[i] !== CALLE[v.ruta[v.k - 1]]) v.lado = ladoDe(i, v.x, v.z); // (al cambiar de calle, por la acera de su lado)
        carril(i, v.lado, tmp); tx = tmp[0]; tz = tmp[1];
        if (v.pareja) {
          // (el de al lado, un paso hacia la calzada si cabe en la acera; si no, hacia la pared; y si tampoco, detrás)
          const c_ = BORDE[v.lado][i], w_ = PARED[v.lado][i], o_ = OF[v.lado][i];
          const sep = o_ - 0.62 >= c_ + 0.3 ? -0.62 : o_ + 0.62 <= w_ - 0.3 ? 0.62 : 0, sg = v.lado ? -1 : 1;
          tx += NX[i] * sg * sep; tz += NZ[i] * sg * sep; v.enFila = sep === 0;
        }
        // (si entre él y ese punto hay una pared o un coche —al doblar una esquina, la línea recta corta el pico de la casa—,
        // primero por el centro de la calle, como quien cruza)
        if (v.kVisto !== v.k) { v.kVisto = v.k; v.rodeo = hayPaso(v.x, v.z, tx, tz, v.y) ? null : [X[i], Z[i]]; }
        if (v.rodeo) { if (Math.hypot(v.rodeo[0] - v.x, v.rodeo[1] - v.z) < 0.6) v.rodeo = null; else { tx = v.rodeo[0]; tz = v.rodeo[1]; } }
        if (!v.rodeo && Math.hypot(tx - v.x, tz - v.z) < 1.2) { v.k++; }
      } else if (v.puntos?.length) { tx = v.puntos[0][0]; tz = v.puntos[0][1]; if (Math.hypot(tx - v.x, tz - v.z) < 0.4) v.puntos.shift(); }
      else { tx = v.fin.x; tz = v.fin.z; }
      if (v.estado === 'andar_directo' && v.t > 0) { v.t -= dt; if (v.t > 0) { mover(v, dt); return; } poner(v, v.clipAndar); }
      let dx = tx - v.x, dz = tz - v.z; const l = Math.hypot(dx, dz);
      if (l < 0.35 && !v.puntos?.length && (v.estado === 'andar_directo' || !v.ruta || v.k >= v.ruta.length)) { llegar(v, tt); mover(v, dt); return; }
      dx /= l || 1; dz /= l || 1;
      // apartarse: de la chica (o del coche, si va conduciendo) y de los demás que vienen de frente
      let lat = 0, para = false;
      const ox = conduce || p;
      const ax = ox.x - v.x, az = ox.z - v.z, adel = ax * dx + az * dz, lado_ = ax * dz - az * dx;
      if (adel > 0 && adel < (conduce ? 9 : 2.2) && Math.abs(lado_) < (conduce ? 2.2 : 0.75)) { lat = lado_ > 0 ? -1 : 1; if (!conduce && adel < 0.8) para = true; }
      // (un coche aparcado delante, en su camino: se le rodea por el lado que le queda más lejos del coche, más despacio)
      let frena = false;
      for (const k of window.foto?.coches?.coches || []) {
        const c = k.caja; if (!c || k.conducido || Math.abs(c.x - v.x) > 6 || Math.abs(c.z - v.z) > 6) continue;
        for (const ad of [0.8, 1.6]) {
          const px = v.x + dx * ad, pz = v.z + dz * ad, rx = px - c.x, rz = pz - c.z, lx = rx * c.dx + rz * c.dz, lz = -rx * c.dz + rz * c.dx;
          if (Math.abs(lx) < c.L / 2 + 0.35 && Math.abs(lz) < c.W / 2 + 0.35) { const la = (c.x - v.x) * dz - (c.z - v.z) * dx; lat = la > 0 ? -1 : 1; frena = true; break; }
        }
      }
      for (const o of gente) {
        if (o === v || o === v.pareja || v === o.pareja) continue;
        const bx = o.x - v.x, bz = o.z - v.z; if (Math.abs(bx) > 2 || Math.abs(bz) > 2) continue;
        const ad = bx * dx + bz * dz, la = bx * dz - bz * dx;
        if (ad > 0 && ad < 1.8 && Math.abs(la) < 0.6) lat = la > 0 ? -1 : 1;
      }
      v.desvio += ((lat * (conduce ? 1.6 : 0.7)) - v.desvio) * Math.min(1, dt * 3);
      let vel = para ? 0 : (conduce && lat ? Math.max(v.paso, 1.8) : frena ? v.paso * 0.35 : v.paso);
      if (v.enFila && v.pareja && Math.hypot(v.pareja.x - v.x, v.pareja.z - v.z) < 0.9) vel *= 0.5; // (en fila, a un paso del de delante)
      if (para) { if (v.clip !== 'quieto') poner(v, 'quieto', 0.25); } else if (v.clip !== v.clipAndar && !(v.estado === 'andar_directo' && v.t > 0)) poner(v, v.clipAndar, 0.25);
      // (al apartarse, nunca hacia una pared: en las aceras de medio metro, apartarse de la chica, de otro o de un coche le
      // metía en la casa de al lado, y seguía andando por dentro. 15-11-2026, «la gente sale de las paredes». Un rayo corto
      // hacia ese lado, cada cuarto de segundo y solo mientras se aparta)
      if (Math.abs(v.desvio) > 0.05 && (v.paredT = (v.paredT || 0) - dt) <= 0) { v.paredT = 0.25; const sg = Math.sign(v.desvio); v.paredLado = hayPaso(v.x, v.z, v.x + dz * sg * 0.6, v.z - dx * sg * 0.6, v.y) ? 0 : sg; }
      if (v.paredLado && Math.sign(v.desvio) === v.paredLado) v.desvio = 0;
      const yawQ = Math.atan2(dx, dz); v.yaw += angulo(yawQ - v.yaw) * Math.min(1, dt * 6);
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      v.x += (fx * vel + dz * v.desvio * 0.9 * (vel > 0 ? 1 : 0)) * dt; v.z += (fz * vel - dx * v.desvio * 0.9 * (vel > 0 ? 1 : 0)) * dt;
      // (y por su acera, nunca más allá de la pared de esa calle, con 35 cm de margen: lo que mide el plano de calles; solo
      // entre dos puntos de la misma calle, que al cambiar de calle la medida de la otra no vale)
      if (v.estado === 'andar' && v.ruta && v.k > 0 && v.k < v.ruta.length && !v.rodeo && CALLE[v.ruta[v.k - 1]] === CALLE[v.ruta[v.k]]) {
        const i = v.ruta[v.k], d = (v.x - X[i]) * NX[i] + (v.z - Z[i]) * NZ[i], m0 = PARED[0][i] - 0.35, m1 = PARED[1][i] - 0.35;
        if (m0 > 0.3 && d > m0) { v.x -= NX[i] * (d - m0); v.z -= NZ[i] * (d - m0); } else if (m1 > 0.3 && -d > m1) { v.x += NX[i] * (-d - m1); v.z += NZ[i] * (-d - m1); }
      }
      // la altura: el suelo, cada cuarto de segundo, y suave (los bordillos, las gradas)
      // (un poco por delante de donde pisa, para subir el bordillo o el escalón a tiempo)
      if ((v.alturaT -= dt) <= 0) { v.alturaT = 0.12; v.yObj = suelo(v.x + fx * 0.2, v.z + fz * 0.2, v.y); }
      if (v.yObj != null) v.y += (v.yObj - v.y) * Math.min(1, dt * 16);
      mover(v, dt);
      return;
    }
    if (v.estado === 'jugar') {
      // correr de un sitio a otro de la plaza, pararse un poco, y otra vez
      if (!v.objetivo || Math.hypot(v.objetivo[0] - v.x, v.objetivo[1] - v.z) < 0.5) {
        if (!v.parado) { v.parado = azar(0.4, 2.5); poner(v, 'quieto', 0.2); }
        v.parado -= dt; if (v.parado <= 0) { v.parado = 0; v.objetivo = Math.random() < 0.35 && v.grupo.miembros.length > 1 ? (() => { const o = elegir(v.grupo.miembros); return [o.x, o.z]; })() : sitioJuego(v.grupo); poner(v, 'correr', 0.2); }
      } else {
        const dx = v.objetivo[0] - v.x, dz = v.objetivo[1] - v.z, l = Math.hypot(dx, dz) || 1;
        const yawQ = Math.atan2(dx, dz); v.yaw += angulo(yawQ - v.yaw) * Math.min(1, dt * 8);
        const vel = Math.cos(angulo(yawQ - v.yaw)) > 0.5 ? v.paso : v.paso * 0.4;
        v.x += Math.sin(v.yaw) * vel * dt * Math.min(1, l); v.z += Math.cos(v.yaw) * vel * dt * Math.min(1, l);
        if (dChica < 0.9) { v.objetivo = null; v.parado = 0.8; poner(v, 'quieto', 0.2); }
        if ((v.alturaT -= dt) <= 0) { v.alturaT = 0.3; v.yObj = suelo(v.x, v.z, v.y); }
        if (v.yObj != null) v.y += (v.yObj - v.y) * Math.min(1, dt * 10);
      }
      if (tt > v.grupo.hasta && !enVista(v.x, v.y, v.z)) { morir(v); return; }
      mover(v, dt); return;
    }
    if (v.estado === 'charla') {
      // en el corro: uno habla y los demás escuchan, y se van turnando
      if (tt > (v.turno || 0)) { v.turno = tt + azar(3, 9); poner(v, Math.random() < 0.45 ? 'charla' : 'quieto', 0.4); }
      if (v.quiereIrse && !enVista(v.x, v.y, v.z)) { morir(v); return; }
      mirarChica(v, p, dChica, dt); mover(v, dt); return;
    }
    if (v.estado === 'sentado' || v.estado === 'misa') {
      if (v.trasSentarse && tt > v.trasSentarse) { v.trasSentarse = 0; poner(v, v.estado === 'misa' ? clipMisa(v) : 'sentado', 0.3); }
      if (v.estado === 'sentado' && tt > (v.turno || 0)) { v.turno = tt + azar(6, 20); if (Math.random() < 0.3) poner(v, v.clip === 'sentado' ? 'charla_sentado' : 'sentado', 0.6); }
      if (v.estado === 'sentado' && tt > v.hasta) {
        // se levanta y se va a otro sitio
        v.sitio && (v.sitio.quien = null); v.sitio = null; poner(v, 'levantarse', 0.2); v.estado = 'levantandose'; v.t = 1.1;
      }
      mirarChica(v, p, dChica, dt); mover(v, dt); return;
    }
    if (v.estado === 'levantandose') {
      v.t -= dt; if (v.t <= 0) {
        // (de pie: un paso hacia delante, que sentado estaba más atrás)
        v.x += Math.sin(v.yaw) * 0.35; v.z += Math.cos(v.yaw) * 0.35; v.y = suelo(v.x, v.z, v.y);
        if (v.luego === 'seguir') { v.luego = null; v.estado = 'seguir'; poner(v, 'quieto', 0.3); mover(v, dt); return; }
        const d = destino(v); if (!d || !irA(v, d[0], d[1], d[2])) { v.estado = 'quieto'; v.quiereIrse = true; poner(v, 'quieto'); }
      }
      mover(v, dt); return;
    }
    if (v.estado === 'llegado') {
      // en la puerta: se mete en cuanto no se le ve (buscando las llaves, mirando el escaparate); si se le sigue viendo, por
      // la puerta (si la tiene) o, como mucho a los 25 s, cuando se deje de ver
      if (!enVista(v.x, v.y, v.z)) { morir(v); return; }
      if (tt > v.hasta + 6 && v.fin?.pt) { entrarPorPuerta(v, v.fin.pt, tt); return; }
      if (v.fin?.mira) girarHacia(v, v.fin.mira, dt, 3);
      mover(v, dt); return;
    }
    if (v.estado === 'quieto') {
      if (v.quiereIrse && !enVista(v.x, v.y, v.z)) { morir(v); return; }
      mirarChica(v, p, dChica, dt); mover(v, dt);
    }
  }
  function llegar(v, tt) {
    const f = v.fin || {}; v.ruta = null;
    if (f.tipo === 'seguir') { v.estado = 'seguir'; poner(v, 'quieto', 0.3); return; }
    if (f.tipo === 'fuera_misa') {
      // fuera de la iglesia: cada uno a su casa
      const d = destino(v); if (!d || !irA(v, d[0], d[1], d[2])) { v.estado = 'quieto'; v.quiereIrse = true; poner(v, 'quieto'); }
      return;
    }
    if (f.tipo === 'paseo') {
      // en la plaza: sentarse si hay un banco libre cerca, o seguir paseando
      const b = bancosLibres.find((b) => Math.hypot(b.p[0] - v.x, b.p[2] - v.z) < 14 && b.sitios.some((s) => !s.quien));
      if (b && v.info.tipo !== 'nino' && Math.random() < 0.6) {
        const s = b.sitios.find((s) => !s.quien); const tx = -b.mira[1], tz = b.mira[0];
        v.fin = { x: b.p[0] + tx * s.u + b.mira[0] * 0.45, z: b.p[2] + tz * s.u + b.mira[1] * 0.45, tipo: 'banco', banco: b, sitio: s }; s.quien = v; v.sitio = s;
        v.estado = 'andar_directo'; return;
      }
      const d = destino(v); if (!d || !irA(v, d[0], d[1], d[2])) { v.estado = 'quieto'; v.quiereIrse = true; poner(v, 'quieto'); }
      return;
    }
    if (f.tipo === 'asiento_misa') {
      const st = f.sitio; [v.x, v.z] = pies(v.pi, st.asiento[0], st.asiento[1], st.mira, -0.10); v.y = st.asiento[2] - 0.46;
      v.yaw = Math.atan2(st.mira[0], st.mira[1]); v.estado = 'misa'; poner(v, 'sentarse', 0.2); v.trasSentarse = tt + 1.3;
      return;
    }
    if (f.tipo === 'banco') {
      // sentarse: de espaldas al banco, y abajo
      const b = f.banco, s = f.sitio, tx = -b.mira[1], tz = b.mira[0];
      [v.x, v.z] = pies(v.pi, b.p[0] + tx * s.u, b.p[2] + tz * s.u, b.mira); v.y = b.p[1] - 0.46;
      v.yaw = Math.atan2(b.mira[0], b.mira[1]); v.estado = 'sentado'; v.hasta = tt + azar(60, 300); poner(v, 'sentarse', 0.2); v.trasSentarse = tt + 1.3; v.turno = tt + 6;
      return;
    }
    if ((f.tipo === 'tienda' || f.tipo === 'portal') && f.pt && Math.hypot(v.x - yo().x, v.z - yo().z) < 80) { entrarPorPuerta(v, f.pt, tt); return; }
    if (f.tipo === 'iglesia' || f.tipo === 'tienda' || f.tipo === 'portal') { v.estado = 'llegado'; v.hasta = tt; poner(v, 'quieto', 0.3); return; }
    v.estado = 'quieto'; v.quiereIrse = true; poner(v, 'quieto');
  }
  function girarHacia(v, m, dt, k) { if (!m) return; const y = Math.atan2(m[0], m[1]); v.yaw += angulo(y - v.yaw) * Math.min(1, dt * k); }

  // ---- las puertas de las casas y las tiendas (15-11-2026; el usuario: «que la gente esté andando por las calles y cuando
  // entre en un edificio que sea por una puerta siempre. Incluso si pudieran abrir la puerta o entrar en ella de forma
  // normal»). La puerta de la fachada es parte de la casa y no se mueve; al abrirse, delante de ella crece un hueco oscuro
  // desde el lado de las bisagras, como una puerta que se abre hacia dentro, y se cierra igual. El vecino entra en él (el
  // hueco lo tapa al pasar) o sale de él. ?puertas=0, sin puertas (desaparecen sin que se vea, como antes)
  const PUERTA = { ancho: 0.95, alto: 2.05, abre: 0.65 };
  const matPuerta = new StandardMaterial(); matPuerta.diffuse = new Color(0, 0, 0); matPuerta.emissive = new Color(0.016, 0.013, 0.011); matPuerta.useLighting = false; matPuerta.useFog = true; matPuerta.update();
  const abiertas = [];
  const fachadaDe = (pt, fuera) => [pt.p[0] + pt.n[0] * (fuera - 0.3), pt.p[2] + pt.n[1] * (fuera - 0.3)]; // (el punto de vida.json está a 0,3 m de la fachada)
  function abrirPuerta(pt) {
    let d = abiertas.find((x) => x.pt === pt); if (d) { d.quiere = 1; d.usos++; return d; }
    const e = new Entity('puerta_abierta'); e.addComponent('render', { type: 'box', material: matPuerta, castShadows: false, receiveShadows: false }); app.root.addChild(e);
    const lado = Math.random() < 0.5 ? 1 : -1, tx = -pt.n[1] * lado, tz = pt.n[0] * lado, [fx, fz] = fachadaDe(pt, 0.025);
    d = { pt, e, k: 0, quiere: 1, usos: 1, bx: fx - tx * PUERTA.ancho / 2, bz: fz - tz * PUERTA.ancho / 2, tx, tz, yaw: Math.atan2(pt.n[0], pt.n[1]) * 180 / Math.PI };
    e.setEulerAngles(0, d.yaw, 0); e.setLocalScale(0.001, PUERTA.alto, 0.02); e.setPosition(d.bx, pt.p[1] + PUERTA.alto / 2, d.bz);
    abiertas.push(d); return d;
  }
  const cerrarPuerta = (d) => { if (d && --d.usos <= 0) d.quiere = 0; };
  app.on('update', (dt) => {
    for (const d of abiertas.slice()) {
      d.k = Math.max(0, Math.min(1, d.k + (d.quiere ? 1 : -1) * dt / PUERTA.abre));
      const w = PUERTA.ancho * d.k * d.k * (3 - 2 * d.k);
      d.e.setLocalScale(Math.max(0.001, w), PUERTA.alto, 0.02); d.e.setPosition(d.bx + d.tx * w / 2, d.pt.p[1] + PUERTA.alto / 2, d.bz + d.tz * w / 2);
      if (!d.quiere && d.k === 0) { d.e.destroy(); abiertas.splice(abiertas.indexOf(d), 1); }
    }
  });
  // entrar: se para ante la puerta, la abre, entra y la puerta se cierra detrás
  function entrarPorPuerta(v, pt, tt) {
    if (q.get('puertas') === '0') { v.estado = 'llegado'; v.hasta = tt; poner(v, 'quieto', 0.3); return; }
    v.ruta = null; v.puntos = null; v.estado = 'entrando'; v.pt = pt; v.fase = 0; v.hasta = tt + azar(0.3, 0.9); v.y0 = v.y; poner(v, 'quieto', 0.3);
  }
  // salir: aparece detrás de la puerta (la tapa la fachada), la abre, sale y la cierra; luego, a lo suyo
  function salirPorPuerta(pi, pt) {
    const [x, z] = fachadaDe(pt, -0.6), v = nacer(pi, x, z, pt.p[1]);
    v.yaw = Math.atan2(pt.n[0], pt.n[1]); v.estado = 'saliendo'; v.pt = pt; v.fase = 0; v.puerta = abrirPuerta(pt); poner(v, 'quieto'); mover(v);
    return v;
  }
  function porLaPuerta(v, dt, tt) {
    const pt = v.pt, mira = v.estado === 'entrando' ? [-pt.n[0], -pt.n[1]] : [pt.n[0], pt.n[1]];
    if (v.estado === 'entrando') {
      if (v.fase === 0) { girarHacia(v, mira, dt, 6); if (tt > v.hasta) { v.puerta = abrirPuerta(pt); v.fase = 1; } }
      else if (v.fase === 1) { girarHacia(v, mira, dt, 6); if (v.puerta.k > 0.6) { v.fase = 2; poner(v, v.clipAndar, 0.25); } }
      else if (v.fase === 2) {
        // (hacia dentro, despacio; sube a la altura del umbral según se acerca: los portales con peldaños)
        const [tx, tz] = fachadaDe(pt, -0.75), dx = tx - v.x, dz = tz - v.z, l = Math.hypot(dx, dz), paso = Math.min(l, v.paso * 0.75 * dt);
        if (l < 0.05) { v.fase = 3; cerrarPuerta(v.puerta); v.puerta = null; v.hasta = tt + PUERTA.abre + 0.15; poner(v, 'quieto', 0.2); }
        else { v.x += dx / l * paso; v.z += dz / l * paso; const df = (v.x - pt.p[0]) * pt.n[0] + (v.z - pt.p[2]) * pt.n[1] + 0.3; v.y = df > 0.9 ? v.y : df < 0 ? pt.p[1] : pt.p[1] + (v.y0 - pt.p[1]) * df / 0.9; girarHacia(v, mira, dt, 8); }
      } else if (tt > v.hasta) { morir(v); return; }
    } else {
      if (v.fase === 0) { if (v.puerta.k > 0.6) { v.fase = 1; poner(v, v.clipAndar, 0.25); } }
      else if (v.fase === 1) {
        const [tx, tz] = fachadaDe(pt, 0.95), dx = tx - v.x, dz = tz - v.z, l = Math.hypot(dx, dz), paso = Math.min(l, v.paso * 0.75 * dt);
        if (l < 0.05) {
          cerrarPuerta(v.puerta); v.puerta = null; v.pt = null; v.y = suelo(v.x, v.z, v.y);
          const d = destino(v); if (!d || !irA(v, d[0], d[1], d[2])) { v.estado = 'quieto'; v.quiereIrse = true; poner(v, 'quieto'); }
        } else { v.x += dx / l * paso; v.z += dz / l * paso; const df = (v.x - pt.p[0]) * pt.n[0] + (v.z - pt.p[2]) * pt.n[1] + 0.3; if (df > 0.6) v.y += (suelo(v.x, v.z, v.y) - v.y) * Math.min(1, dt * 10); }
      }
    }
    mover(v, dt);
  }
  function mover(v) { v.raiz.setPosition(v.x, v.y, v.z); v.raiz.setEulerAngles(0, v.yaw * 180 / Math.PI, 0); }
  // la cabeza hacia la chica, si está cerca y delante (los que están parados o sentados)
  function mirarChica(v, p, d, dt) {
    if (!v.cabeza) return;
    let obj = 0;
    if (d < 7 && d > 0.3) { const a = angulo(Math.atan2(p.x - v.x, p.z - v.z) - v.yaw); obj = Math.abs(a) < 1.8 ? Math.max(-1.1, Math.min(1.1, a)) : 0; }
    v.giroCab += (obj - v.giroCab) * Math.min(1, dt * 2.5);
    if (Math.abs(v.giroCab) < 0.01) return;
    for (const [h, parte] of [[v.cuello, 0.4], [v.cabeza, 0.6]]) { if (!h) continue; qa.setFromAxisAngle(Vec3.UP, v.giroCab * parte * 180 / Math.PI); h.setRotation(qa.mul(h.getRotation().clone())); }
  }

  // ---- las cápsulas: los seis más cercanos a la chica, para que no los atraviese (no mientras conduce: el coche se pararía en seco)
  const CAPS = [];
  for (let k = 0; k < 6; k++) {
    const c = new Entity('gente_capsula'); c.tags.add('gente');
    c.addComponent('collision', { type: 'capsule', radius: 0.24, height: 1.6 }); c.addComponent('rigidbody', { type: 'kinematic' });
    c.enabled = false; app.root.addChild(c); CAPS.push(c);
  }
  function capsulas(p, conduce) {
    const cerc = conduce ? [] : gente.filter((v) => Math.abs(v.x - p.x) < 5 && Math.abs(v.z - p.z) < 5).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z)).slice(0, CAPS.length);
    CAPS.forEach((c, k) => {
      const v = cerc[k];
      if (!v) { if (c.enabled) c.enabled = false; return; }
      const sentado = v.estado === 'sentado' || v.estado === 'misa';
      c.setPosition(v.x - (sentado ? Math.sin(v.yaw) * 0.12 : 0), v.y + 0.82, v.z - (sentado ? Math.cos(v.yaw) * 0.12 : 0)); // (sentado, entre la cadera y las rodillas: los pies van delante)
      if (!c.enabled) { c.enabled = true; c.rigidbody.teleport(c.getPosition()); }
    });
  }

  // ---- para hablar con ellos (src/acciones.js) y para las pruebas
  const api = {
    lista: gente,
    cuantos: () => ({ hay: gente.length, objetivo, enLaCalle: Math.round(VECINOS * enLaCalle(ahora().h, ahora().d, ahora().m)), pesoLocal: Math.round(pesoLocal), estados: gente.reduce((o, v) => ((o[v.estado] = (o[v.estado] || 0) + 1), o), {}) }),
    // el más cercano a un punto, delante de la chica si se da su rumbo
    cercano: (x, z, r = 2.2) => { let m = null, dm = r; for (const v of gente) { if (v.estado === 'llegado') continue; const d = Math.hypot(v.x - x, v.z - z); if (d < dm) { dm = d; m = v; } } return m; },
    hablar: (v, x, z) => {
      if (v?.replica) { v.ocupado = true; alPedir?.(0, v, x, z); return; }
      v.ocupado = true; v.antes = { clip: v.clip, estado: v.estado };
      v.mira = [x - v.x, z - v.z];
      const sentado = v.estado === 'sentado' || v.estado === 'misa';
      if (!sentado) { v.mira = [x - v.x, z - v.z]; poner(v, 'charla', 0.3); } else { v.mira = null; poner(v, 'charla_sentado', 0.3); }
      if (v.grupo && !v.grupo.jugar) v.grupo.hasta += 30;
    },
    soltar: (v) => { if (!v) return; if (v.replica) { v.ocupado = false; alPedir?.(1, v, v.x, v.z); return; } v.ocupado = false; v.mira = null; if (v.antes) poner(v, v.antes.clip === 'charla' ? 'quieto' : v.antes.clip, 0.4); },
    saludar: (v) => { v?.saludo?.empezar(); if (v?.replica) alPedir?.(2, v, v.x, v.z); },
    // lo que puede decidir un vecino al hablar con la chica (src/ia.js): acompañarla un rato, irse a lo suyo o sentarse
    acompañar: (v, segundos = 90) => {
      if (v?.replica) { v.ocupado = false; alPedir?.(3, v, v.x, v.z); return; }
      if (!v) return; v.ocupado = false; v.mira = null; v.seguirHasta = performance.now() / 1000 + segundos;
      if (v.grupo) { v.grupo.miembros = v.grupo.miembros.filter((o) => o !== v); v.grupo = null; }
      if (v.estado === 'sentado' || v.estado === 'misa') { v.sitio && (v.sitio.quien = null); v.sitio = null; poner(v, 'levantarse', 0.2); v.estado = 'levantandose'; v.t = 1.1; v.luego = 'seguir'; }
      else { v.estado = 'seguir'; v.fin = null; poner(v, 'quieto', 0.3); }
    },
    irse: (v) => {
      if (v?.replica) { v.ocupado = false; alPedir?.(4, v, v.x, v.z); return; }
      if (!v) return; v.ocupado = false; v.mira = null; v.seguirHasta = 0;
      if (v.grupo) { v.grupo.miembros = v.grupo.miembros.filter((o) => o !== v); v.grupo = null; }
      if (v.estado === 'sentado' || v.estado === 'misa') { v.sitio && (v.sitio.quien = null); v.sitio = null; poner(v, 'levantarse', 0.2); v.estado = 'levantandose'; v.t = 1.1; return; }
      const d = destino(v); if (d && irA(v, d[0], d[1], d[2])) return;
      // (sin calle a mano —en medio de una plaza—: se aleja andando, de espaldas a la chica, y luego sigue a lo suyo)
      const p = yo(), dx = v.x - p.x, dz = v.z - p.z, l = Math.hypot(dx, dz) || 1;
      v.fin = { x: v.x + dx / l * 14, z: v.z + dz / l * 14, tipo: 'paseo' }; v.puntos = null; v.ruta = null; v.t = 0; v.estado = 'andar_directo'; poner(v, v.clipAndar, 0.25);
    },
    sentarse: (v) => {
      if (v?.replica) { if (v.estado === 'sentado' || v.estado === 'misa') return false; v.ocupado = false; alPedir?.(5, v, v.x, v.z); return true; }
      if (!v || v.estado === 'sentado' || v.estado === 'misa') return false;
      const b = bancosLibres.filter((b) => Math.hypot(b.p[0] - v.x, b.p[2] - v.z) < 25 && b.sitios.some((s) => !s.quien)).sort((a, c) => Math.hypot(a.p[0] - v.x, a.p[2] - v.z) - Math.hypot(c.p[0] - v.x, c.p[2] - v.z))[0];
      if (!b) return false;
      v.ocupado = false; v.mira = null; if (v.grupo) { v.grupo.miembros = v.grupo.miembros.filter((o) => o !== v); v.grupo = null; }
      const s = b.sitios.find((s) => !s.quien), tx = -b.mira[1], tz = b.mira[0];
      v.fin = { x: b.p[0] + tx * s.u + b.mira[0] * 0.45, z: b.p[2] + tz * s.u + b.mira[1] * 0.45, tipo: 'banco', banco: b, sitio: s }; s.quien = v; v.sitio = s;
      v.puntos = null; v.ruta = null; v.t = 0; v.estado = 'andar_directo'; poner(v, v.clipAndar, 0.25); return true;
    },
    // (para la entrada, src/desde388.js: dos de cada uno, andando junto a «p», para que la gráfica prepare sus materiales
    // y sus sombras antes de que se vea nada; luego se guardan, y los primeros que salgan ya estarán hechos)
    calentar: (p) => {
      const vs = [];
      listos.forEach((pi, i) => { for (let k = 0; k < 2; k++) { const v = crear(pi); v.raiz.setPosition(p.x + (i % 6) * 0.8, p.y, p.z + Math.floor(i / 6) * 0.8 + k * 3); v.e.anim?.baseLayer?.transition('andar', 0); vs.push(v); } });
      return () => { for (const v of vs) { v.raiz.enabled = false; POOL[v.pi].push(v); } };
    },
    nacer: (tipo, x, z) => { const l = deTipo[tipo].filter((i) => ASSETS[i]); const v = nacer(elegir(l), x, z); v.estado = 'quieto'; poner(v, 'quieto'); return v; },
    destino, carril, nodoCerca, camino: caminoEntre, enLaCalle, misa: enMisa, nodos: n,
    // (para las pruebas de las puertas, tools/prueba_puertas.py: si se ve a alguien, sacar a uno por una puerta de cerca y
    // mandar a otro a entrar por la suya)
    // (la chica se sienta en (x, z): ese sitio, ocupado, para que ningún vecino se siente encima de ella; devuelve con qué
    // dejarlo libre al levantarse. 15-11-2026, la revisión del juego)
    ocupar: (x, z) => {
      let m = null, dm = 0.6;
      const mira = (sx, sz, st) => { const d = Math.hypot(sx - x, sz - z); if (d < dm && !st.quien) { dm = d; m = st; } };
      for (const b of bancosLibres) { const tx = -b.mira[1], tz = b.mira[0]; for (const st of b.sitios) mira(b.p[0] + tx * st.u, b.p[2] + tz * st.u, st); }
      for (const st of sillas) mira(st.p[0], st.p[2], st);
      for (const st of asientosIglesia) mira(st.asiento[0], st.asiento[1], st);
      if (!m) return null;
      const CHICA = { chica: true }; m.quien = CHICA; return () => { if (m.quien === CHICA) m.quien = null; };
    },
    seVe: (x, y, z) => enVista(x, y, z), puertas: () => abiertas.map((d) => ({ p: d.pt.p, k: d.k })), _red: { X, Z, VEC, CALLE, OF, PARED, BORDE, n, carril, hayPaso, nombres: C.map((c) => c.nombre) },
    salirDeCasa: (x, z, dmin = 3, dmax = 30) => { const pt = puertaCerca(x, z, dmin, dmax), l = deTipo.adulto.filter((i) => ASSETS[i]); return pt && l.length ? salirPorPuerta(elegir(l), pt) : null; },
    entrarEnCasa: (v, x, z, pt0 = null) => { const pt = pt0 || puertaCerca(x, z, 0, 30); if (!pt || !v || !llegada(pt)) return null; v.ocupado = false; const d = [pt.p[0] + pt.n[0] * 0.5, pt.p[2] + pt.n[1] * 0.5]; return irA(v, d[0], d[1], { tipo: 'portal', mira: [-pt.n[0], -pt.n[1]], pt, nodo: pt._nodo }) ? pt : null; },
    // ---- el multijugador (src/multi_gente.js)
    modo: (m) => cambiarModo(m),
    get modoActual() { return modo; },
    // los que siguen a este juego: [{id, x, y, z, r}]
    centros: (l) => { otros = Array.isArray(l) ? l : []; },
    // los de alrededor de los que siguen a este juego, para mandárselos: [id, cuerpo, x, y, z (cm), rumbo (centésimas de
    // radián), clip, señales (1 paraguas, 2 saludando, 4 hablando con alguien, 8 sentado)]
    instantanea: () => {
      if (modo === 'replica' || !otros.length) return null;
      const l = [];
      for (const v of gente) {
        if (v.replica || !otros.some((o) => Math.hypot(v.x - o.x, v.z - o.z) < RADIO + 30)) continue;
        l.push([v.id, v.pi, Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100), Math.round(angulo(v.yaw) * 100), Math.max(0, CLIPS.indexOf(v.clip)),
          (v.paraguas?.enabled ? 1 : 0) | (v.saludo?.activo ? 2 : 0) | (v.ocupado ? 4 : 0) | (/sentado|misa/.test(v.estado) ? 8 : 0)]);
      }
      return l.slice(0, 60);
    },
    recibir: (l, origen) => recibir(l, origen),
    // lo que hay que hacer cuando, siendo réplica, se hace algo con un vecino (lo hace el anfitrión)
    alPedir: (f) => { alPedir = f; },
    // lo que pide alguien que sigue a este juego: 0 hablarle, 1 soltarle, 2 saludar, 3 que le acompañe, 4 que se vaya, 5 que se siente
    pedido: (op, id, x, z, quien) => {
      const v = gente.find((o) => o.id === id && !o.replica); if (!v || modo === 'replica') return false;
      if (op === 0) { api.hablar(v, x, z); v.ocupadoPor = quien; v.ocupadoT = performance.now() / 1000; }
      else if (op === 1) { v.ocupadoPor = null; api.soltar(v); }
      else if (op === 2) v.saludo?.empezar();
      else if (op === 3) { v.ocupadoPor = null; api.acompañar(v, 90); v.sigueA = quien; }
      else if (op === 4) { v.ocupadoPor = null; api.irse(v); }
      else if (op === 5) { v.ocupadoPor = null; if (!api.sentarse(v)) api.soltar(v); }
      return true;
    },
    // (para las pruebas, tools/prueba_gente.py) empezar de cero con la hora y el sitio de ahora, como al cargar
    reiniciar: () => { for (const v of gente.slice()) morir(v); cuentaGente = 0; ultimaCuenta = -1e9; reloj_ = 0; },
    // si lo que hace cada uno tiene sentido: nadie encima de un coche aparcado, flotando o hundido; y dónde está cada uno,
    // para mirar fuera, con las casas del Catastro, que nadie está dentro de una (tools/prueba_gente.py)
    revisar: () => {
      const r = { total: gente.length, sobreCoche: [], flotando: [], tipos: {}, estados: {}, posiciones: [] };
      for (const v of gente) {
        r.tipos[v.info.tipo] = (r.tipos[v.info.tipo] || 0) + 1; r.estados[v.estado] = (r.estados[v.estado] || 0) + 1;
        const dentro = dentroIglesia(v.x, v.z), q_ = [Math.round(v.x * 10) / 10, Math.round(v.z * 10) / 10, v.estado];
        r.posiciones.push(q_);
        const sentado = /sentado|misa|levantandose/.test(v.estado);
        if (!sentado && !libreDeCoches(v.x, v.z, 0.05)) {
          // (cuánto se mete en la caja del coche, en metros: unos centímetros es rozarlo al pasar; más, atravesarlo)
          let hondo = 0;
          for (const k of window.foto?.coches?.coches || []) { const c = k.caja; if (!c) continue; const rx = v.x - c.x, rz = v.z - c.z, lx = rx * c.dx + rz * c.dz, lz = -rx * c.dz + rz * c.dx; hondo = Math.max(hondo, Math.min(c.L / 2 - Math.abs(lx), c.W / 2 - Math.abs(lz))); }
          r.sobreCoche.push([...q_, Math.round(hondo * 100) / 100, v.rodeo ? 'rodeo' : v.pareja ? 'pareja' : '']);
        }
        if (!sentado && !dentro) { const y = suelo(v.x, v.z, v.y); if (Math.abs(y - v.y) > 0.25) r.flotando.push([...q_, Math.round((v.y - y) * 100) / 100]); }
      }
      return r;
    },
  };
  // ---- las réplicas: los vecinos que mueve el juego de otro (src/multi_gente.js)
  // (un cuerpo que no está en este aparato —en el móvil hay 6 de los 12—: otro de la misma edad y sexo)
  const sustituto = (pi) => {
    const i = info[pi]; if (!i) return listos[0] ?? null;
    return listos.find((x) => info[x].tipo === i.tipo && info[x].sexo === i.sexo) ?? listos.find((x) => info[x].tipo === i.tipo) ?? listos[0] ?? null;
  };
  function quitarReplica(v) {
    v.raiz.enabled = false; POOL[v.pi].push(v); replicas.delete(v.id);
    const i = gente.indexOf(v); if (i >= 0) gente.splice(i, 1);
  }
  let origenR = null;
  function recibir(l, origen = null) {
    if (modo !== 'replica' || !Array.isArray(l)) return;
    // (de otro anfitrión: los números de sus vecinos son otros)
    if (origen !== origenR) { for (const v of [...replicas.values()]) quitarReplica(v); origenR = origen; }
    const t = performance.now(), vistos = new Set();
    for (const [id, pi, x, y, z, yaw, clip, se] of l) {
      vistos.add(id);
      let v = replicas.get(id);
      if (!v) {
        const pj = ASSETS[pi] ? pi : sustituto(pi); if (pj == null) continue;
        v = crear(pj); v.clip = null; v.clipYa = false;
        Object.assign(v, { id, replica: true, buf: [], x: x / 100, y: y / 100, z: z / 100, yaw: yaw / 100, estado: 'quieto', giroCab: 0, ocupado: false, sombra: undefined, paraguasR: false, saludoR: false, sitio: null, grupo: null, pareja: null, puerta: null });
        v.info = info[pi] || v.info;   // (quién es: el del anfitrión, aunque el cuerpo sea otro)
        v.raiz.setPosition(v.x, v.y, v.z); gente.push(v); replicas.set(id, v);
      }
      v.buf.push([t, x / 100, y / 100, z / 100, yaw / 100]); if (v.buf.length > 8) v.buf.shift();
      v.clipR = CLIPS[clip] || 'quieto';
      v.estado = v.clipR === 'sentado_iglesia' ? 'misa' : /sentado/.test(v.clipR) || (se & 8) ? 'sentado' : /andar|pasear|correr/.test(v.clipR) ? 'andar' : v.clipR === 'charla' ? 'charla' : 'quieto';
      v.paraguasR = !!(se & 1); v.ocupado = !!(se & 4);
      if ((se & 2) && !v.saludoR) v.saludo?.empezar(); v.saludoR = !!(se & 2);
    }
    for (const v of [...replicas.values()]) if (!vistos.has(v.id)) quitarReplica(v);
  }
  let relojR = 0;
  function moverReplicas(dt, tt, p) {
    const ver = performance.now() - 300;
    for (const v of replicas.values()) {
      const b = v.buf; if (!b.length) continue;
      let j = b.length - 1; while (j > 0 && b[j - 1][0] > ver) j--;
      if (j > 0 && b[j][0] > ver) {
        const [t0, x0, y0, z0, r0] = b[j - 1], [t1, x1, y1, z1, r1] = b[j], k = Math.max(0, Math.min(1, (ver - t0) / Math.max(1, t1 - t0)));
        v.x = x0 + (x1 - x0) * k; v.y = y0 + (y1 - y0) * k; v.z = z0 + (z1 - z0) * k; v.yaw = r0 + angulo(r1 - r0) * k;
      } else { [, v.x, v.y, v.z, v.yaw] = b[b.length - 1]; }
      poner(v, v.clipR || 'quieto', 0.3);
      mover(v);
      if (v.estado !== 'andar') mirarChica(v, p, Math.hypot(v.x - p.x, v.z - p.z), dt);
    }
    if ((relojR -= dt) <= 0) {
      relojR = 0.5;
      for (const v of replicas.values()) {
        ponerParaguas(v, v.paraguasR);
        const cs = Math.hypot(v.x - p.x, v.z - p.z) < 32; if (v.sombra !== cs) { v.sombra = cs; for (const r of v.e.findComponents('render')) r.castShadows = cs; }
      }
    }
  }
  // pasar de mover a los vecinos a verlos («replica»), o al revés: los propios se van (los que se ven, también: los del otro
  // juego llegan enseguida, en el mismo sitio más o menos); las réplicas pasan a ser propias, cada una a lo suyo
  function cambiarModo(m) {
    if (m === modo || !['solo', 'anfitrion', 'replica'].includes(m)) return;
    if (m === 'replica') {
      for (const v of gente.slice()) if (!v.replica) morir(v);
      otros = [];
    } else if (modo === 'replica') {
      const tt = performance.now() / 1000;
      for (const v of [...replicas.values()]) {
        replicas.delete(v.id);
        const sentado = v.estado === 'sentado' || v.estado === 'misa';
        Object.assign(v, { id: sigId++, replica: false, buf: null, sigueA: null, ocupadoPor: null, ocupado: false, ruta: null, k: 0, lado: 0, fin: null, hasta: tt + azar(30, 200), desvio: 0, sitio: null, grupo: null, t: 0, alturaT: 0, mira: null,
          quiereIrse: !sentado, puntos: null, trasSentarse: 0, kVisto: -1, rodeo: null, pareja: null, objetivo: null, parado: 0, turno: 0, yObj: null, antes: null, pt: null, puerta: null, fase: 0 });
        v.paso = PASO[v.info.tipo === 'mayor' ? 'pasear' : 'andar'] * azar(0.95, 1.04); v.clipAndar = v.info.tipo === 'mayor' ? 'pasear' : 'andar';
        if (sentado) { v.estado = v.clipR === 'sentado_iglesia' ? 'misa' : 'sentado'; continue; }
        v.estado = 'quieto';
        if (/andar|pasear|correr/.test(v.clipR || '')) { const d = destino(v); if (d && irA(v, d[0], d[1], d[2])) v.quiereIrse = false; }
      }
      cuentaGente = 1; ultimaCuenta = -1e9;
    }
    modo = m;
  }
  // los saludos se mueven después de la animación
  app.on('update', (dt) => { for (const v of gente) v.saludo?.mover(dt); });
  return api;
}
