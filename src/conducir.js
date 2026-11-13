// Subirse a un coche aparcado del pueblo y conducirlo (13-11-2026, a petición: «quiero que la chica pueda subirse a un
// coche y conducirlo, y que el interior del coche sea muy realista»).
//  · Las cajas: cada coche aparcado es una caja dentro de la malla de colisión del pueblo (tools/blender/calle_gris.py,
//    «una caja por coche»; las de la plaza de la iglesia, en la de la iglesia). Al cargar se sacan de ahí (separarCajas)
//    y cada una pasa a ser su cuerpo aparte, igual de grande: así la del coche al que se sube se puede quitar y, al
//    bajar, ponerla donde se ha dejado.
//  · El coche que se conduce: un cuerpo con su peso y un vehículo de Bullet (btRaycastVehicle) con cuatro ruedas de
//    suspensión, tracción delantera, cambio automático de cinco marchas, freno en las cuatro y freno de mano atrás. Choca
//    con lo mismo que la chica: casas, bordillos (las ruedas los suben con un golpe si se va despacio, y unas esferas en
//    los bajos frenan en seco si se llega deprisa), otros coches.
//  · Lo que se ve: si el modelo tiene su versión para conducir (escenas/<escena>/conducir_<tipo>.glb, de
//    tools/blender/coche_conducir.py: la carrocería sin sus ruedas ni su interior, las cuatro ruedas sueltas y el
//    interior hecho a medida, con el volante y las agujas aparte), esa, bajada al subir y soltada al bajar; si no, el
//    coche de cerca tal cual.
//  · La cámara: detrás del coche, girando con él (con el ratón o arrastrando se mira alrededor y vuelve sola); con C, desde
//    el asiento del conductor.
// Teclas: E subir y bajar, W/S o flechas acelerar y frenar (y marcha atrás parado), A/D girar, Espacio freno de mano, C la
// vista. En el móvil, el mismo mando de la izquierda (arriba acelera, abajo frena, a los lados gira) y los botones.
// ?conducir=0 lo quita todo (y la colisión queda como venía)
import { Asset, BUFFER_STATIC, Entity, INDEXFORMAT_UINT32, IndexBuffer, KeyboardMouseSource, Quat, SEMANTIC_POSITION, Vec3 } from 'playcanvas';

const RAD = 180 / Math.PI;

// ---- las cajas de los coches: componentes de la malla con 8 vértices y 10 o 12 triángulos y tamaño de coche
export function separarCajas(app, render) {
  const cajas = [];
  const M = render.entity.getWorldTransform();
  for (const mi of render.meshInstances) {
    const m = mi.mesh, vb = m.vertexBuffer, st = vb?.storage;
    const el = vb?.format.elements.find((e) => e.name === SEMANTIC_POSITION);
    if (!st || !el || m.primitive[0].count < 3) continue;
    const P = new Float32Array(st), o = el.offset / 4, s = el.stride / 4, n = vb.numVertices;
    const I = []; m.getIndices(I);
    const base = m.primitive[0].base, cuenta = m.primitive[0].count;
    const par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
    const raiz = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    for (let t = base; t < base + cuenta; t += 3) { const a = raiz(I[t]); par[raiz(I[t + 1])] = a; par[raiz(I[t + 2])] = a; }
    const nv = new Int32Array(n), nt = new Int32Array(n);
    for (let i = 0; i < n; i++) nv[raiz(i)]++;
    for (let t = base; t < base + cuenta; t += 3) nt[raiz(I[t])]++;
    const verts = new Map();
    for (let i = 0; i < n; i++) { const r = raiz(i); if (nv[r] === 8 && (nt[r] === 10 || nt[r] === 12)) { let l = verts.get(r); if (!l) verts.set(r, l = []); l.push(i); } }
    const fuera = new Set(), p = new Vec3();
    for (const [r, l] of verts) {
      const Q = l.map((i) => M.transformPoint(new Vec3(P[i * s + o], P[i * s + o + 1], P[i * s + o + 2]), new Vec3()));
      Q.sort((a, b) => a.y - b.y);
      const abajo = Q.slice(0, 4), y0 = Q[0].y, y1 = Q[7].y;
      if (Math.abs(abajo[3].y - y0) > 0.05) continue; // (no es una caja derecha)
      const c = abajo.reduce((a, b) => a.add(b), new Vec3()).mulScalar(0.25);
      const d = abajo.slice(1).map((q) => [q, Math.hypot(q.x - abajo[0].x, q.z - abajo[0].z)]).sort((a, b) => a[1] - b[1]);
      const W = d[0][1], L = d[1][1];
      if (L < 3.2 || L > 5.8 || W < 1.4 || W > 2.4 || y1 - y0 < 0.9 || y1 - y0 > 2.1) continue;
      const dx = (d[1][0].x - abajo[0].x) / L, dz = (d[1][0].z - abajo[0].z) / L;
      fuera.add(r);
      p.set(c.x, (y0 + y1) / 2, c.z);
      const giro = new Quat().setFromEulerAngles(0, Math.atan2(-dz, dx) * RAD, 0); // (su largo, a lo largo de su x)
      const e = new Entity('caja_coche'); e.setPosition(p); e.setRotation(giro); app.root.addChild(e);
      e.addComponent('rigidbody', { type: 'static', friction: 0.5, restitution: 0 });
      e.addComponent('collision', { type: 'box', halfExtents: new Vec3(L / 2, (y1 - y0) / 2, W / 2) });
      cajas.push({ e, x: c.x, z: c.z, y0, y1, L, W, dx, dz });
    }
    if (!fuera.size) continue;
    const quedan = [];
    for (let t = base; t < base + cuenta; t += 3) if (!fuera.has(raiz(I[t]))) quedan.push(I[t], I[t + 1], I[t + 2]);
    const datos = new Uint32Array(quedan);
    const ib = new IndexBuffer(app.graphicsDevice, INDEXFORMAT_UINT32, datos.length, BUFFER_STATIC, datos.buffer);
    m.indexBuffer[0]?.destroy(); m.indexBuffer[0] = ib; m.primitive[0].base = 0; m.primitive[0].count = datos.length;
  }
  return cajas;
}

// ---- cada modelo: sus ruedas (centro adelante y atrás en x, media vía, radio; del coche de cerca) y su peso. Si su
// versión para conducir trae las suyas (conducir_<tipo>.json), mandan esas
const MODELOS = {
  polo: { delante: 1.12, detras: -1.30, via: 0.73, radio: 0.30, masa: 1150 },
  octavia2000: { delante: 1.30, detras: -1.20, via: 0.74, radio: 0.31, masa: 1250 },
  octavia2005: { delante: 1.37, detras: -1.26, via: 0.74, radio: 0.315, masa: 1300 },
  superb: { delante: 1.54, detras: -1.33, via: 0.80, radio: 0.335, masa: 1450 },
};
// el motor y el cambio (un turismo de gasolina de unos 100 CV): par en N·m por cada 1.000 rpm, de 0 a 7.000
const PAR = [62, 95, 112, 122, 124, 120, 110, 95];
const MARCHAS = [3.45, 1.95, 1.28, 0.97, 0.78], ATRAS = 3.2, GRUPO = 4.1, RALENTI = 850, CORTE = 6400;
const par = (rpm) => { const u = Math.max(0, Math.min(6.99, rpm / 1000)), i = Math.floor(u), f = u - i; return PAR[i] * (1 - f) + PAR[i + 1] * f; };

export function montarConducir({ app, q, ctrl, muneco, tpc, camara, coches, cajas, carpeta, glb, post, movil, sonido, compactar }) {
  if (q.get('conducir') === '0' || !coches?.coches?.length || !window.Ammo) return null;
  const Ammo = window.Ammo, mundo = app.systems.rigidbody.dynamicsWorld, sys = app.systems.rigidbody;
  // (cada coche, con su caja: la que tiene el centro a menos de 1,2 m del suyo)
  for (const k of coches.coches) {
    const p = k.lejos.getPosition(); let mejor = null, dm = 1.2;
    for (const c of cajas) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < dm && !c.k) { dm = d; mejor = c; } }
    if (mejor) { k.caja = mejor; mejor.k = k; }
  }

  // ---- los botones y los avisos (en el móvil, botones grandes a la derecha; en el ordenador, el aviso con su tecla)
  const css = document.createElement('style');
  css.textContent = `
  .coche-boton { position: fixed; right: 14px; padding: 10px 16px; background: rgba(0,0,0,.6); color: #f2ece2; border: 1px solid rgba(255,255,255,.35);
    border-radius: 10px; font: 600 15px -apple-system, system-ui, sans-serif; cursor: pointer; z-index: 5; touch-action: manipulation; -webkit-user-select: none; user-select: none; }
  .coche-boton:hover, .coche-boton:focus-visible { background: rgba(0,0,0,.8); border-color: #d9b27c; outline: none; }
  .coche-boton[hidden] { display: none; }
  #coche-subir { bottom: 30%; } #coche-bajar { bottom: 30%; } #coche-vista { bottom: calc(30% + 56px); }
  #coche-velocidad { position: fixed; right: 16px; bottom: 14px; padding: 6px 12px; background: rgba(0,0,0,.5); border-radius: 8px; color: #f2ece2;
    font: 600 22px ui-monospace, Menlo, monospace; pointer-events: none; z-index: 5; }
  #coche-velocidad small { font-size: 12px; font-weight: 400; opacity: .8; margin-left: 4px; }
  #coche-velocidad[hidden] { display: none; }
  @media (pointer: coarse) { .coche-boton { padding: 14px 20px; font-size: 17px; } }`;
  document.head.appendChild(css);
  const boton = (id, texto) => { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.className = 'coche-boton'; b.textContent = texto; b.hidden = true; document.body.appendChild(b); return b; };
  const bSubir = boton('coche-subir', movil ? 'Subir al coche' : 'Subir al coche (E)');
  const bBajar = boton('coche-bajar', movil ? 'Bajar' : 'Bajar (E)');
  const bVista = boton('coche-vista', movil ? 'Vista' : 'Vista (C)');
  const velo = document.createElement('div'); velo.id = 'coche-velocidad'; velo.hidden = true; document.body.appendChild(velo);
  const ayuda = document.getElementById('ayuda'), ayudaPie = ayuda?.textContent;
  const AYUDA_COCHE = movil ? 'Mando de la izquierda: arriba acelera, abajo frena, a los lados gira · a la derecha, mirar'
    : 'W/S acelerar y frenar · A/D girar · Espacio freno de mano · C vista de dentro · E bajar';
  // (los botones no dejan pasar el toque al lienzo: si no, el mando del móvil lo tomaba por el joystick)
  for (const b of [bSubir, bBajar, bVista]) for (const ev of ['pointerdown', 'pointerup', 'touchstart']) b.addEventListener(ev, (e) => e.stopPropagation());

  // ---- el estado
  const est = { modo: 'pie', k: null, cerca: null, vista: 'fuera', v: 0, rpm: RALENTI, marcha: 1, atras: false, giro: 0, freno: 0, acel: 0, mano: false,
    bajando: false, transicion: 0, mandos: null, cuadro: 0, mirar: { yaw: 0, pitch: 0, quieto: 0 }, camYaw: null, camPos: new Vec3(), camMira: new Vec3(), tiempoAtras: 0 };
  let C = null; // (el coche que se conduce: chasis, vehículo, ruedas, lo que se ve)
  const fw = new Vec3();
  const adelante = () => C.chasis.getWorldTransform().getZ(fw).normalize(); // (hacia dónde mira el morro, en el mundo)

  // ---- subir
  const v1 = new Vec3(), v2 = new Vec3(), v3 = new Vec3(), qt = new Quat(), qt2 = new Quat();
  async function subir(k) {
    if (est.modo !== 'pie' || !k?.caja) return false;
    est.modo = 'subiendo';
    const D = MODELOS[k.c.tipo] || MODELOS.octavia2005, caja = k.caja;
    // lo que se ve: su versión para conducir, si la hay (se baja ahora); si no, una copia del coche de cerca
    let modelo = null;
    try { modelo = await cargarModelo(k); } catch (e) { console.warn('conducir: sin la versión para conducir de ' + k.c.tipo, e); }
    const R = modelo?.datos?.ruedas || D;
    // (el centro de masas, a 42 cm del suelo: algo más bajo que en un turismo de verdad, para que un bordillo cogido de
    // lado no lo vuelque; el balanceo, lo frena además estabilizar() más abajo)
    const L = caja.L, W = caja.W, H = caja.y1 - caja.y0, suelo = caja.y0, cdm = 0.42;
    // (el coche de la calle, fuera mientras se conduce: montarCoches no lo toca)
    k.conducido = true; k.lejos.enabled = false; if (k.cerca) k.cerca.enabled = false; caja.e.enabled = false;
    // la chica, fuera (la cápsula, su física y su controlador); su sitio sigue al coche, para lo que lo mira (el sonido,
    // los vecinos, el coche que pasa)
    tpc.fire('speed', 0); ctrl.enabled = false;
    // el chasis: el centro de masas a 52 cm del suelo, la caja de la carrocería desde 25 cm hasta el techo y, en los bajos,
    // una esfera por rueda algo más pequeña que ella (no toca el suelo: choca con el canto de un bordillo y hay que
    // llegar despacio para subirlo)
    // (el chasis mira a +z con la izquierda en +x, que es como lo quiere el vehículo de Bullet: la base de cada rueda la
    // monta con el eje en su primera columna, y con la derecha en z el eje salía paralelo al suelo y todo daba NaN. El
    // modelo, que mira a +x, va dentro girado −90°: lo del modelo (x, y, z) es (−z, y, x) en el chasis)
    const chasis = new Entity('coche_conducido');
    chasis.setPosition(k.lejos.getPosition().x, suelo + cdm + 0.03, k.lejos.getPosition().z);
    chasis.setRotation(new Quat().copy(k.lejos.getRotation()).mul(qt.setFromEulerAngles(0, 90, 0)));
    app.root.addChild(chasis);
    chasis.addComponent('collision', { type: 'compound' });
    const parte = (nombre, datos, x, y, z) => { const e = new Entity(nombre); e.setLocalPosition(-z, y, x); chasis.addChild(e); e.addComponent('collision', datos); return e; };
    parte('carroceria', { type: 'box', halfExtents: new Vec3(W / 2 - 0.02, (H - 0.27) / 2, L / 2 - 0.02) }, 0, 0.25 + (H - 0.27) / 2 - cdm, 0);
    for (const [x, z] of [[R.delante, R.via], [R.delante, -R.via], [R.detras, R.via], [R.detras, -R.via]]) parte('bajos', { type: 'sphere', radius: R.radio * 0.85 }, x, R.radio - cdm + 0.03, z);
    chasis.addComponent('rigidbody', { type: 'dynamic', mass: R.masa || D.masa, friction: 0.35, restitution: 0.05, linearDamping: 0.01, angularDamping: 0.05 });
    const cuerpo = chasis.rigidbody.body;
    cuerpo.setActivationState(4);
    // (el giro, el de un turismo y no el de una caja: la inercia de una caja de su tamaño y su masa)
    // el vehículo
    const ajuste = new Ammo.btVehicleTuning(), rayos = new Ammo.btDefaultVehicleRaycaster(mundo);
    const veh = new Ammo.btRaycastVehicle(ajuste, cuerpo, rayos);
    veh.setCoordinateSystem(0, 1, 2); // (la «derecha» de Bullet en x —el eje de las ruedas, hacia −x—, arriba y, adelante z)
    mundo.addAction(veh);
    const REPOSO = 0.25, RIGIDEZ = 24, hundido = 10 / (4 * RIGIDEZ); // (lo que baja con su peso: unos 10 cm)
    const anclaY = R.radio + REPOSO - hundido - cdm;
    const dir = new Ammo.btVector3(0, -1, 0), eje = new Ammo.btVector3(-1, 0, 0), ancla = new Ammo.btVector3();
    // (en el orden de las ruedas vistas: delante izquierda y derecha, detrás izquierda y derecha; la izquierda, −z del modelo)
    const ruedas = [[R.delante, -R.via, true], [R.delante, R.via, true], [R.detras, -R.via, false], [R.detras, R.via, false]];
    ruedas.forEach(([x, z, delante]) => {
      ancla.setValue(-z, anclaY, x);
      veh.addWheel(ancla, dir, eje, REPOSO, R.radio, ajuste, delante);
    });
    for (let i = 0; i < 4; i++) {
      const w = veh.getWheelInfo(i);
      w.set_m_suspensionStiffness(RIGIDEZ); w.set_m_wheelsDampingRelaxation(2.4); w.set_m_wheelsDampingCompression(3.2);
      w.set_m_frictionSlip(1.25); w.set_m_rollInfluence(0.05); w.set_m_maxSuspensionTravelCm(18); w.set_m_maxSuspensionForce(40000);
    }
    Ammo.destroy(dir); Ammo.destroy(eje); Ammo.destroy(ancla);
    // lo que se ve, colgado del chasis con el suelo a −cdm
    const vista = new Entity('coche_visto'); vista.setLocalPosition(0, -cdm, 0); vista.setLocalEulerAngles(0, -90, 0); chasis.addChild(vista);
    let ruedasVistas = null, volante = null, agujas = {}, interior = null;
    if (modelo) {
      vista.addChild(modelo.e);
      ruedasVistas = ['rueda_di', 'rueda_dd', 'rueda_ti', 'rueda_td'].map((n) => modelo.e.findByName(n));
      if (ruedasVistas.some((r) => !r)) ruedasVistas = null;
      volante = modelo.e.findByName('volante');
      for (const n of ['aguja_velocidad', 'aguja_rpm', 'aguja_gasolina', 'aguja_agua']) agujas[n] = modelo.e.findByName(n);
      interior = modelo.e.findByName('interior');
      if (ruedasVistas) ruedasVistas.forEach((r) => { r._reposo = r.getLocalPosition().clone(); r._giro0 = r.getLocalRotation().clone(); });
      if (volante) volante._giro0 = volante.getLocalRotation().clone();
      for (const a of Object.values(agujas)) if (a) a._giro0 = a.getLocalRotation().clone();
    } else {
      const copia = k.base.clone(); vista.addChild(copia); copia.setLocalPosition(0, 0, 0); copia.setLocalRotation(Quat.IDENTITY);
      if (k.pintura) for (const r of copia.findComponents('render')) for (const mi of r.meshInstances) if (k.c.pintura.some((p) => mi.material.name.startsWith(p))) mi.material = k.pintura;
    }
    // (sus matrículas y su sombra de contacto, las del coche de la calle)
    const placas = k.lejos.clone(); placas.enabled = true; vista.addChild(placas); placas.setLocalPosition(0, 0, 0); placas.setLocalRotation(Quat.IDENTITY); placas.setLocalScale(1, 1, 1);
    for (const r of placas.findComponents('render')) for (const mi of r.meshInstances) mi.visible = /^(matricula|sombra)/.test(mi.material.name);
    for (const r of vista.findComponents('render')) { r.castShadows = true; r.receiveShadows = true; }
    // (el interior no da sombra en el móvil: va dentro de la carrocería, que ya la da, y son unas veinte llamadas más
    // por cascada)
    if (interior && movil) for (const r of interior.findComponents('render')) r.castShadows = false;
    C = { k, chasis, veh, ajuste, rayos, vista, placas, modelo, ruedasVistas, volante, agujas, interior, R, L, W, H, cdm, anclaY, giroRueda: [0, 0, 0, 0] };
    // la cámara, desde donde estaba hasta detrás del coche
    est.camYaw = null; est.transicion = 0; est.desde = { p: camara.getPosition().clone(), r: camara.getRotation().clone() };
    est.marcha = 1; est.atras = false; est.rpm = RALENTI; est.v = 0; est.giro = 0; est.vista = 'fuera';
    if (post?.taa) { est.taa = post.taa.enabled; post.taa.enabled = false; } // (el antialias temporal emborrona lo que va con la cámara: el coche)
    if (sonido && !est.motor) { est.pn = sonido.panner([0, 0.6, 0], 3, 60); est.motor = sonido.sonar('motor', est.pn, { gan: 0, bucle: true }); }
    est.modo = 'conduciendo';
    ponerBotones();
    return true;
  }

  // ---- bajar: parado (si va deprisa, frena solo hasta pararse), por la puerta del conductor (la izquierda) o, si no cabe,
  // por la otra
  function bajar() {
    if (est.modo !== 'conduciendo') return false;
    if (Math.abs(est.v) > 1.0 && !(est.bajando && (est.tBajando || 0) > 2 && Math.abs(est.v) < 1.4)) { est.bajando = true; return false; }
    const { k, chasis, veh, L, W, cdm } = C, T = chasis.getWorldTransform(), caja = k.caja;
    const centro = T.transformPoint(v1.set(0, 1.0 - cdm, 0), new Vec3());
    let sitio = null;
    for (const [x, z] of [[0.2, -(W / 2 + 0.55)], [0.2, W / 2 + 0.55], [-(L / 2 + 0.7), 0], [L / 2 + 0.7, 0]]) {
      const p = T.transformPoint(v2.set(-z, 1.0 - cdm, x), new Vec3());
      const hit = sys.raycastFirst(centro, p, { filterCallback: (e) => e !== chasis && e.parent !== chasis });
      if (hit) continue;
      const pie = sys.raycastFirst(p, v3.set(p.x, p.y - 3, p.z), { filterCallback: (e) => e !== chasis && e.parent !== chasis });
      sitio = new Vec3(p.x, (pie ? pie.point.y : p.y - 1) + 1.02, p.z); break;
    }
    if (!sitio) sitio = T.transformPoint(v2.set(0, 2.2, 0), new Vec3()); // (encerrado: por arriba)
    // el coche se queda donde está: el de la calle, ahí, con su caja
    const p = chasis.getPosition();
    const f = adelante(), yaw = Math.atan2(-f.z, f.x) * RAD;
    // (el suelo debajo, el de la física, sin contar el propio coche)
    const bajo = sys.raycastFirst(v1.set(p.x, p.y + 0.5, p.z), v2.set(p.x, p.y - 3, p.z), { filterCallback: (e) => e !== chasis && e.parent !== chasis });
    const suelo = bajo ? bajo.point.y : p.y - cdm, dy = suelo - k.lejos.getPosition().y;
    k.lejos.setPosition(p.x, suelo, p.z); k.lejos.setEulerAngles(0, yaw, 0);
    caja.x = p.x; caja.z = p.z; caja.dx = Math.cos(yaw / RAD); caja.dz = -Math.sin(yaw / RAD); caja.y0 += dy; caja.y1 += dy;
    caja.e.setPosition(p.x, (caja.y0 + caja.y1) / 2, p.z); caja.e.setEulerAngles(0, yaw, 0);
    mundo.removeAction(veh); for (const x of [veh, C.rayos, C.ajuste]) { try { Ammo.destroy(x); } catch (e) { /* (sin destructor en esta versión de Ammo) */ } }
    C.modelo?.soltar?.(); chasis.destroy();
    caja.e.enabled = true; caja.e.rigidbody.teleport(caja.e.getPosition(), caja.e.getRotation());
    if (k.cerca) { k.cerca.destroy(); k.cerca = null; } // (montarCoches la vuelve a hacer en su sitio nuevo)
    k.lejos.enabled = true; k.conducido = false;
    // la chica, al lado, mirando hacia fuera del coche; la cámara, desde donde está
    ctrl.setPosition(sitio); ctrl.enabled = true; ctrl.rigidbody.teleport(sitio); ctrl.rigidbody.linearVelocity = Vec3.ZERO;
    const fuera = v1.sub2(sitio, p); fuera.y = 0; fuera.normalize();
    tpc._yaw = Math.atan2(-fuera.x, -fuera.z) * RAD; tpc._pitch = 12;
    tpc._modelYaw = Math.atan2(fuera.x, fuera.z) * RAD; muneco.setLocalEulerAngles(0, tpc._modelYaw, 0);
    tpc._camPos?.copy(camara.getPosition()); tpc._camLookAt?.copy(sitio);
    camara.camera.nearClip = est.near ?? camara.camera.nearClip; camara.camera.fov = est.fov ?? camara.camera.fov;
    if (post?.taa && est.taa !== undefined) post.taa.enabled = est.taa;
    if (est.motor) est.motor.g.gain.setTargetAtTime(0, sonido.ctx.currentTime, 0.4);
    C = null; est.modo = 'pie'; est.bajando = false; est.k = null;
    ponerBotones();
    return true;
  }

  // ---- la versión para conducir de cada modelo: conducir_<tipo>.glb (se baja al subir y se suelta al bajar). Sus mallas
  // de carrocería traen el nombre del material del coche de cerca y usan ese (sus texturas ya están en la memoria); la
  // pintura, la del coche de la calle
  async function cargarModelo(k) {
    if (q.get('conducirglb') === '0') return null;
    const url = carpeta + 'conducir_' + k.c.tipo + '.glb';
    const datos = await fetch(carpeta + 'conducir_' + k.c.tipo + '.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (!datos) return null;
    const asset = await new Promise((ok, mal) => {
      const a = new Asset('conducir_' + k.c.tipo, 'container', { url: glb(url) });
      a.once('load', () => ok(a)); a.once('error', mal); app.assets.add(a); app.assets.load(a);
    });
    if (q.get('refraccion') !== '1') asset.resource.materials.forEach(({ resource: m }) => { if (m && m.refraction > 0) { m.refraction = 0; m.update(); } });
    const e = asset.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    // (sus mallas, como las del pueblo: normales en 8 bits y sin la copia de JavaScript, que no hace falta: la física del
    // coche no las mira. Unos 6 MB menos de JavaScript y 2 de gráfica, que en el móvil no sobran)
    const vistas = new Set(), falsa = (b) => { if (b?.storage) b.storage = { byteLength: b.storage.byteLength }; };
    for (const r of e.findComponents('render')) for (const mi of r.meshInstances) {
      if (vistas.has(mi.mesh)) continue; vistas.add(mi.mesh);
      if (compactar) compactar(mi.mesh);
      if (q.get('soltar') !== '0') { falsa(mi.mesh.vertexBuffer); (mi.mesh.indexBuffer || []).forEach(falsa); }
    }
    const deCerca = new Map();
    for (const r of k.base.findComponents('render')) for (const mi of r.meshInstances) deCerca.set(mi.material.name, mi.material);
    for (const r of e.findComponents('render')) for (const mi of r.meshInstances) {
      const n = mi.material.name;
      if (k.pintura && k.c.pintura.some((p) => n.startsWith(p))) mi.material = k.pintura;
      else if (deCerca.has(n)) mi.material = deCerca.get(n);
    }
    // (y sus texturas, sin su copia de JavaScript en cuanto están en la gráfica: unos fotogramas después de ponerlas; si la
    // gráfica se pierde, la página se vuelve a cargar, como con las mallas del pueblo)
    if (q.get('soltar') !== '0') {
      let n = 0; const tras = () => { if (++n < 4) return; app.off('frameend', tras);
        for (const t of asset.resource.textures) { const x = t.resource; if (x?._levels && !x._needsUpload) x._levels = x._levels.map(() => null); } };
      app.on('frameend', tras);
    }
    return { e, datos, soltar: () => { app.assets.remove(asset); asset.unload(); } };
  }

  // ---- los mandos: teclado (el estado del controlador de la chica, para que al bajar siga sabiendo qué está pulsado),
  // mando del móvil y de consola; o los de las pruebas (foto.conducir.mandos)
  const mirarArrastre = { x: 0, y: 0, activo: false };
  const lienzo = app.graphicsDevice.canvas;
  lienzo.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') mirarArrastre.activo = true; });
  addEventListener('pointerup', () => { mirarArrastre.activo = false; });
  lienzo.addEventListener('pointermove', (e) => { if (mirarArrastre.activo && !document.pointerLockElement && e.pointerType === 'mouse') { mirarArrastre.x += e.movementX; mirarArrastre.y += e.movementY; } });
  function leerMandos() {
    // (las teclas, con los números de la fuente de teclado de PlayCanvas, no los del navegador; y sumadas como hace el
    // controlador, que lleva lo que está pulsado sumando lo que se pulsa y restando lo que se suelta)
    const K = KeyboardMouseSource.keyCode, s = tpc._state, d = tpc._desktopInput.read(), m = tpc._mobileInput.read(), g = tpc._gamepadInput.read();
    s.axis.x += (d.key[K.D] - d.key[K.A]) + (d.key[K.RIGHT] - d.key[K.LEFT]);
    s.axis.z += (d.key[K.W] - d.key[K.S]) + (d.key[K.UP] - d.key[K.DOWN]);
    for (let i = 0; i < s.mouse.length; i++) s.mouse[i] += d.button[i];
    s.space += d.key[K.SPACE]; s.shift += d.key[K.SHIFT]; s.ctrl += d.key[K.CTRL];
    const joy = m.leftInput, pad = g.leftStick;
    const giro = Math.max(-1, Math.min(1, s.axis.x + joy[0] + (Math.abs(pad[0]) > 0.15 ? pad[0] : 0)));
    const avance = Math.max(-1, Math.min(1, s.axis.z - joy[1] - (Math.abs(pad[1]) > 0.15 ? pad[1] : 0)));
    const mirar = [d.mouse[0] * tpc.lookSens + mirarArrastre.x * tpc.lookSens + m.rightInput[0] * 0.25 + g.rightStick[0] * 2, d.mouse[1] * tpc.lookSens + mirarArrastre.y * tpc.lookSens + m.rightInput[1] * 0.25 + g.rightStick[1] * 2];
    mirarArrastre.x = mirarArrastre.y = 0;
    return { giro, avance, mano: s.space > 0, mirar, tocando: joy[0] !== 0 || joy[1] !== 0 };
  }

  addEventListener('keydown', (e) => {
    if (e.repeat || e.target?.tagName === 'INPUT') return;
    if (e.code === 'KeyE' || e.code === 'KeyF') { if (est.modo === 'pie' && est.cerca) subir(est.cerca); else if (est.modo === 'conduciendo') bajar(); }
    if (e.code === 'KeyC' || e.code === 'KeyV') cambiarVista();
  });
  bSubir.addEventListener('click', () => { if (est.cerca) subir(est.cerca); });
  bBajar.addEventListener('click', () => bajar());
  bVista.addEventListener('click', () => cambiarVista());
  function cambiarVista() {
    if (est.modo !== 'conduciendo') return;
    est.vista = est.vista === 'fuera' ? 'dentro' : 'fuera'; est.mirar.yaw = est.mirar.pitch = 0;
    if (est.vista === 'dentro') { est.near = camara.camera.nearClip; est.fov = camara.camera.fov; camara.camera.nearClip = 0.04; camara.camera.fov = parseFloat(q.get('fovcoche') || (innerWidth < innerHeight ? '82' : '62')); } // (en vertical, más abierta: con 62° de alto quedaban 30 de ancho)
    else { camara.camera.nearClip = est.near ?? 0.1; camara.camera.fov = est.fov ?? camara.camera.fov; }
    if (C?.interior) C.interior.enabled = true;
    ponerBotones();
  }
  function ponerBotones() {
    const pie = est.modo === 'pie', dentro = est.modo === 'conduciendo';
    bSubir.hidden = !(pie && est.cerca);
    bBajar.hidden = !dentro; bVista.hidden = !dentro; velo.hidden = !dentro;
    bVista.textContent = (est.vista === 'fuera' ? 'Vista de dentro' : 'Vista de fuera') + (movil ? '' : ' (C)');
    if (ayuda) ayuda.textContent = dentro ? AYUDA_COCHE : ayudaPie;
  }

  // ---- cada fotograma
  const marcarCerca = () => {
    if (est.modo !== 'pie' || !ctrl.enabled) { est.cerca = null; return; }
    const p = ctrl.getPosition(); let mejor = null, dm = 1.1;
    for (const k of coches.coches) {
      const c = k.caja; if (!c || k.conducido || !k.lejos.enabled) continue;
      const rx = p.x - c.x, rz = p.z - c.z; if (rx * rx + rz * rz > 16) continue;
      const lx = rx * c.dx + rz * c.dz, lz = -rx * c.dz + rz * c.dx; // (en sus ejes: largo y ancho)
      const d = Math.hypot(Math.max(0, Math.abs(lx) - c.L / 2), Math.max(0, Math.abs(lz) - c.W / 2));
      if (d < dm && Math.abs(p.y - 1 - c.y0) < 1.2) { dm = d; mejor = k; }
    }
    if (mejor !== est.cerca) { est.cerca = mejor; ponerBotones(); }
  };

  app.on('update', (dt) => {
    est.cuadro++;
    if (est.modo === 'pie') { if ((est.cuadro & 3) === 0) marcarCerca(); return; }
    if (est.modo !== 'conduciendo' || !C) return;
    dt = Math.min(dt, 0.05);
    const { veh, chasis, R } = C;
    const mandos = est.mandos ? { mirar: [0, 0], ...est.mandos } : leerMandos();
    // la velocidad hacia delante (m/s, con signo) y las rpm desde las ruedas delanteras
    const lv = chasis.rigidbody.linearVelocity, f = adelante();
    est.v = lv.x * f.x + lv.y * f.y + lv.z * f.z;
    const va = Math.abs(est.v);
    // el cambio: marcha atrás si, parado, se pide frenar un momento; adelante, al revés
    let acel = 0, freno = 0;
    const pide = est.bajando ? 0 : mandos.avance;
    if (!est.atras) {
      if (pide > 0) acel = pide;
      else if (pide < 0) { if (va < 0.6) { est.tiempoAtras += dt; if (est.tiempoAtras > 0.4) { est.atras = true; est.tiempoAtras = 0; } } else freno = -pide; }
      else est.tiempoAtras = 0;
    } else {
      if (pide < 0) acel = -pide;
      else if (pide > 0) { if (va < 0.6) { est.tiempoAtras += dt; if (est.tiempoAtras > 0.4) { est.atras = false; est.tiempoAtras = 0; } } else freno = pide; }
      else est.tiempoAtras = 0;
    }
    if (est.bajando) freno = 1;
    const ratio = est.atras ? ATRAS : MARCHAS[est.marcha - 1];
    const rpmRuedas = va / R.radio * ratio * GRUPO * 60 / (2 * Math.PI);
    // (embrague: por debajo del ralentí patina; el automático sube a 5.800 y baja a 2.000, o antes si se suelta)
    let rpm = Math.max(RALENTI + acel * 1800 * Math.max(0, 1 - rpmRuedas / 2200), rpmRuedas);
    if (!est.atras) {
      if (rpm > 5800 && est.marcha < 5) est.marcha++;
      else if (est.marcha > 1 && va / R.radio * MARCHAS[est.marcha - 2] * GRUPO * 60 / (2 * Math.PI) < (acel > 0.8 ? 4200 : 2600)) est.marcha--;
    }
    est.rpm += (Math.min(rpm, CORTE + 200) - est.rpm) * Math.min(1, dt * 12);
    let fuerza = rpm < CORTE ? acel * par(Math.max(rpm, 1500)) * ratio * GRUPO * 0.9 / R.radio : 0;
    if (est.atras) fuerza = -fuerza;
    // (el motor retiene un poco sin acelerar; el aire y la rodadura, siempre)
    const retiene = acel === 0 && !freno ? 0.6 + va * 0.04 : 0;
    veh.applyEngineForce(fuerza / 2, 0); veh.applyEngineForce(fuerza / 2, 1); veh.applyEngineForce(0, 2); veh.applyEngineForce(0, 3);
    const m = chasis.rigidbody.mass, por = m / 4 / 60; // (el freno de Bullet es un impulso por paso de 1/60 s y rueda)
    const fr = freno * 6.2 * por + retiene * por; // (a fondo, unos 8 m/s², lo de un turismo con ABS en seco)
    for (let i = 0; i < 4; i++) veh.setBrake(fr * (i < 2 ? 1.15 : 0.85), i);
    // freno de mano: las ruedas de atrás bloqueadas y con menos agarre (el coche cruza el culo)
    for (let i = 2; i < 4; i++) { if (mandos.mano) veh.setBrake(9 * por, i); veh.getWheelInfo(i).set_m_frictionSlip(mandos.mano ? 0.7 : 1.25); }
    const aire = 0.39 * est.v * va + 0.012 * m * 10 * Math.sign(est.v) * Math.min(1, va);
    if (va > 0.05) chasis.rigidbody.applyForce(v1.copy(f).mulScalar(-aire));
    // la dirección: hasta 32° parado y menos cuanto más deprisa; el volante va y vuelve con su tiempo
    const tope = 0.56 / (1 + va / 11);
    const quiere = -mandos.giro * tope;
    const rapidez = Math.abs(quiere) > Math.abs(est.giro) && Math.sign(quiere) === Math.sign(est.giro || quiere) ? 1.6 : 3.2;
    est.giro += Math.max(-rapidez * dt, Math.min(rapidez * dt, quiere - est.giro));
    veh.setSteeringValue(est.giro, 0); veh.setSteeringValue(est.giro, 1);
    est.acel = acel; est.freno = freno; est.mano = mandos.mano;
    // (al pedir bajar en marcha, frena solo; se baja al pararse, o si al cabo de dos segundos se arrastra a menos de 5 km/h)
    if (est.bajando) { est.tBajando = (est.tBajando || 0) + dt; if (va < 0.5 || (est.tBajando > 2 && va < 1.4)) bajar(); } else est.tBajando = 0;
    if (C) { estabilizar(dt); moverRuedas(dt); moverCamara(dt, mandos); moverSonido(); }
    // (la chica va con el coche, para lo que mira dónde está)
    if (C) ctrl.setPosition(chasis.getPosition());
    if ((est.cuadro & 7) === 0) velo.innerHTML = `${Math.round(va * 3.6)}<small>km/h · ${est.atras ? 'R' : est.marcha}</small>`;
  });

  // que no vuelque: más allá de 7° de inclinación de lado o de morro, un par que lo devuelve (lo que harían la barra
  // estabilizadora y los topes de la suspensión), con su amortiguación; y si aun así queda volcado dos segundos y casi
  // parado, se pone derecho donde está
  const arriba_ = new Vec3(), wv = new Vec3();
  function estabilizar(dt) {
    const { chasis } = C, rb = chasis.rigidbody, T = chasis.getWorldTransform();
    T.getY(arriba_).normalize();
    const eje = v1.cross(arriba_, Vec3.UP); const s = eje.length(); // (seno de la inclinación, hacia donde enderezar)
    const ang = Math.asin(Math.min(1, s)), tope = 7 * Math.PI / 180;
    const w = rb.angularVelocity; wv.copy(w); const giro = wv.dot(Vec3.UP); wv.sub(v2.copy(Vec3.UP).mulScalar(giro)); // (sin la parte de girar a los lados)
    const I = rb.mass * 0.45;
    if (ang > tope && s > 1e-4) { eje.mulScalar(1 / s); rb.applyTorque(eje.mulScalar(I * 40 * (ang - tope))); }
    rb.applyTorque(wv.mulScalar(-I * 3.5));
    if (arriba_.y < 0.35 && Math.abs(est.v) < 2) { est.volcado = (est.volcado || 0) + dt; } else est.volcado = 0;
    if (est.volcado > 2) {
      const p = chasis.getPosition(), f = adelante(), yaw = Math.atan2(f.x, f.z) * RAD;
      rb.teleport(new Vec3(p.x, p.y + 0.6, p.z), new Quat().setFromEulerAngles(0, yaw, 0)); rb.linearVelocity = Vec3.ZERO; rb.angularVelocity = Vec3.ZERO; est.volcado = 0;
    }
  }

  // las ruedas que se ven: en su ancla, bajadas lo que diga la suspensión, giradas con la dirección y rodando
  function moverRuedas(dt) {
    const { veh, ruedasVistas, volante, agujas, R } = C;
    if (ruedasVistas) for (let i = 0; i < 4; i++) {
      const w = veh.getWheelInfo(i), r = ruedasVistas[i];
      const susp = w.get_m_raycastInfo().get_m_suspensionLength();
      // (la rueda rueda lo que avanza el coche en su sitio)
      C.giroRueda[i] = (C.giroRueda[i] + (est.v / R.radio) * dt * RAD) % 360;
      const y = C.anclaY + C.cdm - susp;
      r.setLocalPosition(r._reposo.x, y, r._reposo.z);
      qt.setFromEulerAngles(0, i < 2 ? est.giro * RAD : 0, 0); qt2.setFromEulerAngles(0, 0, -C.giroRueda[i]);
      r.setLocalRotation(qt.mul(qt2).mul(r._giro0));
    }
    // (el volante y las agujas giran sobre su y local, que es el eje de la columna y la normal de la esfera hacia el
    // conductor: la z de Blender; el volante, 450° de tope a tope de cada lado, como un turismo; las agujas, 250° de
    // la esfera, en el sentido del reloj)
    if (volante) { volante.setLocalRotation(volante._giro0); volante.rotateLocal(0, est.giro / 0.56 * 450 * (C.modelo?.datos?.volante_signo || 1), 0); }
    const aguja = (a, u) => { if (!a) return; a.setLocalRotation(a._giro0); a.rotateLocal(0, -u, 0); };
    aguja(agujas.aguja_velocidad, Math.min(220, Math.abs(est.v) * 3.6) / 220 * 250);
    aguja(agujas.aguja_rpm, Math.min(8000, est.rpm) / 8000 * 250);
  }

  // la cámara: fuera, detrás y algo por encima, siguiendo el rumbo del coche con un poco de retraso; dentro, en los ojos
  // del conductor. Lo que se mira con el ratón vuelve solo a su sitio al dejarlo
  function moverCamara(dt, mandos) {
    const { chasis, L, cdm } = C, f = adelante();
    const M = est.mirar;
    if (mandos.mirar[0] || mandos.mirar[1]) { M.yaw -= mandos.mirar[0]; M.pitch = Math.max(-40, Math.min(60, M.pitch + mandos.mirar[1] * (tpc.invertLookY ? 1 : -1))); M.quieto = 0; }
    else { M.quieto += dt; if (M.quieto > 1.2) { const k = 1 - Math.exp(-dt * 2.5); M.yaw *= 1 - k; M.pitch *= 1 - k; } }
    M.yaw = ((M.yaw + 540) % 360) - 180;
    const T = chasis.getWorldTransform();
    let pos, rot;
    if (est.vista === 'dentro') {
      const ojo = C.modelo?.datos?.ojo || [-0.05, 1.16, -0.37];
      // (la cabeza, con el cuerpo: se va un poco hacia atrás al acelerar, hacia delante al frenar y hacia fuera en las
      // curvas, con algo de retraso; y un temblor muy leve que crece con la velocidad)
      const lv = chasis.rigidbody.linearVelocity, ac = est.acelPrev ? v2.sub2(lv, est.acelPrev).mulScalar(1 / Math.max(dt, 1e-3)) : v2.set(0, 0, 0);
      est.acelPrev = (est.acelPrev || new Vec3()).copy(lv);
      const derecha = v3.cross(f, Vec3.UP).normalize();
      const along = Math.max(-9, Math.min(9, ac.dot(f))), side = Math.max(-9, Math.min(9, ac.dot(derecha)));
      const H = est.cabeza || (est.cabeza = { x: 0, z: 0 }), kk = 1 - Math.exp(-dt * 5);
      H.x += (-along * 0.006 - H.x) * kk; H.z += (-side * 0.005 - H.z) * kk;
      const tiembla = Math.min(1, Math.abs(est.v) / 15) * 0.0015 * Math.sin(est.cuadro * 1.7) * Math.sin(est.cuadro * 0.37);
      pos = T.transformPoint(v1.set(-ojo[2] - H.z, ojo[1] - cdm + tiembla, ojo[0] + H.x), new Vec3());
      rot = new Quat().copy(chasis.getRotation()).mul(qt.setFromEulerAngles(0, 180 + Math.max(-140, Math.min(140, M.yaw)), 0)).mul(qt2.setFromEulerAngles(-Math.max(-50, Math.min(55, M.pitch)) * 0.8, 0, 0));
    } else {
      const yawCoche = Math.atan2(-f.x, -f.z) * RAD;
      if (est.camYaw === null) est.camYaw = yawCoche;
      let d = yawCoche - est.camYaw; d -= Math.round(d / 360) * 360;
      est.camYaw += d * (1 - Math.exp(-dt * 3.2));
      const yaw = est.camYaw + M.yaw, pitch = 11 + M.pitch;
      const pivote = T.transformPoint(v1.set(0, 1.25 - cdm, 0), new Vec3());
      const dist = Math.max(4.6, L * 1.25);
      qt.setFromEulerAngles(-pitch, yaw, 0);
      const atras = qt.transformVector(Vec3.BACK, v2);
      const quiere = v3.copy(pivote).add(atras.clone().mulScalar(dist));
      // (la cámara no se aparta por los coches, como en los juegos de coches: solo por casas y paredes)
      const hit = sys.raycastFirst(pivote, quiere, { filterCallback: (e) => e !== chasis && e.parent !== chasis && e.name !== 'caja_coche' && e.name !== 'coche_que_pasa' });
      let dd = dist; if (hit) dd = Math.max(1.2, hit.point.distance(pivote) - 0.25);
      est.camDist = est.camDist ? est.camDist + (dd - est.camDist) * Math.min(1, dt * (dd < est.camDist ? 14 : 3)) : dd;
      pos = pivote.clone().add(atras.mulScalar(est.camDist));
      if (pos.y < pivote.y - 1.0) pos.y = pivote.y - 1.0;
      rot = new Quat().setFromEulerAngles(-pitch, yaw, 0);
    }
    // (al subir, de donde estaba la cámara a su sitio en algo menos de un segundo)
    if (est.transicion < 1) {
      est.transicion = Math.min(1, est.transicion + dt / 0.85);
      const u = est.transicion * est.transicion * (3 - 2 * est.transicion);
      pos = new Vec3().lerp(est.desde.p, pos, u); rot = new Quat().slerp(est.desde.r, rot, u);
    }
    camara.setPosition(pos); camara.setRotation(rot);
  }

  function moverSonido() {
    if (!est.motor || !sonido) return;
    const ct = sonido.ctx.currentTime + 0.03, p = C.chasis.getPosition();
    est.pn.positionX.setTargetAtTime(p.x, ct, 0.03); est.pn.positionY.setTargetAtTime(p.y, ct, 0.03); est.pn.positionZ.setTargetAtTime(p.z, ct, 0.03);
    est.motor.s.playbackRate.setTargetAtTime(0.6 + est.rpm / 3200, ct, 0.08);
    est.motor.g.gain.setTargetAtTime(0.25 + est.acel * 0.25, ct, 0.15);
  }

  const api = {
    estado: () => ({ modo: est.modo, vista: est.vista, cerca: est.cerca?.c.nodo || null, coche: C?.k.c.nodo || null, tipo: C?.k.c.tipo || null,
      kmh: Math.round(Math.abs(est.v) * 36) / 10, rpm: Math.round(est.rpm), marcha: est.atras ? 'R' : est.marcha, giro: Math.round(est.giro * RAD * 10) / 10,
      pos: C ? [C.chasis.getPosition().x, C.chasis.getPosition().y, C.chasis.getPosition().z].map((v) => Math.round(v * 100) / 100) : null,
      rumbo: C ? Math.round(Math.atan2(adelante().x, adelante().z) * RAD * 10) / 10 : null, modelo: !!C?.modelo }),
    subir: (nodo) => subir(nodo ? coches.coches.find((k) => k.c.nodo === nodo) : est.cerca),
    bajar, vista: (v) => { if ((v === 'dentro') !== (est.vista === 'dentro')) cambiarVista(); },
    // (para las pruebas: {avance, giro, mano} fijos; null vuelve al teclado)
    mandos: (m) => { est.mandos = m ? { avance: 0, giro: 0, mano: false, ...m } : null; },
    mirar: (yaw, pitch) => { est.mirar.yaw = yaw; est.mirar.pitch = pitch; est.mirar.quieto = -1e9; },
    cajas: () => cajas.length,
    conduciendo: () => est.modo === 'conduciendo' || est.modo === 'subiendo',
    // (para las pruebas: el coche que se conduce, a un sitio y un rumbo, parado)
    poner: (x, z, rumbo) => {
      if (!C) return false;
      const r = new Quat().setFromEulerAngles(0, rumbo, 0), y = C.chasis.getPosition().y;
      C.chasis.rigidbody.teleport(new Vec3(x, y, z), r); C.chasis.rigidbody.linearVelocity = Vec3.ZERO; C.chasis.rigidbody.angularVelocity = Vec3.ZERO;
      est.camYaw = null; return true;
    },
    // (el coche más cerca de un punto, para ir a él en las pruebas)
    cercaDe: (x, z, tipo) => coches.coches.filter((k) => k.caja && (!tipo || k.c.tipo === tipo)).map((k) => [k, Math.hypot(k.caja.x - x, k.caja.z - z)]).sort((a, b) => a[1] - b[1]).slice(0, 5)
      .map(([k, d]) => ({ nodo: k.c.nodo, tipo: k.c.tipo, d: Math.round(d * 10) / 10, x: k.caja.x, z: k.caja.z, dx: k.caja.dx, dz: k.caja.dz, L: k.caja.L, W: k.caja.W })),
  };
  return api;
}
