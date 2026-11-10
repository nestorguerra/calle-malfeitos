// La melena simulada (docs/personaje_video.md; tools/personajes/melena.py la genera). El .glb trae los mechones atados
// a huesos sueltos, uno por punto de cada pelo guía (g<guía>_<punto>); aquí se mueven esos puntos con física y se
// colocan los huesos encima:
// - cada punto sigue con su inercia (Verlet) y cae con la gravedad; la raíz va clavada a la cabeza;
// - cada tramo conserva su largo, y lo que tira de su punto de abajo se lo devuelve al de arriba (si no, hace de látigo);
// - el pelo choca con el cuerpo, que para él son un elipsoide (la cabeza) y bolas y cápsulas atadas a los huesos del
//   cuello, los hombros, los brazos y la espalda; cada guía, además, va despegada lo que diga su capa (el cuerpo de la
//   melena);
// - y recuerda su forma: cada punto tira hacia donde estaría con la cabeza como está ahora, mucho cerca de la raíz (el
//   pelo sale peinado de la cabeza) y casi nada en las puntas, que van sueltas.
// El reposo que trae el .glb es el de esta misma física con el personaje quieto, así que de pie no tira de nada.
import { Mat4, Quat, Vec3 } from 'playcanvas';

const PASO = 1 / 90, PASOS = 6;   // (el paso de la simulación, fijo; hasta 6 por fotograma: va al día desde 15 fotogramas por segundo)

// «entidad»: la melena ya puesta en la escena. «sim»: su .json. «hueso(nombre)»: el hueso del cuerpo (los de Mixamo).
// «ibm(nombre)»: su matriz inversa de enlace, en el espacio del modelo y ya ajustada al cuerpo. «escala»: la talla del
// cuerpo frente al de la melena (para los choques); «talla»: la de la cabeza (para la melena misma).
export function crearMelena({ app, entidad, sim, hueso, ibm, escala = 1, talla = 1, q = null }) {
  const G = sim.guias, K = sim.puntos, n = G * K;
  const num = (clave, v) => parseFloat(q?.get(clave) || v);
  // (dos frenos, por paso: el del aire quieto, pequeño, que es el viento de la carrera (con 0,035, a 3 m/s el pelo iba
  // tendido a 45°); y el del propio pelo, que amortigua lo que se mueve respecto a la cabeza sin hacer de viento. La
  // memoria de forma de la parte suelta, a la mitad: con ella entera las puntas iban de lado ±6 cm al trote, y el
  // vídeo pide ±8–12)
  const GRAVEDAD = num('pelog', 9.8), AIRE = num('peloaire', 0.004), ROCE = num('peloroce', 0.015), MEMORIA = num('pelomem', 0.5);
  // (cuánto recuerda su forma cada punto, por paso: la raíz, clavada; los dos siguientes, mucho: son el peinado, y con
  // menos el pelo se despegaba de la coronilla y se venía a la cara; luego cae deprisa hasta casi nada en la punta)
  const TIRA = num('pelotira', 0.9), tiron = new Float32Array(K * 3);  // (cuánto del tirón de cada punto vuelve al de arriba)
  const memoria = Array.from({ length: K }, (_, k) => (k === 0 ? 1 : k === 1 ? 0.55 : k === 2 ? 0.22 : MEMORIA * 0.07 * Math.pow(0.72, k - 3)));
  // los huesos de la melena, a la raíz de la escena: así su sitio local es el del mundo
  const huesos = new Array(n);
  for (let g = 0; g < G; g++) for (let k = 0; k < K; k++) huesos[g * K + k] = entidad.findByName(`g${g}_${k}`);
  if (huesos.some((h) => !h)) { console.warn('melena: faltan huesos'); return null; }
  const cabeza = hueso('mixamorig:Head'), ibmCabeza = ibm('mixamorig:Head');
  const articulacion = (nombre) => ibm(nombre).clone().invert().getTranslation();  // (dónde está cada articulación en reposo, en el modelo)
  // el reposo de cada punto, en el modelo en reposo: la articulación de la cabeza más lo que trae el .glb, a la talla.
  // De ahí al mundo se va con «el hueso ahora × su inversa de enlace», que lleva lo que iba con el hueso en reposo a
  // donde está ahora
  const jc = articulacion('mixamorig:Head'), v = new Vec3(), reposo = new Float32Array(n * 3), largo = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    v.copy(huesos[i].getLocalPosition()).mulScalar(talla).add(jc);
    reposo[3 * i] = v.x; reposo[3 * i + 1] = v.y; reposo[3 * i + 2] = v.z;
  }
  const dirReposo = new Float32Array(n * 3);  // (hacia dónde sale cada tramo, en reposo)
  for (let g = 0; g < G; g++) for (let k = 0; k < K; k++) {
    const i = g * K + k, a = k < K - 1 ? i : i - 1, b = a + 1;
    const dx = reposo[3 * b] - reposo[3 * a], dy = reposo[3 * b + 1] - reposo[3 * a + 1], dz = reposo[3 * b + 2] - reposo[3 * a + 2], l = Math.hypot(dx, dy, dz) || 1;
    dirReposo[3 * i] = dx / l; dirReposo[3 * i + 1] = dy / l; dirReposo[3 * i + 2] = dz / l;
    if (k < K - 1) largo[i] = l;  // (el largo del tramo que sale de este punto; la talla ya va dentro)
  }
  // los choques, cada extremo en el modelo en reposo (la articulación de su hueso más lo que diga el .json, a escala)
  const sitio = (nombre, p, e) => new Vec3(p[0], p[1], p[2]).mulScalar(e).add(articulacion(nombre));
  const choques = sim.choques.map((s) => ({ h: hueso(s.hueso), ibm: ibm(s.hueso), a: sitio(s.hueso, s.a, escala), b: s.b ? sitio(s.hueso, s.b, escala) : null,
    r: s.r * escala, m: new Mat4(), wa: new Vec3(), wb: new Vec3() })).filter((s) => s.h);
  const elip = { c: sitio(sim.elipsoide.hueso, sim.elipsoide.c, talla), r: sim.elipsoide.r.map((x) => x * talla) };
  // (la capa: lo que va despegado del cuerpo cada punto; nace pegado al cuero cabelludo y se despega a lo largo)
  const capa = Float32Array.from({ length: n }, (_, i) => (sim.capa.length === n ? sim.capa[i] : sim.capa[Math.floor(i / K)]) * talla);
  // el peinado: a cada altura sobre la articulación de la cabeza, lo más adelante que llega el pelo (por debajo de las
  // sienes no pasa por delante de las orejas ni de los hombros). Va con la cabeza
  const del = sim.delante, delante = del ? (a) => {
    const A = del.alto, T = del.tope; if (a <= A[0]) return T[0];
    for (let k = 1; k < A.length; k++) if (a <= A[k]) return T[k - 1] + (T[k] - T[k - 1]) * (a - A[k - 1]) / (A[k] - A[k - 1]);
    return T[T.length - 1];
  } : null;
  entidad.reparent(app.root); entidad.setLocalPosition(0, 0, 0); entidad.setLocalEulerAngles(0, 0, 0); entidad.setLocalScale(1, 1, 1);
  for (const h of huesos) h.setLocalScale(talla, talla, talla);

  const p = new Float32Array(n * 3), ant = new Float32Array(n * 3), meta = new Float32Array(n * 3), metaAnt = new Float32Array(n * 3);
  const mc = new Mat4(), inv = new Mat4(), qc = new Quat(), qa = new Quat(), qb = new Quat();
  const va = new Vec3(), vb = new Vec3(), eje = new Vec3(), ultima = new Vec3(), salto = new Vec3();
  for (const s of choques) { s.pa = new Vec3(); s.pb = new Vec3(); }
  const CERCA = (0.34 * talla) ** 2;
  let listo = false, resto = 0;  // («resto»: lo que la simulación va por detrás del fotograma, menos de un paso)
  const previa = new Vec3();

  // dónde estaría cada punto con la cabeza como está ahora, y dónde están los choques. Se guarda lo del fotograma
  // anterior: los pasos de la simulación van de lo uno a lo otro poco a poco, cada uno a su hora. (Si la cabeza saltara
  // de golpe a su sitio nuevo en el primer paso, al correr el pelo recibía un tirón en cada fotograma y acababa volando)
  function metas() {
    metaAnt.set(meta); for (const s of choques) { s.pa.copy(s.wa); s.pb.copy(s.wb); }
    mc.mul2(cabeza.getWorldTransform(), ibmCabeza);
    for (let i = 0; i < n; i++) { v.set(reposo[3 * i], reposo[3 * i + 1], reposo[3 * i + 2]); mc.transformPoint(v, v); meta[3 * i] = v.x; meta[3 * i + 1] = v.y; meta[3 * i + 2] = v.z; }
    for (const s of choques) { s.m.mul2(s.h.getWorldTransform(), s.ibm); s.m.transformPoint(s.a, s.wa); if (s.b) s.m.transformPoint(s.b, s.wb); }
    inv.copy(mc).invert();
  }
  // saca un punto del cuerpo. «t»: por dónde va este paso entre el fotograma anterior (0) y este (1)
  function chocar(i, cap, t) {
    let x = p[3 * i], y = p[3 * i + 1], z = p[3 * i + 2];
    // la cabeza: el elipsoide, en el modelo en reposo (donde va derecho), como una bola de radio 1; con la cabeza donde
    // estaba en este paso (su sitio de ahora, menos lo que le falta por andar)
    const fx = salto.x * (1 - t), fy = salto.y * (1 - t), fz = salto.z * (1 - t);
    // (solo los puntos que andan cerca de la cabeza: a más de 34 cm de su articulación, ni el peinado ni el cráneo
    // tienen nada que decir, y son dos cambios de ejes por punto que se ahorran, la mitad del coste)
    const hx = x + fx - ultima.x, hy = y + fy - ultima.y, hz = z + fz - ultima.z;
    if (hx * hx + hy * hy + hz * hz < CERCA) {
      v.set(x + fx, y + fy, z + fz); inv.transformPoint(v, v);
      let toca = false;
      if (delante) { const tope = jc.z + delante((v.y - jc.y) / talla) * talla; if (v.z > tope) { v.z = tope; toca = true; } }  // (el peinado; el modelo mira a +z)
      const ex = (v.x - elip.c.x) / (elip.r[0] + cap), ey = (v.y - elip.c.y) / (elip.r[1] + cap), ez = (v.z - elip.c.z) / (elip.r[2] + cap), d = Math.hypot(ex, ey, ez);
      if (d < 1 && d > 1e-6) { v.set(elip.c.x + ex / d * (elip.r[0] + cap), elip.c.y + ey / d * (elip.r[1] + cap), elip.c.z + ez / d * (elip.r[2] + cap)); toca = true; }
      if (toca) { mc.transformPoint(v, v); x = v.x - fx; y = v.y - fy; z = v.z - fz; }
    }
    for (const s of choques) {  // (cada bola o cápsula, donde está en este paso: «s.c», «s.ab», de «paso»)
      let cx = s.cx, cy = s.cy, cz = s.cz;
      if (s.b) { const u = Math.max(0, Math.min(1, ((x - cx) * s.abx + (y - cy) * s.aby + (z - cz) * s.abz) * s.ab2)); cx += s.abx * u; cy += s.aby * u; cz += s.abz * u; }
      const dx = x - cx, dy = y - cy, dz = z - cz, d2 = dx * dx + dy * dy + dz * dz, R = s.r + cap;
      if (d2 < R * R && d2 > 1e-12) { const k = R / Math.sqrt(d2); x = cx + dx * k; y = cy + dy * k; z = cz + dz * k; }
    }
    p[3 * i] = x; p[3 * i + 1] = y; p[3 * i + 2] = z;
  }
  const vr = [0, 0, 0], vAnt = new Float32Array(G * 3);  // (lo que anda la raíz de la guía en este paso, y en el anterior)
  const TOPE = num('peloacel', 14) * PASO * PASO, BAJA = num('pelocae', 5) * PASO * PASO;  // (la aceleración que le llega al pelo, como mucho: 14 m/s², y 5 hacia abajo)
  function paso(t) {
    const g2 = GRAVEDAD * PASO * PASO;
    for (const s of choques) {  // (los choques, donde están en este paso: una vez, no por cada punto)
      s.cx = s.pa.x + (s.wa.x - s.pa.x) * t; s.cy = s.pa.y + (s.wa.y - s.pa.y) * t; s.cz = s.pa.z + (s.wa.z - s.pa.z) * t;
      if (s.b) {
        s.abx = s.pb.x + (s.wb.x - s.pb.x) * t - s.cx; s.aby = s.pb.y + (s.wb.y - s.pb.y) * t - s.cy; s.abz = s.pb.z + (s.wb.z - s.pb.z) * t - s.cz;
        s.ab2 = 1 / (s.abx * s.abx + s.aby * s.aby + s.abz * s.abz);
      }
    }
    for (let g = 0; g < G; g++) {
      const r = g * K;
      // la raíz, a su sitio. Si acelera más de lo que acelera una persona, lo que pasa del tope lo sigue la guía entera,
      // rígida. Dos casos lo pedían: el juego cambia de andar a correr de golpe, a varios g; y el clip de correr de la
      // librería baja la cabeza 15 cm por zancada a más de 2 g (medido: 25 m/s²), más que la caída libre, con lo que el
      // pelo, que cae a 1 g, se quedaba flotando por encima de la cabeza. Hacia abajo el tope es medio g: el pelo
      // siempre pesa. (Con el trote rehecho, que bota 6 cm, el tope ya casi no actúa: queda de red)
      for (let c = 0; c < 3; c++) {
        const x = metaAnt[3 * r + c] + (meta[3 * r + c] - metaAnt[3 * r + c]) * t, d = x - p[3 * r + c], antes = vAnt[3 * g + c];
        vr[c] = antes + Math.max(c === 1 ? -BAJA : -TOPE, Math.min(TOPE, d - antes)); vAnt[3 * g + c] = vr[c];
        const sobra = d - vr[c];
        if (sobra !== 0) for (let k = 1; k < K; k++) { p[3 * (r + k) + c] += sobra; ant[3 * (r + k) + c] += sobra; }
        p[3 * r + c] = x;
      }
      for (let k = 1; k < K; k++) {
        const i = 3 * (r + k), m = memoria[k];
        for (let c = 0; c < 3; c++) {
          const vel = (vr[c] + (p[i + c] - ant[i + c] - vr[c]) * (1 - ROCE)) * (1 - AIRE); ant[i + c] = p[i + c];
          p[i + c] += vel - (c === 1 ? g2 : 0); p[i + c] += (metaAnt[i + c] + (meta[i + c] - metaAnt[i + c]) * t - p[i + c]) * m;
        }
      }
      // el largo: cada punto, a su distancia del de arriba, de la raíz a la punta (así no estira nada), y fuera del
      // cuerpo. Solo con eso, cada tramo tira del de abajo y el de abajo no tira de él: es como si cada punto pesara
      // infinitamente más que el siguiente, un látigo que agranda hacia las puntas cualquier meneo de la cabeza (sin
      // la memoria de forma, la melena estallaba con solo echar a andar). Así que lo que se corrige cada punto se le
      // devuelve al de arriba como velocidad, casi todo (Müller y otros, «Fast simulation of inextensible hair and fur»)
      tiron.fill(0);
      for (let vuelta = 0; vuelta < 2; vuelta++) {
        for (let k = 1; k < K; k++) {
          const i = 3 * (r + k), a = i - 3, L = largo[r + k - 1];
          const dx = p[i] - p[a], dy = p[i + 1] - p[a + 1], dz = p[i + 2] - p[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
          const nx = p[a] + dx / d * L, ny = p[a + 1] + dy / d * L, nz = p[a + 2] + dz / d * L;
          tiron[3 * k] += nx - p[i]; tiron[3 * k + 1] += ny - p[i + 1]; tiron[3 * k + 2] += nz - p[i + 2];
          p[i] = nx; p[i + 1] = ny; p[i + 2] = nz;
          chocar(r + k, capa[r + k], t);
        }
      }
      for (let k = 1; k < K - 1; k++) for (let c = 0; c < 3; c++) ant[3 * (r + k) + c] += TIRA * tiron[3 * (k + 1) + c];
    }
  }
  // los huesos, encima de los puntos. La simulación va un pelín por detrás del fotograma (menos de un paso: a la
  // carrera, hasta 3 cm), así que cada guía se dibuja corrida lo que le falte a su raíz para estar en la cabeza
  function colocar() {
    qc.setFromMat4(mc);  // (el giro de un hueso que no se ha movido de su sitio en la cabeza)
    for (let i = 0; i < n; i++) {
      const k = i % K, a = k < K - 1 ? i : i - 1, b = a + 1, r = 3 * (i - k);
      const ox = meta[r] - p[r], oy = meta[r + 1] - p[r + 1], oz = meta[r + 2] - p[r + 2];
      va.set(dirReposo[3 * i], dirReposo[3 * i + 1], dirReposo[3 * i + 2]); mc.transformVector(va, va).normalize();
      vb.set(p[3 * b] - p[3 * a], p[3 * b + 1] - p[3 * a + 1], p[3 * b + 2] - p[3 * a + 2]).normalize();
      eje.cross(va, vb); const s = eje.length(), c = va.dot(vb);
      if (s > 1e-6) { qa.setFromAxisAngle(eje.mulScalar(1 / s), Math.atan2(s, c) * 180 / Math.PI); qb.mul2(qa, qc); } else qb.copy(qc);
      huesos[i].setLocalPosition(p[3 * i] + ox, p[3 * i + 1] + oy, p[3 * i + 2] + oz); huesos[i].setLocalRotation(qb);
    }
  }
  function actualizar(dt) {
    metas();
    const c = cabeza.getPosition();
    if (!listo || c.distance(previa) > 0.8) {  // (al empezar, o si al personaje lo han llevado de golpe a otro sitio: en reposo allí)
      p.set(meta); ant.set(meta); metaAnt.set(meta); vAnt.fill(0); for (const s of choques) { s.pa.copy(s.wa); s.pb.copy(s.wb); }
      ultima.copy(c); listo = true; resto = 0;
    }
    previa.copy(c); salto.sub2(c, ultima); ultima.copy(c);
    // los pasos que caben hasta este fotograma, cada uno a su hora entre el fotograma anterior (0) y este (1). A 60
    // fotogramas por segundo toca un paso en uno y dos en el siguiente: repartiendo el avance de la cabeza por igual
    // entre los pasos de cada fotograma, el pelo la veía ir a tirones (a 0,75 y a 1,5 veces su velocidad, alternando),
    // una sacudida continua que lo encogía y lo abría, más cuanto más deprisa
    const pasos = Math.floor((resto + dt) / PASO);
    if (pasos > PASOS) { for (let j = 1; j <= PASOS; j++) paso(j / PASOS); resto = 0; }  // (un fotograma lentísimo: no llega, y se reparte)
    else { for (let j = 1; j <= pasos; j++) paso(Math.min(1, (j * PASO - resto) / dt)); resto += dt - pasos * PASO; }
    colocar();
  }
  return { actualizar, guias: G, puntos: K, p, destruir: () => entidad.destroy() };
}
