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
import { cargarSentados, sentadosListos } from './asiento_coche.js';

const RAD = 180 / Math.PI;
const CDM = 0.42; // (el centro del coche que se conduce, sobre el suelo: src/conducir.js)

export function montarCochesMulti({ app, q = null, ctrl, tpc, muneco, camara, movil, enviar, otros, nombreDe, yoId = () => null, carpeta = null, cuerpoCoche = null }) {
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
    if (k.cerca) { if (!k._slot) k.cerca.destroy(); else k.cerca.enabled = false; k.cerca = null; } // (src/vida.js la vuelve a poner en el sitio nuevo)
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
    if (copi?.id === id) bajarCopiloto(); // (liberar el muñeco propio antes de destruir rc.raiz)
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

  // ---- dónde va sentado quien va en un coche (22-11-2026; el usuario: «si sube alguien más en el coche y van dos personas,
  // que se puedan ver mutuamente los dos en el coche», y luego «tiene que estar bien sentados, que el personaje que conduce
  // se vea coger el volante bien y sentado bien en el asiento del conductor, y lo mismo del copiloto»): el conductor, a la
  // izquierda, con las manos en el volante; el copiloto, a la derecha, con las manos en los muslos; los dos con la cadera
  // en el cojín y la espalda en el respaldo de su asiento de verdad. Dónde va cada figura en cada modelo de coche (y los
  // ojos del copiloto, para su cámara de dentro), en escenas/<escena>/coches_sentados.json, y su postura en
  // escenas/chica/conduciendo_<tipo>.glb y copiloto_<tipo>.glb: los dos de tools/blender/chica_coche.py, en el marco del
  // coche (x adelante, y arriba, z a la derecha, desde el suelo bajo su centro —el que manda quien conduce, CDM más
  // arriba—). Sin ellos, como antes: un poco hacia atrás, a un lado y a ras del asiento, con la animación de estar sentada
  // (src/multi.js); ?asiento=atras,lado,alto para ajustar ese de repuesto, y ?sentados=0, como antes (para comparar)
  cargarSentados(carpeta, q || new URLSearchParams(location.search));
  const AS = (q_ => { const v = (q_ || '').split(',').map(parseFloat); return { atras: isFinite(v[0]) ? v[0] : 0.3, lado: isFinite(v[1]) ? v[1] : 0.37, alto: isFinite(v[2]) ? v[2] : 0.1 }; })(new URLSearchParams(location.search).get('asiento'));
  const conTipo = (rc) => (rc?.ult ? [...rc.ult, rc.k.c.tipo] : null);
  function cocheDe(o) {   // ([x, y, z, rumbo, tipo] del coche en el que va o: el que lleva, o el de quien le lleva —que puedo ser yo—)
    if (o.p.m === 7) return conTipo(remotos.get(o.id));
    if (o.p.m === 10) {
      if (o.p.cp && o.p.cp === yoId()) { const c = conducir(); return c?.modo === 'conduciendo' && c.pos ? [c.pos[0], c.pos[1], c.pos[2], c.rumbo ?? 0, c.tipo] : null; }
      return conTipo(remotos.get(o.p.cp));
    }
    return null;
  }
  // (el sitio de la figura —su origen, a sus pies— y, para el copiloto, sus ojos; clip: la postura de ese modelo de coche)
  function sitioAsiento(u, conductor) {
    const [x, y, z, r, tipo] = u, a = r / RAD, fx = Math.sin(a), fz = Math.cos(a), rx = -Math.cos(a), rz = Math.sin(a);
    const S = sentadosListos(carpeta)[tipo], o = S?.[conductor ? 'conductor' : 'copiloto'];
    const en = (v) => [x + fx * v[0] + rx * v[2], y - CDM + v[1], z + fz * v[0] + rz * v[2]];
    if (o) {
      const [px, py, pz] = en(o);
      return { x: px, y: py, z: pz, r, fx, fz, clip: (conductor ? 'conduciendo_' : 'copiloto_') + tipo, ojo: !conductor && S.ojos_copiloto ? en(S.ojos_copiloto) : null };
    }
    const s = conductor ? -1 : 1;
    return { x: x - fx * AS.atras + rx * AS.lado * s, y: y - CDM + AS.alto, z: z - fz * AS.atras + rz * AS.lado * s, r, fx, fz, clip: null, ojo: null };
  }
  const asiento = (o) => { const u = cocheDe(o); return u ? sitioAsiento(u, o.p.m === 7) : null; };

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
  const AYUDA_COPI = movil ? 'Vas de copiloto · arrastra para mirar' : 'Vas de copiloto · arrastra con el ratón para mirar · C vista de dentro · E bajar';
  function subirCopiloto(o) {
    const rc = remotos.get(o.id); if (!rc || copi || !ctrl.enabled) return false;
    if (window.foto?.acciones?.estado?.()?.modo && window.foto.acciones.estado().modo !== 'pie') return false;
    tpc?.fire?.('speed', 0); ctrl.enabled = false;
    copi = { id: o.id, k: rc.k, pos: camara.getPosition().clone(), giro: 0, alto: 0, quieto: 0, vista: 'fuera' };
    cuerpoCoche?.sentar({ padre: rc.raiz, tipo: rc.k.c.tipo, puesto: 'copiloto', primeraPersona: false });
    bBajar.hidden = false;
    if (ayuda) { ayudaAntes = ayuda.textContent; ayuda.textContent = AYUDA_COPI; }
    return true;
  }
  function bajarCopiloto() {
    if (!copi) return;
    if (copi.vista === 'dentro') vistaCopiloto('fuera');
    cuerpoCoche?.salir();
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
  // (de copiloto, la vista de dentro, desde su asiento, como la del conductor —src/conducir.js—: se ve a quien conduce, al
  // lado. Las lunas, claras desde dentro; la cámara, más cerca de la cara y con más campo; y la calidad de dentro —src/main.js—)
  const claras = new Map();
  function lunas(raiz, claro) {
    for (const r of raiz.findComponents('render')) for (const mi of r.meshInstances) {
      const m = mi._lunaAntes || mi.material;
      if (!/glass|cristal|vidrio|luna/i.test(m.name || '') && !(m.opacity < 0.99)) continue;
      if (claro) {
        if (!claras.has(m)) { const c = m.clone(); c.opacity = Math.min(m.opacity ?? 1, 0.12); c.diffuse.set(0.85, 0.9, 0.92); c.diffuseMap = null; c.update(); claras.set(m, c); }
        mi._lunaAntes = m; mi.material = claras.get(m);
      } else if (mi._lunaAntes) { mi.material = mi._lunaAntes; mi._lunaAntes = null; }
    }
  }
  function vistaCopiloto(v) {
    if (!copi) return;
    const rc = remotos.get(copi.id);
    copi.vista = v; copi.giro = copi.alto = 0;
    cuerpoCoche?.primeraPersona(v === 'dentro');
    if (v === 'dentro') {
      copi.near = camara.camera.nearClip; copi.fov = camara.camera.fov;
      camara.camera.nearClip = 0.04; camara.camera.fov = innerWidth < innerHeight ? 82 : 58;
      if (rc) lunas(rc.raiz, true);
    } else {
      camara.camera.nearClip = copi.near ?? camara.camera.nearClip; camara.camera.fov = copi.fov ?? camara.camera.fov;
      if (rc) lunas(rc.raiz, false);
      copi.pos.copy(camara.getPosition());
    }
    window.foto?.calidadDentro?.(v === 'dentro');
  }
  addEventListener('keydown', (e) => {
    if (!copi || e.repeat || e.target?.tagName === 'INPUT') return;
    if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Escape') { e.preventDefault(); bajarCopiloto(); }
    else if (e.code === 'KeyC' || e.code === 'KeyV') { e.preventDefault(); vistaCopiloto(copi.vista === 'dentro' ? 'fuera' : 'dentro'); }
  });
  // (mirar alrededor: arrastrando con el ratón o el dedo; al soltar, la cámara vuelve sola detrás del coche)
  let arrastre = null;
  addEventListener('pointerdown', (e) => { if (copi && e.target?.tagName === 'CANVAS') arrastre = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointermove', (e) => {
    if (!copi || !arrastre) return;
    const maxAlto = copi.vista === 'dentro' ? 78 : 40;
    copi.giro -= (e.clientX - arrastre.x) * 0.3; copi.alto = Math.max(-15, Math.min(maxAlto, copi.alto + (e.clientY - arrastre.y) * 0.15)); copi.quieto = 0;
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
    if (copi.vista === 'dentro') {
      // (los ojos, sobre su asiento; mirando adelante, o adonde arrastre, hasta 120° a cada lado)
      // (en los ojos de su figura sentada; sin ellos, 1,12 m sobre el asiento)
      const s = sitioAsiento(conTipo(rc), false), g = Math.max(-120, Math.min(120, copi.giro)) / RAD, h = copi.alto / RAD * 0.8;
      const ax = s.fx * Math.cos(g) + s.fz * Math.sin(g), az = s.fz * Math.cos(g) - s.fx * Math.sin(g), [ex, ey, ez] = s.ojo || [s.x, s.y + 1.12, s.z];
      camara.setPosition(ex, ey, ez); vm.set(ex + ax * 10, ey - Math.tan(h) * 10, ez + az * 10); camara.lookAt(vm);
      return;
    }
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
    dibujar, dejado, sale, cerca, asiento,
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
    estado: () => ({ remotos: [...remotos.entries()].map(([id, rc]) => ({ id, coche: rc.k.c.nodo, pos: rc.ult, v: Math.round(rc.v * 10) / 10 })), copiloto: copi ? { id: copi.id, coche: copi.k.c.nodo, vista: copi.vista } : null }),
    vista: (v) => vistaCopiloto(v),
    mirar: (g, a) => { if (copi) { copi.giro = g; copi.alto = a; copi.quieto = -1e9; } },
  };
}
