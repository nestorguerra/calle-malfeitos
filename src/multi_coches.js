// Los coches en el multijugador (docs/multijugador.md, fase 2):
// - Ver conducir a los demás: quien conduce manda en su estado el coche que lleva («co») y el sitio y el rumbo del coche;
//   aquí ese coche se quita de donde estaba aparcado y se ve ir por la calle, con su pintura y sus matrículas, y con una
//   caja que choca (la chica no lo atraviesa, y el coche que se conduce aquí tampoco).
// - Los coches que alguien deja en otro sitio: al bajarse, manda dónde lo ha dejado («cd»); el servidor lo apunta y quien
//   entre después lo ve ahí. Si se va de la página conduciendo, el coche se queda donde estaba.
// - Subirse de copiloto: junto a un coche que conduce otro, parado o despacio, E («Subir con Lucía 23»); se va con él,
//   con la cámara detrás del coche (arrastrando se mira alrededor), y E o «Bajar» para bajarse (por la derecha). Si quien
//   conduce se baja o se va, también. Los demás lo ven como «de copiloto» encima del coche.
import { Entity, Quat, Vec3 } from 'playcanvas';

const RAD = 180 / Math.PI;
const CDM = 0.42; // (el centro del coche que se conduce, sobre el suelo: src/conducir.js)

export function montarCochesMulti({ app, ctrl, tpc, muneco, camara, movil, enviar, otros, nombreDe }) {
  const coches = () => window.foto?.coches?.coches || null;
  const conducir = () => window.foto?.conducir?.estado?.() || null;
  const porNodo = (n) => coches()?.find((k) => k.c.nodo === n) || null;
  const fisica = app.systems.rigidbody;
  const sinCoches = { filterCallback: (e) => e.name !== 'caja_coche' && e.name !== 'coche_de_otro' && e.name !== 'coche_conducido' && e.name !== 'controlador' && !e.tags?.has('gente') && e.rigidbody?.type === 'static' };
  const va = new Vec3(), vb = new Vec3();
  const suelo = (x, y, z) => { const h = fisica?.raycastFirst(va.set(x, y + 1.2, z), vb.set(x, y - 3, z), sinCoches); return h ? h.point.y : y; };
  const yawDe = (e) => { const ex = e.getWorldTransform().getX(new Vec3()); return Math.atan2(-ex.z, ex.x) * RAD; };

  // ---- dejar un coche aparcado en un sitio (como al bajarse en src/conducir.js)
  function aparcar(k, x, y, z, yaw) {
    if (!k || k.obra) return;
    const dy = y - k.lejos.getPosition().y;
    k.lejos.setPosition(x, y, z); k.lejos.setEulerAngles(0, yaw, 0);
    const c = k.caja;
    if (c) {
      c.x = x; c.z = z; c.dx = Math.cos(yaw / RAD); c.dz = -Math.sin(yaw / RAD); c.y0 += dy; c.y1 += dy;
      c.e.setPosition(x, (c.y0 + c.y1) / 2, z); c.e.setEulerAngles(0, yaw, 0); c.e.enabled = true; c.e.rigidbody?.teleport(c.e.getPosition(), c.e.getRotation());
    }
    if (k.cerca) { k.cerca.destroy(); k.cerca = null; } // (src/vida.js la vuelve a hacer en el sitio nuevo)
    k.lejos.enabled = true; k.conducido = false; k.remoto = null;
  }
  // los coches que otros han dejado en otro sitio (al entrar, de la sala; luego, cada «cd»). Si aún no están los coches, después
  const pendientes = new Map();
  function dejado(nodo, x, y, z, r) {
    const k = porNodo(nodo);
    if (!k) { pendientes.set(nodo, [x, y, z, r]); return; }
    if (k.conducido && !k.remoto) return; // (lo lleva quien juega aquí: manda el suyo)
    for (const [id, rc] of remotos) if (rc.k === k) quitarRemoto(id, false);
    aparcar(k, x, suelo(x, y, z), z, r);
  }

  // ---- los coches que conducen los demás
  const remotos = new Map(); // id de quien conduce → { k, raiz, caja, L, W, H, ult: [x, y, z, r], v }
  function vistaDe(k) {
    const raiz = new Entity('coche_de_otro');
    if (k.base) {
      const fuera = k.base.clone(); fuera.enabled = true; raiz.addChild(fuera); fuera.setLocalPosition(0, 0, 0); fuera.setLocalRotation(Quat.IDENTITY);
      if (k.pintura) for (const r of fuera.findComponents('render')) for (const mi of r.meshInstances) if (k.c.pintura.some((p) => mi.material.name.startsWith(p))) mi.material = k.pintura;
      const placas = k.lejos.clone(); placas.enabled = true; raiz.addChild(placas); placas.setLocalPosition(0, 0, 0); placas.setLocalRotation(Quat.IDENTITY); placas.setLocalScale(1, 1, 1);
      const pc = window.foto?.coches?.placas?.(k); if (pc) placas.addChild(pc);
      for (const r of placas.findComponents('render')) for (const mi of r.meshInstances) mi.visible = pc && r.entity === pc ? true : /^(matricula|sombra)/.test(mi.material.name) && !(pc && /^matricula/.test(mi.material.name));
    } else { const l = k.lejos.clone(); l.enabled = true; raiz.addChild(l); l.setLocalPosition(0, 0, 0); l.setLocalRotation(Quat.IDENTITY); }
    for (const r of raiz.findComponents('render')) { r.castShadows = !movil; r.receiveShadows = true; }
    app.root.addChild(raiz);
    return raiz;
  }
  function ponerRemoto(o) {
    const k = porNodo(o.p.co); if (!k || k.obra) return null;
    if (k.conducido && !k.remoto) return null; // (es el que conduzco yo: dos a la vez en el mismo, cada uno el suyo)
    const ya = remotos.get(o.id);
    if (ya?.k === k) return ya;
    if (ya) quitarRemoto(o.id, true);
    // (el aparcado, fuera; su caja, apagada)
    k.conducido = true; k.remoto = o.id; k.lejos.enabled = false; if (k.cerca) k.cerca.enabled = false; if (k.caja) k.caja.e.enabled = false;
    const c = k.caja, L = c?.L || 4.4, W = c?.W || 1.75, H = c ? c.y1 - c.y0 : 1.45;
    const raiz = vistaDe(k);
    // (la caja que choca: cinemática, se mueve con el coche; la chica la empuja, no la atraviesa)
    const caja = new Entity('coche_de_otro'); caja.addComponent('collision', { type: 'box', halfExtents: new Vec3(L / 2, H / 2 - 0.1, W / 2) });
    caja.addComponent('rigidbody', { type: 'kinematic', friction: 0.5, restitution: 0 }); app.root.addChild(caja);
    const rc = { k, raiz, caja, L, W, H, ult: null, v: 0, t: 0 };
    remotos.set(o.id, rc);
    return rc;
  }
  function quitarRemoto(id, aparcarlo) {
    const rc = remotos.get(id); if (!rc) return;
    remotos.delete(id);
    rc.raiz.destroy(); rc.caja.destroy();
    // (si no ha llegado dónde lo dejó —se perdió el aviso—, donde se le vio por última vez)
    if (aparcarlo && rc.ult && rc.k.remoto === id) { const [x, y, z, r] = rc.ult; aparcar(rc.k, x, suelo(x, y - CDM, z), z, r - 90); }
    else if (rc.k.remoto === id) { rc.k.conducido = false; rc.k.remoto = null; rc.k.lejos.enabled = true; if (rc.k.caja) rc.k.caja.e.enabled = true; }
  }
  // (cada fotograma, con el sitio de quien conduce ya suavizado en src/multi.js)
  const qt = new Quat();
  function dibujar(o, x, y, z, r, dt) {
    if (o.p.m !== 7 || !o.p.co) { if (remotos.has(o.id)) quitarRemoto(o.id, true); return; }
    const rc = remotos.get(o.id)?.k?.c.nodo === o.p.co ? remotos.get(o.id) : ponerRemoto(o);
    if (!rc) return;
    if (rc.ult && dt > 0) { const d = Math.hypot(x - rc.ult[0], z - rc.ult[2]) / dt; rc.v += (d - rc.v) * Math.min(1, dt * 4); }
    rc.ult = [x, y, z, r];
    const yaw = r - 90, ys = y - CDM;
    rc.raiz.setPosition(x, ys, z); rc.raiz.setEulerAngles(0, yaw, 0);
    qt.setFromEulerAngles(0, yaw, 0);
    rc.caja.setPosition(x, ys + rc.H / 2 + 0.1, z); rc.caja.setRotation(qt);
  }
  function sale(id) { quitarRemoto(id, true); if (copi?.id === id) bajarCopiloto(); }

  // ---- lo mío: al bajarme del coche que conducía, dónde lo dejo (para los demás y para quien entre después)
  let antes = null;
  function vigilarMio() {
    const c = conducir();
    const ahora = c?.modo === 'conduciendo' ? c.coche : null;
    if (antes && ahora !== antes) {
      const k = porNodo(antes);
      if (k && !k.conducido) { const p = k.lejos.getPosition(); enviar({ t: 'cd', o: antes, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, z: Math.round(p.z * 100) / 100, r: Math.round(yawDe(k.lejos) * 10) / 10 }); }
    }
    antes = ahora;
  }

  // ---- de copiloto
  let copi = null; // { id (quien conduce), k, cam: {pos, giro, alto} }
  const bBajar = document.createElement('button'); bBajar.type = 'button'; bBajar.id = 'copiloto-bajar'; bBajar.className = 'coche-boton'; bBajar.hidden = true;
  bBajar.textContent = movil ? 'Bajar del coche' : 'Bajar del coche (E)';
  bBajar.style.bottom = '30%';
  document.body.appendChild(bBajar);
  for (const ev of ['pointerdown', 'pointerup', 'touchstart']) bBajar.addEventListener(ev, (e) => e.stopPropagation());
  bBajar.addEventListener('click', () => bajarCopiloto());
  const ayuda = document.getElementById('ayuda'); let ayudaAntes = null;
  const AYUDA_COPI = movil ? 'Vas de copiloto · arrastra para mirar' : 'Vas de copiloto · arrastra con el ratón para mirar · E bajar';
  function subirCopiloto(o) {
    const rc = remotos.get(o.id); if (!rc || copi || !ctrl.enabled) return false;
    if (window.foto?.acciones?.estado?.()?.modo && window.foto.acciones.estado().modo !== 'pie') return false;
    tpc?.fire?.('speed', 0); ctrl.enabled = false;
    copi = { id: o.id, k: rc.k, pos: camara.getPosition().clone(), giro: 0, alto: 0, quieto: 0 };
    bBajar.hidden = false;
    if (ayuda) { ayudaAntes = ayuda.textContent; ayuda.textContent = AYUDA_COPI; }
    return true;
  }
  function bajarCopiloto() {
    if (!copi) return;
    const rc = remotos.get(copi.id);
    const ult = rc?.ult || null;
    let sitio = null;
    if (ult) {
      // (por la derecha, la puerta del copiloto; si no cabe, por la izquierda o por detrás)
      const [x, y, z, r] = ult, yaw = (r - 90) / RAD, W = rc.W, L = rc.L, ys = y - CDM;
      const ax = Math.cos(yaw), az = -Math.sin(yaw), lx = Math.sin(yaw), lz = Math.cos(yaw); // (el largo del coche y su derecha, en el mundo)
      for (const [u, w] of [[0.2, W / 2 + 0.6], [0.2, -(W / 2 + 0.6)], [-(L / 2 + 0.8), 0], [L / 2 + 0.8, 0]]) {
        const px = x + ax * u + lx * w, pz = z + az * u + lz * w;
        const hit = fisica.raycastFirst(va.set(x, ys + 1, z), vb.set(px, ys + 1, pz), { filterCallback: (e) => e.name !== 'coche_de_otro' && e.name !== 'controlador' && !e.tags?.has('gente') });
        if (hit) continue;
        sitio = new Vec3(px, suelo(px, ys, pz) + 1.02, pz); break;
      }
      if (!sitio) sitio = new Vec3(x, ys + 2.4, z);
    } else sitio = ctrl.getPosition().clone();
    ctrl.setPosition(sitio); ctrl.enabled = true; ctrl.rigidbody.teleport(sitio); ctrl.rigidbody.linearVelocity = Vec3.ZERO;
    if (tpc) {
      const f = ult ? new Vec3(sitio.x - ult[0], 0, sitio.z - ult[2]).normalize() : new Vec3(0, 0, 1);
      tpc._yaw = Math.atan2(-f.x, -f.z) * RAD; tpc._pitch = 12;
      tpc._modelYaw = Math.atan2(f.x, f.z) * RAD; muneco.setLocalEulerAngles(0, tpc._modelYaw, 0);
      tpc._camPos?.copy(camara.getPosition()); tpc._camLookAt?.copy(sitio);
    }
    copi = null; bBajar.hidden = true;
    if (ayuda && ayudaAntes != null) { ayuda.textContent = ayudaAntes; ayudaAntes = null; }
  }
  addEventListener('keydown', (e) => {
    if (!copi || e.repeat || e.target?.tagName === 'INPUT') return;
    if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Escape') { e.preventDefault(); bajarCopiloto(); }
  });
  // (mirar alrededor: arrastrando con el ratón o el dedo; al soltar, la cámara vuelve sola detrás del coche)
  let arrastre = null;
  addEventListener('pointerdown', (e) => { if (copi && e.target?.tagName === 'CANVAS') arrastre = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', (e) => {
    if (!copi || !arrastre) return;
    copi.giro -= (e.clientX - arrastre.x) * 0.3; copi.alto = Math.max(-15, Math.min(40, copi.alto + (e.clientY - arrastre.y) * 0.15)); copi.quieto = 0;
    arrastre.x = e.clientX; arrastre.y = e.clientY;
  });
  addEventListener('pointerup', () => { arrastre = null; });
  const vc = new Vec3(), vm = new Vec3();
  function camaraCopiloto(dt) {
    const rc = remotos.get(copi.id);
    if (!rc?.ult) return;
    const [x, y, z, r] = rc.ult;
    ctrl.setPosition(x, y + 0.6, z); // (su sitio, con el coche: para lo que lo mira —el sonido, los vecinos, las zonas—)
    if (!arrastre) { copi.quieto += dt; if (copi.quieto > 1.5) { copi.giro *= Math.exp(-dt * 1.5); copi.alto *= Math.exp(-dt * 1.5); } }
    const a = (r + 180 + copi.giro) / RAD, dist = 6.4, alto = 2.3 + copi.alto * 0.06;
    vc.set(x + Math.sin(a) * dist, y + alto, z + Math.cos(a) * dist);
    copi.pos.lerp(copi.pos, vc, 1 - Math.exp(-dt * 5));
    camara.setPosition(copi.pos); vm.set(x, y + 0.9, z); camara.lookAt(vm);
  }

  // ---- E junto a un coche que conduce otro: subir de copiloto (src/acciones.js pregunta por src/multi.js, cerca())
  function cerca(p) {
    if (copi || !ctrl.enabled) return null;
    let mejor = null, dm = 2.4;
    for (const [id, rc] of remotos) {
      if (!rc.ult || rc.v > 1.5) continue;
      const o = otros.get(id); if (!o) continue;
      if ([...otros.values()].some((x) => x.p.m === 10 && x.p.cp === id)) continue; // (ya lleva copiloto)
      const [x, , z, r] = rc.ult, yaw = (r - 90) / RAD, lx = Math.sin(yaw), lz = Math.cos(yaw);
      const px = x + lx * (rc.W / 2 + 0.4), pz = z + lz * (rc.W / 2 + 0.4); // (la puerta del copiloto)
      const d = Math.min(Math.hypot(p.x - px, p.z - pz), Math.hypot(p.x - x, p.z - z) - rc.W / 2);
      if (d < dm) { dm = d; mejor = { o, x: px, z: pz }; }
    }
    return mejor && { x: mejor.x, z: mejor.z, nombre: nombreDe(mejor.o), texto: 'Subir con ' + nombreDe(mejor.o), f: () => subirCopiloto(mejor.o) };
  }

  // ---- cada fotograma
  app.on('update', (dt) => {
    if (pendientes.size && coches()) { for (const [n, [x, y, z, r]] of pendientes) { pendientes.delete(n); dejado(n, x, y, z, r); } }
    vigilarMio();
    if (copi) {
      const o = otros.get(copi.id);
      if (!o || o.p.m !== 7 || o.p.co !== copi.k.c.nodo) bajarCopiloto(); // (quien conduce se ha bajado o se ha ido)
      else {
        camaraCopiloto(dt);
        // (la ayuda de abajo, la de ir de copiloto: src/conducir.js la vuelve a poner a la de andar al quitar su botón)
        if (ayuda && ayuda.textContent !== AYUDA_COPI) ayuda.textContent = AYUDA_COPI;
      }
    }
  });

  return {
    dibujar, dejado, sale, cerca,
    sala: (cs) => { for (const [n, v] of Object.entries(cs || {})) if (Array.isArray(v) && v.length === 4) dejado(n, ...v); },
    // (lo que va en mi estado: el coche en el que voy y con quién; de copiloto, el sitio del coche)
    mio: () => {
      if (copi) { const rc = remotos.get(copi.id); return { co: copi.k.c.nodo, cp: copi.id, m: 10, pos: rc?.ult || null }; }
      const c = conducir(); if (c?.modo === 'conduciendo' && c.coche) return { co: c.coche, cp: '' };
      return { co: '', cp: '' };
    },
    copiloto: () => !!copi,
    bajar: bajarCopiloto,
    subir: (id) => { const o = otros.get(id); return o ? subirCopiloto(o) : false; },
    estado: () => ({ remotos: [...remotos.entries()].map(([id, rc]) => ({ id, coche: rc.k.c.nodo, pos: rc.ult, v: Math.round(rc.v * 10) / 10 })), copiloto: copi ? { id: copi.id, coche: copi.k.c.nodo } : null }),
  };
}
