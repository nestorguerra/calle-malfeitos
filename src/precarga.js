// La precarga desde 388 Pueblos (https://pueblos388.onrender.com): la web monta el juego, invisible, con
// ?desde=388&precarga=1 en cuanto se abre su portada (o la página de Guareña) y el juego no arranca: solo baja, en orden
// y por detrás, todo lo que va a pedir al empezar (escenas/<escena>/precarga.json, lo saca tools/precarga.py de una
// carga de verdad: los .glb del pueblo, las zonas de la salida, el motor, la chica, los sonidos…). No guarda nada: lo
// lee y lo suelta, y queda en la caché del navegador (la del juego dentro de esa web: la misma que usará al arrancar).
// Cuando la web dice g388:juega (se ha pulsado Jugar), el juego arranca en este mismo marco y encuentra lo bajado; lo
// que aún esté bajando lo espera aquí (window.precargando), sin pedirlo dos veces.
// Lo pidió el usuario el 11-11-2026: «que parezca que no hace falta cargar, que está cargando por detrás, pero cuando
// llegas ya está todo funcionando».
//   juego → web  g388:precarga {p, mb, total, critico} (lo bajado, de 0 a 1; critico: ya está lo que hace falta para arrancar)
//   web → juego  g388:juega (arranca)
const q = new URLSearchParams(location.search);
const padre = window.parent !== window ? window.parent : null;
const DE_FIAR = /^(https:\/\/pueblos388\.onrender\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const decir = (type, mas = {}) => { try { padre.postMessage({ type, ...mas }, '*'); } catch (e) { /* sin web */ } };
const movil = q.get('movil') ? q.get('movil') === '1' : (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900);

// lo que se está bajando: la dirección entera → la promesa de que ya está en la caché (src/main.js la espera antes de
// pedir un archivo; así no lo baja dos veces si se pulsa Jugar a medias)
window.precargando = new Map();

export function precargar() {
  let juega;
  const arranca = new Promise((r) => { juega = r; });
  addEventListener('message', (e) => {
    if (e.source !== padre || !DE_FIAR.test(e.origin) || !e.data || e.data.type !== 'g388:juega') return;
    juega();
  });
  (async () => {
    const escena = q.get('escena') || 'guarena';
    let lista = [];
    try { lista = (await (await fetch(`./escenas/${escena}/precarga${movil ? '_movil' : ''}.json`)).json()).archivos || []; } catch (e) { decir('g388:precarga', { p: 1, error: true }); return; }
    const total = lista.reduce((a, x) => a + (x.b || 0), 0) || 1, criticos = lista.filter((x) => x.c).length;
    let hecho = 0, criticosHechos = 0, ultimo = 0;
    const avisar = (fin) => { const now = performance.now(); if (!fin && now - ultimo < 400) return; ultimo = now; decir('g388:precarga', { p: fin ? 1 : Math.min(0.999, hecho / total), mb: Math.round(hecho / 1e5) / 10, total: Math.round(total / 1e5) / 10, critico: criticosHechos >= criticos }); };
    const bajar = async (x) => {
      const url = new URL(x.u, location.href).href;
      const p = (async () => {
        try {
          const r = await fetch(url, { priority: x.c ? 'high' : 'low' });
          if (!r.ok || !r.body) return;
          const lector = r.body.getReader();
          for (;;) { const { done, value } = await lector.read(); if (done) break; hecho += value.length; avisar(false); }
        } catch (e) { /* (la pedirá el juego) */ }
      })();
      window.precargando.set(url, p); await p;
      if (x.c) criticosHechos++;
    };
    // de cuatro en cuatro, en el orden de la lista: primero lo que hace falta para arrancar y, cuando eso ya está todo,
    // lo demás (cargar antes, 13-11-2026: en cuanto se habían pedido los críticos se empezaba con lo demás, y las zonas
    // de más allá, los coches de cerca y el sonido —46 MB— le quitaban red a las de la salida mientras el juego esperaba)
    const tanda = async (xs) => { let i = 0; await Promise.all(Array.from({ length: 4 }, async () => { while (i < xs.length) await bajar(xs[i++]); })); };
    await tanda(lista.filter((x) => x.c));
    await tanda(lista.filter((x) => !x.c));
    avisar(true);
  })();
  decir('g388:hola', { v: 3, precarga: true });
  return arranca;
}
