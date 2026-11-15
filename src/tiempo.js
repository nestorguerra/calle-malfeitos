// El tiempo que hace en Guareña, el de verdad (15-11-2026; el usuario: «cada vez que accedas al pueblo, accede a un servicio
// de meteorología gratuito y sepas cuál es el tiempo, el clima y las nubes que hay ese día, de tal forma que repliques
// exactamente igual la meteorología real»):
// - De Open-Meteo (https://open-meteo.com, gratis, sin clave ni cuenta, datos CC BY 4.0): la previsión por horas de hoy y
//   de los dos días siguientes en las coordenadas del pueblo (38,86° N, 6,10° O). Lo único que se le manda son esas
//   coordenadas. Se pide al entrar y otra vez cada media hora.
// - El juego corre más que el reloj (un día en 3 horas: src/reloj.js), así que cada hora del juego toma la de la previsión
//   de esa hora de ese día: al entrar, la de ahora mismo; luego, la que toca.
// - Lo que se ve: las nubes (una cúpula de nubes que se mueven con el viento, más o menos cerrada según lo nublado y más
//   gris si llueve), lo que apagan el sol y el cielo, la bruma (más espesa con niebla o lluvia), la lluvia (o la nieve)
//   alrededor de la cámara, inclinada por el viento, y los relámpagos de las tormentas. La pastilla de la hora dice la
//   temperatura y el cielo.
// - Sin conexión, o si falla, el día queda despejado como antes. ?tiempo=0 lo quita; ?tiempo=lluvia|nublado|niebla|tormenta|
//   nieve|despejado lo fuerza (para probar).
import { BLEND_NORMAL, Color, CULLFACE_NONE, Entity, Mesh, MeshInstance, PRIMITIVE_TRIANGLES, StandardMaterial, Texture, Vec3, ADDRESS_REPEAT, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';

const LAT = 38.861609, LON = -6.10126;
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&hourly=temperature_2m,precipitation,rain,snowfall,weather_code,cloud_cover,cloud_cover_low,visibility,wind_speed_10m,wind_direction_10m&timezone=Europe%2FMadrid&forecast_days=3`;
// (lo que dice cada código de la OMM, para la pastilla)
const CIELO = (c, nubes) => c >= 95 ? 'tormenta' : c >= 71 && c <= 77 || c === 85 || c === 86 ? 'nieve' : c >= 61 && c <= 67 || c >= 80 && c <= 82 ? 'lluvia' : c >= 51 && c <= 57 ? 'llovizna'
  : c === 45 || c === 48 ? 'niebla' : nubes > 85 ? 'cubierto' : nubes > 55 ? 'nublado' : nubes > 20 ? 'algo nublado' : 'despejado';
const FORZADOS = {
  despejado: { nubes: 5, bajas: 0, lluvia: 0, nieve: 0, codigo: 0, visibilidad: 30000, viento: 8, rumbo: 270 },
  nublado: { nubes: 75, bajas: 40, lluvia: 0, nieve: 0, codigo: 3, visibilidad: 20000, viento: 14, rumbo: 250 },
  lluvia: { nubes: 100, bajas: 90, lluvia: 3.5, nieve: 0, codigo: 63, visibilidad: 6000, viento: 20, rumbo: 240 },
  tormenta: { nubes: 100, bajas: 100, lluvia: 8, nieve: 0, codigo: 95, visibilidad: 4000, viento: 35, rumbo: 230 },
  niebla: { nubes: 100, bajas: 100, lluvia: 0, nieve: 0, codigo: 45, visibilidad: 300, viento: 3, rumbo: 0 },
  nieve: { nubes: 100, bajas: 90, lluvia: 0, nieve: 1.5, codigo: 73, visibilidad: 3000, viento: 10, rumbo: 0 },
};

// una textura de nubes: ruido de varias octavas que se repite, en el alfa; «cubre» (0 a 1) es lo cerrado del cielo
function texturaNubes(device, cubre, semilla = 7) {
  const n = 256, datos = new Uint8Array(n * n * 4);
  const h = (i, j, s) => { const x = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453; return x - Math.floor(x); };
  const valor = (x, y, f, s) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), m = (a) => ((a % f) + f) % f;
    const a = h(m(xi), m(yi), s), b = h(m(xi + 1), m(yi), s), c = h(m(xi), m(yi + 1), s), d = h(m(xi + 1), m(yi + 1), s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const umbral = 1 - cubre * 1.15;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let s = 0, amp = 0.5, f = 4;
    for (let o = 0; o < 5; o++) { s += amp * valor(i / n * f, j / n * f, f, semilla + o); amp *= 0.5; f *= 2; }
    const a = Math.max(0, Math.min(1, (s - umbral) / 0.22)), k = (j * n + i) * 4, luz = Math.round(255 * (0.78 + 0.22 * Math.min(1, s * 1.3)));
    datos[k] = luz; datos[k + 1] = luz; datos[k + 2] = Math.min(255, luz + 8); datos[k + 3] = Math.round(255 * a);
  }
  const t = new Texture(device, { width: n, height: n, mipmaps: true, addressU: ADDRESS_REPEAT, addressV: ADDRESS_REPEAT, name: 'nubes' });
  t.lock().set(datos); t.unlock(); return t;
}
// una gota: un trazo vertical que se apaga por los extremos
function texturaGota(device) {
  const w = 8, hh = 64, datos = new Uint8Array(w * hh * 4);
  for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
    const k = (j * w + i) * 4, a = Math.sin(Math.PI * j / (hh - 1)) * Math.max(0, 1 - Math.abs(i - (w - 1) / 2) / (w / 2));
    datos[k] = 220; datos[k + 1] = 228; datos[k + 2] = 240; datos[k + 3] = Math.round(255 * a);
  }
  const t = new Texture(device, { width: w, height: hh, mipmaps: true, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'gota' });
  t.lock().set(datos); t.unlock(); return t;
}

export function montarTiempo({ app, reloj, camara, q, movil }) {
  if (q.get('tiempo') === '0' || !reloj) return null;
  const forzado = FORZADOS[q.get('tiempo')] || null;
  const est = { horas: null, ahora: null, fuente: forzado ? 'forzado' : 'open-meteo', pedido: 0, error: null };
  async function pedir() {
    if (forzado) return;
    try {
      const r = await fetch(URL, { cache: 'no-store' }); if (!r.ok) throw new Error('open-meteo ' + r.status);
      const j = await r.json(), H = j.hourly; est.pedido = Date.now(); est.error = null;
      est.horas = H.time.map((t_, i) => ({ t: t_, temp: H.temperature_2m[i], lluvia: H.rain[i] ?? H.precipitation[i], nieve: H.snowfall[i] || 0, codigo: H.weather_code[i], nubes: H.cloud_cover[i], bajas: H.cloud_cover_low[i] ?? H.cloud_cover[i], visibilidad: H.visibility[i] ?? 20000, viento: H.wind_speed_10m[i], rumbo: H.wind_direction_10m[i] }));
    } catch (e) { est.error = String(e); console.warn('tiempo:', e); }
  }
  pedir(); const cadaMedia = setInterval(pedir, 30 * 60 * 1000);
  // la hora de la previsión que toca a la hora del juego (entre las dos más cercanas)
  function deAhora() {
    if (forzado) return { ...forzado, temp: 16 };
    if (!est.horas) return null;
    const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date()); // (AAAA-MM-DD de hoy en España)
    const i0 = est.horas.findIndex((x) => x.t.startsWith(hoy)); if (i0 < 0) return null;
    const pos = Math.max(0, Math.min(est.horas.length - 1.001, i0 + reloj.dia * 24 + reloj.hora)), i = Math.floor(pos), f = pos - i;
    const a = est.horas[i], b = est.horas[Math.min(i + 1, est.horas.length - 1)], m = (k) => a[k] + (b[k] - a[k]) * f;
    return { temp: m('temp'), lluvia: m('lluvia'), nieve: m('nieve'), codigo: f < 0.5 ? a.codigo : b.codigo, nubes: m('nubes'), bajas: m('bajas'), visibilidad: m('visibilidad'), viento: m('viento'), rumbo: f < 0.5 ? a.rumbo : b.rumbo };
  }

  // ---- las nubes: una cúpula grande alrededor de la cámara, con la textura corriendo con el viento
  const R = 950, Hc = 260; // (el radio y la altura de la cúpula; la cámara ve hasta 1.000 m)
  const matNubes = new StandardMaterial(); matNubes.diffuse = new Color(0, 0, 0); matNubes.useLighting = false; matNubes.useFog = false;
  matNubes.blendType = BLEND_NORMAL; matNubes.depthWrite = false; matNubes.cull = CULLFACE_NONE; matNubes.emissive = new Color(1, 1, 1);
  const cupula = (() => {
    const pos = [], uv = [], nor = [], ind = [], A = 48, B = 10;
    for (let j = 0; j <= B; j++) for (let i = 0; i <= A; i++) {
      const fi = (j / B) * (Math.PI / 2) * 0.96, th = (i / A) * Math.PI * 2, r = Math.sin(fi) * R, y = Math.cos(fi) * Hc - 40;
      pos.push(Math.cos(th) * r, y, Math.sin(th) * r); nor.push(0, -1, 0); uv.push(Math.cos(th) * Math.sin(fi) * 3 + 0.5, Math.sin(th) * Math.sin(fi) * 3 + 0.5);
    }
    for (let j = 0; j < B; j++) for (let i = 0; i < A; i++) { const k = j * (A + 1) + i; ind.push(k, k + A + 1, k + 1, k + 1, k + A + 1, k + A + 2); }
    const m = new Mesh(app.graphicsDevice); m.setPositions(pos); m.setNormals(nor); m.setUvs(0, uv); m.setIndices(ind); m.update(PRIMITIVE_TRIANGLES);
    const e = new Entity('nubes'); e.addComponent('render', { meshInstances: [new MeshInstance(m, matNubes)], castShadows: false, receiveShadows: false }); e.render.meshInstances[0].drawOrder = -1; app.root.addChild(e); e.enabled = false;
    return e;
  })();
  let cubreHecho = -1, desplaza = [0, 0];

  // ---- la lluvia (o la nieve): gotas alrededor de la cámara, en una malla que se mueve en cada fotograma
  const N = movil ? 900 : 2400, CAJA = 22, ALTO = 14;
  const gotas = new Float32Array(N * 3); for (let i = 0; i < N; i++) { gotas[i * 3] = (Math.random() - 0.5) * CAJA * 2; gotas[i * 3 + 1] = Math.random() * ALTO; gotas[i * 3 + 2] = (Math.random() - 0.5) * CAJA * 2; }
  const matLluvia = new StandardMaterial(); matLluvia.diffuse = new Color(0, 0, 0); matLluvia.emissive = new Color(0.75, 0.8, 0.88); matLluvia.useLighting = false;
  matLluvia.emissiveMap = texturaGota(app.graphicsDevice); matLluvia.opacityMap = matLluvia.emissiveMap; matLluvia.opacityMapChannel = 'a'; matLluvia.blendType = BLEND_NORMAL; matLluvia.depthWrite = false; matLluvia.cull = CULLFACE_NONE; matLluvia.useFog = true; matLluvia.update();
  const mLluvia = new Mesh(app.graphicsDevice), posL = new Float32Array(N * 4 * 3), uvL = new Float32Array(N * 4 * 2), norL = new Float32Array(N * 4 * 3), indL = new Uint32Array(N * 6);
  for (let i = 0; i < N; i++) { uvL.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8); for (let k = 0; k < 4; k++) norL.set([0, 1, 0], (i * 4 + k) * 3); indL.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6); }
  mLluvia.setPositions(posL); mLluvia.setUvs(0, uvL); mLluvia.setNormals(norL); mLluvia.setIndices(indL); mLluvia.update(PRIMITIVE_TRIANGLES);
  const lluviaE = new Entity('lluvia'); lluviaE.addComponent('render', { meshInstances: [new MeshInstance(mLluvia, matLluvia)], castShadows: false, receiveShadows: false }); app.root.addChild(lluviaE); lluviaE.enabled = false;
  lluviaE.render.meshInstances[0].cull = false;

  // ---- cada fotograma
  let actual = null, cuenta = 0, relampago = 0, siguienteRayo = 0, intensidadLluvia = 0;
  const cielo = new Color();
  app.on('update', (dt) => {
    if ((cuenta++ % 30) === 0) actual = deAhora();
    const w = actual; if (!w) return;
    const c = camara.getPosition();
    const nubes = Math.max(0, Math.min(1, w.nubes / 100)), bajas = Math.max(0, Math.min(1, w.bajas / 100));
    const llueve = Math.max(0, Math.min(1, (w.lluvia || 0) / 4)), nieva = Math.max(0, Math.min(1, (w.nieve || 0) / 1.5)), tormenta = w.codigo >= 95;
    const niebla = w.codigo === 45 || w.codigo === 48 ? 1 : Math.max(0, Math.min(1, (3000 - w.visibilidad) / 2800));
    // lo que apagan las nubes y lo gris de la bruma, para el reloj (src/reloj.js)
    const cl = reloj.clima, antes = cl.sol + cl.cielo * 7 + cl.niebla * 13 + cl.gris * 29;
    cl.sol = 1 - 0.82 * Math.pow(nubes, 1.6) * (0.55 + 0.45 * bajas) - 0.1 * llueve;
    cl.cielo = 1 - 0.45 * nubes * (0.5 + 0.5 * bajas) - 0.15 * llueve;
    cl.niebla = niebla * 9 + llueve * 1.8 + nieva * 2.5;
    cl.gris = Math.min(1, nubes * bajas * 0.8 + llueve * 0.5 + niebla * 0.6);
    cl.texto = `${Math.round(w.temp)}° · ${CIELO(w.codigo, w.nubes)}`;
    if (Math.abs(cl.sol + cl.cielo * 7 + cl.niebla * 13 + cl.gris * 29 - antes) > 0.01) reloj.aplicar(true);
    // las nubes: la textura según lo cerrado (rehecha al cambiar un 4 %), corriendo con el viento, y su color según la luz
    const cubre = Math.round(Math.min(1, nubes * 1.05) * 25) / 25;
    cupula.enabled = cubre > 0.02;
    if (cupula.enabled) {
      if (cubre !== cubreHecho) { cubreHecho = cubre; const tx = texturaNubes(app.graphicsDevice, cubre); matNubes.emissiveMap?.destroy?.(); matNubes.emissiveMap = tx; matNubes.opacityMap = tx; matNubes.opacityMapChannel = 'a'; matNubes.update(); }
      const v = (w.viento || 0) / 3.6, r = ((w.rumbo || 0) + 180) * Math.PI / 180; // (el viento viene de «rumbo»: las nubes van hacia el contrario)
      desplaza[0] = (desplaza[0] + Math.sin(r) * v * dt / (R * 2 / 3)) % 1; desplaza[1] = (desplaza[1] - Math.cos(r) * v * dt / (R * 2 / 3)) % 1;
      matNubes.emissiveMapOffset.set(desplaza[0], desplaza[1]); matNubes.opacityMapOffset.set(desplaza[0], desplaza[1]);
      const dia = 1 - reloj.noche, sol = Math.max(0, Math.min(1, reloj.sol[0] / 20));
      const k = (0.08 + 0.92 * dia) * (1 - 0.45 * (llueve + bajas * 0.5) / 1.5) + relampago * 2.5;
      cielo.set(k * (0.92 + 0.08 * sol), k * (0.93 + 0.04 * sol), k * (0.97 - 0.05 * sol));
      matNubes.emissive = cielo; matNubes.opacity = Math.min(1, 0.55 + 0.45 * nubes); matNubes.update();
      cupula.setPosition(c.x, 0, c.z);
    }
    // la lluvia o la nieve: cuántas gotas se ven, según lo que cae, y su caída (la nieve, despacio y balanceándose)
    const objetivo = Math.max(llueve, nieva) * (camaraBajoTecho() ? 0 : 1);
    intensidadLluvia += (objetivo - intensidadLluvia) * Math.min(1, dt * 0.8);
    lluviaE.enabled = intensidadLluvia > 0.02;
    if (lluviaE.enabled) {
      const nieve = nieva > llueve, vel = nieve ? 1.2 : 9, vx = Math.sin(((w.rumbo || 0) + 180) * Math.PI / 180) * (w.viento || 0) / 3.6 * (nieve ? 0.35 : 0.25), vz = -Math.cos(((w.rumbo || 0) + 180) * Math.PI / 180) * (w.viento || 0) / 3.6 * (nieve ? 0.35 : 0.25);
      const n = Math.round(N * Math.min(1, 0.3 + intensidadLluvia * 0.7)), largo = nieve ? 0.05 : 0.6, ancho = nieve ? 0.05 : 0.016, t_ = performance.now() / 1000;
      const cx = c.x, cy = c.y, cz = c.z;
      for (let i = 0; i < N; i++) {
        let y = gotas[i * 3 + 1] - vel * dt;
        if (y < -2) { y += ALTO; gotas[i * 3] = (Math.random() - 0.5) * CAJA * 2; gotas[i * 3 + 2] = (Math.random() - 0.5) * CAJA * 2; }
        gotas[i * 3 + 1] = y; gotas[i * 3] += vx * dt + (nieve ? Math.sin(t_ * 1.3 + i) * 0.3 * dt : 0); gotas[i * 3 + 2] += vz * dt;
        // (alrededor de la cámara: lo que se sale de la caja vuelve por el otro lado)
        let gx = gotas[i * 3], gz = gotas[i * 3 + 2]; if (gx > CAJA) gx -= CAJA * 2; if (gx < -CAJA) gx += CAJA * 2; if (gz > CAJA) gz -= CAJA * 2; if (gz < -CAJA) gz += CAJA * 2; gotas[i * 3] = gx; gotas[i * 3 + 2] = gz;
        const o = i * 12, x0 = cx + gx, y0 = cy - 3 + y, z0 = cz + gz;
        if (i >= n) { posL.fill(0, o, o + 12); continue; }
        // (un trazo que mira a la cámara de lado: ancho en x/z perpendicular a la vista, largo en vertical con la inclinación del viento)
        const lx = z0 - cz, lz = -(x0 - cx), ll = Math.hypot(lx, lz) || 1, ax = lx / ll * ancho, az = lz / ll * ancho, ix = -vx / vel * largo, iz = -vz / vel * largo;
        posL[o] = x0 - ax; posL[o + 1] = y0; posL[o + 2] = z0 - az;
        posL[o + 3] = x0 + ax; posL[o + 4] = y0; posL[o + 5] = z0 + az;
        posL[o + 6] = x0 + ax + ix; posL[o + 7] = y0 + largo; posL[o + 8] = z0 + az + iz;
        posL[o + 9] = x0 - ax + ix; posL[o + 10] = y0 + largo; posL[o + 11] = z0 - az + iz;
      }
      mLluvia.setPositions(posL); mLluvia.update(PRIMITIVE_TRIANGLES, false);
      matLluvia.opacity = (nieve ? 0.9 : 0.5) * Math.min(1, 0.4 + intensidadLluvia) * (0.35 + 0.65 * (1 - reloj.noche * 0.6)); matLluvia.emissive.set(nieve ? 0.95 : 0.72, nieve ? 0.95 : 0.77, nieve ? 0.97 : 0.86); matLluvia.update();
    }
    // los relámpagos: un fogonazo de vez en cuando con tormenta
    if (tormenta && t0() > siguienteRayo) { siguienteRayo = t0() + 6 + Math.random() * 18; relampago = 1; }
    if (relampago > 0) { relampago = Math.max(0, relampago - dt * 4); app.scene.exposure = (reloj._exposicion ?? (reloj._exposicion = app.scene.exposure)) * (1 + relampago * 1.6); }
    else if (reloj._exposicion != null) { app.scene.exposure = reloj._exposicion; reloj._exposicion = null; }
  });
  const t0 = () => performance.now() / 1000;
  // (dentro de la iglesia, o con un techo encima, no llueve: un rayo hacia arriba desde la cámara)
  let techoT = 0, techo = false; const ta = new Vec3(), tb = new Vec3();
  function camaraBajoTecho() {
    if (performance.now() - techoT < 500) return techo; techoT = performance.now();
    const c = camara.getPosition(), sys = app.systems.rigidbody; if (!sys) return false;
    techo = !!sys.raycastFirst(ta.set(c.x, c.y, c.z), tb.set(c.x, c.y + 40, c.z)); return techo;
  }
  return { estado: () => ({ fuente: est.fuente, error: est.error, pedido: est.pedido, ahora: actual, clima: { ...reloj.clima } }), pedir, parar: () => clearInterval(cadaMedia) };
}
