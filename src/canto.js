// El canto gregoriano de dentro de la iglesia de Santa María (docs/iglesia.md). El usuario, el 14-11-2026: «cuando entres,
// quiero que se escuche música de fondo gregoriana. Solo cuando estás dentro de la iglesia». Tres piezas de la Schola
// Gregoriana (Wikimedia Commons, CC BY-SA 3.0: CREDITOS.md) en una pista de casi seis minutos, en bucle:
// escenas/guarena/canto_iglesia.m4a (la monta tools/canto_iglesia.py; AAC, que suena en todos los navegadores).
// No se baja al empezar (son 2,7 MB que no hacen falta para el primer fotograma): se pide al acercarse a la iglesia y suena
// por un elemento de audio metido en el Web Audio de src/sonido.js, así que obedece a su volumen (?volumen=) y a su tecla
// M. Solo se oye con la chica dentro de la planta de la iglesia (escenas/guarena/iglesia_planta.json: la escribe
// tools/blender/iglesia.py, en coordenadas del juego): al entrar sube en un par de segundos y al salir se apaga igual; y
// mientras está dentro, lo de la calle (el fondo, los pájaros, la radio, los coches) se oye más bajo y apagado, como
// tras los muros. Fuera, el audio se para. ?canto=0 lo quita; ?sonido=0 quita todo el sonido.
const VOLUMEN = 0.85; // (sobre el volumen general: el canto, normalizado a −20 dB, queda como un fondo que no tapa los pasos)

export function montarCanto({ app, sonido, ctrl, url, planta, q }) {
  if (!sonido || !url || !planta || q.get('canto') === '0') return null;
  const { ctx, general, calle } = sonido;
  const estado = { dentro: false, sonando: false, cargado: false, volumen: 0 };
  let P = null, centro = null, el = null, gan = null, fuera = 0, antes = null;
  fetch(planta).then((r) => r.json()).then((j) => {
    P = j; const n = j.planta.length;
    centro = j.planta.reduce((a, p) => [a[0] + p[0] / n, a[1] + p[1] / n], [0, 0]);
  }).catch((e) => console.warn('canto: sin la planta de la iglesia', e));
  // (dentro de la planta: el rayo de siempre, contando cruces)
  const dentroDe = (x, z) => {
    let c = false; const pl = P.planta;
    for (let i = 0, j = pl.length - 1; i < pl.length; j = i++) {
      const [xi, zi] = pl[i], [xj, zj] = pl[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  const preparar = () => {
    el = new Audio(); el.crossOrigin = 'anonymous'; el.loop = true; el.preload = 'auto'; el.src = url;
    el.addEventListener('canplaythrough', () => { estado.cargado = true; }, { once: true });
    el.addEventListener('error', () => console.warn('canto: no se pudo cargar', url));
    gan = ctx.createGain(); gan.gain.value = 0;
    ctx.createMediaElementSource(el).connect(gan); gan.connect(general);
  };
  let n = 0;
  app.on('update', () => {
    if (!P || n++ % 6) return; // (diez veces por segundo basta)
    const p = ctrl.getPosition();
    if (!el && Math.hypot(p.x - centro[0], p.z - centro[1]) < 110) preparar();
    if (!el) return;
    const dentro = dentroDe(p.x, p.z) && p.y > P.suelo - 1 && p.y < P.suelo + P.alto;
    if (dentro !== antes) {
      antes = dentro; estado.dentro = dentro;
      const t = ctx.currentTime;
      gan.gain.cancelScheduledValues(t); gan.gain.setTargetAtTime(dentro ? VOLUMEN : 0, t, dentro ? 0.7 : 0.5);
      if (calle) { calle.gan.gain.setTargetAtTime(dentro ? 0.35 : 1, t, 0.5); calle.filtro.frequency.setTargetAtTime(dentro ? 900 : 20000, t, 0.4); }
    }
    // (que suene solo mientras hace falta: dentro, o saliendo, hasta que se ha apagado; el navegador no deja empezar sin
    // que el jugador haya tocado algo, y entonces el contexto aún no corre)
    if (dentro) fuera = 0; else fuera += 0.1;
    if (dentro && el.paused && ctx.state === 'running') el.play().then(() => { estado.sonando = true; }).catch(() => {});
    if (!dentro && fuera > 4 && !el.paused) { el.pause(); estado.sonando = false; }
    estado.volumen = Math.round(gan.gain.value * 100) / 100; estado.tiempo = Math.round(el.currentTime * 10) / 10; // (para las pruebas: window.foto.canto)
  });
  return estado;
}
