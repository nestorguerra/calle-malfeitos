// La entrada desde la web de 388 Pueblos (https://pueblos388.onrender.com): el juego va en un marco de esa web, con
// ?desde=388, y no se ve hasta que la web lo enseña. Solo hace algo en ese caso (o con ?foto388=, para sacar las fotos).
// Lo pidió el usuario el 10-11-2026 («realmente espectacular», sin cortes) y lo corrigió el 11-11-2026: «demasiado lento,
// y se queda atascado; tienes que ir acercándote poco a poco y que sea todo fluido, como una película continua, sin
// cortes ni momentos en blanco». Así que no hay bruma ni paradas: la cámara de la web baja
// sin frenar hasta el punto de la FOTO (sobre la calle Malfeitos, mirando hacia la chica) y allí se funde, en marcha,
// con un VÍDEO grabado por este mismo juego (la web lo tiene: 388-pueblos, web/assets/juego/; lo graba
// tools/foto388.py): la cámara sigue avanzando calle arriba, frenando poco a poco, mientras aquí se construye el pueblo
// (el vídeo lo pinta el navegador aparte: no da tirones aunque todo esté ocupado). Al acabar, esta cámara se pone donde
// va el vídeo en ese instante, la web los funde (son la misma imagen) y la cámara sigue: baja por la calle hasta detrás
// de la chica y empieza el juego. Si el vídeo no puede verse, la web usa la foto, que se acerca con un zoom (s, r).
//   juego → web  g388:hola · g388:progreso {p, descargado} · g388:obra {p} · g388:listo · g388:aterriza · g388:error {msg}
//   web → juego  g388:construye (la foto ya tapa la web: que se construya; antes, solo se descarga, que en muchos
//                navegadores el marco y la web comparten hilo y la obra congelaría la cámara de la web)
//                g388:entra {tv, vel, s, r, t, cruce} (en el instante t de Date.now() el vídeo va por el segundo tv y
//                avanza a vel segundos por segundo —1 si se reproduce, 0 si ya acabó—, con un zoom s que crece e^r por
//                segundo; dentro de «cruce» segundos el fundido habrá acabado: entonces esta cámara echa a volar)
// La espera para construir está en src/main.js (window.esperaConstruir, justo después de las descargas).
import { Vec3 } from 'playcanvas';

// la foto: dónde está la cámara, a dónde mira y con qué campo vertical se sacó cada una (la web lleva lo mismo, en
// web/js/jugar.js: si se cambia aquí, hay que volver a sacar las fotos con tools/foto388.py y cambiarlo allí)
export const FOTO = { pos: [2, 26, 84], mira: [1, 1, 12], bruma: 0.0009,
  apaisada: { ancho: 2560, alto: 1440, fov: 55 }, vertical: { ancho: 1440, alto: 2560, fov: 80 } };
// el campo vertical con que se ve la foto a pantalla completa (recortada como «cover») en una pantalla de este aspecto
export function fovFoto(aspecto) {
  const f = aspecto >= 1 ? FOTO.apaisada : FOTO.vertical, af = f.ancho / f.alto, t = Math.tan(f.fov * Math.PI / 360);
  return aspecto >= af ? 2 * Math.atan(t * af / aspecto) * 180 / Math.PI : f.fov;
}
const lente = (fov, z) => 2 * Math.atan(Math.tan(fov * Math.PI / 360) / z) * 180 / Math.PI; // (el objetivo cerrado z veces)
// el vídeo: desde el punto de la foto la cámara sigue hacia «hasta», frenando (pos(t) = pos + (1 − e^(−t/tau))·(hasta −
// pos)), mirando siempre a FOTO.mira. La web lleva lo mismo
export const VIDEO = { dur: 16, tau: 9, hasta: [1.5, 14, 44], fps: 30 };
export function enVideo(t) {
  t = Math.max(0, Math.min(VIDEO.dur, t));
  const e = Math.exp(-t / VIDEO.tau), P = FOTO.pos, Q = VIDEO.hasta;
  return { pos: P.map((p, i) => p + (1 - e) * (Q[i] - p)), vel: P.map((p, i) => (e / VIDEO.tau) * (Q[i] - p)) };
}

const q = new URLSearchParams(location.search);
const padre = window.parent !== window ? window.parent : null;
// (de quién se aceptan las órdenes: la web publicada y, para probar, una en local)
const DE_FIAR = /^(https:\/\/pueblos388\.onrender\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const decir = (type, mas = {}) => { try { padre.postMessage({ type, ...mas }, '*'); } catch (e) { /* sin web */ } }; // (solo progreso: nada privado)
const fotogramas = (app, n) => new Promise((r) => { let k = 0; const f = () => { if (++k >= n) { app.off('frameend', f); r(); } }; app.on('frameend', f); });
const listo = () => new Promise((r) => { const m = setInterval(() => { if (window.tiempos?.listo !== undefined && window.foto?.tpc) { clearInterval(m); r(); } }, 60); });

// la cámara en el punto de la foto, con su bruma (más fina que la de la calle: desde arriba, la de siempre lo blanqueaba)
function ponerEnLaFoto(z = 1) {
  const { app, tpc } = window.foto, cam = app.root.findByName('camara');
  tpc.enabled = false;
  const aspecto = app.graphicsDevice.width / Math.max(1, app.graphicsDevice.height);
  cam.setPosition(...FOTO.pos); cam.lookAt(...FOTO.mira);
  cam.camera.fov = lente(fovFoto(aspecto), z);
  app.scene.fog.density = FOTO.bruma;
  return { cam, aspecto };
}

if (q.get('foto388')) {
  // para sacar la foto y el vídeo (tools/foto388.py): el juego normal, y al acabar de construir, la cámara en el punto de
  // la foto. Para el vídeo, window.video388(t) pone la cámara en su segundo t (la vida, quieta: se graba fotograma a
  // fotograma, más despacio que en tiempo real) y espera a que esté dibujado
  (async () => {
    await listo(); const { app } = window.foto; ponerEnLaFoto(); await fotogramas(app, 30);
    window.video388 = async (t) => {
      app.timeScale = 0;
      const { cam } = ponerEnLaFoto(); cam.setPosition(...enVideo(t).pos); cam.lookAt(...FOTO.mira);
      await fotogramas(app, 2); return true;
    };
    window.foto388 = true;
  })();
} else if (padre && q.get('desde') === '388') {
  // la interfaz del juego, fuera (el cuadro de medidas, siempre: es para medir, no para jugar; la ayuda de las teclas
  // y los créditos, también al aterrizar)
  const estilo = document.createElement('style');
  estilo.textContent = `#hud { display: none !important; }
    #carga { opacity: 0 !important; }
    #ayuda, #creditos { display: none !important; }`;   /* (sin la ayuda de las teclas ni los créditos: que solo se vea a la chica; a petición, 11-11-2026. Los créditos, en la web de 388 Pueblos) */
  document.head.appendChild(estilo);

  let construir, entra = null;
  window.esperaConstruir = new Promise((r) => { construir = r; });
  addEventListener('message', (e) => {
    if (e.source !== padre || !DE_FIAR.test(e.origin) || !e.data || typeof e.data.type !== 'string') return;
    if (e.data.type === 'g388:construye') construir();
    if (e.data.type === 'g388:entra') entra?.(e.data);
  });
  setTimeout(() => construir(), 90000); // (si la web no llega a decirlo, que no se quede sin construir)
  decir('g388:hola', { v: 2 });

  // ---- lo bajado: los archivos grandes (el aviso de src/main.js lleva los megas) y las zonas de la calle de partida, que
  // el juego bajaría después de construir y aquí se piden ya, mientras la web vuela (quedan en la caché del navegador)
  const carga = document.getElementById('carga');
  const prin = { hecho: 0, total: 0, fin: false };
  const zon = { hecho: 0, total: 0, fin: false };
  const num = (s) => parseFloat(String(s).replace(',', '.')) * 1e6;
  const leerAviso = () => {
    const t = carga?.textContent || '';
    const m = t.match(/([\d.,]+)(?: de ([\d.,]+))? MB/);
    if (m) { prin.hecho = num(m[1]); if (m[2]) prin.total = Math.max(prin.total, num(m[2])); }
    if (/Preparando/.test(t)) prin.fin = true;
  };
  if (carga) new MutationObserver(leerAviso).observe(carga, { childList: true, characterData: true, subtree: true });

  // las zonas que src/main.js carga al empezar (las de alrededor de la salida, hasta su radio y su tope de caras)
  const ESCENAS = { guarena: { zonas: './escenas/guarena/zonas.json', inicio: [1, 22], caras: [900000, 2600000] } };
  const esc = ESCENAS[q.get('escena')];
  const movil = q.get('movil') ? q.get('movil') === '1' : (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900);
  (async () => {
    if (!esc || q.get('zonas') === '0') { zon.fin = true; return; }
    try {
      const Z = await (await fetch(esc.zonas)).json();
      const [ix, iz] = esc.inicio, radio = parseFloat(q.get('radio') || (movil ? '160' : '330'));
      // (al empezar, src/main.js solo carga las de menos de ?radio0= (100 m): aquí se bajaban todas las del radio, nueve
      // en el ordenador y a la vez, y le quitaban red a las de la salida —cargar antes, 13-11-2026—)
      const radio0 = parseFloat(q.get('radio0') ?? '100') || radio;
      const tope = parseFloat(q.get('caras') || esc.caras[movil ? 0 : 1]);
      const dist = (z) => { const [x0, z0, x1, z1] = z.caja; return Math.hypot(Math.max(0, x0 - ix, ix - x1), Math.max(0, z0 - iz, iz - z1)); };
      let r = Math.min(radio, radio0), suma = 0;
      for (const z of Z.zonas.filter((z) => dist(z) < r).sort((a, b) => dist(a) - dist(b))) { suma += z.caras; if (suma > tope && suma > z.caras) { r = dist(z); break; } }
      const base = esc.zonas.slice(0, esc.zonas.lastIndexOf('/') + 1);
      await Promise.all(Z.zonas.filter((z) => dist(z) < r).map(async (z) => {
        await window.precargando?.get(new URL(base + z.archivo, location.href).href); const resp = await fetch(base + z.archivo);
        zon.total += +resp.headers.get('content-length') || 0;
        const lector = resp.body.getReader();
        for (;;) { const { done, value } = await lector.read(); if (done) break; zon.hecho += value.length; }
      }));
    } catch (e) { /* (si falla, las bajará el juego) */ }
    zon.fin = true;
  })();
  let ultimo = -1;
  const avisar = setInterval(() => {
    leerAviso();
    const total = prin.total + zon.total, p = prin.fin && zon.fin ? 1 : total ? Math.min(0.99, (prin.hecho + zon.hecho) / total) : 0;
    if (p !== ultimo) { ultimo = p; decir('g388:progreso', { p, descargado: p === 1 }); }
    if (p === 1) clearInterval(avisar);
  }, 200);

  // ---- la obra: por dónde va (src/main.js apunta cada fase en window.tiempos)
  const fases = [['activos', 0.35], ['colision', 0.5], ['listo', 1]];
  let obraDicha = 0;
  const mirar = setInterval(() => {
    const t = window.tiempos || {};
    let p = 0; for (const [k, v] of fases) if (t[k] !== undefined) p = v;
    if (p > obraDicha) { obraDicha = p; decir('g388:obra', { p }); }
    if (p === 1) clearInterval(mirar);
  }, 100);
  addEventListener('error', (e) => decir('g388:error', { msg: String(e.message || e.type).slice(0, 200) }));

  (async () => {
    await listo();
    const { app, tpc } = window.foto;
    const cam = app.root.findByName('camara');
    // el aterrizaje: donde el controlador pone la cámara al empezar (detrás de la chica, mirando calle arriba)
    const F = cam.getPosition().clone(), fwd = cam.forward.clone(), fovJuego = cam.camera.fov, brumaJuego = app.scene.fog.density;
    // al punto de la foto, quieta; unos fotogramas (se compilan los sombreadores de lo que se ve y se suben las
    // texturas), y a la web: ya se puede fundir
    let { aspecto } = ponerEnLaFoto();
    await fotogramas(app, 12);
    decir('g388:listo', { tiempos: window.tiempos, recursos: performance.getEntriesByType('resource').filter((e) => e.transferSize > 1e6).length });   // (los tiempos de la obra y cuántos archivos grandes bajó de la red: para medir)
    // el vídeo (o la foto), igual que lo lleva la web, hasta que acaba el fundido
    const orden = await new Promise((r) => { entra = r; setTimeout(() => r({ tv: 0, vel: 0, s: 1, r: 0, t: Date.now(), cruce: 0 }), 60000); });
    const tv0 = +orden.tv || 0, vel = orden.vel === undefined ? 0 : +orden.vel, s0 = +orden.s || 1, r0 = +orden.r || 0;
    const t0 = +orden.t || Date.now(), cruce = Math.min(3, Math.max(0, +orden.cruce || 0));
    const zoomEn = (ms) => s0 * Math.exp(r0 * (ms - t0) / 1000);
    const tvEn = (ms) => Math.min(VIDEO.dur, tv0 + vel * (ms - t0) / 1000);
    await new Promise((fin) => {
      const paso = () => {
        aspecto = app.graphicsDevice.width / Math.max(1, app.graphicsDevice.height);
        const now = Date.now();
        cam.setPosition(...enVideo(tvEn(now)).pos); cam.lookAt(...FOTO.mira);
        cam.camera.fov = lente(fovFoto(aspecto), zoomEn(now));
        if (now >= t0 + cruce * 1000) { app.off('update', paso); fin(); }
      };
      app.on('update', paso); paso();
    });
    // la bajada: de donde va el vídeo a la chica. Sale con la velocidad (y el zoom) que llevaba y se posa despacio detrás
    // de ella, con el campo y la bruma de siempre (curvas de Hermite: sin saltos de posición ni de velocidad)
    const ahora = Date.now(), tvH = tvEn(ahora), ev = enVideo(tvH);
    const P0 = new Vec3(...ev.pos), V0 = new Vec3(...ev.vel).mulScalar(tvH < VIDEO.dur ? vel : 0);
    const L0 = new Vec3(...FOTO.mira), L1 = F.clone().add(fwd.clone().mulScalar(20));
    const zH = zoomEn(ahora), fov0 = lente(fovFoto(aspecto), zH);
    const pend = (lente(fovFoto(aspecto), zH * Math.exp(r0 * 0.05)) - fov0) / 0.05; // (grados por segundo con que iba el zoom)
    const dur = 4.2;
    let t = 0;
    await new Promise((fin) => {
      const paso = (dt) => {
        t += Math.min(dt, 0.05);
        const x = Math.min(1, t / dur), x2 = x * x, x3 = x2 * x;
        const h00 = 2 * x3 - 3 * x2 + 1, h10 = x3 - 2 * x2 + x, h01 = -2 * x3 + 3 * x2;
        cam.setPosition(h00 * P0.x + h10 * dur * V0.x + h01 * F.x, h00 * P0.y + h10 * dur * V0.y + h01 * F.y, h00 * P0.z + h10 * dur * V0.z + h01 * F.z);
        const w = x * x * (3 - 2 * x);
        cam.lookAt(new Vec3().lerp(L0, L1, w));
        // el campo: el del vídeo (con su zoom, a la velocidad que llevaba) al del juego, sin saltos
        cam.camera.fov = h00 * fov0 + h10 * pend * dur + h01 * fovJuego;
        app.scene.fog.density = FOTO.bruma + (brumaJuego - FOTO.bruma) * w;
        if (x >= 1) { app.off('update', paso); fin(); }
      };
      app.on('update', paso);
    });
    // la cámara vuelve al controlador, en el mismo sitio (sin lo que se tocó mientras tanto)
    cam.camera.fov = fovJuego; app.scene.fog.density = brumaJuego;
    for (const k of ['_desktopInput', '_mobileInput', '_gamepadInput']) try { tpc[k]?.read?.(); } catch (e) { /* ignore */ }
    tpc._camInitialized = false;
    tpc.enabled = true;
    document.documentElement.classList.add('aterrizado');
    decir('g388:aterriza');
  })();
}
