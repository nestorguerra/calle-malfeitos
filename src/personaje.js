// El personaje del editor, en la calle (docs/personaje_rediseno.md): el mismo cuerpo de Anny y las mismas prendas de
// MakeHuman que usa el editor (escenas/personaje/), pero horneados al cargar. El editor mezcla en la GPU las 214 formas
// del cuerpo y carga texturas de 2048 px (unos 170 MB de gráfica); en la calle el personaje ya está decidido, así que:
// - cada .glb se lee a mano y sus formas se suman a los vértices con los pesos del personaje (las 64 del fenotipo, los
//   deslizadores y la piel que tapa cada prenda); las normales se rehacen con la forma nueva. Solo quedan vivas las del
//   parpadeo, la mirada y el vaivén del pelo;
// - sobran los dientes y la lengua (la boca va cerrada), y las zonas de piel que el editor pinta aparte se unen a ella;
// - las texturas se reducen antes de subirlas a la GPU (la piel y la ropa, a 1024 px; en el móvil, la mitad);
// - el esqueleto se ajusta una vez al cuerpo, como en el editor;
// - la luz se adapta a la de la calle, mucho más fuerte que la del editor (ver luzSuave y sinSombraPropia).
// El personaje sale de lo guardado por el editor en el navegador (localStorage «personaje»), o de ?estado=<JSON>.
import {
  AnimData, AnimEvents, AnimTrack, Asset, BLEND_NONE, CULLFACE_NONE, Color, Entity, Mat4, PIXELFORMAT_RGBA8, PIXELFORMAT_SRGBA8,
  Quat, SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL, ShaderChunks, Texture, Vec3,
} from 'playcanvas';
import { crearMelena } from './melena.js';

export const ROPA_DE_SERIE = { conjunto: 'camiseta_blanca', calzado: 'zapatillas', pelo: 'corto' };
export const TIPOS = ['conjunto', 'calzado', 'pelo'];
// las prendas hechas aquí, que no salen de MakeHuman ni llevan las formas del cuerpo (no están en editor.json): la
// melena simulada (tools/personajes/melena.py y src/melena.js), con su .json al lado
export const PROPIAS = [{ clave: 'melena_media', nombre: 'Melena a media espalda', tipo: 'pelo', sim: true }];
// las formas que siguen vivas en la calle (las demás se hornean): el parpadeo, los párpados al mirar y el vaivén del pelo
const VIVAS = new Set(['eyeBlinkLeft', 'eyeBlinkRight', 'vaiven_izq', 'vaiven_der', 'vaiven_ade', 'vaiven_atr',
  ...['Left', 'Right'].flatMap((l) => ['In', 'Out', 'Up', 'Down'].map((s) => `eyeLook${s}${l}`))]);

// ------------------------------------------------------------------------------------------------ leer y escribir .glb
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
function leerGlb(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('no es un .glb');
  const nJson = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, nJson)));
  return { json, bin: new Uint8Array(buf, 20 + nJson + 8, dv.getUint32(20 + nJson, true)) };
}
// un trozo del binario como números (sin copiar si está alineado)
function vista(g, Tipo, desde, cuantos) {
  const ini = g.bin.byteOffset + desde, n = Tipo.BYTES_PER_ELEMENT;
  return ini % n === 0 ? new Tipo(g.bin.buffer, ini, cuantos) : new Tipo(g.bin.buffer.slice(ini, ini + cuantos * n));
}
function disperso(g, a) {
  const s = a.sparse, vi = g.json.bufferViews[s.indices.bufferView], vv = g.json.bufferViews[s.values.bufferView];
  const Tipo = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }[s.indices.componentType];
  return { idx: vista(g, Tipo, (vi.byteOffset || 0) + (s.indices.byteOffset || 0), s.count),
    val: vista(g, Float32Array, (vv.byteOffset || 0) + (s.values.byteOffset || 0), s.count * NUM[a.type]) };
}
// un accessor de decimales, entero y propio (con lo disperso ya puesto)
function decimales(g, a) {
  if (a.componentType !== 5126) throw new Error('accessor que no es de decimales');
  const n = NUM[a.type], out = new Float32Array(a.count * n);
  if (a.bufferView !== undefined) {
    const v = g.json.bufferViews[a.bufferView], paso = v.byteStride || n * 4, desde = (v.byteOffset || 0) + (a.byteOffset || 0);
    if (paso === n * 4) out.set(vista(g, Float32Array, desde, a.count * n));
    else { const dv = new DataView(g.bin.buffer, g.bin.byteOffset + desde); for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv.getFloat32(i * paso + k * 4, true); }
  }
  if (a.sparse) { const { idx, val } = disperso(g, a); for (let k = 0; k < idx.length; k++) for (let c = 0; c < n; c++) out[idx[k] * n + c] = val[k * n + c]; }
  return out;
}
// suma a «pos» una forma (un accessor de diferencias, entero o disperso) con su peso
function sumar(g, a, w, pos) {
  if (a.bufferView === undefined && a.sparse) {
    const { idx, val } = disperso(g, a);
    for (let k = 0; k < idx.length; k++) { const i = idx[k] * 3, j = k * 3; pos[i] += w * val[j]; pos[i + 1] += w * val[j + 1]; pos[i + 2] += w * val[j + 2]; }
  } else { const d = decimales(g, a); for (let i = 0; i < pos.length; i++) pos[i] += w * d[i]; }
}
function enteros(g, a) {
  if (a._bytes) return new ({ 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType])(a._bytes.buffer, a._bytes.byteOffset, a.count);
  const v = g.json.bufferViews[a.bufferView];
  return vista(g, { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType], (v.byteOffset || 0) + (a.byteOffset || 0), a.count);
}

// las normales de una malla con su forma nueva, como las hace Blender (cada cara pesa por su ángulo en el vértice). Los
// vértices que el .glb parte en dos por la costura de la textura eran uno: se reconocen por tener la misma posición y
// la misma normal de partida, y comparten la nueva
function normales(g, prims, nuevos) {
  const grupos = new Map(); let n = 0;
  for (const pr of prims) {
    const aN = pr.p.attributes.NORMAL; if (aN === undefined) continue;
    pr.n0 = decimales(g, g.json.accessors[aN]);
    const bp = new Uint32Array(pr.pos0.buffer), bn = new Uint32Array(pr.n0.buffer), cuenta = pr.pos0.length / 3;
    pr.grupo = new Uint32Array(cuenta);
    for (let i = 0; i < cuenta; i++) {
      const k = `${bp[3 * i]},${bp[3 * i + 1]},${bp[3 * i + 2]},${bn[3 * i]},${bn[3 * i + 1]},${bn[3 * i + 2]}`;
      let gr = grupos.get(k); if (gr === undefined) { gr = n++; grupos.set(k, gr); }
      pr.grupo[i] = gr;
    }
  }
  const suma = new Float64Array(n * 3);
  for (const pr of prims) {
    if (!pr.grupo || (pr.p.mode ?? 4) !== 4) continue;
    const ind = pr.p.indices !== undefined ? enteros(g, g.json.accessors[pr.p.indices]) : null, P = pr.forma, gr = pr.grupo;
    const nTri = Math.floor((ind ? ind.length : P.length / 3) / 3);
    for (let t = 0; t < nTri; t++) {
      const a = ind ? ind[3 * t] : 3 * t, b = ind ? ind[3 * t + 1] : 3 * t + 1, c = ind ? ind[3 * t + 2] : 3 * t + 2;
      const ux = P[3 * b] - P[3 * a], uy = P[3 * b + 1] - P[3 * a + 1], uz = P[3 * b + 2] - P[3 * a + 2];
      const vx = P[3 * c] - P[3 * a], vy = P[3 * c + 1] - P[3 * a + 1], vz = P[3 * c + 2] - P[3 * a + 2];
      const wx = vx - ux, wy = vy - uy, wz = vz - uz;  // (de b a c)
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const ln = Math.hypot(nx, ny, nz), lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz), lw = Math.hypot(wx, wy, wz);
      if (ln < 1e-20 || lu < 1e-12 || lv < 1e-12 || lw < 1e-12) continue;
      nx /= ln; ny /= ln; nz /= ln;
      const angA = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy + uz * vz) / (lu * lv))));
      const angB = Math.acos(Math.max(-1, Math.min(1, -(ux * wx + uy * wy + uz * wz) / (lu * lw))));
      const ang = [angA, angB, Math.max(0, Math.PI - angA - angB)], vs = [a, b, c];
      for (let k = 0; k < 3; k++) { const i = gr[vs[k]] * 3; suma[i] += nx * ang[k]; suma[i + 1] += ny * ang[k]; suma[i + 2] += nz * ang[k]; }
    }
  }
  for (const pr of prims) {
    if (!pr.grupo) continue;
    const N = pr.n0.slice();
    for (let i = 0; i < pr.grupo.length; i++) {
      const k = pr.grupo[i] * 3, l = Math.hypot(suma[k], suma[k + 1], suma[k + 2]);
      if (l > 1e-12) { N[3 * i] = suma[k] / l; N[3 * i + 1] = suma[k + 1] / l; N[3 * i + 2] = suma[k + 2] / l; }
    }
    nuevos.set(pr.p.attributes.NORMAL, N);
  }
}

// los bytes de un accessor, seguidos (lo horneado, lo unido o lo que trae el .glb, sin su paso)
function seguidos(g, i, nuevos) {
  const a = g.json.accessors[i], n = nuevos.get(i);
  if (n) return new Uint8Array(n.buffer, n.byteOffset, n.byteLength);
  if (a._bytes) return a._bytes;
  if (a.sparse) { const d = decimales(g, a); return new Uint8Array(d.buffer); }
  const v = g.json.bufferViews[a.bufferView], elem = BYTES[a.componentType] * NUM[a.type], paso = v.byteStride || elem;
  const desde = (v.byteOffset || 0) + (a.byteOffset || 0);
  if (paso === elem) return g.bin.subarray(desde, desde + a.count * elem);
  const out = new Uint8Array(a.count * elem);
  for (let k = 0; k < a.count; k++) out.set(g.bin.subarray(desde + k * paso, desde + k * paso + elem), k * elem);
  return out;
}
const limites = (d, c) => {
  const min = new Array(c).fill(Infinity), max = new Array(c).fill(-Infinity);
  for (let k = 0; k < d.length; k++) { const x = d[k], e = k % c; if (x < min[e]) min[e] = x; if (x > max[e]) max[e] = x; }
  return { min, max };
};
// une varias primitivas de una malla (con los mismos atributos y las mismas formas) en la primera: un dibujo en vez de varios
function unir(g, destino, otras, nuevos) {
  const j = g.json, todas = [destino, ...otras];
  const junta = (indices) => {  // (un accessor nuevo con los de cada primitiva, uno tras otro)
    const a0 = j.accessors[indices[0]], partes = indices.map((i) => seguidos(g, i, nuevos));
    const bytes = new Uint8Array(partes.reduce((t, x) => t + x.byteLength, 0)); let o = 0;
    for (const x of partes) { bytes.set(x, o); o += x.byteLength; }
    const a = { componentType: a0.componentType, type: a0.type, count: indices.reduce((t, i) => t + j.accessors[i].count, 0), _bytes: bytes };
    if (a0.normalized) a.normalized = true;
    if (a0.componentType === 5126 && (a0.min || a0.type === 'VEC3')) Object.assign(a, limites(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4), NUM[a0.type]));
    j.accessors.push(a);
    return j.accessors.length - 1;
  };
  // los índices, corridos lo que ocupan los vértices de las primitivas de antes
  const cuentas = todas.map((p) => j.accessors[p.attributes.POSITION].count), total = cuentas.reduce((a, b) => a + b, 0);
  const listas = todas.map((p) => enteros(g, j.accessors[p.indices]));
  const ind = new (total > 65535 ? Uint32Array : Uint16Array)(listas.reduce((t, x) => t + x.length, 0)); let o = 0, base = 0;
  listas.forEach((l, k) => { for (let i = 0; i < l.length; i++) ind[o++] = l[i] + base; base += cuentas[k]; });
  for (const k of Object.keys(destino.attributes)) destino.attributes[k] = junta(todas.map((p) => p.attributes[k]));
  if (destino.targets) destino.targets = destino.targets.map((t, i) => Object.fromEntries(Object.keys(t).map((k) => [k, junta(todas.map((p) => p.targets[i][k]))])));
  j.accessors.push({ componentType: total > 65535 ? 5125 : 5123, type: 'SCALAR', count: ind.length, _bytes: new Uint8Array(ind.buffer) });
  destino.indices = j.accessors.length - 1;
}

// Hornea un .glb con formas: suma a los vértices cada forma con su peso («peso(nombre)») y la quita; las que «viva(nombre)»
// dice quedan como formas. Las de «sinNormal(nombre)» (la piel metida bajo la ropa) mueven el vértice pero no cuentan
// para la normal, para que no cambie la luz en el borde de la prenda. «quita(material)» deja fuera las piezas de ese
// material y «funde(material)» da el material de la pieza de la misma malla a la que se une (para dibujarlas de una
// vez). Devuelve el .glb nuevo, solo con lo que usa, y sus imágenes aparte (los bytes de cada una, si es de color y si
// alguna pieza la usa), para subirlas ya reducidas, y la geometría horneada de cada pieza. «color(material, posiciones,
// normales)» puede dar un color por vértice (RGBA, de 0 a 255) para las piezas de ese material.
export function hornear(buf, { peso, viva = () => false, sinNormal = () => false, quita = () => false, funde = () => null, color = () => null }) {
  const g = leerGlb(buf), j = g.json, nuevos = new Map(), geometria = [];
  const mat = (p) => j.materials?.[p.material]?.name;
  (j.meshes || []).forEach((m, im) => {
    m.primitives = m.primitives.filter((p) => !quita(mat(p)));
    if (!m.primitives.length) for (const n of j.nodes || []) if (n.mesh === im) { delete n.mesh; delete n.skin; }
    const nombres = m.extras?.targetNames || [], prims = [];
    let quedan = [];
    for (const p of m.primitives) {
      const pos0 = decimales(g, j.accessors[p.attributes.POSITION]), forma = pos0.slice();
      let pos = null; quedan = [];
      (p.targets || []).forEach((t, i) => {
        const nombre = nombres[i] ?? String(i);
        if (viva(nombre)) { quedan.push(i); return; }
        const w = peso(nombre);
        if (!w || t.POSITION === undefined) return;
        if (sinNormal(nombre)) { pos = pos || new Float32Array(pos0.length); sumar(g, j.accessors[t.POSITION], w, pos); }
        else sumar(g, j.accessors[t.POSITION], w, forma);
      });
      // (lo que la ropa tapa del todo: los vértices metidos más de 1,8 cm, que son los que quedan lejos del borde de la prenda)
      let tapado = null;
      if (pos) {
        tapado = new Uint8Array(pos.length / 3);
        for (let v = 0; v < tapado.length; v++) if (Math.hypot(pos[3 * v], pos[3 * v + 1], pos[3 * v + 2]) > 0.018) tapado[v] = 1;
        for (let i = 0; i < pos.length; i++) pos[i] += forma[i];
      } else pos = forma;
      nuevos.set(p.attributes.POSITION, pos);
      prims.push({ p, pos0, forma, quedan, tapado });
    }
    normales(g, prims, nuevos);
    for (const { p, quedan: q } of prims) { if (q.length) p.targets = q.map((i) => p.targets[i]); else delete p.targets; }
    if (m.extras?.targetNames) m.extras.targetNames = quedan.map((i) => nombres[i]);
    if (m.weights) { if (quedan.length) m.weights = quedan.map((i) => m.weights[i]); else delete m.weights; }
    // la geometría ya horneada de cada pieza (para quien la quiera mirar) y su color por vértice, si «color» lo da (las
    // demás piezas de la malla, en blanco, para poder unirlas)
    const colores = prims.map(({ p }) => color(mat(p), nuevos.get(p.attributes.POSITION), nuevos.get(p.attributes.NORMAL)));
    prims.forEach(({ p }, k) => {
      const pos = nuevos.get(p.attributes.POSITION);
      geometria.push({ material: mat(p), pos, ind: p.indices !== undefined ? enteros(g, j.accessors[p.indices]) : null });
      if (!colores.some(Boolean)) return;
      j.accessors.push({ componentType: 5121, type: 'VEC4', normalized: true, count: pos.length / 3, _bytes: colores[k] || new Uint8Array(pos.length / 3 * 4).fill(255) });
      p.attributes.COLOR_0 = j.accessors.length - 1;
    });
    // las caras tapadas del todo por la ropa, fuera: no se ven, y al moverse podían asomar (un dedo, por la puntera)
    for (const pr of prims) {
      if (!pr.tapado || pr.p.indices === undefined || (pr.p.mode ?? 4) !== 4) continue;
      const a = j.accessors[pr.p.indices], ind = enteros(g, a), queda = new ind.constructor(ind.length); let n = 0;
      for (let t = 0; t + 2 < ind.length; t += 3) {
        if (pr.tapado[ind[t]] && pr.tapado[ind[t + 1]] && pr.tapado[ind[t + 2]]) continue;
        queda[n++] = ind[t]; queda[n++] = ind[t + 1]; queda[n++] = ind[t + 2];
      }
      if (n === ind.length) continue;
      j.accessors.push({ componentType: a.componentType, type: 'SCALAR', count: n, _bytes: new Uint8Array(queda.buffer, 0, n * queda.BYTES_PER_ELEMENT) });
      pr.p.indices = j.accessors.length - 1;
    }
    // las piezas que se unen a otra de la misma malla
    const fuera = new Set();
    for (const d of m.primitives) {
      const otras = m.primitives.filter((p) => p !== d && funde(mat(p)) === mat(d) && p.indices !== undefined);
      if (!otras.length || d.indices === undefined || funde(mat(d))) continue;
      unir(g, d, otras, nuevos); for (const p of otras) fuera.add(p);
    }
    m.primitives = m.primitives.filter((p) => !fuera.has(p));
  });
  // las imágenes, aparte (antes de rehacer las vistas): cuáles son de color y cuáles usa alguna pieza que quede
  const deColor = new Set(), usadas = new Set(), enUso = new Set((j.meshes || []).flatMap((m) => m.primitives.map((p) => p.material)));
  (j.materials || []).forEach((m, k) => {
    const t = m.pbrMetallicRoughness?.baseColorTexture; if (t) deColor.add(j.textures[t.index].source);
    if (m.emissiveTexture) deColor.add(j.textures[m.emissiveTexture.index].source);
    if (enUso.has(k)) JSON.stringify(m, (c, v) => { if (v && typeof v === 'object' && Number.isInteger(v.index) && j.textures?.[v.index]) usadas.add(j.textures[v.index].source); return v; });
  });
  const imagenes = (j.images || []).map((im, i) => {
    const v = j.bufferViews[im.bufferView], desde = v.byteOffset || 0;
    return { nombre: im.name || String(i), mime: im.mimeType, bytes: g.bin.subarray(desde, desde + v.byteLength), srgb: deColor.has(i), usada: usadas.has(i) };
  });
  j.images = (j.images || []).map((im, i) => ({ name: im.name, uri: `personaje:${i}` }));  // (las da quien carga el .glb)
  // el binario nuevo: una vista por accessor usado
  const partes = [], vistas = [], accs = [], mapa = new Map(); let largo = 0;
  const nuevaVista = (bytes, extra = {}) => {
    vistas.push({ buffer: 0, byteOffset: largo, byteLength: bytes.byteLength, ...extra });
    partes.push(bytes); largo += bytes.byteLength;
    const relleno = (4 - largo % 4) % 4; if (relleno) { partes.push(new Uint8Array(relleno)); largo += relleno; }
    return vistas.length - 1;
  };
  const acc = (i) => {
    if (mapa.has(i)) return mapa.get(i);
    const a = j.accessors[i], n = { componentType: a.componentType, count: a.count, type: a.type };
    if (a.normalized) n.normalized = true;
    const nuevo = nuevos.get(i);
    if (a._bytes) {
      n.bufferView = nuevaVista(a._bytes);
      if (a.min) { n.min = a.min; n.max = a.max; }
    } else if (nuevo || a.sparse) {
      const d = nuevo || decimales(g, a);
      n.bufferView = nuevaVista(new Uint8Array(d.buffer, d.byteOffset, d.byteLength));
      if (a.min) Object.assign(n, limites(d, NUM[a.type]));
    } else {
      const v = j.bufferViews[a.bufferView], elem = BYTES[a.componentType] * NUM[a.type], paso = v.byteStride || elem;
      const desde = (v.byteOffset || 0) + (a.byteOffset || 0);
      n.bufferView = nuevaVista(g.bin.subarray(desde, desde + (a.count - 1) * paso + elem),
        { ...(v.byteStride ? { byteStride: v.byteStride } : {}), ...(v.target ? { target: v.target } : {}) });
      if (a.min) n.min = a.min;
      if (a.max) n.max = a.max;
    }
    accs.push(n); mapa.set(i, accs.length - 1);
    return accs.length - 1;
  };
  for (const m of j.meshes || []) {
    for (const p of m.primitives) {
      for (const k of Object.keys(p.attributes)) p.attributes[k] = acc(p.attributes[k]);
      if (p.indices !== undefined) p.indices = acc(p.indices);
      if (p.targets) p.targets = p.targets.map((t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, acc(v)])));
    }
  }
  for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = acc(s.inverseBindMatrices);
  for (const an of j.animations || []) for (const s of an.samplers) { s.input = acc(s.input); s.output = acc(s.output); }
  j.accessors = accs; j.bufferViews = vistas; j.buffers = [{ byteLength: largo }];
  const texto = new TextEncoder().encode(JSON.stringify(j)), relleno = (4 - texto.length % 4) % 4;
  const total = 20 + texto.length + relleno + 8 + largo, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, texto.length + relleno, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(texto, 20); out.fill(0x20, 20 + texto.length, 20 + texto.length + relleno);
  let o = 20 + texto.length + relleno;
  dv.setUint32(o, largo, true); dv.setUint32(o + 4, 0x004e4942, true); o += 8;
  for (const p of partes) { out.set(p, o); o += p.byteLength; }
  return { glb: out.buffer, imagenes, geometria };
}

// ------------------------------------------------------------------------------------------------ las texturas, reducidas
const lienzo = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
// una imagen del .glb como textura de «lado» píxeles como mucho: a la mitad cada vez (cada píxel, la media de cuatro) y,
// si tiene transparencia, con el color medio bajo lo transparente, para que el borde no tire a negro
async function texturaReducida(device, { nombre, mime, bytes, srgb, usada }, lado) {
  if (usada === false) return new Texture(device, { name: nombre, width: 1, height: 1, format: PIXELFORMAT_RGBA8, mipmaps: false, levels: [new Uint8Array([255, 255, 255, 255])] });
  const bmp = await createImageBitmap(new Blob([bytes], { type: mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  let w = bmp.width, h = bmp.height;
  const op = { name: nombre, format: srgb ? PIXELFORMAT_SRGBA8 : PIXELFORMAT_RGBA8, mipmaps: true };
  if (Math.max(w, h) <= lado) { const t = new Texture(device, { ...op, width: w, height: h }); t.setSource(bmp); return t; }
  let fuente = bmp;
  while (Math.max(w, h) > lado) {
    w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    const c = lienzo(w, h), x = c.getContext('2d');
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(fuente, 0, 0, w, h);
    if (fuente === bmp) bmp.close(); else fuente.width = fuente.height = 0;
    fuente = c;
  }
  const px = fuente.getContext('2d').getImageData(0, 0, w, h).data;
  fuente.width = fuente.height = 0;
  let r = 0, v = 0, a = 0, n = 0, hueco = false;
  for (let i = 0; i < px.length; i += 4) { if (px[i + 3] === 0) hueco = true; else if (px[i + 3] > 128) { r += px[i]; v += px[i + 1]; a += px[i + 2]; n++; } }
  if (hueco && n) { r = Math.round(r / n); v = Math.round(v / n); a = Math.round(a / n); for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 0) { px[i] = r; px[i + 1] = v; px[i + 2] = a; } }
  // (como mapa de bits y no como píxeles sueltos: PlayCanvas guarda lo que se le da para volver a subirlo, y los píxeles
  // contarían en la memoria de JavaScript, que en el móvil va justa)
  const t = new Texture(device, { ...op, width: w, height: h });
  t.setSource(await createImageBitmap(new ImageData(px, w, h), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
  return t;
}
// el lado de cada textura en la calle: la piel y la ropa, 1024; el pelo, 1024 su color y 512 su relieve; el calzado y
// el iris, 512; los dientes, 256. En el móvil, la mitad (sin bajar de 256)
function ladoDe(tipo, nombre, movil, pedido) {
  let l = 512;
  if (tipo === 'cuerpo') l = /piel/.test(nombre) ? (pedido.piel || 1024) : /teeth/.test(nombre) ? 256 : 512;
  else if (tipo === 'conjunto') l = pedido.ropa || 1024;
  else if (tipo === 'pelo') l = /_normal$/.test(nombre) ? 512 : (pedido.pelo || 1024);
  return movil ? Math.max(256, l >> 1) : l;
}

// un archivo del personaje, entero: en el enlace de claude.ai los .glb van con sufijo y los grandes, en trozos
export async function leerArchivo(ruta) {
  const pide = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`No se pudo bajar ${u}: ${r.status}`); return r.arrayBuffer(); };
  const tr = window.TROZOS?.[ruta];
  if (!tr) return pide(ruta.endsWith('.glb') ? ruta + (window.SUFIJO_GLB || '') : ruta);
  const [n, h] = Array.isArray(tr) ? tr : [tr, null];
  const partes = await Promise.all(Array.from({ length: n }, (_, i) => pide(`${ruta}${h ? '.' + h : ''}.p${i}.wasm`)));
  return new Blob(partes).arrayBuffer();
}

// ------------------------------------------------------------------------------------------------ el fenotipo
// los pesos de la base compacta para un fenotipo (lo mismo que anny.models.phenotype y que src/editor.js)
export function pesosFenotipo(datos, fen) {
  const val = {};
  for (const [g, vars] of Object.entries(datos.grupos_variaciones)) {
    if (g === 'race') continue;
    const an = datos.anclas[g], x = fen[g] ?? 0.5, w = new Array(an.length).fill(0);
    if (x <= an[0]) w[0] = 1; else if (x >= an[an.length - 1]) w[an.length - 1] = 1;
    else { let j = 0; while (an[j + 1] < x) j++; const t = (x - an[j]) / (an[j + 1] - an[j]); w[j] = 1 - t; w[j + 1] = t; }
    vars.forEach((v, k) => { val[v] = w[k]; });
  }
  const r = ['african', 'asian', 'caucasian'].map((k) => fen[k] ?? 0.5), sr = r[0] + r[1] + r[2];
  ['african', 'asian', 'caucasian'].forEach((k, i) => { val[k] = sr > 0 ? r[i] / sr : 1 / 3; });
  const ph = datos.variaciones.map((v) => val[v]);
  const R = datos.rango, w = new Float64Array(R);
  datos.mascara.forEach((vs, k) => {
    let c = 1; for (const v of vs) c *= ph[v];
    if (c === 0) return;
    const fila = datos.proyeccion[k]; for (let i = 0; i < R; i++) w[i] += c * fila[i];
  });
  return w;
}
// el personaje entero a partir de lo guardado (lo que falte, lo de serie)
export function estadoCompleto(datos, dado) {
  const e = { fenotipo: {}, deslizadores: {}, tono: [0.93, 0.83, 0.74], ojos: 'marron', vello: [0.09, 0.06, 0.04], ropa: { ...ROPA_DE_SERIE } };
  for (const p of datos.parametros) e.fenotipo[p.clave] = p.defecto;
  for (const d of datos.deslizadores) e.deslizadores[d.clave] = 0;
  if (dado) {
    Object.assign(e.fenotipo, dado.fenotipo); Object.assign(e.deslizadores, dado.deslizadores); Object.assign(e.ropa, dado.ropa);
    for (const k of ['tono', 'ojos', 'vello']) if (dado[k]) e[k] = dado[k];
  }
  return e;
}
// lo guardado por el editor en este navegador, o ?estado=<JSON> (para las pruebas)
export function estadoGuardado(q) {
  try { if (q?.get('estado')) return JSON.parse(q.get('estado')); } catch (e) { console.warn('personaje: ?estado no es JSON', e); }
  try { return JSON.parse(localStorage.getItem('personaje') || 'null'); } catch (e) { return null; }
}
// los archivos que va a pedir un personaje (para bajarlos con lo demás, con su progreso)
export function archivosDe(estado, ruta = './escenas/personaje/') {
  const ropa = { ...ROPA_DE_SERIE, ...(estado?.ropa || {}) };
  return [ruta + 'cuerpo.glb', ...TIPOS.map((t) => ropa[t]).filter(Boolean).map((c) => `${ruta}prendas/${c}.glb`)];
}

// ------------------------------------------------------------------------------------------------ la luz en el personaje
// Cómo suma un material la luz de cada foco (PlayCanvas no trae dispersión bajo la piel). En el editor (src/editor.js),
// cada canal cae con su curva hacia la línea de sombra y llega a cero en ella. En la calle no vale: el sol va a 6,2 con
// la exposición a 1,4 (puestos para las fachadas), la piel llega a su tope de luz a pocos grados de la línea y el paso
// de luz a sombra queda tan brusco que se ve polígono a polígono (media cara a escalones). Aquí la luz «envuelve»: pasa
// de la línea, el rojo más que el verde y el azul (la carne a contraluz), y el paso se reparte. Como en la chica, con
// 0,6 en la cabeza y 0,35 en el cuerpo y la ropa. «envuelve»: cuánto, por canal; «curva»: el exponente de cada canal
function luzSuave(device, m, { envuelve = [0, 0, 0], curva = [1, 1, 1] } = {}) {
  const w = envuelve.map((x) => x.toFixed(3)), k = curva.map((x) => x.toFixed(3));
  const funcion = {
    [SHADERLANGUAGE_GLSL]: `
vec3 pielDifusa(float nl) {
	return pow(max((vec3(nl) + vec3(${w})) / (vec3(1.0) + vec3(${w})), vec3(1e-5)), vec3(${k}));
}
`,
    [SHADERLANGUAGE_WGSL]: `
fn pielDifusa(nl: f32) -> vec3f {
	return pow(max((vec3f(nl) + vec3f(${w})) / (vec3f(1.0) + vec3f(${w})), vec3f(1e-5)), vec3f(${k}));
}
`,
  };
  const cambios = {
    [SHADERLANGUAGE_GLSL]: [
      ['dAtten *= getLightDiffuse(litArgs_worldNormal, vec3(0.0), dLightDirNormW);', 'float nlPiel = dot(litArgs_worldNormal, -dLightDirNormW);'],
      ['dDiffuseLight += (dAtten * lightColor) * (1.0 - litArgs_specularity);', 'dDiffuseLight += (dAtten * pielDifusa(nlPiel) * lightColor) * (1.0 - litArgs_specularity); dAtten *= max(nlPiel, 0.0);'],
      ['dDiffuseLight += dAtten * lightColor;', 'dDiffuseLight += dAtten * pielDifusa(nlPiel) * lightColor; dAtten *= max(nlPiel, 0.0);'],
    ],
    [SHADERLANGUAGE_WGSL]: [
      ['dAtten = dAtten * getLightDiffuse(litArgs_worldNormal, vec3(0.0), dLightDirNormW);', 'let nlPiel: f32 = dot(litArgs_worldNormal, -dLightDirNormW);'],
      ['dDiffuseLight = dDiffuseLight + ((dAtten * lightColor) * (1.0 - litArgs_specularity));', 'dDiffuseLight = dDiffuseLight + ((dAtten * pielDifusa(nlPiel) * lightColor) * (1.0 - litArgs_specularity)); dAtten = dAtten * max(nlPiel, 0.0);'],
      ['dDiffuseLight = dDiffuseLight + (dAtten * lightColor);', 'dDiffuseLight = dDiffuseLight + (dAtten * pielDifusa(nlPiel) * lightColor); dAtten = dAtten * max(nlPiel, 0.0);'],
    ],
  };
  for (const lengua of [SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL]) {
    const base = ShaderChunks.get(device, lengua);
    let luz = base.get('lightFunctionLightPS');
    for (const [de, a] of cambios[lengua]) {
      if (!luz.includes(de)) { console.warn('luz: no está', de); return false; }
      luz = luz.split(de).join(a);
    }
    m.getShaderChunks(lengua).set('lightFunctionLightPS', luz);
    m.getShaderChunks(lengua).set('lightDiffuseLambertPS', base.get('lightDiffuseLambertPS') + funcion[lengua]);
  }
  m.shaderChunksVersion = '2.8';
  m.update();
  return true;
}

// la luz que envuelve necesita que el personaje no se dé sombra a sí mismo (donde la luz pasa de la línea, su propia
// sombra la cortaría con una raya), y la sombra del sol en la calle tiene unos 3 cm por píxel, que sobre una cara son
// escalones. El personaje mira la sombra desde «metros» más cerca del sol: lo que tiene a menos de eso (él mismo) no le
// da sombra, y las casas, los coches y los árboles, sí. (A la chica se le quitó toda la sombra de la cabeza: al sol no
// se nota, pero a la sombra de una casa la cara sigue al sol)
function sinSombraPropia(device, m, metros = 0.3) {
  const cambios = {
    [SHADERLANGUAGE_GLSL]: ['vec3 surfacePosition = worldPosition;', `vec3 surfacePosition = worldPosition - lightDirNorm * ${metros.toFixed(2)};`],
    [SHADERLANGUAGE_WGSL]: ['var surfacePosition = worldPosition;', `var surfacePosition = worldPosition - lightDirNorm * ${metros.toFixed(2)};`],
  };
  for (const lengua of [SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL]) {
    const base = ShaderChunks.get(device, lengua).get('lightFunctionShadowPS'), [de, a] = cambios[lengua];
    if (!base.includes(de)) { console.warn('sombra: no está', de); return false; }
    m.getShaderChunks(lengua).set('lightFunctionShadowPS', base.split(de).join(a));
  }
  m.shaderChunksVersion = '2.8';
  m.update();
  return true;
}

// ¿qué vértices tiene pelo encima? Desde cada uno, un rayo por su normal: si a menos de «lejos» da en una lámina del
// peinado, está tapado (1 pegado a él, bajando hasta 0,5 a «lejos»: un peinado con volumen va a varios centímetros).
// «detras»: lo que puede quedar la lámina por debajo de la piel y contar (la melena simulada nace pegada a la cabeza
// y en algún punto queda hasta un par de centímetros por dentro: ahí el cuero asomaba, de color de piel)
function tapado(pos, nor, laminas, lejos = 0.08, detras = 0.004) {
  const out = new Float32Array(pos.length / 3);
  for (let v = 0; v < out.length; v++) {
    const ox = pos[3 * v], oy = pos[3 * v + 1], oz = pos[3 * v + 2], dx = nor[3 * v], dy = nor[3 * v + 1], dz = nor[3 * v + 2];
    let cerca = Infinity;
    for (const { pos: P, ind } of laminas) {
      for (let t = 0; t < ind.length; t += 3) {
        const a = 3 * ind[t], b = 3 * ind[t + 1], c = 3 * ind[t + 2];
        const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x, det = e1x * px + e1y * py + e1z * pz;
        if (det > -1e-12 && det < 1e-12) continue;
        const tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2], u = (tx * px + ty * py + tz * pz) / det;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, w = (dx * qx + dy * qy + dz * qz) / det;
        if (w < 0 || u + w > 1) continue;
        const d = (e2x * qx + e2y * qy + e2z * qz) / det;
        if (d > -detras && d < cerca) cerca = d;
      }
    }
    if (cerca <= lejos) out[v] = 1 - 0.5 * Math.max(0, cerca) / lejos;
  }
  return out;
}
// lo mate de un material, al menos «r» (0 espejo, 1 mate). En los materiales de un .glb, «gloss» guarda la aspereza
// (glossInvert), no el brillo
const mate = (m, r) => { m.gloss = m.glossInvert ? Math.max(m.gloss, r) : Math.min(m.gloss, 1 - r); };
const lineal = (x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);  // (de sRGB a luz)

// ------------------------------------------------------------------------------------------------ el personaje
// Las piernas, con la dirección del clip. Las animaciones se hicieron sobre el esqueleto de la plantilla, que en reposo
// tiene las piernas más abiertas que cualquier cuerpo del editor (el muslo 6,5° y la pierna 9,3°; la chica del vídeo,
// 5,5° y 4,3°). Como del clip solo se toman los giros, una pierna recta en el clip salía aquí con la espinilla metida 4°
// y, de pie, los tobillos a 14 cm en vez de a 24. Esto da, para el muslo, la pierna y el pie de cada lado, por lo que
// hay que multiplicar su giro local (antes · giro · después) para que el muslo y la pierna lleven la dirección que
// llevan en el clip y el pie quede como estaba. «pos»: la cabeza de cada hueso de este cuerpo, por su índice en
// datos.huesos; «giros»: el giro en reposo de cada hueso de la piel, y «padreDe», el índice de su padre.
export function girosDePiernas({ datos, pos, giros, indiceJson, padreDe, huesos }) {
  const girar = new Map();
  const aJuego = (h) => new Vec3(h[0], h[2], -h[1]);
  const entre = (a, b) => { const c = new Vec3().cross(a, b); return new Quat(c.x, c.y, c.z, 1 + a.dot(b)).normalize(); };
  // (un giro dado en el espacio del modelo, visto desde el hueso i)
  const enHueso = (i, Q) => (i === undefined ? new Quat() : new Quat().mul2(giros[i].clone().invert(), new Quat().mul2(Q, giros[i])));
  for (const s of ['Left', 'Right']) {
    const j = ['UpLeg', 'Leg', 'Foot'].map((x) => datos.huesos.indexOf(`mixamorig:${s}${x}`)), i = j.map((x) => indiceJson[x]);
    if (j.some((x) => x < 0) || i.some((x) => x === undefined)) continue;
    // (de la dirección de aquí a la de la plantilla, para el muslo y para la pierna)
    const Q = [0, 1].map((k) => entre(pos[j[k + 1]].clone().sub(pos[j[k]]).normalize(),
      aJuego(datos.cabezas[j[k + 1]]).sub(aJuego(datos.cabezas[j[k]])).normalize()));
    girar.set(huesos[i[0]].name, [new Quat(), enHueso(i[0], Q[0])]);
    girar.set(huesos[i[1]].name, [enHueso(padreDe[i[1]], Q[0].clone().invert()), enHueso(i[1], Q[1])]);
    girar.set(huesos[i[2]].name, [enHueso(padreDe[i[2]], Q[1].clone().invert()), new Quat()]);
  }
  return girar;
}

// Monta el personaje y devuelve { raiz, modelo, estado, pista(track), actualizar(dt, camara), altura }. «leer(ruta)» da
// cada archivo entero (el juego ya los ha bajado con lo demás); «q», los parámetros de la página.
export async function montarPersonaje({ app, ruta = './escenas/personaje/', estado: dado, leer = leerArchivo, movil = false, q = null }) {
  const device = app.graphicsDevice;
  let datos = await (await fetch(ruta + 'editor.json')).json();  // (se suelta al acabar: son 1,4 MB de números)
  const estado = estadoCompleto(datos, dado);
  const prendas = new Map([...(datos.prendas || []), ...PROPIAS].map((p) => [p.clave, p]));
  for (const t of TIPOS) if (estado.ropa[t] && prendas.get(estado.ropa[t])?.tipo !== t) estado.ropa[t] = null;  // (una prenda que ya no existe)
  const puestas = new Set(TIPOS.map((t) => estado.ropa[t]).filter(Boolean));
  // la luz de la calle (el sol a 6,2 y la exposición a 1,4, puestos para las fachadas) quema la piel clara y la ropa de
  // MakeHuman, que en el editor se ven bien con su sol a 2,2: en la calle su color va algo más bajo
  const LUZ = { piel: parseFloat(q?.get('luzpiel') || '0.68'), ropa: parseFloat(q?.get('luzropa') || '0.85'), pelo: parseFloat(q?.get('luzpelo') || '0.8') };
  // (la luz que envuelve: ?luzsuave=0 la quita, para comparar; el rojo pasa más de la línea de sombra que el verde y el azul)
  const suave = q?.get('luzsuave') !== '0', ENVUELVE = (q?.get('envuelve') || '0.5,0.45,0.42').split(',').map(Number);
  const pedido = { piel: parseInt(q?.get('pieltex') || '0', 10), ropa: parseInt(q?.get('ropatex') || '0', 10), pelo: parseInt(q?.get('pelotex') || '0', 10) };

  // el peso de cada forma por su nombre: las del fenotipo, los deslizadores («clave+», «clave-») y la piel metida bajo
  // cada prenda puesta («oculta:prenda»)
  const w = pesosFenotipo(datos, estado.fenotipo);
  const peso = (nombre) => {
    const f = /^fenotipo(\d+)$/.exec(nombre); if (f) return w[+f[1]] || 0;
    if (nombre.startsWith('oculta:')) return puestas.has(nombre.slice(7)) ? 1 : 0;
    const signo = nombre.slice(-1);
    if (signo === '+' || signo === '-') { const v = estado.deslizadores[nombre.slice(0, -1)] || 0; return signo === '+' ? Math.max(v, 0) : Math.max(-v, 0); }
    return 0;  // (los gestos, en reposo)
  };
  const opciones = { peso, viva: (n) => VIVAS.has(n), sinNormal: (n) => n.startsWith('oculta:') };
  // lo horneado, como contenedor de PlayCanvas, con sus texturas ya reducidas
  const contenedor = async (nombre, { glb, imagenes }, tipo, cambia = {}) => {
    for (const im of imagenes) if (cambia[im.nombre]) { im.bytes = new Uint8Array(await cambia[im.nombre]); im.mime = 'image/jpeg'; }
    const texturas = imagenes.map((im) => texturaReducida(device, im, ladoDe(tipo, im.nombre, movil, pedido)));
    const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    const a = new Asset(nombre, 'container', { url, filename: nombre + '.glb' }, {}, {
      image: { processAsync: (gltfImage, hecho) => {
        texturas[+gltfImage.uri.split(':')[1]].then((t) => { const ta = new Asset(t.name, 'texture', null); ta.resource = t; ta.loaded = true; hecho(null, ta); }, (e) => hecho(e));
      } },
    });
    app.assets.add(a);
    await new Promise((ok, no) => { a.ready(() => ok()); a.once('error', (e) => no(new Error(`personaje: ${nombre}: ${e}`))); app.assets.load(a); });
    URL.revokeObjectURL(url);
    return a;
  };
  const iris = estado.ojos !== 'marron' && datos.colores_ojos?.includes(estado.ojos)
    ? { marron: fetch(`${ruta}ojos/${estado.ojos}.jpg`).then((r) => { if (!r.ok) throw new Error('iris ' + r.status); return r.arrayBuffer(); }) } : {};
  const [bCuerpo, ...bPrendas] = await Promise.all([leer(ruta + 'cuerpo.glb'), ...TIPOS.map((t) => (estado.ropa[t] ? leer(`${ruta}prendas/${estado.ropa[t]}.glb`) : null))]);
  const hPrendas = bPrendas.map((b) => (b ? hornear(b, opciones) : null));
  // la melena simulada: su .json, y su talla, la de la cabeza de este personaje frente a la de la melena (de la
  // articulación de la cabeza a entre los ojos). Sus mechones vienen respecto a esa articulación
  const articulacion = (nombre) => {  // (dónde queda un hueso de este cuerpo, en los ejes del juego)
    const j = datos.huesos.indexOf(nombre), h0 = datos.cabezas[j]; let x = h0[0], y = h0[1], z = h0[2];
    for (let r = 0; r < datos.rango; r++) { const b = datos.base_cabezas[r][j]; x += w[r] * b[0]; y += w[r] * b[1]; z += w[r] * b[2]; }
    return new Vec3(x, z, -y);
  };
  const simPelo = prendas.get(estado.ropa.pelo)?.sim ? await (await fetch(`${ruta}prendas/${estado.ropa.pelo}.json`)).json() : null;
  const jCab = articulacion('mixamorig:Head');
  const talla = simPelo ? jCab.distance(articulacion('eye.L').add(articulacion('eye.R')).mulScalar(0.5)) / simPelo.cabeza_ojos : 1;
  if (simPelo) for (const x of hPrendas[TIPOS.indexOf('pelo')].geometria) x.pos = x.pos.map((c, i) => c * talla + [jCab.x, jCab.y, jCab.z][i % 3]);
  // el cuero cabelludo bajo el pelo: el editor pinta de piel el casquete de la cabeza, y al sol de la calle asomaba
  // claro entre los mechones, como calvas. Donde hay pelo encima va del color del pelo, algo más claro (por vértice)
  let laminas = (hPrendas[TIPOS.indexOf('pelo')]?.geometria || []).filter((x) => x.ind);
  const conPelo = laminas.length > 0;
  const cuero = [0, 1, 2].map((c) => Math.max(0.05, Math.min(1, 1.6 * lineal(Math.min(1, estado.vello[c] * 1.7 * LUZ.pelo)) * 0.21 / (lineal(estado.tono[c] * LUZ.piel) * 0.55))));
  const colorCuero = (pos, nor) => {
    const t = tapado(pos, nor, laminas, 0.08, simPelo ? 0.03 : 0.004), out = new Uint8Array(t.length * 4).fill(255);
    // (la melena simulada: en la raya y entre mechones quedan huecos por los que el rayo no da en nada y el cuero se
    // veía de color de piel, como calvas; ahí vale con que haya pelo a menos de 2,5 cm)
    if (simPelo) for (let v = 0; v < t.length; v++) {
      if (t[v] > 0) continue;
      const x = pos[3 * v], y = pos[3 * v + 1], z = pos[3 * v + 2];
      busca: for (const { pos: P } of laminas) for (let i = 0; i < P.length; i += 3) {
        const dx = P[i] - x, dy = P[i + 1] - y, dz = P[i + 2] - z;
        if (dx * dx + dy * dy + dz * dz < 0.025 * 0.025) { t[v] = 1; break busca; }
      }
    }
    for (let v = 0; v < t.length; v++) for (let c = 0; c < 3; c++) out[4 * v + c] = Math.round(255 * (1 + t[v] * (cuero[c] - 1)));
    return out;
  };
  // del cuerpo, fuera los dientes y la lengua (en la calle la boca va cerrada y no se ven); y las zonas de piel que el
  // editor pinta aparte, unidas a la piel (un dibujo): con ropa puesta, la ropa interior de prueba; sin peinado, el
  // casquete (con peinado va aparte, sin brillo: el de la piel, al sol, asomaba entre los mechones como una mancha blanca)
  const hCuerpo = hornear(bCuerpo, { ...opciones,
    quita: (m) => m === 'dientes' || m === 'lengua',
    funde: (m) => ((m === 'pelo' && !conPelo) || (estado.ropa.conjunto && (m === 'ropa_arriba' || m === 'ropa_abajo')) ? 'piel' : null),
    color: (m, pos, nor) => (m === 'pelo' && conPelo && nor && q?.get('cuero') !== '0' ? colorCuero(pos, nor) : null) });
  const [aCuerpo, ...aPrendas] = await Promise.all([
    contenedor('personaje', hCuerpo, 'cuerpo', iris),
    ...TIPOS.map((t, k) => (hPrendas[k] ? contenedor('prenda_' + estado.ropa[t], hPrendas[k], t) : null)),
  ]);
  // (lo horneado y las láminas del pelo ya no hacen falta, y las funciones de más abajo, que siguen vivas, las
  // retendrían con los .glb enteros de los que salen)
  hPrendas.fill(null); laminas = null;

  const raiz = new Entity('personaje');
  const modelo = aCuerpo.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
  raiz.addChild(modelo);
  const mis = modelo.findComponents('render').flatMap((r) => r.meshInstances);
  const pieles = [...new Set(mis.map((mi) => mi.skinInstance).filter(Boolean))];
  const skin = pieles.reduce((a, b) => (b.bones.length > a.bones.length ? b : a));
  const material = (n) => mis.map((mi) => mi.material).find((m) => m.name === n);
  const piel = material('piel');

  // ---- las prendas: atadas a los huesos del cuerpo por su nombre; el pelo, recortado con alfa a cobertura
  const misPelo = []; let entMelena = null;
  TIPOS.forEach((tipo, k) => {
    const a = aPrendas[k]; if (!a) return;
    const ent = a.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    raiz.addChild(ent);
    for (const mi of ent.findComponents('render').flatMap((r) => r.meshInstances)) {
      // (la ropa va con los huesos del cuerpo; la melena simulada, con los suyos)
      if (mi.skinInstance && !(tipo === 'pelo' && simPelo)) { mi.skinInstance.resolve(modelo, mi.node); pieles.push(mi.skinInstance); }
      mis.push(mi);
      if (tipo === 'calzado') mi.castShadow = false;  // (la sombra del pie la da el pie: dos dibujos menos por cascada)
      const m = mi.material;
      if (tipo === 'pelo') {
        // (con el sol y el cielo de la calle, el brillo del editor dejaba el pelo como de plástico mojado: casi mate)
        m.blendType = BLEND_NONE; m.depthWrite = true; m.alphaTest = 0.35; m.alphaToCoverage = true;
        m.cull = CULLFACE_NONE; m.specularityFactor = 0.08; mate(m, 0.75); m.diffuseVertexColor = false;
        m.bumpiness = Math.min(m.bumpiness, 0.35);  // (el relieve del peinado, más suave: al sol parecía barro modelado)
        m.diffuse = new Color(...estado.vello.map((x) => x * 1.7 * LUZ.pelo));  // (su textura es gris, con la mediana a 0,5)
        if (simPelo) entMelena = ent; else misPelo.push(mi);
      } else m.diffuse = new Color(LUZ.ropa, LUZ.ropa, LUZ.ropa);
      m.update();
      if (suave) luzSuave(device, m, { envuelve: [0.35, 0.35, 0.35] });  // (la ropa y el pelo, como el cuerpo de la chica)
    }
  });
  // las formas vivas por su nombre, malla a malla
  const indices = new Map();
  for (const mi of mis) mi.morphInstance?.morph.targets.forEach((t, i) => { if (!indices.has(t.name)) indices.set(t.name, []); indices.get(t.name).push([mi.morphInstance, i]); });
  const pon = (nombre, v) => { for (const [m, i] of indices.get(nombre) || []) m.setWeight(i, v); };

  // ---- los materiales (como en el editor)
  if (piel) {
    // (más mate que en el editor: con este sol, su brillo dejaba la frente y la nariz como aceitadas)
    piel.diffuse = new Color(...estado.tono.map((x) => x * LUZ.piel)); mate(piel, 0.6); piel.specularityFactor = 0.45;
    piel.update();
    if (suave) luzSuave(device, piel, { envuelve: ENVUELVE });
  }
  // (la córnea, sin el reflejo del cielo: en la calle, el cielo y las fachadas claras velaban el iris de gris; se queda
  // con el destello del sol, que es lo que da el ojo húmedo)
  const cornea = material('cornea');
  if (cornea) { cornea.opacityFadesSpecular = false; cornea.depthWrite = false; cornea.specularityFactor = 0.6; cornea.useSkybox = q?.get('cornea') === 'cielo'; cornea.update(); }
  // (las cejas y las pestañas, recortadas con alfa a cobertura, como las de la chica: mezcladas con más opacidad que 1,
  // como en el editor, la imagen de la calle, que no recorta los valores, restaba el fondo y salían azules)
  for (const m of ['cejas', 'pestanas'].map(material).filter(Boolean)) {
    if (m.diffuseMap) { m.opacityMap = m.diffuseMap; m.opacityMapChannel = 'a'; m.diffuseMap = null; m.diffuseVertexColor = false; m.opacity = m.name === 'cejas' ? 1.3 : 1.4; m.specularityFactor = 0.3; }
    m.blendType = BLEND_NONE; m.alphaTest = m.name === 'cejas' ? 0.5 : 0.4; m.alphaToCoverage = true; m.depthWrite = true;
    m.diffuse = new Color(...estado.vello); m.update();
  }
  // (lo pequeño de la cara no da sombra: a 3 cm por píxel no se vería, y son dibujos de menos en cada cascada)
  for (const mi of mis) if (['ojo', 'cornea', 'cejas', 'pestanas'].includes(mi.material.name)) mi.castShadow = false;
  const ojo = material('ojo');
  if (ojo) { ojo.diffuse = new Color(0.84 * LUZ.piel, 0.82 * LUZ.piel, 0.8 * LUZ.piel); ojo.specularityFactor = 0.2; ojo.update(); if (suave) luzSuave(device, ojo, { envuelve: [0.5, 0.5, 0.5] }); }
  // (lo que quede sin unir de la ropa interior de prueba y del casquete, de piel; el casquete bajo un peinado, con una
  // copia de la piel sin brillo, y sin dar sombra: la da el peinado)
  let cuero_ = null;
  for (const mi of mis) {
    const n = mi.material.name;
    if (!piel || !['ropa_arriba', 'ropa_abajo', 'pelo'].includes(n)) continue;
    if (n === 'pelo' && conPelo) {
      if (!cuero_) { cuero_ = piel.clone(); cuero_.name = 'cuero'; cuero_.specularityFactor = 0; mate(cuero_, 1); cuero_.update(); if (suave) luzSuave(device, cuero_, { envuelve: ENVUELVE }); }
      mi.material = cuero_; mi.castShadow = false;
    } else if (n === 'pelo' || estado.ropa.conjunto) mi.material = piel;
  }
  if (q?.get('sombrapropia') !== '1') for (const m of new Set(mis.map((mi) => mi.material))) sinSombraPropia(device, m, parseFloat(q?.get('sombrapj') || '0.3'));

  // ---- el esqueleto, ajustado al cuerpo: la cabeza de cada hueso, la de la plantilla más la base por los pesos; su giro
  // en reposo (de la matriz inversa de enlace) se queda
  const ibp = skin.skin.inverseBindPose, huesos = skin.bones;
  const giros = huesos.map((_, i) => { const m = ibp[i].clone().invert(); const qu = new Quat(); qu.setFromMat4(m); return qu; });
  const deHueso = new Map(huesos.map((h, i) => [h.name, i]));
  const indiceJson = datos.huesos.map((n) => deHueso.get(n));
  const padreDe = huesos.map((h) => deHueso.get(h.parent?.name));
  const pos = datos.cabezas.map((h0, j) => {
    let x = h0[0], y = h0[1], z = h0[2];
    for (let r = 0; r < datos.rango; r++) { const b = datos.base_cabezas[r][j]; x += w[r] * b[0]; y += w[r] * b[1]; z += w[r] * b[2]; }
    return new Vec3(x, z, -y);  // (de Blender, z arriba, al juego: x, z, −y)
  });
  const nuevo = new Map(); datos.huesos.forEach((n, j) => { if (indiceJson[j] !== undefined) nuevo.set(indiceJson[j], pos[j]); });
  const m4 = new Mat4();
  huesos.forEach((h, i) => {
    const p = nuevo.get(i); if (!p) return;
    m4.setTRS(p, giros[i], Vec3.ONE); ibp[i].copy(m4).invert();
    const k = padreDe[i];
    if (k === undefined || !nuevo.get(k)) h.setLocalPosition(p);
    else { const d = p.clone().sub(nuevo.get(k)); giros[k].clone().invert().transformVector(d, d); h.setLocalPosition(d); }
  });
  for (const s of pieles) {
    if (s.skin.inverseBindPose === ibp) continue;
    s.bones.forEach((h, j) => { const i = deHueso.get(h.name); if (i !== undefined) s.skin.inverseBindPose[j].copy(ibp[i]); });
  }
  // el suelo: la planta más baja del cuerpo
  let zmin = Infinity;
  datos.suela.forEach((_, i) => { let z = datos.suela_z[i]; for (let r = 0; r < datos.rango; r++) z += w[r] * datos.base_suela[r][i]; zmin = Math.min(zmin, z); });
  raiz.setLocalPosition(0, -zmin, 0);
  const ih = datos.huesos.indexOf('mixamorig:Hips'), ic = datos.huesos.indexOf('mixamorig:Head');
  const escalaCadera = ih >= 0 ? pos[ih].y / (datos.cabezas[ih][2] || 0.95) : 1;
  // (la estatura: lo más alto del cuerpo ya horneado, la coronilla, sobre la planta; el casquete va en su propia pieza)
  const altura = Math.max(...modelo.findComponents('render').flatMap((r) => r.meshInstances).map((mi) => mi.mesh.aabb.getMax().y), ic >= 0 ? pos[ic].y : 1.5) - zmin;

  // ---- la melena simulada, con el esqueleto ya ajustado: choca con los huesos de este cuerpo, a su escala
  const melena = entMelena && simPelo ? crearMelena({ app, entidad: entMelena, sim: simPelo, q, talla, escala: altura / simPelo.estatura,
    hueso: (n) => huesos[deHueso.get(n)], ibm: (n) => ibp[deHueso.get(n)] }) : null;

  // ---- las animaciones: solo los giros, más la posición de la cadera a la escala de este cuerpo (son de un adulto)
  // («rectas»: las piernas, con la dirección que llevan en el clip, girosDePiernas; para el de estar de pie. Los de andar
  // y correr se ajustaron mirando el juego tal como salían, docs/personaje_video.md, y se quedan como están)
  const girar = girosDePiernas({ datos, pos, giros, indiceJson, padreDe, huesos });
  const pista = (track, { rectas = false } = {}) => {
    const esCadera = (c) => c.paths.every((p) => p.propertyPath[0] === 'localPosition' && p.entityPath[p.entityPath.length - 1] === 'mixamorig:Hips');
    const curvas = track.curves.filter((c) => esCadera(c) || c.paths.every((p) => p.propertyPath[0] === 'localRotation'));
    const salidas = track.outputs.slice();
    for (const c of curvas) if (esCadera(c)) { const d = track.outputs[c.output]; salidas[c.output] = new AnimData(d.components, d.data.map((x) => x * escalaCadera)); }
    if (rectas) {
      const qk = new Quat();
      for (const c of curvas) {
        const camino = c.paths[0].entityPath, g = !esCadera(c) && girar.get(camino[camino.length - 1]), d = track.outputs[c.output];
        if (!g || d.components !== 4 || d.data.length !== track.inputs[c.input].data.length * 4) continue;  // (solo las muestreadas, de un giro por instante)
        const x = new Float32Array(d.data);
        for (let k = 0; k < x.length; k += 4) { qk.set(x[k], x[k + 1], x[k + 2], x[k + 3]); qk.mul2(g[0], qk).mul(g[1]); x[k] = qk.x; x[k + 1] = qk.y; x[k + 2] = qk.z; x[k + 3] = qk.w; }
        salidas[c.output] = new AnimData(4, x);
      }
    }
    return new AnimTrack(track.name, track.duration, track.inputs, salidas, curvas, new AnimEvents([]));
  };

  // ---- la mirada: los globos giran con su hueso hacia la cámara, con sus límites y pequeños saltos; los párpados
  // acompañan con los gestos de mirar (como en el editor)
  const ADELANTE = new Vec3(0, 0, 1), IZQUIERDA = new Vec3(1, 0, 0), ARRIBA = new Vec3(0, 1, 0);
  const GRADOS = { lado: 28, arriba: 13, abajo: 20 };
  const ojos = ['eye.L', 'eye.R'].map((n) => {
    const i = deHueso.get(n); if (i === undefined) return null;
    const h = huesos[i], inv = giros[i].clone().invert();
    return { h, lado: n.endsWith('L') ? 'Left' : 'Right', q0: h.getLocalRotation().clone(),
      f: inv.transformVector(ADELANTE, new Vec3()), l: inv.transformVector(IZQUIERDA, new Vec3()), u: inv.transformVector(ARRIBA, new Vec3()), giro: 0, alto: 0 };
  }).filter(Boolean);
  const mirada = { salto: { giro: 0, alto: 0 }, tSalto: 1 };
  const qa = new Quat(), qb = new Quat(), va = new Vec3(), vb = new Vec3(), vc = new Vec3(), vd = new Vec3(), dir = new Vec3(), eje = new Vec3();
  function mirar(dt, camara) {
    if (ojos.length < 2) return;
    mirada.tSalto -= dt;
    if (mirada.tSalto < 0) { mirada.salto = { giro: (Math.random() - 0.5) * 6, alto: (Math.random() - 0.5) * 4 }; mirada.tSalto = 0.8 + Math.random() * 2.2; }
    const cam = camara?.getPosition();
    for (const o of ojos) {
      o.q0.transformVector(o.f, vb); o.q0.transformVector(o.l, vc); o.q0.transformVector(o.u, vd);
      let g = 0, a = 0;
      if (cam) {
        va.sub2(cam, o.h.getPosition()).normalize();
        qa.copy(o.h.parent.getRotation()).invert(); qa.transformVector(va, va);
        g = Math.atan2(va.dot(vc), va.dot(vb)) * 180 / Math.PI; a = Math.asin(Math.max(-1, Math.min(1, va.dot(vd)))) * 180 / Math.PI;
        if (Math.abs(g) > 70 || va.dot(vb) < 0) { g = 0; a = 0; }  // (la cámara detrás o muy de lado: mira al frente)
      }
      g = Math.max(-30, Math.min(30, g + mirada.salto.giro)); a = Math.max(-22, Math.min(16, a + mirada.salto.alto));
      const k = Math.min(1, dt * 18); o.giro += (g - o.giro) * k; o.alto += (a - o.alto) * k;
      const rg = o.giro * Math.PI / 180, ra = o.alto * Math.PI / 180;
      dir.copy(vb).mulScalar(Math.cos(ra) * Math.cos(rg)).add(va.copy(vc).mulScalar(Math.cos(ra) * Math.sin(rg))).add(va.copy(vd).mulScalar(Math.sin(ra)));
      eje.cross(vb, dir); const s = eje.length();
      if (s > 1e-6) { qb.setFromAxisAngle(eje.mulScalar(1 / s), Math.atan2(s, vb.dot(dir)) * 180 / Math.PI); qb.mul(o.q0); o.h.setLocalRotation(qb); }
      else o.h.setLocalRotation(o.q0);
      const afuera = o.lado === 'Left' ? o.giro : -o.giro;
      pon(`eyeLookOut${o.lado}`, Math.max(0, afuera) / GRADOS.lado); pon(`eyeLookIn${o.lado}`, Math.max(0, -afuera) / GRADOS.lado);
      pon(`eyeLookUp${o.lado}`, Math.max(0, o.alto) / GRADOS.arriba); pon(`eyeLookDown${o.lado}`, Math.max(0, -o.alto) / GRADOS.abajo);
    }
  }

  // ---- el vaivén del pelo: un muelle amortiguado en el marco de la cabeza en reposo (como en el editor): la gravedad
  // cuando la cabeza se inclina, y en contra de los acelerones del cuerpo y de los giros de la cabeza
  const muelle = { p: new Vec3(), v: new Vec3(), pos: null, vel: new Vec3(), giro: null };
  const MUELLE = { hz: 1.5, amort: 0.22, gravedad: 0.12, inercia: 0.006, giro: 0.02, max: 0.06, adelante: 0.005, lado: 0.03 };
  const iCab = deHueso.get('mixamorig:Head'), giroCab = iCab !== undefined ? giros[iCab].clone().invert() : null;
  const qh = new Quat(), vg = new Vec3(), vacel = new Vec3(), vvel = new Vec3(), vad = new Vec3(), vobj = new Vec3(), vf = new Vec3(), qi = new Quat();
  function mecer(dt) {
    if (!misPelo.length || !giroCab || dt <= 0) return;
    const cab = huesos[iCab];
    qh.copy(cab.getRotation()).mul(giroCab).invert();  // (del mundo al marco de la cabeza en reposo)
    const p = cab.getPosition();
    if (!muelle.pos) { muelle.pos = p.clone(); muelle.giro = qh.clone(); }
    vvel.sub2(p, muelle.pos).mulScalar(1 / dt); vacel.sub2(vvel, muelle.vel).mulScalar(1 / dt);
    // (un salto de sitio, al colocar al personaje: sin latigazo)
    if (vvel.length() > 30) { vvel.set(0, 0, 0); vacel.set(0, 0, 0); }
    muelle.pos.copy(p); muelle.vel.copy(vvel);
    qh.transformVector(vg.set(0, -1, 0), vg); qh.transformVector(vacel, vacel);
    qi.copy(muelle.giro).invert().transformVector(vad.set(0, 0, 1), vad); qh.transformVector(vad, vad);
    const giroV = Math.atan2(vad.x, vad.z) / dt; muelle.giro.copy(qh);
    vobj.set(vg.x * MUELLE.gravedad - vacel.x * MUELLE.inercia + giroV * MUELLE.giro, 0, vg.z * MUELLE.gravedad - vacel.z * MUELLE.inercia);
    const om = 2 * Math.PI * MUELLE.hz, pasos = Math.max(1, Math.min(8, Math.ceil(dt / 0.008))), h = dt / pasos;
    for (let s = 0; s < pasos; s++) {
      vf.sub2(vobj, muelle.p).mulScalar(om * om).sub(vacel.copy(muelle.v).mulScalar(2 * MUELLE.amort * om));
      muelle.v.add(vf.mulScalar(h)); muelle.p.add(vf.copy(muelle.v).mulScalar(h));
    }
    const l = muelle.p.length(); if (l > MUELLE.max) muelle.p.mulScalar(MUELLE.max / l);
    if (muelle.p.z > MUELLE.adelante) { muelle.p.z = MUELLE.adelante; muelle.v.z = Math.min(muelle.v.z, 0); }
    if (Math.abs(muelle.p.x) > MUELLE.lado) { muelle.p.x = Math.sign(muelle.p.x) * MUELLE.lado; muelle.v.x = 0; }
    pon('vaiven_izq', Math.max(0, muelle.p.x) / 0.05); pon('vaiven_der', Math.max(0, -muelle.p.x) / 0.05);
    pon('vaiven_ade', Math.max(0, muelle.p.z) / 0.05); pon('vaiven_atr', Math.max(0, -muelle.p.z) / 0.05);
  }

  // ---- cada fotograma, después de la animación: el parpadeo, la mirada y el pelo
  // (la córnea y las pestañas, solo de cerca: a más de 3,5 m no se ven, y son dibujos de menos mientras se juega)
  const finos = mis.filter((mi) => ['cornea', 'pestanas'].includes(mi.material.name));
  let tParpadeo = 2, lejos = false;
  function actualizar(dt, camara) {
    const ahora = !!camara && iCab !== undefined && camara.getPosition().distance(huesos[iCab].getPosition()) > 3.5;
    if (ahora !== lejos) { lejos = ahora; for (const mi of finos) mi.visible = !lejos; }
    tParpadeo -= dt;
    const fase = tParpadeo < 0 ? Math.max(0, 1 - Math.abs(tParpadeo + 0.075) / 0.075) : 0;
    if (tParpadeo < -0.15) tParpadeo = 2 + Math.random() * 3;
    pon('eyeBlinkLeft', fase); pon('eyeBlinkRight', fase);
    mirar(dt, camara);
    mecer(dt);
    melena?.actualizar(dt);
  }
  datos = null;
  return { raiz, modelo, estado, mis, pista, actualizar, altura, escalaCadera, pon, muelle, melena };
}
