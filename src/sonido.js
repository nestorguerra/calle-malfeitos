// El sonido de la calle (fase 5 del plan de calidad): el fondo de una tarde de verano, vencejos que pasan chillando por
// encima de los tejados, gorriones, una radio por una ventana, un perro lejos, las campanadas de la hora, la tela de
// los toldos con el viento y los pasos de la chica, que suenan distinto en la baldosa de la acera, el asfalto y el
// granito de los peldaños. Grabaciones CC0 (CREDITOS.md) montadas por tools/sonidos.py. Con Web Audio: cada sonido
// con sitio va por un panner HRTF y el oído sigue a la cámara. Arranca con el primer clic o tecla (el navegador no
// deja sonar antes); ?sonido=0 lo quita, ?volumen= lo cambia (de serie 0,4: bajo, a petición), la tecla M lo silencia.
import { Vec3 } from 'playcanvas';

export function montarSonido({ app, camara, ctrl, muneco, carpeta, vida, suelo, viento, q, despues }) {
  if (q.get('sonido') === '0') return null;
  const ctx = new AudioContext();
  const general = ctx.createGain(); general.gain.value = parseFloat(q.get('volumen') || '0.4');
  // (un compresor suave a la salida: nada salta por encima del resto, como en la calle de verdad)
  const suave = new DynamicsCompressorNode(ctx, { threshold: -24, knee: 18, ratio: 3, attack: 0.01, release: 0.4 });
  general.connect(suave); suave.connect(ctx.destination);
  const salida = ctx.createMediaStreamDestination(); general.connect(salida); // (para grabar el vídeo con sonido: tools/video.py)
  const buf = {}, api = {};
  // (todos en un solo WAV, ambiente.wav, con su índice en ambiente.json: se descodifica una vez y cada sonido es un trozo)
  const paquete = (async () => {
    await despues; // (cuando el juego ya está listo: son 7,5 MB que no hacen falta para el primer fotograma, src/main.js)
    const [ind, bin] = await Promise.all([fetch(carpeta + 'ambiente.json').then((r) => r.json()), fetch(carpeta + 'ambiente.wav').then((r) => r.arrayBuffer())]);
    return { ind: ind.paquete, todo: await ctx.decodeAudioData(bin) };
  })();
  const cargar = async (n) => {
    try {
      const { ind, todo } = await paquete, [a, l] = ind[n], k = todo.sampleRate / 22050; // (el navegador puede descodificarlo a su propia frecuencia)
      const b = ctx.createBuffer(1, Math.round(l * k), todo.sampleRate); b.copyToChannel(todo.getChannelData(0).subarray(Math.round(a * k), Math.round((a + l) * k)), 0); buf[n] = b;
    } catch (e) { console.warn('sonido', n, e); }
  };
  const azar = (a, b) => a + Math.random() * (b - a);
  const uno = (lista) => lista[Math.floor(Math.random() * lista.length)];

  // (el navegador no deja sonar hasta que el jugador hace algo; las pruebas, con --mute-audio, siguen en silencio)
  const despertar = () => { if (ctx.state !== 'running') ctx.resume(); };
  addEventListener('pointerdown', despertar); addEventListener('keydown', (e) => { despertar(); if (e.code === 'KeyM') general.gain.value = general.gain.value > 0 ? 0 : parseFloat(q.get('volumen') || '0.4'); });

  // un panner en un sitio del mundo (o que se mueve): de 1 m a 60 m, cae como en la calle de verdad
  const panner = (p, ref = 3, max = 80) => {
    const pn = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: ref, maxDistance: max, rolloffFactor: 1.1 });
    pn.positionX.value = p[0]; pn.positionY.value = p[1]; pn.positionZ.value = p[2];
    pn.connect(general); return pn;
  };
  const sonar = (nombre, destino, { gan = 1, tono = 1, cuando = 0, bucle = false } = {}) => {
    const b = buf[nombre]; if (!b) return null;
    const s = ctx.createBufferSource(); s.buffer = b; s.loop = bucle; s.playbackRate.value = tono;
    const g = ctx.createGain(); g.gain.value = gan; s.connect(g); g.connect(destino);
    s.start(ctx.currentTime + cuando, bucle ? Math.random() * b.duration : 0); return { s, g };
  };

  // ---- lo que suena siempre: el fondo (sin sitio), los gorriones y la radio (en sitios fijos), la tela de los toldos
  const fijos = [];
  const cerca = (lista, n, z0, z1) => lista.filter((v) => v.p[2] > z0 && v.p[2] < z1).sort(() => Math.random() - 0.5).slice(0, n);
  const empezarFijos = () => {
    // (10-11-2026, el usuario: «el sonido de andar más bajo, más normal, y los pájaros y el sonido ambiente más bajito en
    // general, más solo un ambiente». Todo lo de la calle, a la mitad o menos: fondo −4 dB; pájaros, radio, perro,
    // campanas y toldos, de −5 a −9 dB; los pasos, −7 dB. El motor de los coches, igual)
    sonar('fondo', general, { gan: 0.25, bucle: true });
    // los gorriones, en un par de aleros del tramo que se anda (a 20–40 m y a 60–80 m del cruce con Nueva)
    for (const [z0, z1] of [[20, 40], [60, 80]]) for (const a of cerca(vida.aleros.map((x) => ({ p: x.a })), 1, z0, z1)) fijos.push(sonar('gorriones', panner(a.p, 4), { gan: 0.12, bucle: true }));
    // la radio: una ventana de la primera planta, hacia la mitad del tramo
    const v = cerca(vida.ventanas.filter((x) => x.p[1] < 6), 1, 40, 60)[0];
    if (v) fijos.push(sonar('radio', panner([v.p[0] - v.n[0] * 0.5, v.p[1], v.p[2] - v.n[1] * 0.5], 1.5, 30), { gan: 0.12, bucle: true }));
    // la tela de los toldos: sube con las rachas
    for (const t of vida.toldos) { const m = t.a.map((x, i) => (x + t.b[i]) / 2); const s = sonar('tela', panner(m, 2, 30), { gan: 0.08, bucle: true }); if (s) telas.push(s); }
  };
  const telas = [];

  // ---- lo que suena de vez en cuando: vencejos que cruzan (moviéndose), un perro lejos, las campanadas de la hora
  const pendientes = { vencejos: azar(2, 6), perro: azar(15, 40), arrullo: azar(8, 20) };
  const volando = [];
  const vencejos = () => {
    // (un trío que cruza la calle a 12–20 m de alto, a 25–40 m/s, cerca de donde está la chica)
    const p = ctrl.getPosition(), r = azar(0, Math.PI * 2), h = azar(12, 20), v = azar(25, 40), L = 70;
    const pn = panner([0, 0, 0], 6, 120);
    const desde = new Vec3(p.x - Math.sin(r) * L / 2 + azar(-8, 8), h, p.z - Math.cos(r) * L / 2 + azar(-8, 8));
    const s = sonar('vencejos' + Math.floor(Math.random() * 6), pn, { gan: 0.16, tono: azar(0.95, 1.08) });
    const dir = new Vec3(Math.sin(r) * v, 0, Math.cos(r) * v);
    if (s) volando.push({ pn, desde, dir, t: 0, fin: s.s.buffer.duration });
    if (api.alPasar) api.alPasar(desde.clone(), dir.clone(), s ? s.s.buffer.duration : 3); // (los vencejos que se ven, por el mismo camino: src/vida.js)
  };
  const ladrido = () => {
    // (un perro en un patio, a 40–70 m: dos o tres ladridos)
    const p = ctrl.getPosition(), r = azar(0, Math.PI * 2), d = azar(40, 70);
    const pn = panner([p.x + Math.sin(r) * d, 1.5, p.z + Math.cos(r) * d], 3, 120);
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2200 }); lp.connect(pn); // (lejos y tras las casas: sin agudos)
    let t = 0; for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) { sonar('ladrido', lp, { gan: 0.2, tono: azar(0.96, 1.04), cuando: t }); t += azar(0.45, 0.9); }
  };
  const arrullo = () => {
    // (unas palomas en el alero más cercano)
    const p = ctrl.getPosition(); let mejor = null, dm = 1e9;
    for (const a of vida.aleros) { const m = [(a.a[0] + a.b[0]) / 2, a.a[1], (a.a[2] + a.b[2]) / 2], d = Math.hypot(m[0] - p.x, m[2] - p.z); if (d > 6 && d < dm) { dm = d; mejor = m; } }
    if (mejor && dm < 30) sonar('arrullo' + Math.floor(Math.random() * 3), panner(mejor, 2, 40), { gan: 0.14 });
  };
  // las campanadas: a cada hora en punto, las de la hora (de 1 a 12), y una a la media; ?campanas=N, N al empezar
  const torre = [vida.aleros.length ? vida.aleros[0].a[0] + 60 : 60, 25, -40];
  const campanadas = (n) => { const pn = panner(torre, 30, 400); const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3500 }); lp.connect(pn); for (let i = 0; i < n; i++) sonar('campanada', lp, { gan: 0.3, cuando: i * 2.6 }); };
  let ultimoMinuto = -1;
  const reloj = () => {
    const h = new Date(); const m = h.getHours() * 60 + h.getMinutes();
    if (m === ultimoMinuto) return; ultimoMinuto = m;
    if (h.getMinutes() === 0) campanadas(h.getHours() % 12 || 12); else if (h.getMinutes() === 30) campanadas(1);
  };

  // ---- los pasos: cuando un pie baja hasta el suelo (sus huesos, después de la animación)
  const pies = ['mixamorig:LeftFoot', 'mixamorig:RightFoot'].map((n) => ({ e: muneco.findByName(n), min: 1e9, arriba: true }));
  const pasoDe = (y) => { const b = vida.bordillo; return y > b + 0.07 ? 'bordillo' : y > b * 0.5 ? 'baldosa' : 'asfalto'; };
  const cuantos = { baldosa: 6, asfalto: 8, bordillo: 8 };
  const dados = { baldosa: 0, asfalto: 0, bordillo: 0 }; // (los pasos que han sonado, por suelo: para las pruebas)
  const pasos = (dt) => {
    const v = ctrl.rigidbody.linearVelocity, rapidez = Math.hypot(v.x, v.z);
    const yS = suelo();
    for (const pie of pies) {
      if (!pie.e) continue;
      const h = pie.e.getPosition().y - yS;
      pie.min = Math.min(pie.min + dt * 0.02, h); // (el más bajo, que sube despacio: se adapta a cada animación)
      if (pie.arriba && h < pie.min + 0.03 && rapidez > 0.4 && Math.abs(v.y) < 1.5) {
        pie.arriba = false;
        const s = pasoDe(yS), correr = rapidez > 2.2; dados[s]++;
        sonar('paso_' + s + Math.floor(Math.random() * cuantos[s]), pasosBus, { gan: (correr ? 0.19 : 0.105) * azar(0.85, 1.1), tono: azar(0.93, 1.07) });
      } else if (!pie.arriba && h > pie.min + 0.07) pie.arriba = true;
    }
  };
  const pasosBus = ctx.createGain(); pasosBus.gain.value = 0.9; pasosBus.connect(general);

  // ---- cada fotograma: el oído en la cámara, lo que vuela, lo pendiente, los pasos
  const fw = new Vec3(), up = new Vec3();
  let empezado = false, t = 0;
  const L = ctx.listener;
  app.on('update', (dt) => {
    if (ctx.state !== 'running') return;
    if (!empezado) {
      empezado = true; empezarFijos(); reloj();
      if (q.get('campanas')) campanadas(parseInt(q.get('campanas'), 10) || 3);
    }
    t += dt;
    const c = camara.getPosition(); fw.copy(camara.forward); up.copy(camara.up);
    const ct = ctx.currentTime + 0.02;
    L.positionX.setTargetAtTime(c.x, ct, 0.02); L.positionY.setTargetAtTime(c.y, ct, 0.02); L.positionZ.setTargetAtTime(c.z, ct, 0.02);
    L.forwardX.setTargetAtTime(fw.x, ct, 0.02); L.forwardY.setTargetAtTime(fw.y, ct, 0.02); L.forwardZ.setTargetAtTime(fw.z, ct, 0.02);
    L.upX.setTargetAtTime(up.x, ct, 0.02); L.upY.setTargetAtTime(up.y, ct, 0.02); L.upZ.setTargetAtTime(up.z, ct, 0.02);
    for (let i = volando.length - 1; i >= 0; i--) {
      const b = volando[i]; b.t += dt;
      const p = [b.desde.x + b.dir.x * b.t, b.desde.y, b.desde.z + b.dir.z * b.t];
      b.pn.positionX.setTargetAtTime(p[0], ct, 0.03); b.pn.positionY.setTargetAtTime(p[1], ct, 0.03); b.pn.positionZ.setTargetAtTime(p[2], ct, 0.03);
      if (b.t > b.fin + 0.5) { b.pn.disconnect(); volando.splice(i, 1); }
    }
    for (const k of Object.keys(pendientes)) {
      pendientes[k] -= dt;
      if (pendientes[k] > 0) continue;
      if (k === 'vencejos') { vencejos(); if (Math.random() < 0.5) setTimeout(vencejos, azar(300, 1200)); pendientes[k] = azar(4, 12); }
      if (k === 'perro') { ladrido(); pendientes[k] = azar(25, 70); }
      if (k === 'arrullo') { arrullo(); pendientes[k] = azar(10, 25); }
    }
    const w = viento(t);
    for (const s of telas) s.g.gain.setTargetAtTime(0.015 + 0.11 * w, ct, 0.3);
    pasos(dt);
    if ((Math.floor(t) & 7) === 0) reloj();
  });

  // la carga: después de la calle, sin prisa; lo que falte simplemente no suena
  const nombres = ['fondo', 'gorriones', 'radio', 'tela', 'ladrido', 'campanada', 'motor', ...[0, 1, 2].map((i) => 'arrullo' + i),
    ...[0, 1, 2, 3, 4, 5].map((i) => 'vencejos' + i), ...Object.entries(cuantos).flatMap(([k, n]) => [...Array(n).keys()].map((i) => 'paso_' + k + i))];
  const listo = Promise.all(nombres.map(cargar));
  Object.assign(api, { ctx, general, salida, sonar, panner, buf, listo, despertar, azar, dados });
  return api;
}
