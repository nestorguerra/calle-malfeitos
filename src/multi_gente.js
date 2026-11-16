// Los mismos vecinos para todos los que juegan cerca (docs/multijugador.md, fase 2; lo de mover a los vecinos, en
// src/gente.js). Como en los juegos de mundo abierto: los de una zona los mueve un solo juego, el «anfitrión», y los demás
// los ven.
// - Quién es el anfitrión de cada uno: de los que mueven a sus vecinos (no siguen a nadie) y están a menos de 140 m, el
//   que llegó antes a la sala; si no hay ninguno que llegara antes, uno mismo. Quien ya sigue a uno lo sigue hasta 170 m
//   (para no ir cambiando en el borde). Cada uno dice a quién sigue en su estado («h»), y el anfitrión mueve a sus vecinos
//   alrededor de su chica y de la de cada uno de los que le siguen.
// - El anfitrión manda a los suyos los vecinos de su alrededor cinco veces por segundo («gv»); lo que alguien hace con uno
//   de ellos (hablarle, saludarle, que le acompañe, que se vaya, que se siente) se le pide a él («go»).
// - Si el anfitrión se va o se aleja, el siguiente se queda con sus vecinos tal como estaban (cada uno sigue a lo suyo).
export function montarGenteMulti({ enviar, otros, yo, miOrden, miPos }) {
  const gente = () => window.foto?.gente || null;
  const R = 140, R_SIGUE = 170;
  let anfitrion = null, tDecidir = 0, tCentros = 0, tEnvio = 0, enlazado = null;

  function decidir() {
    const g = gente(); if (!g?.modo) return;
    if (enlazado !== g) { enlazado = g; g.alPedir((op, v, x, z) => { if (anfitrion) enviar({ t: 'go', a: anfitrion, i: v.id, o: op, x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 }); }); }
    const p = miPos(), mio = miOrden();
    let mejor = null;
    if (mio != null) {
      for (const o of otros.values()) {
        if (o.o == null || o.p.x == null || o.p.h) continue; // (h: sigue a otro; quien no lo ha dicho aún, tampoco)
        if (!('h' in o.p)) continue;
        const d = Math.hypot(o.p.x - p.x, o.p.z - p.z);
        if (d < (o.id === anfitrion ? R_SIGUE : R) && o.o < mio && (!mejor || o.o < mejor.o)) mejor = o;
      }
    }
    anfitrion = mejor ? mejor.id : null;
    g.modo(anfitrion ? 'replica' : 'anfitrion');
  }
  function centros() {
    const g = gente(); if (!g?.centros || anfitrion) return;
    const me = yo();
    g.centros([...otros.values()].filter((o) => me && o.p.h === me && o.p.x != null).map((o) => ({ id: o.id, x: o.p.x, y: o.p.y ?? 0, z: o.p.z, r: o.p.r ?? 0 })));
  }

  return {
    // (cada fotograma)
    mover(dt) {
      if ((tDecidir -= dt) <= 0) { tDecidir = 1; decidir(); }
      if ((tCentros -= dt) <= 0) { tCentros = 0.25; centros(); }
      if ((tEnvio -= dt) <= 0) {
        tEnvio = 0.2;
        const g = gente();
        if (g?.instantanea && !anfitrion) {
          let l = g.instantanea();
          if (l) { while (l.length && JSON.stringify(l).length > 3800) l = l.slice(0, -4); enviar({ t: 'gv', g: l }); }
        }
      }
    },
    recibir(d) {
      const g = gente(); if (!g) return;
      if (d.t === 'gv' && d.id === anfitrion) g.recibir(d.g, d.id);
      else if (d.t === 'go' && !anfitrion) g.pedido(d.o, d.i, d.x, d.z, d.id);
    },
    // (lo que va en mi estado: a quién sigo; '' si muevo a los míos)
    h: () => anfitrion || '',
    anfitrion: () => anfitrion,
    // (al irse alguien: si era el anfitrión, a decidir enseguida)
    sale(id) { if (id === anfitrion) { anfitrion = null; tDecidir = 0; } },
    reset() { anfitrion = null; tDecidir = 0; const g = gente(); g?.modo?.('anfitrion'); g?.centros?.([]); },
  };
}
