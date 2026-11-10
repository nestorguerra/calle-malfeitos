// La entrada desde la web de 388 Pueblos (https://pueblos388.onrender.com): el juego va en un marco de esa web, con
// ?desde=388, y no se ve hasta que la web lo enseña. Solo hace algo en ese caso; sin marco, o sin ?desde=388, no se carga.
// Lo pidió el usuario el 10-11-2026: que «Guareña» y «Jugar» lleven al pueblo entero con un paso «realmente
// espectacular», sin cortes: la cámara de la web baja por su maqueta, rodea la torre de Santa María y entra en una
// bruma de mañana sobre la calle Malfeitos; dentro de la bruma la web deja de dibujar y aquí se construye el pueblo; la
// cámara de este juego sale de la bruma ya en el pueblo de verdad, baja entre los tejados por la calle y aterriza detrás
// de la chica, mirando calle abajo (al sur, la calle larga), y empieza el juego.
//   juego → web  g388:hola · g388:progreso {p, descargado} (lo bajado, de 0 a 1) · g388:obra {p} (lo construido)
//                g388:listo (la cámara ya está en la bruma, quieta y con todo dibujado) · g388:aterriza · g388:error {msg}
//   web → juego  g388:construye (la web ya está en la bruma: que se construya; hasta entonces solo se baja, que en muchos
//                navegadores el marco y la web comparten hilo y la obra congelaría la cámara de la web)
//                g388:baja {dur} (la bruma empieza a abrirse: la cámara baja hasta la chica en dur segundos)
// La espera para construir está en src/main.js (window.esperaConstruir, justo después de las descargas).
import { Vec3 } from 'playcanvas';

const q = new URLSearchParams(location.search);
const padre = window.parent !== window ? window.parent : null;
// (de quién se aceptan las órdenes: la web publicada y, para probar, una en local)
const DE_FIAR = /^(https:\/\/pueblos388\.onrender\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const decir = (type, mas = {}) => { try { padre.postMessage({ type, ...mas }, '*'); } catch (e) { /* sin web */ } }; // (solo progreso: nada privado)

if (padre && q.get('desde') === '388') {
  // la interfaz del juego, fuera hasta aterrizar (el cuadro de medidas, siempre: es para medir, no para jugar)
  const estilo = document.createElement('style');
  estilo.textContent = `#hud { display: none !important; }
    #carga { opacity: 0 !important; }
    #ayuda, #creditos { opacity: 0 !important; transition: opacity 1.2s ease; pointer-events: none; }
    html.aterrizado #ayuda { opacity: .85 !important; }
    html.aterrizado #creditos { opacity: .8 !important; pointer-events: auto; }`;
  document.head.appendChild(estilo);

  let construir, baja = null;
  window.esperaConstruir = new Promise((r) => { construir = r; });
  addEventListener('message', (e) => {
    if (e.source !== padre || !DE_FIAR.test(e.origin) || !e.data || typeof e.data.type !== 'string') return;
    if (e.data.type === 'g388:construye') construir();
    if (e.data.type === 'g388:baja') baja?.(Math.min(14, Math.max(3, +e.data.dur || 7.5)));
  });
  // (si la web no llega a decirlo, que no se quede sin construir)
  setTimeout(() => construir(), 90000);
  decir('g388:hola', { v: 1 });

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
      const tope = parseFloat(q.get('caras') || esc.caras[movil ? 0 : 1]);
      const dist = (z) => { const [x0, z0, x1, z1] = z.caja; return Math.hypot(Math.max(0, x0 - ix, ix - x1), Math.max(0, z0 - iz, iz - z1)); };
      let r = radio, suma = 0;
      for (const z of Z.zonas.filter((z) => dist(z) < radio).sort((a, b) => dist(a) - dist(b))) { suma += z.caras; if (suma > tope && suma > z.caras) { r = dist(z); break; } }
      const base = esc.zonas.slice(0, esc.zonas.lastIndexOf('/') + 1);
      const lista = Z.zonas.filter((z) => dist(z) < r);
      await Promise.all(lista.map(async (z) => {
        const resp = await fetch(base + z.archivo);
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

  // ---- la obra: por dónde va (src/main.js apunta cada fase en window.tiempos), y al acabar, la cámara a la bruma
  const fases = [['activos', 0.35], ['colision', 0.5], ['listo', 1]];
  let obraDicha = 0;
  const mirar = setInterval(() => {
    const t = window.tiempos || {};
    let p = 0; for (const [k, v] of fases) if (t[k] !== undefined) p = v;
    if (p > obraDicha) { obraDicha = p; decir('g388:obra', { p }); }
    if (t.listo !== undefined && window.foto?.tpc) { clearInterval(mirar); tomarCamara(); }
  }, 60);
  addEventListener('error', (e) => decir('g388:error', { msg: String(e.message || e.type).slice(0, 200) }));

  const fotogramas = (app, n) => new Promise((r) => { let k = 0; const f = () => { if (++k >= n) { app.off('frameend', f); r(); } }; app.on('frameend', f); });
  const suave = (x) => x * x * (3 - 2 * x);

  async function tomarCamara() {
    const { app, tpc, muneco } = window.foto, cam = app.root.findByName('camara');
    // el aterrizaje, mirando calle abajo (al sur): lo calcula el propio controlador (con su distancia, su altura y los
    // muros), así al devolverle la cámara no hay salto. La chica, de espaldas a la cámara (el giro no se ve: aún no se
    // enseña el juego)
    const yaw = tpc._yaw + 180;
    tpc._yaw = yaw; tpc._camInitialized = false;
    if (muneco && tpc._modelYaw !== undefined) tpc._modelYaw -= 180;
    await fotogramas(app, 3);
    const F = cam.getPosition().clone(), fwd = cam.forward.clone();
    // la salida de la bruma: 34 m por encima y 82 m por detrás, sobre los tejados del principio de la calle; la mirada,
    // de la calle por delante de la chica a su espalda, y bajando
    const d = new Vec3(fwd.x, 0, fwd.z).normalize(), arriba = new Vec3(0, 1, 0);
    const P0 = F.clone().add(d.clone().mulScalar(-82)).add(arriba.clone().mulScalar(32));
    const P1 = F.clone().add(d.clone().mulScalar(-52)).add(arriba.clone().mulScalar(24));
    const P2 = F.clone().add(d.clone().mulScalar(-14)).add(arriba.clone().mulScalar(4));
    const P3 = F;
    const L0 = F.clone().add(d.clone().mulScalar(18)).add(arriba.clone().mulScalar(-F.y));
    const L1 = F.clone().add(fwd.clone().mulScalar(24));
    tpc.enabled = false;
    const poner = (u, w) => {
      const a = 1 - u; // (la curva de Bézier de la bajada)
      const p = new Vec3(
        a * a * a * P0.x + 3 * a * a * u * P1.x + 3 * a * u * u * P2.x + u * u * u * P3.x,
        a * a * a * P0.y + 3 * a * a * u * P1.y + 3 * a * u * u * P2.y + u * u * u * P3.y,
        a * a * a * P0.z + 3 * a * a * u * P1.z + 3 * a * u * u * P2.z + u * u * u * P3.z);
      const l = new Vec3().lerp(L0, L1, w);
      cam.setPosition(p); cam.lookAt(l);
    };
    poner(0, 0);
    // unos fotogramas quietos en la bruma (se compilan los sombreadores de lo que se ve y se suben las texturas), y a
    // la web: ya se puede abrir la bruma
    await fotogramas(app, 12);
    decir('g388:listo');
    const dur = await new Promise((r) => { baja = r; });
    // la bajada: sale con la velocidad que traía la web (rápido) y se posa despacio detrás de la chica
    let t = 0;
    await new Promise((fin) => {
      const paso = (dt) => {
        t += Math.min(dt, 0.05);
        const x = Math.min(1, t / dur);
        const v0 = 1.6; // (la velocidad de salida, en veces la media: viene volando)
        const u = v0 * (x - 2 * x * x + x * x * x) + (3 * x * x - 2 * x * x * x);
        poner(u, suave(Math.min(1, x * 1.15)));
        if (x >= 1) { app.off('update', paso); fin(); }
      };
      app.on('update', paso);
    });
    // la cámara vuelve al controlador, en el mismo sitio (sin lo que se tocó mientras tanto)
    for (const k of ['_desktopInput', '_mobileInput', '_gamepadInput']) try { tpc[k]?.read?.(); } catch (e) { /* ignore */ }
    tpc._camInitialized = false;
    tpc.enabled = true;
    document.documentElement.classList.add('aterrizado');
    decir('g388:aterriza');
  }
}
