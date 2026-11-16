// Dónde está alguien en el pueblo y qué hace, en palabras (el multijugador, docs/multijugador.md: la pantalla «Guareña,
// ahora» dice de cada persona la calle, el sitio y qué hace). Con lo que ya trae vida.json: las calles con su eje (un
// punto cada 4 m; las de varios tramos se llaman «Calle San Ginés (2)»…: el nombre, sin el número) y las plazas con su
// contorno; y la planta de la iglesia (reloj.enPlanta). Cada juego lo saca para su chica y manda solo los números: k (la
// calle, en CALLES), l (el sitio, en LUGARES) y m (qué hace, en HACE): así el servidor no lleva texto.
const sinTramo = (n) => n.replace(/\s*\(\d+\)$/, '');
// qué hace (m): la figura es la de la chica, de ahí el femenino
export const HACE = ['quieta', 'paseando', 'corriendo', 'sentada', 'bailando', 'rezando', 'hablando', 'conduciendo', 'encendiendo una vela', 'saltando', 'de copiloto'];

export function montarDonde({ vida, reloj, iglesia = 'la iglesia' }) {
  const CALLES = [], deCalle = [];
  for (const c of vida?.calles || []) {
    const n = sinTramo(c.nombre || ''); if (!n) continue;
    let i = CALLES.indexOf(n); if (i < 0) { i = CALLES.length; CALLES.push(n); }
    for (const p of c.p || []) deCalle.push([p[0], p[1], i]);
  }
  // (los sitios: las plazas, sin repetir las de varios trozos, y la iglesia)
  const plazas = [];
  for (const p of vida?.plazas || []) {
    const n = sinTramo(p.nombre || ''); if (!n || !p.p?.length) continue;
    plazas.push({ n, p: p.p });
  }
  const LUGARES = [...new Set(plazas.map((p) => p.n))];
  const IGLESIA = LUGARES.push(iglesia) - 1;   // (su nombre, el de la escena: src/main.js, «dentro»)
  // (la rejilla de los puntos de las calles, de 40 m: buscar la más cercana mira solo las celdas de alrededor)
  const R = 40, rej = new Map(), clave = (x, z) => Math.floor(x / R) + ',' + Math.floor(z / R);
  for (const q of deCalle) { const k = clave(q[0], q[1]); if (!rej.has(k)) rej.set(k, []); rej.get(k).push(q); }
  const dentro = (x, z, pol) => { let s = false; for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) { const [xi, zi] = pol[i], [xj, zj] = pol[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) s = !s; } return s; };
  const aBorde = (x, z, pol) => {
    let m = Infinity;
    for (let i = 0, j = pol.length - 1; i < pol.length; j = i++) {
      const [ax, az] = pol[j], [bx, bz] = pol[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); m = Math.min(m, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
    return dentro(x, z, pol) ? 0 : m;
  };
  // la calle (k) y el sitio (l) de un punto; -1 si no hay ninguno cerca
  function de(x, z) {
    let k = -1, mejor = R;
    const cx = Math.floor(x / R), cz = Math.floor(z / R);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of rej.get((cx + i) + ',' + (cz + j)) || []) {
      const d = Math.hypot(q[0] - x, q[1] - z); if (d < mejor) { mejor = d; k = q[2]; }
    }
    let l = -1;
    if (reloj?.enPlanta?.(x, z)) l = IGLESIA;
    else {
      let md = 40;
      for (const p of plazas) { const d = aBorde(x, z, p.p); if (d < md) { md = d; l = LUGARES.indexOf(p.n); } }
    }
    return { k, l };
  }
  // en palabras: «Calle Malfeitos · en la Plaza de España» (o «junto a…», o «dentro de la iglesia de Santa María»)
  function texto({ k, l }, x, z) {
    const calle = k >= 0 && k < CALLES.length ? CALLES[k] : 'en las afueras';
    if (l === IGLESIA) return 'dentro de ' + iglesia;
    if (l >= 0 && l < LUGARES.length) {
      const en = x != null && plazas.some((p_) => p_.n === LUGARES[l] && dentro(x, z, p_.p));
      if (en || calle === LUGARES[l]) return `en la ${LUGARES[l]}`;
      return `${calle} · junto a la ${LUGARES[l]}`;
    }
    return calle;
  }
  return { de, texto, CALLES, LUGARES };
}
