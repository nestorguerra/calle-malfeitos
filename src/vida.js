// La vida de la calle (fase 5 del plan de calidad): el viento, la ropa tendida en algunos balcones y los faldones de los
// toldos verdes que mueve. Todo sale de vida.json (tools/blender/calle_gris.py), en coordenadas del juego. La tela se
// mueve en la CPU: son unos pocos cientos de vértices, y así sirve igual con WebGPU que con WebGL2.
import { Asset, BLEND_NONE, BUFFER_DYNAMIC, BoundingBox, CULLFACE_NONE, Entity, MeshInstance, PRIMITIVE_TRIANGLES, Quat, StandardMaterial, Texture, Vec3, VertexBuffer, VertexFormat, createMesh } from 'playcanvas';

// el viento: una brisa de tarde con rachas (de 0 a 1)
export function viento(t) {
  const v = 0.32 + 0.18 * Math.sin(t * 0.21) + 0.12 * Math.sin(t * 0.53 + 1.3) + 0.22 * Math.max(0, Math.sin(t * 0.11 + 0.4)) ** 6;
  return Math.min(1, Math.max(0, v));
}

// un pseudoazar que se repite (la misma ropa en los mismos balcones cada vez)
function semilla(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

// una tela: una rejilla de nx × ny vértices colgada de una línea (a → b, en lo alto) hacia abajo «largo» m, que el
// viento empuja hacia «n» (la calle), más abajo cuanto más lejos de la línea
function tela(app, material, a, b, largo, n, nx = 5, ny = 5, sombra = true) {
  const pos = [], uv = [], idx = [], nor = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const u = i / (nx - 1), v = j / (ny - 1);
    pos.push(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u - largo * v, a[2] + (b[2] - a[2]) * u);
    nor.push(n[0], 0, n[1]); uv.push(u, v);
  }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const k = j * nx + i; idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1); }
  const mesh = createMesh(app.graphicsDevice, pos, { normals: nor, uvs: uv, indices: idx });
  const e = new Entity('tela'); e.addComponent('render', { meshInstances: [new MeshInstance(mesh, material)], castShadows: sombra, receiveShadows: true });
  return { e, mesh, base: Float32Array.from(pos), pos: Float32Array.from(pos), nx, ny, n, fase: Math.random() * 6.28 };
}

// la textura de una prenda: un color con algo de trama (y rayas, las toallas)
function textura(app, color, rayas) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, 64, 64);
  if (rayas) { g.fillStyle = rayas; for (let y = 6; y < 64; y += 16) g.fillRect(0, y, 64, 4); }
  const im = g.getImageData(0, 0, 64, 64);
  for (let i = 0; i < im.data.length; i += 4) { const r = (Math.random() - 0.5) * 14; for (let k = 0; k < 3; k++) im.data[i + k] = Math.max(0, Math.min(255, im.data[i + k] + r)); }
  g.putImageData(im, 0, 0);
  const t = new Texture(app.graphicsDevice, { width: 64, height: 64, mipmaps: true }); t.setSource(c); return t;
}

export function montarVida({ app, vida, materiales, q }) {
  const telas = [], R = semilla(388);
  const raiz = new Entity('vida'); app.root.addChild(raiz);
  const mat = (color, rayas) => {
    const m = new StandardMaterial(); m.diffuseMap = textura(app, color, rayas); m.cull = CULLFACE_NONE; m.blendType = BLEND_NONE;
    m.gloss = 0.15; m.useMetalness = true; m.metalness = 0; m.update(); return m;
  };
  // la ropa: blanco, celestes, rosa, gris y alguna toalla a rayas; camisetas, sábanas y toallas
  const colores = [['#ecebe6'], ['#e8e6df'], ['#a9c4dc'], ['#d9a9b4'], ['#8d9095'], ['#f2efe8', '#5d86b5'], ['#2e3a55'], ['#e9d9a6'], ['#c9d8c5', '#ffffff']].map(([c, r]) => mat(c, r));
  if (q.get('ropa') !== '0') {
    for (const bc of vida.balcones) {
      if (R() > 0.22) continue; // (en uno de cada cinco balcones)
      const L = Math.hypot(bc.b[0] - bc.a[0], bc.b[2] - bc.a[2]); if (L < 0.9) continue;
      const d = [(bc.b[0] - bc.a[0]) / L, (bc.b[2] - bc.a[2]) / L], fuera = 0.06;
      const y = bc.a[1] + 0.02; // (colgada del pasamanos, por fuera)
      let s = 0.08 + R() * 0.2;
      while (s < L - 0.3) {
        const tipo = R(), ancho = tipo < 0.45 ? 0.45 + R() * 0.15 : tipo < 0.8 ? 0.5 + R() * 0.2 : 1.0 + R() * 0.5, largo = tipo < 0.45 ? 0.55 : tipo < 0.8 ? 0.7 : 0.85;
        if (s + ancho > L - 0.05) break;
        const p0 = [bc.a[0] + d[0] * s + bc.n[0] * fuera, y, bc.a[2] + d[1] * s + bc.n[1] * fuera];
        const p1 = [p0[0] + d[0] * ancho, y, p0[2] + d[1] * ancho];
        // (la ropa, sin sombra: cada prenda era una llamada de dibujo más en cada cascada, y su sombra en la pared apenas se
        // ve; con los carteles, Malfeitos llegaba a las 1.200 llamadas. Los faldones de los toldos sí la dan)
        const t_ = tela(app, colores[Math.floor(R() * colores.length)], p0, p1, largo, bc.n, 5, 5, false);
        t_.fuerza = 0.18; raiz.addChild(t_.e); telas.push(t_);
        s += ancho + 0.06 + R() * 0.25;
        if (R() < 0.3) s += 0.5;
      }
    }
  }
  // los faldones de los toldos verdes, con la lona del propio toldo (el material «toldo» de las fachadas)
  // (una copia sin la oclusión horneada, el mapa de normales ni la opacidad: piden un segundo juego de UV y tangentes que
  // esta tela no tiene, y la opacidad de la lona la dejaba sin dibujar)
  let lona = materiales.find((m) => m.name.startsWith('toldo'));
  if (lona) { lona = lona.clone(); lona.aoMap = null; lona.normalMap = null; lona.opacityMap = null; lona.opacity = 1; lona.cull = CULLFACE_NONE; lona.update(); }
  if (lona) for (const td of vida.toldos) {
    const t_ = tela(app, lona, td.a, td.b, td.alto, td.n, 14, 3);
    // (las rayas como en el resto de la lona: ocho en 1,6 m, a lo largo)
    const uv = []; for (let j = 0; j < 3; j++) for (let i = 0; i < 14; i++) uv.push((td.u0 + (td.u1 - td.u0) * i / 13) / 1.6, j / 2 * 0.15);
    t_.mesh.setUvs(0, uv); t_.mesh.update();
    t_.fuerza = 0.08; raiz.addChild(t_.e); telas.push(t_);
  }
  let t = 0;
  // (a más de «tope» m de la cámara, la tela ni se dibuja ni se mueve: de lejos no se ve, y cada una era una llamada de
  // dibujo más su sombra; ?telas=1000 las deja todas)
  const tope = parseFloat(q.get('telas') || '45'), tope2 = tope * tope; let cam = null;
  app.on('update', (dt) => {
    t += dt; const w = viento(t);
    cam = cam || app.root.findComponents('camera')[0]?.entity; const P = cam?.getPosition();
    for (const c of telas) {
      const { base, pos, nx, ny, n, fase, fuerza } = c;
      if (P) {
        const cerca = (base[0] - P.x) ** 2 + (base[2] - P.z) ** 2 < tope2 * (fuerza < 0.1 ? 2.25 : 1); // (los toldos, hasta 1,5 veces más lejos)
        if (c.e.enabled !== cerca) c.e.enabled = cerca;
        if (!cerca) continue;
      }
      for (let j = 1; j < ny; j++) {
        const v = j / (ny - 1), caida = v ** 1.4;
        for (let i = 0; i < nx; i++) {
          const k = (j * nx + i) * 3, u = i / (nx - 1);
          const ola = Math.sin(t * (2.1 + w * 2.5) + fase + u * 3.1 + v * 1.7) * (0.35 + 0.65 * w) + Math.sin(t * 5.3 + fase * 2 + u * 7) * 0.25 * w;
          const sale = fuerza * caida * (w * 0.9 + 0.25 * ola);
          pos[k] = base[k] + n[0] * sale; pos[k + 2] = base[k + 2] + n[1] * sale;
          pos[k + 1] = base[k + 1] + Math.abs(sale) * 0.35 * caida; // (al salir, sube un poco: la tela no se estira)
        }
      }
      c.mesh.setPositions(pos); c.mesh.update();
    }
  });
  return { telas: telas.length, viento };
}

// ---- los vecinos sentados a la puerta (tools/blender/vecinos.py): cada uno en una silla de vida.json, mirando a la
// calle, sentado quieto o charlando (los que tienen otra silla al lado), y con la cabeza siguiendo a la chica cuando
// pasa a menos de 8 m. Se cargan después de la calle, y solo con ?vecinos=1: de serie las sillas quedan vacías
export async function montarVecinos({ app, vida, carpeta, glb, chica, q }) {
  if (q.get('vecinos') !== '1' || !vida.sillas.length) return [];
  // (las sillas del tramo que se anda primero; las de dos en dos, para los que charlan)
  const sillas = vida.sillas.map((s, i) => ({ ...s, i, par: vida.sillas.some((o, j) => j !== i && Math.hypot(o.p[0] - s.p[0], o.p[2] - s.p[2]) < 1.2) }))
    .filter((s) => s.p[2] > 0 && s.p[2] < 140).sort((a, b) => (b.par - a.par) || (a.p[2] - b.p[2]));
  const quien = [2, 3, 0, 1]; // (las vecinas, en el par de sillas; los hombres, en las sueltas)
  const cargar = (n) => new Promise((ok) => {
    const a = new Asset('vecino' + n, 'container', { url: glb(carpeta + 'vecino' + n + '.glb') });
    a.once('load', () => ok(a)); a.once('error', () => ok(null)); app.assets.add(a); app.assets.load(a);
  });
  const vecinos = [];
  await Promise.all(sillas.slice(0, 4).map(async (s, k) => {
    const a = await cargar(quien[k]); if (!a) return;
    const e = a.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    const raiz = new Entity('vecino' + quien[k]); raiz.addChild(e); app.root.addChild(raiz);
    // (en el asiento: el centro de la silla, que es donde la animación de sentado pone la cadera)
    const atras = parseFloat(q.get('vecatras') || '0'), alto = parseFloat(q.get('vecalto') || '0');
    raiz.setPosition(s.p[0] - s.mira[0] * atras, s.p[1] + alto, s.p[2] - s.mira[1] * atras);
    raiz.setEulerAngles(0, Math.atan2(s.mira[0], s.mira[1]) * 180 / Math.PI, 0);
    e.addComponent('anim', { activate: true });
    const clip = (n) => a.resource.animations.find((x) => x.resource.name === n)?.resource || a.resource.animations[0].resource;
    e.anim.assignAnimation(s.par ? 'charla' : 'sentado', clip(s.par ? 'charla' : 'sentado'));
    e.anim.baseLayer.activeStateCurrentTime = Math.random() * 3;
    vecinos.push({ raiz, cabeza: e.findByName('mixamorig:Head'), cuello: e.findByName('mixamorig:Neck'), giro: 0, frente: s.mira });
  }));
  // (los materiales de MakeHuman salen todos transparentes y se ordenaban mal: la cara, con agujeros. Opacos, y con
  // recorte por alfa solo lo que lo necesita: pelo, cejas y pestañas)
  for (const w of vecinos) for (const r of w.raiz.findComponents('render')) for (const mi of r.meshInstances) {
    const m = mi.material; if (m._vecino) continue; m._vecino = true;
    const recorte = /pelo|eyebrow|eyelash|short0|bob0|opacity/i.test(m.name);
    m.blendType = BLEND_NONE; m.depthWrite = true;
    if (recorte) { m.alphaTest = 0.45; m.opacityMap = m.opacityMap || m.diffuseMap; m.opacityMapChannel = 'a'; m.cull = CULLFACE_NONE; }
    else { m.opacityMap = null; m.opacity = 1; m.alphaTest = 0; }
    m.update();
  }
  // la cabeza hacia la chica: un giro alrededor de la vertical, repartido entre el cuello y la cabeza, suave y con tope
  const qa = new Quat(), v = new Vec3();
  app.on('postupdate', (dt) => {
    const p = chica.getPosition();
    for (const w of vecinos) {
      if (!w.cabeza) continue;
      const c = w.cabeza.getPosition(); v.set(p.x - c.x, 0, p.z - c.z);
      const d = v.length();
      let objetivo = 0;
      if (d < 8 && d > 0.3) {
        const ang = Math.atan2(v.x, v.z) - Math.atan2(w.frente[0], w.frente[1]);
        const a_ = Math.atan2(Math.sin(ang), Math.cos(ang));
        objetivo = Math.abs(a_) < 1.9 ? Math.max(-1.2, Math.min(1.2, a_)) : 0; // (si queda detrás, no la sigue)
      }
      w.giro += (objetivo - w.giro) * Math.min(1, dt * 2.5);
      for (const [h, parte] of [[w.cuello, 0.4], [w.cabeza, 0.6]]) {
        if (!h) continue;
        qa.setFromAxisAngle(Vec3.UP, w.giro * parte * 180 / Math.PI); h.setRotation(qa.mul(h.getRotation().clone()));
      }
    }
  });
  return vecinos;
}

// ---- los animales y el coche que pasa. Las palomas (Sketchfab, CC BY: CREDITOS.md) se posan en bandadas en dos aleros
// y se quedan ahí, picoteando (a petición se quitó su vuelo, que se veía mal, y el gato; y luego también se dejaron de
// ver, «quita las palomas, pero que se escuchen»: su arrullo sigue en src/sonido.js; ?palomas=1 las vuelve a poner).
// El coche (uno de los de la calle, coche.glb) baja despacio por el centro de la calzada cada minuto o dos, se para si
// la chica está delante y suena su motor. ?animales=0, ?coche=0 los quitan
export async function montarAnimales({ app, vida, centro, carpeta, glb, ctrl, sonido, q }) {
  const cargar = (url) => new Promise((ok) => {
    const a = new Asset(url, 'container', { url: glb(url) }); a.once('load', () => ok(a)); a.once('error', () => ok(null)); app.assets.add(a); app.assets.load(a);
  });
  const azar = (a, b) => a + Math.random() * (b - a);
  const estado = { palomas: [], coche: null };

  // -- las palomas
  if (q.get('animales') !== '0' && q.get('palomas') === '1') {
    const pa = await cargar(carpeta + 'animales/paloma.glb');
    if (pa) {
      // (dos aleros que se ven al andar: uno a 50–70 m y otro a 90–110 m del cruce con Nueva, de los que dan a la calle)
      const aleros = [[50, 70], [90, 110]].map(([z0, z1]) => vida.aleros.filter((a) => Math.min(a.a[2], a.b[2]) > z0 && Math.max(a.a[2], a.b[2]) < z1 && Math.hypot(a.b[0] - a.a[0], a.b[2] - a.a[2]) > 3)[0]).filter(Boolean);
      for (const al of aleros) {
        for (let i = 0, n = 5 + Math.floor(Math.random() * 4); i < n; i++) {
          const u = azar(0.1, 0.9);
          const p = new Vec3(al.a[0] + (al.b[0] - al.a[0]) * u, al.a[1] + parseFloat(q.get('palomay') || '0.08'), al.a[2] + (al.b[2] - al.a[2]) * u);
          const e = pa.resource.instantiateRenderEntity({ castShadows: true });
          const raiz = new Entity('paloma'); raiz.addChild(e); app.root.addChild(raiz);
          // (la caja de una malla con huesos no sirve para medirla: la paloma mide 0,87 de largo en su modelo, con las patas en 0)
          const k = 0.32 / 0.87; e.setLocalScale(k, k, k); e.setLocalPosition(0, 0, 0.14 * k);
          raiz.setPosition(p); raiz.setEulerAngles(0, Math.atan2(al.b[0] - al.a[0], al.b[2] - al.a[2]) * 180 / Math.PI + (Math.random() < 0.5 ? 0 : 180) + azar(-35, 35), 0);
          e.addComponent('anim', { activate: true }); e.anim.assignAnimation('posada', pa.resource.animations[0].resource); e.anim.baseLayer.activeStateCurrentTime = azar(0, 7); e.anim.speed = azar(0.8, 1.2);
          estado.palomas.push({ raiz, e, p });
        }
      }
    }
  }

  // -- el coche que pasa
  if (q.get('coche') !== '0' && centro) {
    const ca = await cargar(carpeta + 'coche.glb');
    if (ca) {
      const e = ca.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
      const raiz = new Entity('coche_que_pasa'); raiz.addChild(e); app.root.addChild(raiz);
      e.setLocalEulerAngles(0, parseFloat(q.get('cochegiro') || '-90'), 0);
      // (la caja, la del coche que se ve, para que la chica no lo atraviese: la de antes, de 1,7 × 1,4 × 4,2 m y con
      // la mitad bajo el suelo, se quedaba corta)
      const caja = new BoundingBox(); let primera = true;
      for (const r of e.findComponents('render')) for (const mi of r.meshInstances) { if (/^sombra/.test(mi.material.name)) continue; if (primera) { caja.copy(mi.aabb); primera = false; } else caja.add(mi.aabb); }
      raiz.addComponent('collision', primera ? { type: 'box', halfExtents: new Vec3(0.85, 0.7, 2.1), linearOffset: new Vec3(0, 0.7, 0) }
        : { type: 'box', halfExtents: caja.halfExtents.clone(), linearOffset: caja.center.clone() });
      raiz.addComponent('rigidbody', { type: 'kinematic' });
      raiz.enabled = false;
      // (por su carril, el hueco libre entre los coches aparcados y los contenedores y el otro bordillo: por el centro
      // de la calzada atravesaba la fila de coches donde la calle es estrecha)
      const P = centro.carril || centro.puntos;
      estado.coche = { raiz, s: 0, v: 0, espera: parseFloat(q.get('cocheya') || '0') || azar(40, 90), motor: null, P, paso: centro.paso };
    }
  }

  // ---- cada fotograma
  let cuadro = 0;
  app.on('update', (dt) => {
    const c = ctrl.getPosition();
    // (rendimiento: las palomas a más de 35 m no animan; de lejos su picoteo no se ve)
    if ((cuadro++ & 15) === 0) for (const pl of estado.palomas) pl.e.anim.enabled = Math.hypot(pl.p.x - c.x, pl.p.z - c.z) < 35;
    const k = estado.coche;
    if (k) {
      if (!k.raiz.enabled) {
        k.espera -= dt;
        if (k.espera <= 0) {
          // (sale 50 m por detrás de la chica, o desde el cruce con Nueva)
          const i = Math.max(0, Math.round(c.z / k.paso) - 25); k.s = i * k.paso; k.v = 4; k.raiz.enabled = true;
          if (sonido && !k.motor) { k.pn = sonido.panner([0, 0.6, 0], 4, 80); k.motor = sonido.sonar('motor', k.pn, { gan: 0, bucle: true }); }
        }
      } else {
        const i = Math.min(k.P.length - 2, Math.floor(k.s / k.paso)), f = k.s / k.paso - i;
        const [x0, z0] = k.P[i], [x1, z1] = k.P[i + 1];
        const x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f, dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
        // (se para si la chica está delante, a menos de 7 m y a menos de 1,8 m del eje de su camino)
        const ax = (c.x - x) * dx / L + (c.z - z) * dz / L, lat = Math.abs(-(c.x - x) * dz / L + (c.z - z) * dx / L);
        // (y al final de su carril, en el ceda el paso de Estacada, se queda parado: pasado el cruce no cabe con la fila
        // de coches aparcados; desaparece cuando la chica ya no está cerca)
        const fin = (k.P.length - 2) * k.paso;
        const objetivo = (ax > 0 && ax < 7 && lat < 1.8) || k.s > fin - 6 ? 0 : 4.2;
        k.v += Math.max(-4 * dt, Math.min(1.2 * dt, objetivo - k.v));
        k.s = Math.min(fin, k.s + k.v * dt);
        k.raiz.setPosition(x, 0, z); k.raiz.setEulerAngles(0, Math.atan2(dx, dz) * 180 / Math.PI, 0);
        if (k.motor) {
          const ct = sonido.ctx.currentTime + 0.05;
          k.pn.positionX.setTargetAtTime(x, ct, 0.05); k.pn.positionZ.setTargetAtTime(z, ct, 0.05);
          k.motor.s.playbackRate.setTargetAtTime(0.85 + k.v * 0.06, ct, 0.2); k.motor.g.gain.setTargetAtTime(0.45, ct, 0.5);
        }
        if ((k.s > fin - 8 && k.v < 0.05 && Math.hypot(c.x - x, c.z - z) > 35) || z > c.z + 90) {
          k.raiz.enabled = false; k.espera = azar(60, 120);
          if (k.motor) k.motor.g.gain.setTargetAtTime(0, sonido.ctx.currentTime, 0.3);
        }
      }
    }
  });
  return estado;
}

// ---- lo que se mueve solo por la calle (a petición: «dinámicas en el entorno»): los cables que cruzan la calle,
// mecidos por el viento con un vaivén que no se repite, y hojas secas que arrastran las rachas. (Los pájaros que se veían
// volar y el gato que cruzaba se quitaron a petición: «los pájaros son horribles, que no se vean volar así; quita los
// gatos».) ?dinamicas=0 lo quita
export async function montarDinamicas({ app, vida, ctrl, q }) {
  if (q.get('dinamicas') === '0') return null;
  const azar = (a, b) => a + Math.random() * (b - a);
  const plano = (color, rayas) => { const m = new StandardMaterial(); m.diffuseMap = textura(app, color, rayas); m.cull = CULLFACE_NONE; m.gloss = 0.2; m.useMetalness = true; m.metalness = 0; m.update(); return m; };
  const estado = { cables: [], hojas: [] };
  let t = 0;

  // -- los cables: un tubo de 5 lados por cable, con su comba; el viento lo mece de lado (más en el centro del vano)
  const negro = new StandardMaterial(); negro.diffuse.set(0.05, 0.05, 0.05); negro.gloss = 0.35; negro.useMetalness = true; negro.metalness = 0; negro.update();
  const N = 24, LADOS = 5;
  // (todos los cables en una sola malla: eran 28 llamadas de dibujo, más su sombra en cada cascada)
  const todos = { base: [], nor: [], idx: [] };
  for (const c of vida.cables || []) {
    const a = c.a, b = c.b, dx = b[0] - a[0], dz = b[2] - a[2], L = Math.hypot(dx, dz) || 1;
    const h = [-dz / L, 0, dx / L], r = (c.grueso || 0.012) / 2;
    const base = [], nor = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, y = a[1] + (b[1] - a[1]) * u - c.comba * 4 * u * (1 - u);
      for (let k = 0; k < LADOS; k++) {
        const th = k / LADOS * Math.PI * 2, ch = Math.cos(th), sh = Math.sin(th);
        nor.push(h[0] * ch, sh, h[2] * ch);
        base.push(a[0] + dx * u + h[0] * ch * r, y + sh * r, a[2] + dz * u + h[2] * ch * r);
      }
    }
    const v0 = todos.base.length / 3;
    for (let i = 0; i < N; i++) for (let k = 0; k < LADOS; k++) { const p0 = v0 + i * LADOS + k, p1 = v0 + i * LADOS + (k + 1) % LADOS; idx.push(p0, p0 + LADOS, p1, p1, p0 + LADOS, p1 + LADOS); }
    // (cada cable con su ritmo: un vano largo y combado oscila más despacio y más; «o» es dónde empieza en la malla)
    estado.cables.push({ o: v0 * 3, h, centro: [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2],
      amp: 0.04 + 0.16 * c.comba, w1: azar(0.7, 1.2) / Math.sqrt(0.5 + c.comba), w2: azar(1.7, 2.6), f1: azar(0, 6.28), f2: azar(0, 6.28) });
    for (const x of base) todos.base.push(x); for (const x of nor) todos.nor.push(x); for (const x of idx) todos.idx.push(x);
  }
  let mallaCables = null, baseCables = null, posCables = null;
  if (todos.idx.length) {
    mallaCables = createMesh(app.graphicsDevice, todos.base, { normals: todos.nor, indices: todos.idx });
    baseCables = Float32Array.from(todos.base); posCables = Float32Array.from(todos.base);
    const e = new Entity('cables'); e.addComponent('render', { meshInstances: [new MeshInstance(mallaCables, negro)], castShadows: true, receiveShadows: false }); app.root.addChild(e);
  }

  // -- las hojas secas: unas pocas en el suelo cerca de la chica, que las rachas arrastran dando vueltas
  const hojaM = createMesh(app.graphicsDevice, [-0.03, 0, -0.045, 0.03, 0, -0.045, 0.03, 0, 0.045, -0.03, 0, 0.045], { normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 1, 1, 0, 1], indices: [0, 1, 2, 0, 2, 3] });
  const mH = [plano('#8a6a3a'), plano('#a07a40'), plano('#6e5232')];
  const DIR = new Vec3(0.55, 0, 0.83); // (la brisa sube la calle)
  for (let i = 0; i < 10; i++) {
    const e = new Entity('hoja'); e.addComponent('render', { meshInstances: [new MeshInstance(hojaM, mH[i % 3])], castShadows: false }); app.root.addChild(e);
    estado.hojas.push({ e, v: new Vec3(), giro: azar(0, 360), vg: 0, colocada: false });
  }

  const rayoA = new Vec3(), rayoB = new Vec3(), op = { filterCallback: (x) => x !== ctrl };
  const sueloEn = (x, z, y0 = 3) => { rayoA.set(x, y0, z); rayoB.set(x, -2, z); const r = app.systems.rigidbody.raycastFirst(rayoA, rayoB, op); return r ? r.point.y : 0; };

  let cuadro = 0;
  app.on('update', (dt) => {
    t += dt; const w = viento(t), c = ctrl.getPosition();
    // cables (rendimiento: uno de cada dos fotogramas, solo los de menos de 45 m, y sin recalcular su caja: se mueven
    // unos centímetros)
    if (mallaCables && cuadro++ & 1) {
      let movido = false;
      for (const k of estado.cables) {
        if (Math.hypot(k.centro[0] - c.x, k.centro[1] - c.z) > 45) continue;
        const s = k.amp * (w * (0.55 * Math.sin(t * k.w1 + k.f1) + 0.25 * Math.sin(t * k.w2 + k.f2)) + 0.15 * w), v = 0.25 * k.amp * w * Math.sin(t * k.w1 * 1.9 + k.f2);
        const base = baseCables, pos = posCables, h = k.h;
        for (let i = 0; i <= N; i++) {
          const f = Math.sin(Math.PI * i / N), dx = h[0] * s * f, dz = h[2] * s * f, dy = v * f;
          for (let j = 0; j < LADOS; j++) { const o = k.o + (i * LADOS + j) * 3; pos[o] = base[o] + dx; pos[o + 1] = base[o + 1] + dy; pos[o + 2] = base[o + 2] + dz; }
        }
        movido = true;
      }
      if (movido) { mallaCables.setPositions(posCables); mallaCables.update(PRIMITIVE_TRIANGLES, false); }
    }
    // hojas
    for (const h of estado.hojas) {
      const p = h.e.getPosition();
      if (!h.colocada || Math.hypot(p.x - c.x, p.z - c.z) > 22) { // (se recolocan cerca de la chica, viento arriba)
        const x = c.x - DIR.x * azar(4, 14) + azar(-3, 3), z = c.z - DIR.z * azar(4, 14) + azar(-3, 3);
        h.e.setPosition(x, sueloEn(x, z, 1.5) + 0.005, z); h.colocada = true; h.v.set(0, 0, 0); continue;
      }
      const empuje = Math.max(0, w - 0.45) * 6; // (solo con las rachas)
      h.v.x += (DIR.x * empuje - h.v.x * 1.5) * dt; h.v.z += (DIR.z * empuje - h.v.z * 1.5) * dt;
      const vel = Math.hypot(h.v.x, h.v.z); h.giro += vel * 400 * dt;
      if (vel < 0.05) continue; // (quieta: ni se mueve ni se busca el suelo)
      const x = p.x + h.v.x * dt, z = p.z + h.v.z * dt, salto = Math.min(0.12, vel * 0.04) * Math.abs(Math.sin(h.giro * 0.02));
      h.e.setPosition(x, sueloEn(x, z, p.y + 0.4) + 0.005 + salto, z); h.e.setEulerAngles(vel > 0.2 ? Math.sin(h.giro * 0.05) * 60 : 0, h.giro, 0);
    }
  });
  return estado;
}

// ---- los coches aparcados de cerca (fase 4): cada coche de la calle (coche_<k> en el .glb de la calle) se cambia, a
// menos de ?cerca=9 m de la cámara, por la versión de su modelo con más triángulos (coches_cerca.glb), con la pintura
// de ese coche; de la versión de lejos quedan solo sus matrículas y su sombra de contacto. Como mucho, cuatro a la vez
export async function montarCoches({ app, vida, carpeta, glb, camara, q }) {
  const dist = parseFloat(q.get('cerca') || '9');
  // (y los de más de ?lejos=70 m, apagados: con los 82 coches de las otras calles, las llamadas de dibujo pasaban de ~1.150
  // a ~2.250 en Malfeitos; tan lejos, entre casas, casi nunca se ven)
  const tope = parseFloat(q.get('lejos') || '70');
  if (!dist || !vida.coches?.length) return null;
  const a = await new Promise((ok) => { const x = new Asset('coches_cerca', 'container', { url: glb(carpeta + 'coches_cerca.glb') }); x.once('load', () => ok(x)); x.once('error', () => ok(null)); app.assets.add(x); app.assets.load(x); });
  if (!a) return null;
  if (q.get('refraccion') !== '1') a.resource.materials.forEach((m) => { const mt = m.resource; if (mt && mt.refraction > 0) { mt.refraction = 0; mt.update(); } }); // (los cristales, sin la refracción que dejaba ver el cielo morado: src/main.js)
  const modelos = a.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
  const coches = [];
  for (const c of vida.coches) {
    const lejos = app.root.findByName(c.nodo), base = modelos.findByName('cerca_' + c.tipo);
    if (!lejos?.render || !base) continue;
    const queda = /^(matricula|sombra)/; // (lo que se deja de la versión de lejos)
    // (la sombra de contacto, pegada al suelo, y la matrícula no dan sombra: eran dos llamadas más por coche en cada cascada)
    for (const mi of lejos.render.meshInstances) if (queda.test(mi.material.name)) mi.castShadow = false;
    coches.push({ c, lejos, base, cerca: null, mis: lejos.render.meshInstances.filter((mi) => !queda.test(mi.material.name)),
      pintura: lejos.render.meshInstances.find((mi) => mi.material.name.startsWith('pintura'))?.material });
  }
  // los coches de lejos, con instancias, solo con ?instancias=1 (a prueba): una llamada por malla y material, con las
  // matrices de los coches que se ven. Medido en Malfeitos (tools/perfil.py), salen más llamadas, no menos (1.928 contra
  // 1.771): los grupos no se recortan por la vista y van a todas las cascadas de la sombra, y sin coches quedan 1.578; los
  // coches no son lo que más pesa allí
  const grupos = new Map(), inst = q.get('instancias') === '1';
  if (inst) {
    for (const k of coches) for (const mi of k.lejos.render.meshInstances) {
      const clave = mi.mesh.id + '/' + mi.material.id;
      let g = grupos.get(clave);
      if (!g) { g = { mesh: mi.mesh, material: mi.material, piezas: [] }; grupos.set(clave, g); }
      g.piezas.push({ k, mi, queda: !k.mis.includes(mi) }); // (queda: la matrícula y la sombra, que siguen con el coche de cerca)
      mi.visible = false;
    }
    // (las piezas que no se repiten, la matrícula y la sombra de cada coche, que son mallas suyas: sueltas como antes, y
    // solo a menos de 40 m)
    for (const [clave, g] of grupos) if (g.piezas.length < 2) { const s = g.piezas[0]; s.mi.visible = true; (s.k.solas ||= []).push(s); grupos.delete(clave); }
    const raiz = new Entity('coches_instancias'); app.root.addChild(raiz);
    const formato = VertexFormat.getDefaultInstancingFormat(app.graphicsDevice);
    for (const g of grupos.values()) {
      g.datos = new Float32Array(16 * g.piezas.length);
      g.vb = new VertexBuffer(app.graphicsDevice, formato, g.piezas.length, { usage: BUFFER_DYNAMIC, data: g.datos });
      g.mi = new MeshInstance(g.mesh, g.material); g.mi.setInstancing(g.vb); g.mi.cull = false; g.mi.castShadow = true; g.mi.receiveShadow = true;
      const e = new Entity('inst'); e.addComponent('render', { meshInstances: [g.mi], castShadows: true, receiveShadows: true }); raiz.addChild(e);
    }
  }
  const llenar = () => {
    for (const g of grupos.values()) {
      let i = 0;
      for (const { k, mi, queda } of g.piezas) {
        if (!k.lejos.enabled || (k.cerca?.enabled && !queda)) continue;
        g.datos.set(mi.node.getWorldTransform().data, 16 * i++);
      }
      g.vb.setData(g.datos); g.mi.instancingCount = i;
    }
  };
  const poner = (k, sí) => {
    if (sí && !k.cerca) {
      // (la copia de su modelo, en el mismo sitio que el de lejos y con su pintura)
      k.cerca = k.base.clone(); app.root.addChild(k.cerca);
      // (solo las ?sombracerca=6 piezas más grandes dan sombra: la carrocería y las ruedas. Los modelos de cerca traen
      // hasta 52 materiales, y cada pieza era una llamada más en cada cascada de la sombra; los faros, insignias y
      // embellecedores no dan una sombra que se vea)
      const mis_ = k.cerca.findComponents('render').flatMap((r) => r.meshInstances);
      const vol_ = (mi) => { const h = mi.aabb.halfExtents; return h.x * h.y * h.z; };
      const n_ = parseInt(q.get('sombracerca') || '6', 10);
      // (y nunca el cristal, la matrícula ni los faros: el cristal salía entre las seis más grandes)
      const sinSombra_ = /glass|cristal|vidrio|matricula|plate|faro|light|lamp/i;
      mis_.forEach((mi) => { mi.castShadow = false; });
      mis_.filter((mi) => !sinSombra_.test(mi.material?.name || '')).sort((a_, b_) => vol_(b_) - vol_(a_)).forEach((mi, i) => { mi.castShadow = i < n_; });
      k.cerca.setPosition(k.lejos.getPosition()); k.cerca.setRotation(k.lejos.getRotation()); k.cerca.setLocalScale(k.lejos.getWorldTransform().getScale());
      if (k.pintura) for (const r of k.cerca.findComponents('render')) for (const mi of r.meshInstances) if (k.c.pintura.some((p) => mi.material.name.startsWith(p))) mi.material = k.pintura;
    }
    if (k.cerca) k.cerca.enabled = sí;
    if (!inst) for (const mi of k.mis) mi.visible = !sí;
  };
  let n = 0;
  app.on('update', () => {
    if (n++ & 7) return;
    const p = camara.getPosition();
    const orden = coches.map((k) => [k, k.lejos.getPosition().distance(p)]).sort((x, y) => x[1] - y[1]);
    orden.forEach(([k, d], i) => {
      poner(k, d < dist && i < 4); if (k.lejos.enabled !== d < tope) k.lejos.enabled = d < tope;
      if (k.solas) for (const s of k.solas) s.mi.visible = d < 40 && !(k.cerca?.enabled && !s.queda);
    });
    if (inst) llenar();
  });
  return { coches, cerca: () => coches.filter((k) => k.cerca?.enabled).map((k) => k.c.nodo), grupos: () => grupos.size };
}
