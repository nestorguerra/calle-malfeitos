// El reloj del juego y la luz según la hora (docs/pueblo_vivo.md; el usuario, 14-11-2026: «en función de la hora del día
// […] que el juego vaya fluctuando a lo largo del día, como si fuera un GTA»).
// - La hora: empieza en la de España de ahora y corre como en los juegos de mundo abierto, un día en 3 horas (8 minutos del
//   juego por minuto; 15-11-2026, el usuario: «que la velocidad del día sea más lenta, unas 3 horas las 24 del día»; antes,
//   en 48 minutos). ?hora=19:30 la pone y ?ritmo= cambia lo que corre (minutos del juego por segundo; 0, parada). La T la
//   adelanta una hora (con mayúsculas, la atrasa); en el móvil, tocar la hora. Se ve en una pastilla arriba.
// - La luna: por su camino de verdad (una cuenta sencilla, de un grado), con su fase; se ve en el cielo y de noche alumbra
//   desde donde está, más cuanto más llena. Sin ella en el cielo, la noche queda a la luz de las estrellas, muy floja.
// - El tiempo que hace (src/tiempo.js): las nubes apagan el sol y el cielo, la niebla y la lluvia cierran la bruma; lo
//   pone en estado.clima y la pastilla lo dice.
// - El sol: por su camino de verdad sobre Guareña (38,86° N, 6,10° O), el de la fecha de hoy. Su color y su fuerza, de la
//   altura: blanco cálido a mediodía, dorado por la tarde, naranja al ponerse; de noche, una luna azulada y floja.
// - El cielo y la luz de ambiente, la exposición y la bruma, a juego: de noche, el cielo oscuro y los faroles encendidos
//   (su material brilla y en la pared y el suelo, debajo, un charco de luz que se suma a lo de detrás).
// - Para las pruebas y para la gente (src/gente.js): window.foto.reloj.
import { BLEND_ADDITIVE, Color, CULLFACE_NONE, Entity, Mesh, MeshInstance, PRIMITIVE_TRIANGLES, Quat, StandardMaterial, Texture, Vec3, ADDRESS_CLAMP_TO_EDGE } from 'playcanvas';

const LAT = 38.861609, LON = -6.10126; // (el origen del pueblo, tools/blender/guarena.sh)
const rad = Math.PI / 180;

// la hora de España (Europe/Madrid) de una fecha: [horas decimales, desfase con UTC en horas, día de la semana 0 = domingo]
function horaEspana(fecha) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    .formatToParts(fecha).map((x) => [x.type, x.value]));
  const h = (+p.hour % 24) + +p.minute / 60 + +p.second / 3600;
  const utc = fecha.getUTCHours() + fecha.getUTCMinutes() / 60 + fecha.getUTCSeconds() / 3600;
  let des = h - utc; if (des > 12) des -= 24; if (des < -12) des += 24;
  return [h, Math.round(des), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday)];
}

// la altura y el rumbo del sol (grados; rumbo desde el norte, por el este) para un día del año y una hora UTC
function posicionSol(diaDelAno, horaUTC) {
  const B = 2 * Math.PI * (diaDelAno - 81) / 364;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // (la ecuación del tiempo, en minutos)
  const decl = 23.44 * Math.sin(2 * Math.PI * (284 + diaDelAno) / 365) * rad;
  const solar = horaUTC * 60 + 4 * LON + eot; // (minutos de tiempo solar)
  const H = (solar / 4 - 180) * rad, lat = LAT * rad;
  const sinE = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const E = Math.asin(Math.max(-1, Math.min(1, sinE)));
  const A = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
  return [E / rad, ((A / rad) % 360 + 360) % 360];
}

// la luna (una cuenta sencilla, de un grado: la longitud y la latitud eclípticas con su término principal, y de ahí la
// altura y el rumbo sobre Guareña) y lo iluminada que está (de 0, nueva, a 1, llena), para una fecha en milisegundos UTC
function posicionLuna(ms) {
  const d = ms / 86400000 - 10957.5; // (días desde el 1 de enero de 2000 a mediodía)
  const L = (218.316 + 13.176396 * d) * rad, M = (134.963 + 13.064993 * d) * rad, F = (93.272 + 13.229350 * d) * rad;
  const lon = L + 6.289 * rad * Math.sin(M), lat = 5.128 * rad * Math.sin(F), e = 23.4397 * rad;
  const ra = Math.atan2(Math.sin(lon) * Math.cos(e) - Math.tan(lat) * Math.sin(e), Math.cos(lon));
  const dec = Math.asin(Math.sin(lat) * Math.cos(e) + Math.cos(lat) * Math.sin(e) * Math.sin(lon));
  const H = (280.16 + 360.9856235 * d) * rad + LON * rad - ra, fi = LAT * rad;
  const alt = Math.asin(Math.sin(fi) * Math.sin(dec) + Math.cos(fi) * Math.cos(dec) * Math.cos(H));
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(fi) - Math.tan(dec) * Math.cos(fi)) + Math.PI;
  const g = (357.528 + 0.9856003 * d) * rad, ls = (280.46 + 0.9856474 * d) * rad + 1.915 * rad * Math.sin(g) + 0.02 * rad * Math.sin(2 * g);
  const fase = (1 - Math.cos(lat) * Math.cos(lon - ls)) / 2, crece = Math.sin(lon - ls) > 0;
  return { alt: alt / rad, az: ((az / rad) % 360 + 360) % 360, fase, crece };
}
// la cara de la luna: un disco gris con mares más oscuros y la parte en sombra según la fase (de un lado si crece, del
// otro si mengua); se rehace al cambiar la fase
function texturaLuna(device, fase, crece) {
  const n = 128, datos = new Uint8Array(n * n * 4), rnd = (i, j) => { const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return s - Math.floor(s); };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * 2 - 1, y = (j + 0.5) / n * 2 - 1, r2 = x * x + y * y, k = (j * n + i) * 4;
    if (r2 > 1) { datos[k + 3] = 0; continue; }
    const z = Math.sqrt(1 - r2);
    // (la luz del sol sobre la esfera: el terminador va de un borde al otro con la fase)
    const ang = Math.acos(1 - 2 * fase), lx = (crece ? -1 : 1) * Math.sin(ang), lz = -Math.cos(ang); // (el disco se ve reflejado: creciente, iluminada a la derecha)
    const luz = Math.max(0, Math.min(1, (x * lx + z * lz) * 6 + 0.5));
    const mar = (Math.sin(x * 5.1 + 1.3) * Math.cos(y * 4.3 - 0.4) + Math.sin(x * 9.7 - y * 7.9)) * 0.08 + rnd(i >> 2, j >> 2) * 0.06;
    const c = Math.round(255 * Math.max(0.06, (0.86 - mar) * (0.1 + 0.9 * luz)));
    datos[k] = c; datos[k + 1] = c; datos[k + 2] = Math.min(255, c + 6); datos[k + 3] = Math.round(255 * Math.min(1, (1 - r2) * 40));
  }
  const t = new Texture(device, { width: n, height: n, mipmaps: true, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'luna' });
  t.lock().set(datos); t.unlock(); return t;
}

const mezcla = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
const mezclaColor = (c, a, b, t) => { t = Math.max(0, Math.min(1, t)); c.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); return c; };

// un charco de luz: un círculo blanco que se apaga hacia fuera (para el suelo y la pared bajo cada farol)
function texturaCharco(device) {
  const n = 64, datos = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = Math.hypot(i - n / 2 + 0.5, j - n / 2 + 0.5) / (n / 2), a = Math.max(0, 1 - d) ** 2.2, k = (j * n + i) * 4;
    datos[k] = Math.round(255 * a); datos[k + 1] = Math.round(200 * a); datos[k + 2] = Math.round(130 * a); datos[k + 3] = Math.round(a * 255); // (la caída, en el color: al sumarse, el alfa no cuenta)
  }
  const t = new Texture(device, { width: n, height: n, mipmaps: true, addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, name: 'charco_luz' });
  t.lock().set(datos); t.unlock(); return t;
}

// (interior: la planta de la iglesia, iglesia_planta.json: dentro, de noche, sus lámparas encendidas: la luz de ambiente no baja de la mitad)
export function montarReloj({ app, sol, rebote, post, escena, q, vida, hud, interior = null }) {
  const base = { luz: sol.light ? sol.light.intensity : 2, amb: app.scene.skyboxIntensity, exposicion: app.scene.exposure,
    color: sol.light ? [sol.light.color.r, sol.light.color.g, sol.light.color.b] : [1, 1, 1], niebla: [app.scene.fog.color.r, app.scene.fog.color.g, app.scene.fog.color.b], rebote: rebote?.light?.intensity || 0 };
  const ahora = new Date();
  let [hora, desfase, diaSemana] = horaEspana(ahora);
  const inicio = q.get('hora');
  if (inicio) { const [h, m] = inicio.split(':').map(Number); hora = (h || 0) + (m || 0) / 60; }
  const ritmo = parseFloat(q.get('ritmo') ?? (inicio ? '0' : String(24 * 60 / (3 * 3600)))); // (minutos del juego por segundo de verdad: un día en 3 horas)
  const inicioAno = Date.UTC(ahora.getUTCFullYear(), 0, 0); const diaDelAno = Math.floor((ahora - inicioAno) / 86400000);
  const estado = { hora, diaSemana, dia: 0, sol: [0, 0], noche: 0, luna: null, clima: { sol: 1, cielo: 1, niebla: 0, gris: 0, texto: '' } };
  const clima = estado.clima;
  // la luna: un disco que mira siempre a la cámara, a 900 m en su dirección, sin bruma; su cara, según la fase
  let lunaE = null, lunaMat = null, lunaFase = -1;
  const ponerLuna = (luna, E) => {
    if (!luna || q.get('luna') === '0') return;
    const ve = luna.alt > -3 && E < 10;
    if (!lunaE) {
      if (!ve) return;
      lunaMat = new StandardMaterial(); lunaMat.diffuse = new Color(0, 0, 0); lunaMat.emissive = new Color(1, 1, 1); lunaMat.useLighting = false; lunaMat.useFog = false;
      lunaMat.blendType = 2; lunaMat.depthWrite = false; lunaMat.cull = CULLFACE_NONE; // (2: BLEND_NORMAL)
      lunaE = new Entity('luna'); lunaE.addComponent('render', { type: 'plane', material: lunaMat, castShadows: false, receiveShadows: false }); app.root.addChild(lunaE);
    }
    lunaE.enabled = ve; if (!ve) return;
    const f = Math.round(luna.fase * 40) / 40;
    if (Math.abs(f - lunaFase) > 0.001) { lunaFase = f; const tx = texturaLuna(app.graphicsDevice, f, luna.crece); lunaMat.emissiveMap?.destroy?.(); lunaMat.emissiveMap = tx; lunaMat.opacityMap = tx; lunaMat.opacityMapChannel = 'a'; }
    // (de día casi no se ve; al anochecer aparece)
    lunaMat.emissiveIntensity = mezcla(0.35, 1.6, (2 - E) / 10) * mezcla(1, 0.35, clima.gris); lunaMat.opacity = mezcla(0.25, 1, (4 - E) / 10) * mezcla(1, 0.25, clima.gris); lunaMat.update();
    lunaE._dir = [Math.sin(luna.az * rad) * Math.cos(luna.alt * rad), Math.sin(luna.alt * rad), -Math.cos(luna.az * rad) * Math.cos(luna.alt * rad)];
  };

  // la pastilla de la hora, arriba en el centro (como los rótulos: docs/estilo.md); tocarla adelanta una hora
  const pastilla = document.createElement('button'); pastilla.id = 'reloj'; pastilla.type = 'button'; pastilla.title = 'La hora del pueblo (T adelanta una hora)';
  const css = document.createElement('style');
  css.textContent = `#reloj { position: fixed; top: calc(10px + env(safe-area-inset-top, 0px)); left: 50%; transform: translateX(-50%); padding: 7px 14px; background: var(--velo, rgba(7, 10, 20, .62));
    border: 1px solid var(--linea, rgba(186, 198, 255, .16)); border-radius: 999px; color: var(--cal, #eef0ec); font: 500 11px/1.3 var(--f-mono, ui-monospace, Menlo, monospace); letter-spacing: .09em;
    text-transform: uppercase; font-variant-numeric: tabular-nums; cursor: pointer; z-index: 5; -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px); }
    #reloj b { color: var(--sodio, #ffa94d); font-weight: 500; }
    #reloj { white-space: nowrap; }
    @media (max-width: 760px) { #reloj { top: calc(54px + env(safe-area-inset-top, 0px)); left: calc(10px + env(safe-area-inset-left, 0px)); transform: none; } #reloj .dia { display: none; } }`;   /* (en el móvil, a la izquierda: en el centro pisaba «Crea tu personaje») */
  document.head.appendChild(css); document.body.appendChild(pastilla);
  if (q.get('reloj') === '0') pastilla.hidden = true;
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const parte = (h) => (h < 6 ? 'madrugada' : h < 12.5 ? 'mañana' : h < 15 ? 'mediodía' : h < 20.5 ? 'tarde' : 'noche');
  const pintarPastilla = () => {
    const h = Math.floor(estado.hora), m = Math.floor((estado.hora - h) * 60);
    const t = `<b>${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}</b><span class="dia"> · ${DIAS[((estado.diaSemana + estado.dia) % 7 + 7) % 7]}</span> · ${parte(estado.hora)}${clima.texto ? `<span class="dia"> · ${clima.texto}</span>` : ''}`; // (en el móvil, sin el día ni el tiempo: no cabían)
    if (t !== pastilla._t) { pastilla._t = t; pastilla.innerHTML = t; } // (solo si cambia: rehacerlo cada vez dejaba a veces una cifra a medio pintar)
  };
  const adelantar = (horas) => { estado.hora += horas; while (estado.hora >= 24) { estado.hora -= 24; estado.dia++; } while (estado.hora < 0) { estado.hora += 24; estado.dia--; } aplicar(true); };
  pastilla.addEventListener('click', () => adelantar(1));
  for (const ev of ['pointerdown', 'pointerup', 'touchstart']) pastilla.addEventListener(ev, (e) => e.stopPropagation()); // (que el toque no mueva la cámara)
  addEventListener('keydown', (e) => { if (e.code === 'KeyT' && !e.repeat && !e.ctrlKey && !e.metaKey) adelantar(e.shiftKey ? -1 : 1); });

  // los faroles: sus materiales (de materiales.glb y de la iglesia) y los charcos de luz cerca de la cámara
  const farolesMat = new Set();
  const buscarMateriales = () => {
    for (const a of app.assets.list()) {
      if (a.type !== 'container' || !a.resource?.materials) continue;
      for (const m of a.resource.materials) { const mt = m.resource; if (mt && /^(farol|farola_cristal|glass(\.\d+)?)$/.test(mt.name) && !farolesMat.has(mt)) { farolesMat.add(mt); mt._luzFarol = { emissive: mt.emissive.clone(), int: mt.emissiveIntensity, map: mt.emissiveMap }; } }
    }
  };
  const lista = (vida?.faroles || []).map((f) => [f.p[0] + (f.mira ? f.mira[0] * 1.1 : 0), f.p[1], f.p[2] + (f.mira ? f.mira[1] * 1.1 : 0)]); // (el charco, algo separado de la pared)
  // el suelo bajo cada farol, con un rayo (la física es plana: la acera o la calzada), una vez
  const sueloDe = new Map(), va_ = new Vec3(), vb_ = new Vec3();
  const sueloBajo = (p) => {
    const k = p[0].toFixed(1) + ',' + p[2].toFixed(1); if (sueloDe.has(k)) return sueloDe.get(k);
    const h = app.systems.rigidbody?.raycastFirst(va_.set(p[0], p[1] - 0.4, p[2]), vb_.set(p[0], p[1] - 8, p[2]));
    const y = h ? h.point.y : p[1] - 3.2; sueloDe.set(k, y); return y;
  };
  let charcos = null, matCharco = null, ultimoSitio = null;
  const hacerCharcos = (c) => {
    if (!lista.length) return;
    if (!matCharco) {
      matCharco = new StandardMaterial(); matCharco.diffuse = new Color(0, 0, 0); matCharco.emissive = new Color(1, 0.78, 0.5); matCharco.emissiveMap = texturaCharco(app.graphicsDevice);
      matCharco.opacityMap = matCharco.emissiveMap; matCharco.opacityMapChannel = 'a'; matCharco.blendType = BLEND_ADDITIVE; matCharco.depthWrite = false; matCharco.cull = CULLFACE_NONE;
      matCharco.useLighting = false; matCharco.useFog = true; matCharco.update();
    }
    const cerca = lista.filter((p) => Math.hypot(p[0] - c.x, p[2] - c.z) < 120).slice(0, 220);
    const pos = [], uv = [], nor = [], ind = [];
    for (const p of cerca) {
      const y0 = sueloBajo(p) + 0.03, r = 3.2;
      const k = pos.length / 3;
      pos.push(p[0] - r, y0, p[2] - r, p[0] + r, y0, p[2] - r, p[0] + r, y0, p[2] + r, p[0] - r, y0, p[2] + r);
      uv.push(0, 0, 1, 0, 1, 1, 0, 1); nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); ind.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    if (!pos.length) return;
    // (con normales: sin ellas, WebGPU no podía montar su sombreado y no se dibujaba nada)
    const mesh = new Mesh(app.graphicsDevice); mesh.setPositions(pos); mesh.setNormals(nor); mesh.setUvs(0, uv); mesh.setIndices(ind); mesh.update(PRIMITIVE_TRIANGLES);
    if (charcos) charcos.destroy();
    charcos = new Entity('charcos_de_luz'); charcos.addComponent('render', { meshInstances: [new MeshInstance(mesh, matCharco)], castShadows: false, receiveShadows: false });
    app.root.addChild(charcos);
  };

  let dentro = 0, dentroAplicado = 0; // (de 0, fuera, a 1, dentro de la iglesia; suave al cruzar la puerta)
  let camE = null, planta = null;
  if (interior) fetch(interior).then((r) => r.json()).then((j) => { planta = j.planta; }).catch(() => {});
  const enPlanta = (x, z) => { let d = false; for (let i = 0, j = planta.length - 1; i < planta.length; j = i++) { const [xi, zi] = planta[i], [xj, zj] = planta[j]; if ((zi > z) !== (zj > z) && x < xi + (z - zi) * (xj - xi) / (zj - zi)) d = !d; } return d; };
  const cSol = new Color(), cNiebla = new Color(), arriba = new Vec3(), qr = new Quat();
  let ultimoAplicado = -1;
  function aplicar(forzar = false) {
    if (!forzar && Math.abs(estado.hora - ultimoAplicado) < 1 / 120) return; // (cada medio minuto del juego)
    ultimoAplicado = estado.hora;
    const horaUTC = ((estado.hora - desfase) % 24 + 24) % 24;
    const [E, A] = posicionSol(diaDelAno + estado.dia, horaUTC); estado.sol = [E, A];
    // de día (el sol arriba) a noche: 1 de día, 0 de noche, pasando por el crepúsculo (de 6° sobre el horizonte a −8°)
    const dia = Math.max(0, Math.min(1, (E + 8) / 14)); estado.noche = 1 - dia;
    // (la luz del cielo cae mucho antes que la del sol: a 22°, la de la tarde con la que se ajustó la escena, y con el sol poniéndose, poco más de un cuarto)
    const cielo = Math.max(0, Math.min(1, (E + 6) / 28));
    // el sol, o de noche la luna desde donde está (sin ella en el cielo, una luz de estrellas, alta y muy floja)
    const luna = posicionLuna(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()) + (estado.dia * 24 + estado.hora - desfase) * 3600000);
    estado.luna = luna;
    const conLuna = luna.alt > 2;
    const e_ = E > -2 ? Math.max(E, 2) : conLuna ? luna.alt : 70, a_ = E > -2 ? A : conLuna ? luna.az : 180;
    arriba.set(Math.sin(a_ * rad) * Math.cos(e_ * rad), Math.sin(e_ * rad), -Math.cos(a_ * rad) * Math.cos(e_ * rad)).normalize();
    // (una direccional alumbra a lo largo de su −y: su +y, hacia el sol)
    const eje = new Vec3().cross(Vec3.UP, arriba); const ang = Math.acos(Math.max(-1, Math.min(1, arriba.y))) / rad;
    if (eje.length() < 1e-6) sol.setRotation(Quat.IDENTITY); else sol.setRotation(qr.setFromAxisAngle(eje.normalize(), ang));
    if (sol.light) {
      const alto = Math.max(0, Math.min(1, (E - 2) / 40)); // (0 al ponerse, 1 a 42° y más)
      const calido = [1, 0.62, 0.36], tarde = base.color, mediodia = [1, 0.96, 0.88];
      if (E > -2) {
        if (alto < 0.55) mezclaColor(cSol, calido, tarde, alto / 0.55); else mezclaColor(cSol, tarde, mediodia, (alto - 0.55) / 0.45);
        sol.light.color = cSol; sol.light.intensity = base.luz * mezcla(0.25, 1.05, Math.sqrt(Math.max(0, (E + 2) / 30)));
      } else { sol.light.color = cSol.set(0.55, 0.65, 0.95); sol.light.intensity = base.luz * (conLuna ? (0.02 + 0.07 * luna.fase) * Math.min(1, luna.alt / 15) : 0.015); }
      sol.light.intensity *= clima.sol; // (las nubes apagan la luz directa: src/tiempo.js)
    }
    if (rebote?.light) {
      const u = sol.up, h = Math.hypot(u.x, u.z) || 1, d = new Vec3(-u.x / h, -0.45, -u.z / h).normalize(), ej = new Vec3().cross(Vec3.UP, d);
      rebote.setRotation(new Quat().setFromAxisAngle(ej.normalize(), Math.acos(d.y) / rad)); rebote.light.intensity = base.rebote * mezcla(0.08, 1, cielo);
    }
    // el cielo y la luz de ambiente, la exposición y la bruma
    app.scene.skyboxIntensity = base.amb * Math.max(mezcla(0.012, 1, cielo ** 1.2), 0.62 * dentro) * mezcla(1, clima.cielo, 1 - dentro); // (de noche, 0,025: medido a ojo, el cielo casi negro y la calle a oscuras salvo los faroles)
    app.scene.exposure = base.exposicion;
    mezclaColor(cNiebla, [0.06, 0.08, 0.13], E < 8 && E > -8 ? [0.86, 0.68, 0.55] : base.niebla, E < 8 && E > -8 ? 1 - Math.abs(E) / 8 : dia);
    if (E >= 8) cNiebla.set(...base.niebla);
    // (nublado o con lluvia, la bruma, gris; y más espesa con niebla o lluvia: src/tiempo.js)
    if (clima.gris > 0) { const g = (cNiebla.r + cNiebla.g + cNiebla.b) / 3; cNiebla.set(mezcla(cNiebla.r, g * 0.92, clima.gris), mezcla(cNiebla.g, g * 0.95, clima.gris), mezcla(cNiebla.b, g, clima.gris)); }
    app.scene.fog.color = cNiebla;
    app.scene.fog.density = (base.densidad ?? (base.densidad = app.scene.fog.density)) * (1 + clima.niebla * (1 - dentro * 0.8));
    // la luna en el cielo
    ponerLuna(luna, E);
    // los faroles: se encienden al anochecer y se apagan al amanecer (con el sol a 4° y más, apagados)
    const luz = Math.max(0, Math.min(1, (4 - E) / 8));
    if (luz > 0) buscarMateriales();
    for (const mt of farolesMat) {
      if (luz > 0) { mt.emissive = cSol.set(1, 0.82, 0.55); mt.emissiveMap = mt.diffuseMap || mt._luzFarol.map; mt.emissiveIntensity = 2.2 * luz; }
      else { mt.emissive = mt._luzFarol.emissive; mt.emissiveMap = mt._luzFarol.map; mt.emissiveIntensity = mt._luzFarol.int; }
      mt.update();
    }
    if (matCharco) { matCharco.emissiveIntensity = 0.8 * luz; matCharco.update(); }
    if (charcos) charcos.enabled = luz > 0.01;
    estado.faroles = luz;
    pintarPastilla();
  }

  let cuenta = 0;
  app.on('update', (dt) => {
    if (ritmo) { estado.hora += ritmo * dt / 60; if (estado.hora >= 24) { estado.hora -= 24; estado.dia++; } }
    if (planta) {
      camE ||= app.root.findByName('camara'); const c = camE?.getPosition();
      const quiere = c && c.y < 15 && enPlanta(c.x, c.z) ? 1 : 0;
      dentro += (quiere - dentro) * Math.min(1, dt * 2.5);
      if (Math.abs(dentro - dentroAplicado) > 0.02 || (quiere !== dentroAplicado && Math.abs(dentro - quiere) < 0.02)) { dentroAplicado = dentro; aplicar(true); }
    }
    aplicar();
    if (lunaE?.enabled && lunaE._dir) {
      camE ||= app.root.findByName('camara'); const c = camE?.getPosition();
      if (c) { const d = lunaE._dir; lunaE.setPosition(c.x + d[0] * 900, c.y + d[1] * 900, c.z + d[2] * 900); lunaE.lookAt(c); lunaE.rotateLocal(90, 0, 0); lunaE.setLocalScale(26, 26, 26); }
    }
    // (los charcos de luz, rehechos al moverse 40 m)
    if (estado.faroles > 0.01 && (cuenta++ % 30) === 0) {
      camE ||= app.root.findByName('camara'); const c = camE?.getPosition();
      if (c && (!ultimoSitio || Math.hypot(c.x - ultimoSitio[0], c.z - ultimoSitio[1]) > 40)) { ultimoSitio = [c.x, c.z]; hacerCharcos(c); if (charcos) charcos.enabled = true; }
    }
  });
  aplicar(true);
  return Object.assign(estado, { adelantar, poner: (h) => { estado.hora = h; aplicar(true); }, aplicar });
}
