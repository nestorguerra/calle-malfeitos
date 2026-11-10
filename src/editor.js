// El editor de personajes (docs/personaje_rediseno.md, fase A): el cuerpo de Anny con todas sus formas
// (tools/blender/personaje_editor.py) y, en escenas/personaje/editor.json, cómo se calculan sus pesos. Cada parámetro
// del fenotipo (sexo, edad, peso, músculo, altura, proporciones, pecho, firmeza y la mezcla de origen) da unos pesos por
// interpolación lineal entre sus anclas; cada una de las 624 formas originales de Anny vale el producto de los pesos de
// las variaciones de las que está hecha, y la base compacta lleva eso a 64 formas (c · proyección). Los huesos siguen a
// la misma base: su cabeza en reposo es la plantilla más la base por esos pesos, así que el esqueleto se ajusta al cuerpo
// y las animaciones (solo giros, más la posición de la cadera a su escala) le sirven a cualquiera. Los deslizadores de
// cara y cuerpo son formas sueltas de «más» y «menos»; los 52 gestos, el parpadeo.
import {
  AnimClipHandler, AnimComponentSystem, AnimEvents, AnimStateGraphHandler, AnimTrack, AppBase, AppOptions, Asset, AssetListLoader,
  BLEND_NONE, CULLFACE_NONE,
  CameraComponentSystem, Color, ContainerHandler, Entity, EnvLighting, FILLMODE_FILL_WINDOW, LightComponentSystem, Mat4,
  Mouse, Quat, RESOLUTION_AUTO, RenderComponentSystem, SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL, SHADOW_PCF3_32F, ShaderChunks,
  StandardMaterial, TEXTURETYPE_RGBE, TONEMAP_ACES, TextureHandler, TouchDevice, Vec3, createGraphicsDevice,
} from 'playcanvas';
import { crearMelena } from './melena.js';
import { PROPIAS, girosDePiernas } from './personaje.js';

const q = new URLSearchParams(location.search);
const RUTA = './escenas/personaje/';
const canvas = document.getElementById('lienzo');
const device = await createGraphicsDevice(canvas, { deviceTypes: q.get('gpu') === 'webgl2' ? ['webgl2'] : ['webgpu', 'webgl2'], antialias: true });
device.maxPixelRatio = Math.min(window.devicePixelRatio, 2);
const op = new AppOptions();
op.graphicsDevice = device; op.mouse = new Mouse(canvas); op.touch = new TouchDevice(canvas);
op.componentSystems = [RenderComponentSystem, CameraComponentSystem, LightComponentSystem, AnimComponentSystem];
op.resourceHandlers = [TextureHandler, ContainerHandler, AnimClipHandler, AnimStateGraphHandler];
const app = new AppBase(canvas); app.init(op);
app.setCanvasFillMode(FILLMODE_FILL_WINDOW); app.setCanvasResolution(RESOLUTION_AUTO);
addEventListener('resize', () => app.resizeCanvas());

// en el enlace de claude.ai los .glb van como .glb.wasm (window.SUFIJO_GLB) y los grandes, en trozos de medio mega
// (window.TROZOS: cuántos y su huella; tools/despliegue/trocear_editor.py), que aquí se juntan en memoria; en local, enteros
async function bajar(ruta) {
  const tr = window.TROZOS?.[ruta];
  if (!tr) return ruta.endsWith('.glb') ? ruta + (window.SUFIJO_GLB || '') : ruta;
  const [n, h] = tr;
  const partes = await Promise.all(Array.from({ length: n }, (_, i) => fetch(`${ruta}.${h}.p${i}.wasm`).then((r) => {
    if (!r.ok) throw new Error(`No se pudo bajar ${ruta} (trozo ${i}): ${r.status}`); return r.arrayBuffer();
  })));
  return URL.createObjectURL(new Blob(partes));
}
const contenedor = async (nombre, ruta) => new Asset(nombre, 'container', { url: await bajar(ruta), filename: ruta.split('/').pop() });
const datos = await (await fetch(RUTA + 'editor.json')).json();
const A = {
  cuerpo: await contenedor('cuerpo', RUTA + 'cuerpo.glb'),
  quieto: await contenedor('quieto', RUTA + 'quieto.glb'),
  andar: await contenedor('andar', RUTA + 'andar.glb'),
  luz: new Asset('luz', 'texture', { url: './escenas/malfeitos_gris/cielo_luz.png' }, { mipmaps: false, type: TEXTURETYPE_RGBE }),
};
await new Promise((ok) => new AssetListLoader(Object.values(A), app.assets).load(ok));
app.start();

// ---- la luz: la de ambiente, de un cielo casi gris y cálido (el de la calle); el sol, con su sombra, y una de relleno
app.scene.envAtlas = EnvLighting.generateAtlas(EnvLighting.generateLightingSource(A.luz.resource));
app.scene.skyboxIntensity = 0.9; app.scene.exposure = 1.0;
const sol = new Entity('sol');
sol.addComponent('light', { type: 'directional', color: new Color(1, 0.95, 0.88), intensity: 2.2, castShadows: true, shadowDistance: 6,
  shadowResolution: 2048, shadowType: SHADOW_PCF3_32F, shadowBias: 0.2, normalOffsetBias: 0.04 });
sol.setLocalEulerAngles(50, 35, 0); app.root.addChild(sol);
const relleno = new Entity('relleno');
relleno.addComponent('light', { type: 'directional', color: new Color(0.75, 0.82, 1), intensity: 0.6, castShadows: false });
relleno.setLocalEulerAngles(30, 200, 0); app.root.addChild(relleno);
const suelo = new Entity('suelo');
const mSuelo = new StandardMaterial(); mSuelo.diffuse = new Color(0.32, 0.31, 0.3); mSuelo.gloss = 0.2; mSuelo.update();
suelo.addComponent('render', { type: 'cylinder', material: mSuelo }); suelo.setLocalScale(3, 0.02, 3); suelo.setLocalPosition(0, -0.01, 0);
app.root.addChild(suelo);

// ---- la cámara, que gira alrededor del personaje (arrastrar) y se acerca (rueda o pellizco)
const camara = new Entity('camara');
camara.addComponent('camera', { clearColor: new Color(0.085, 0.088, 0.1), fov: 30, nearClip: 0.05, farClip: 50, toneMapping: TONEMAP_ACES });
app.root.addChild(camara);
const orbita = { giro: 20, alto: 8, dist: 4.2, mira: new Vec3(0, 0.95, 0) };
const destino = { ...orbita, mira: orbita.mira.clone() };
const vistas = { cuerpo: { dist: 4.2, alto: 8, y: 0.95 }, cara: { dist: 0.9, alto: 3, y: null } };
let arrastre = null;
canvas.addEventListener('pointerdown', (e) => { arrastre = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!arrastre) return;
  destino.giro -= (e.clientX - arrastre.x) * 0.4; destino.alto = Math.max(-20, Math.min(60, destino.alto + (e.clientY - arrastre.y) * 0.25));
  arrastre = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointerup', () => { arrastre = null; });
canvas.addEventListener('wheel', (e) => { destino.dist = Math.max(0.6, Math.min(7, destino.dist * Math.exp(e.deltaY * 0.0012))); e.preventDefault(); }, { passive: false });

// ---- el personaje
const raiz = new Entity('personaje'); app.root.addChild(raiz);
const modelo = A.cuerpo.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
raiz.addChild(modelo);
const mis = modelo.findComponents('render').flatMap((r) => r.meshInstances);
const conMorph = mis.filter((mi) => mi.morphInstance);
// la piel del cuerpo (la de más huesos: los ojos, las cejas y las pestañas llevan la suya, con menos)
const pieles = [...new Set(mis.map((mi) => mi.skinInstance).filter(Boolean))];
const skin = pieles.reduce((a, b) => (b.bones.length > a.bones.length ? b : a));
// los índices de cada forma por su nombre, malla a malla (el cuerpo tiene todas; los adornos, solo las que los mueven)
const indices = new Map();
for (const mi of conMorph) {
  mi.morphInstance.morph.targets.forEach((t, i) => {
    if (!indices.has(t.name)) indices.set(t.name, []);
    indices.get(t.name).push([mi.morphInstance, i]);
  });
}
const pon = (nombre, w) => { for (const [m, i] of indices.get(nombre) || []) m.setWeight(i, w); };
const material = (n) => mis.map((mi) => mi.material).find((m) => m.name === n);
const piel = material('piel');

// ---- la piel: la luz que se cuela bajo ella y el brillo de dos capas. PlayCanvas no trae dispersión bajo la piel, así
// que en su material se cambia cómo suma la luz de cada foco: cada canal cae con su propia curva (el rojo, más
// despacio), así que cerca de la línea de sombra la piel se ve roja, como la carne a contraluz; las tres curvas llegan
// a cero en la línea, sin pasarla, porque detrás la corta la sombra y quedaría una raya. El especular sigue con su
// coseno de siempre. Encima, la capa de barniz de PlayCanvas hace de la grasa: un segundo brillo, más fino y más débil
// que el de la piel seca. Con ?piel=plana, sin nada de esto (para comparar).
const CURVA = [0.8, 0.97, 1.06];  // (el exponente de cada canal, rojo, verde y azul: menos de 1, más luz cerca de la sombra)
function pielRealista(m) {
  const k = CURVA.map((x) => x.toFixed(3));
  const funcion = {
    [SHADERLANGUAGE_GLSL]: `
vec3 pielDifusa(float nl) {
	return pow(vec3(max(nl, 1e-5)), vec3(${k}));
}
`,
    [SHADERLANGUAGE_WGSL]: `
fn pielDifusa(nl: f32) -> vec3f {
	return pow(vec3f(max(nl, 1e-5)), vec3f(${k}));
}
`,
  };
  const cambios = {
    [SHADERLANGUAGE_GLSL]: [
      ['dAtten *= getLightDiffuse(litArgs_worldNormal, vec3(0.0), dLightDirNormW);', 'float nlPiel = dot(litArgs_worldNormal, -dLightDirNormW);'],
      ['dDiffuseLight += (dAtten * lightColor) * (1.0 - litArgs_specularity);', 'dDiffuseLight += (dAtten * pielDifusa(nlPiel) * lightColor) * (1.0 - litArgs_specularity); dAtten *= max(nlPiel, 0.0);'],
      ['dDiffuseLight += dAtten * lightColor;', 'dDiffuseLight += dAtten * pielDifusa(nlPiel) * lightColor; dAtten *= max(nlPiel, 0.0);'],
    ],
    [SHADERLANGUAGE_WGSL]: [
      ['dAtten = dAtten * getLightDiffuse(litArgs_worldNormal, vec3(0.0), dLightDirNormW);', 'let nlPiel: f32 = dot(litArgs_worldNormal, -dLightDirNormW);'],
      ['dDiffuseLight = dDiffuseLight + ((dAtten * lightColor) * (1.0 - litArgs_specularity));', 'dDiffuseLight = dDiffuseLight + ((dAtten * pielDifusa(nlPiel) * lightColor) * (1.0 - litArgs_specularity)); dAtten = dAtten * max(nlPiel, 0.0);'],
      ['dDiffuseLight = dDiffuseLight + (dAtten * lightColor);', 'dDiffuseLight = dDiffuseLight + (dAtten * pielDifusa(nlPiel) * lightColor); dAtten = dAtten * max(nlPiel, 0.0);'],
    ],
  };
  for (const lengua of [SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL]) {
    const base = ShaderChunks.get(device, lengua);
    let luz = base.get('lightFunctionLightPS');
    for (const [de, a] of cambios[lengua]) {
      if (!luz.includes(de)) { console.warn('piel: no está', de); return false; }
      luz = luz.split(de).join(a);
    }
    m.getShaderChunks(lengua).set('lightFunctionLightPS', luz);
    m.getShaderChunks(lengua).set('lightDiffuseLambertPS', base.get('lightDiffuseLambertPS') + funcion[lengua]);
  }
  m.shaderChunksVersion = '2.8';
  m.clearCoat = 0.1; m.clearCoatGloss = 0.7;  // (la grasa)
  m.update();
  return true;
}
if (piel && q.get('piel') !== 'plana') pielRealista(piel);
// los ojos, las cejas y las pestañas (de MakeHuman, CC0; los iris, propios): la córnea casi transparente pero con su
// reflejo entero (el brillo húmedo); las cejas y las pestañas, del color del vello, con la textura solo de transparencia
const cornea = material('cornea');
if (cornea) { cornea.opacityFadesSpecular = false; cornea.depthWrite = false; cornea.specularityFactor = 0.6; cornea.update(); }
const vello = ['cejas', 'pestanas', 'pelo'].map(material).filter(Boolean);
for (const m of vello) {
  if (m.diffuseMap && m.name !== 'pelo') {
    // (la textura de MakeHuman es casi toda transparente: con más opacidad, los pelos salen del color que se elija y no
    // grisáceos; y con poco brillo, que el vello no reluce)
    m.opacityMap = m.diffuseMap; m.opacityMapChannel = 'a'; m.diffuseMap = null; m.diffuseVertexColor = false;
    m.opacity = m.name === 'cejas' ? 1.8 : 1.4; m.specularityFactor = 0.3;
  }
  m.update();
}
const ojo = material('ojo');
// (el blanco del ojo, sin saturar con el sol; y el globo casi sin brillo propio: el reflejo es de la córnea, y si no, el
// cielo en el globo deja el iris gris)
if (ojo) { ojo.diffuse = new Color(0.84, 0.82, 0.8); ojo.specularityFactor = 0.2; ojo.update(); }
const iris = new Map();
function ponIris(color) {
  if (!ojo || !datos.colores_ojos?.includes(color)) return;
  const pon_ = (tex) => { ojo.diffuseMap = tex; ojo.update(); };
  if (iris.has(color)) { const a = iris.get(color); if (a.resource) pon_(a.resource); else a.ready(() => pon_(a.resource)); return; }
  const a = new Asset('iris_' + color, 'texture', { url: RUTA + 'ojos/' + color + '.jpg' });
  iris.set(color, a); a.ready(() => pon_(a.resource)); app.assets.add(a); app.assets.load(a);
}

// los huesos: su giro en reposo (de la matriz inversa de enlace) se queda; su posición, la que dé el cuerpo
const ibp = skin.skin.inverseBindPose, huesos = skin.bones;
const giros = huesos.map((_, i) => { const m = ibp[i].clone().invert(); const qu = new Quat(); qu.setFromMat4(m); return qu; });
const deHueso = new Map(huesos.map((h, i) => [h.name, i]));
const indiceJson = datos.huesos.map((n) => deHueso.get(n));
const padreDe = huesos.map((h) => deHueso.get(h.parent?.name));
const caderaPlantilla = datos.cabezas[datos.huesos.indexOf('mixamorig:Hips')]?.[2] || 0.95;

// ---- las animaciones: solo los giros, más la posición de la cadera (que se escala a la altura de cada cuerpo)
modelo.addComponent('anim', { activate: true });
const soloGiros = (track) => {
  const curvas = track.curves.filter((c) => c.paths.every((p) => p.propertyPath[0] === 'localRotation' ||
    (p.propertyPath[0] === 'localPosition' && p.entityPath[p.entityPath.length - 1] === 'mixamorig:Hips')));
  return new AnimTrack(track.name, track.duration, track.inputs, track.outputs, curvas, new AnimEvents([]));  // (con su lista de eventos, aunque vacía: sin ella, el clip no arranca)
};
for (const n of ['quieto', 'andar']) modelo.anim.assignAnimation(n, soloGiros(A[n].resource.animations[0].resource));
let animActual = 'quieto';
modelo.anim.baseLayer.play?.('quieto');
const cadera = huesos[deHueso.get('mixamorig:Hips')];

// ---- el estado del personaje
const ROPA_DE_SERIE = { conjunto: 'camiseta_blanca', calzado: 'zapatillas', pelo: 'corto' };
const TIPOS = ['conjunto', 'calzado', 'pelo'];
const estado = { fenotipo: {}, deslizadores: {}, tono: [0.93, 0.83, 0.74], ojos: 'marron', vello: [0.09, 0.06, 0.04], ropa: { ...ROPA_DE_SERIE } };
const reiniciar = () => {
  for (const p of datos.parametros) estado.fenotipo[p.clave] = p.defecto;
  for (const d of datos.deslizadores) estado.deslizadores[d.clave] = 0;
  estado.tono = [0.93, 0.83, 0.74]; estado.ojos = 'marron'; estado.vello = [0.09, 0.06, 0.04]; estado.ropa = { ...ROPA_DE_SERIE };
};
reiniciar();
try { const g = JSON.parse(localStorage.getItem('personaje') || 'null'); if (g) Object.assign(estado, g); } catch (e) { /* sin almacenamiento */ }

// los pesos de la base compacta para un fenotipo (lo mismo que anny.models.phenotype, comprobado a 0,000 mm)
function pesosFenotipo(fen) {
  const val = {};
  for (const [g, vars] of Object.entries(datos.grupos_variaciones)) {
    if (g === 'race') continue;
    const an = datos.anclas[g], x = fen[g] ?? 0.5, w = new Array(an.length).fill(0);
    if (x <= an[0]) w[0] = 1; else if (x >= an[an.length - 1]) w[an.length - 1] = 1;
    else { let j = 0; while (an[j + 1] < x) j++; const t = (x - an[j]) / (an[j + 1] - an[j]); w[j] = 1 - t; w[j + 1] = t; }
    vars.forEach((v, k) => { val[v] = w[k]; });
  }
  const r = ['african', 'asian', 'caucasian'].map((k) => fen[k] ?? 0.5), sr = r[0] + r[1] + r[2];
  ['african', 'asian', 'caucasian'].forEach((k, i) => { val[k] = sr > 0 ? r[i] / sr : 1 / 3; });
  const ph = datos.variaciones.map((v) => val[v]);
  const R = datos.rango, w = new Float64Array(R);
  datos.mascara.forEach((vs, k) => {
    let c = 1; for (const v of vs) c *= ph[v];
    if (c === 0) return;
    const fila = datos.proyeccion[k]; for (let r_ = 0; r_ < R; r_++) w[r_] += c * fila[r_];
  });
  return w;
}

const m4 = new Mat4(), pos = [];
let piernasRectas = new Map();  // (de pie, las piernas con la dirección del clip: girosDePiernas, src/personaje.js)
function aplicar() {
  const w = pesosFenotipo(estado.fenotipo);
  for (let r_ = 0; r_ < datos.rango; r_++) pon(`fenotipo${String(r_).padStart(2, '0')}`, w[r_]);
  for (const d of datos.deslizadores) { const v = estado.deslizadores[d.clave] || 0; pon(`${d.clave}+`, Math.max(v, 0)); pon(`${d.clave}-`, Math.max(-v, 0)); }
  // los huesos: la cabeza de cada uno (Blender, z arriba) a la del juego (y arriba, z hacia delante: x, z, −y)
  datos.cabezas.forEach((h0, j) => {
    let x = h0[0], y = h0[1], z = h0[2];
    for (let r_ = 0; r_ < datos.rango; r_++) { const b = datos.base_cabezas[r_][j]; x += w[r_] * b[0]; y += w[r_] * b[1]; z += w[r_] * b[2]; }
    pos[j] = new Vec3(x, z, -y);
  });
  const nuevo = new Map(); datos.huesos.forEach((n, j) => { if (indiceJson[j] !== undefined) nuevo.set(indiceJson[j], pos[j]); });
  huesos.forEach((h, i) => {
    const p = nuevo.get(i); if (!p) return;
    m4.setTRS(p, giros[i], Vec3.ONE); ibp[i].copy(m4).invert();  // (la matriz inversa de enlace, con la cabeza nueva)
    const k = padreDe[i];
    if (k === undefined || !nuevo.get(k)) h.setLocalPosition(p);
    else { const d_ = p.clone().sub(nuevo.get(k)); const inv = giros[k].clone().invert(); inv.transformVector(d_, d_); h.setLocalPosition(d_); }
  });
  // las otras pieles (si no comparten la del cuerpo), con las mismas matrices por el nombre de su hueso
  for (const s of pieles) {
    if (s.skin.inverseBindPose === ibp) continue;
    s.bones.forEach((h, j) => { const i = deHueso.get(h.name); if (i !== undefined) s.skin.inverseBindPose[j].copy(ibp[i]); });
  }
  piernasRectas = girosDePiernas({ datos, pos, giros, indiceJson, padreDe, huesos });
  // el suelo: la planta más baja del cuerpo nuevo
  let zmin = Infinity;
  datos.suela.forEach((_, i) => { let z = datos.suela_z[i]; for (let r_ = 0; r_ < datos.rango; r_++) z += w[r_] * datos.base_suela[r_][i]; zmin = Math.min(zmin, z); });
  raiz.setLocalPosition(0, -zmin, 0);
  const ih = datos.huesos.indexOf('mixamorig:Hips');
  escalaCadera = ih >= 0 ? pos[ih].y / caderaPlantilla : 1;
  if (piel) { piel.diffuse = new Color(...estado.tono); piel.update(); }
  for (const m of vello) { m.diffuse = new Color(...estado.vello); m.update(); }
  // (el peinado: su textura gris tiene la mediana a 0,5, así que el color va casi al doble, 1,7, que al doble el rubio
  // salía chillón; el casquete de prueba, de piel)
  for (const mi of puestas.pelo?.mis || []) { mi.material.diffuse = new Color(...estado.vello.map((x) => x * 1.7)); mi.material.update(); }
  if (casquete && (datos.prendas || []).some((p) => p.tipo === 'pelo')) casquete.material = piel;
  // (bajo la melena simulada, el cuero cabelludo va del color del pelo y sin brillo: de color de piel asomaba en la raya)
  if (casquete && puestas.pelo?.melena && piel) {
    if (!cuero) { cuero = piel.clone(); cuero.name = 'cuero'; cuero.specularityFactor = 0; }
    cuero.diffuse = new Color(...estado.vello.map((x) => Math.min(1, x * 2.2))); cuero.update(); casquete.material = cuero;
  }
  for (const p of datos.prendas || []) pon(`oculta:${p.clave}`, puestas[p.tipo]?.clave === p.clave ? 1 : 0);
  // (la ropa interior de prueba, pintada en la piel: con ropa de verdad encima, de piel, que no asome por el escote)
  for (const [mi, m] of provisional) mi.material = puestas.conjunto ? piel : m;
  const cabeza = pos[datos.huesos.indexOf('mixamorig:Head')];
  // (la melena simulada se hizo para el cuerpo de antes: si ha cambiado, se monta otra vez en cuanto se suelta el deslizador)
  if (puestas.pelo?.melena && puestas.pelo.cuerpo !== firmaCuerpo()) {
    clearTimeout(tMelena); tMelena = setTimeout(() => { const clave = estado.ropa.pelo; if (puestas.pelo?.melena) { quitarPrenda('pelo'); ponPrenda('pelo', clave); } }, 250);
  }
  if (cabeza) vistas.cara.y = cabeza.y - zmin + 0.07;
  vistas.cuerpo.y = (cabeza ? cabeza.y - zmin : 1.6) * 0.55;
}
let escalaCadera = 1, tMelena = 0, cuero = null;
// (lo que la melena necesita del cuerpo: dónde quedan la cabeza, los ojos y el suelo)
const firmaCuerpo = () => ['mixamorig:Head', 'eye.L', 'mixamorig:Spine1'].map((n) => { const p = pos[datos.huesos.indexOf(n)]; return p ? `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}` : ''; }).join(';') + ';' + raiz.getLocalPosition().y.toFixed(3);

// ---- la mirada: los globos giran con su hueso hacia la cámara (con sus límites, como un ojo de verdad), con pequeños
// saltos cada poco; los párpados y las pestañas acompañan con los gestos de mirar de ARKit (eyeLook*), que en los
// globos no están (giran de verdad, no se deforman)
const ADELANTE = new Vec3(0, 0, 1), IZQUIERDA = new Vec3(1, 0, 0), ARRIBA = new Vec3(0, 1, 0);
const GRADOS = { lado: 28, arriba: 13, abajo: 20 };  // (lo que gira el globo con cada gesto a 1, medido en sus formas)
const ojos = ['eye.L', 'eye.R'].map((n) => {
  const i = deHueso.get(n); if (i === undefined) return null;
  const h = huesos[i], inv = giros[i].clone().invert();
  return { h, lado: n.endsWith('L') ? 'Left' : 'Right', q0: h.getLocalRotation().clone(),
    f: inv.transformVector(ADELANTE, new Vec3()), l: inv.transformVector(IZQUIERDA, new Vec3()), u: inv.transformVector(ARRIBA, new Vec3()),
    giro: 0, alto: 0 };
}).filter(Boolean);
const mirada = { giro: 0, alto: 0, salto: { giro: 0, alto: 0 }, tSalto: 1 };
const qa = new Quat(), qb = new Quat(), va = new Vec3(), vb = new Vec3(), vc = new Vec3(), vd = new Vec3(), m3 = new Mat4();
function mirar(dt) {
  if (ojos.length < 2) return;
  mirada.tSalto -= dt;
  if (mirada.tSalto < 0) {  // (los saltos de la mirada: unos grados, cada uno o tres segundos)
    mirada.salto = { giro: (Math.random() - 0.5) * 6, alto: (Math.random() - 0.5) * 4 }; mirada.tSalto = 0.8 + Math.random() * 2.2;
  }
  const cam = camara.getPosition();
  for (const o of ojos) {
    const padre = o.h.parent;
    // el sentido hacia la cámara, en el marco del padre (la cabeza), frente al delante, la izquierda y el arriba del ojo en reposo
    va.sub2(cam, o.h.getPosition()).normalize();
    qa.copy(padre.getRotation()).invert(); qa.transformVector(va, va);
    o.q0.transformVector(o.f, vb); o.q0.transformVector(o.l, vc); o.q0.transformVector(o.u, vd);
    let g = Math.atan2(va.dot(vc), va.dot(vb)) * 180 / Math.PI, a = Math.asin(Math.max(-1, Math.min(1, va.dot(vd)))) * 180 / Math.PI;
    if (Math.abs(g) > 70 || va.dot(vb) < 0) { g = 0; a = 0; }  // (la cámara detrás o muy de lado: mira al frente)
    g = Math.max(-30, Math.min(30, g + mirada.salto.giro)); a = Math.max(-22, Math.min(16, a + mirada.salto.alto));
    const k = Math.min(1, dt * 18); o.giro += (g - o.giro) * k; o.alto += (a - o.alto) * k;
    // el giro: el delante en reposo llevado al sentido de la mirada
    const rg = o.giro * Math.PI / 180, ra = o.alto * Math.PI / 180;
    const dir = new Vec3().copy(vb).mulScalar(Math.cos(ra) * Math.cos(rg)).add(vc.clone().mulScalar(Math.cos(ra) * Math.sin(rg))).add(vd.clone().mulScalar(Math.sin(ra)));
    const eje = new Vec3().cross(vb, dir), s = eje.length();
    if (s > 1e-6) { qb.setFromAxisAngle(eje.mulScalar(1 / s), Math.atan2(s, vb.dot(dir)) * 180 / Math.PI); qb.mul(o.q0); o.h.setLocalRotation(qb); }
    else o.h.setLocalRotation(o.q0);
    // los párpados y las pestañas (hacia la izquierda del personaje, el ojo izquierdo mira afuera y el derecho adentro)
    const afuera = o.lado === 'Left' ? o.giro : -o.giro;
    pon(`eyeLookOut${o.lado}`, Math.max(0, afuera) / GRADOS.lado); pon(`eyeLookIn${o.lado}`, Math.max(0, -afuera) / GRADOS.lado);
    pon(`eyeLookUp${o.lado}`, Math.max(0, o.alto) / GRADOS.arriba); pon(`eyeLookDown${o.lado}`, Math.max(0, -o.alto) / GRADOS.abajo);
  }
}

// ---- el parpadeo y una respiración leve (los gestos de ARKit)
let tParpadeo = 2, t = 0;
const qPierna = new Quat();
app.on('update', (dt) => {
  t += dt;
  // la cadera de la animación, a la escala de este cuerpo (las animaciones son de un adulto de 1,7 m)
  if (cadera) { const p = cadera.getLocalPosition(); cadera.setLocalPosition(p.x * escalaCadera, p.y * escalaCadera, p.z * escalaCadera); }
  // de pie, las piernas con la dirección del clip (la animación acaba de poner sus giros: aquí se corrigen, cada fotograma)
  if (animActual === 'quieto') for (const [nombre, g] of piernasRectas) { const h = huesos[deHueso.get(nombre)]; h.setLocalRotation(qPierna.mul2(g[0], h.getLocalRotation()).mul(g[1])); }
  tParpadeo -= dt;
  const fase = tParpadeo < 0 ? Math.max(0, 1 - Math.abs(tParpadeo + 0.075) / 0.075) : 0;
  if (tParpadeo < -0.15) tParpadeo = 2 + Math.random() * 3;
  pon('eyeBlinkLeft', fase); pon('eyeBlinkRight', fase);
  mirar(dt);
  mecer(dt);
  puestas.pelo?.melena?.actualizar(dt);
  // la cámara
  for (const k of ['giro', 'alto', 'dist']) orbita[k] += (destino[k] - orbita[k]) * Math.min(1, dt * 8);
  orbita.mira.lerp(orbita.mira, destino.mira, Math.min(1, dt * 8));
  const g = orbita.giro * Math.PI / 180, a = orbita.alto * Math.PI / 180;
  camara.setPosition(orbita.mira.x + Math.sin(g) * Math.cos(a) * orbita.dist, orbita.mira.y + Math.sin(a) * orbita.dist, orbita.mira.z + Math.cos(g) * Math.cos(a) * orbita.dist);
  camara.lookAt(orbita.mira);
});

// ---- el vaivén del pelo: un muelle amortiguado por peinado, en el marco de la cabeza en reposo (el de las formas
// «vaiven_*», que la piel lleva con la cabeza). Su punto de equilibrio: la gravedad cuando la cabeza se inclina, y en
// contra de los acelerones del cuerpo y de los giros de la cabeza (el pelo se queda atrás). Cada forma, a 1, son 5 cm
const muelle = { p: new Vec3(), v: new Vec3(), pos: null, vel: new Vec3(), giro: null };
// (sin choques con el cuerpo: hacia delante, medio centímetro, que más metía la melena por dentro del hombro; a los
// lados, 3 cm; atrás, hasta 6)
const MUELLE = { hz: 1.5, amort: 0.22, gravedad: 0.12, inercia: 0.006, giro: 0.02, max: 0.06, adelante: 0.005, lado: 0.03 };
const qh = new Quat(), vg = new Vec3(), va2 = new Vec3();
function mecer(dt) {
  const iH = deHueso.get('mixamorig:Head'); if (!puestas.pelo || iH === undefined || dt <= 0) return;
  const cab = huesos[iH];
  // (del mundo al marco de la cabeza en reposo: la inversa de su giro de ahora por el de reposo)
  qh.copy(cab.getRotation()).mul(giros[iH].clone().invert()).invert();
  const pos = cab.getPosition().clone();
  if (!muelle.pos) { muelle.pos = pos.clone(); muelle.giro = qh.clone(); }
  const vel = pos.clone().sub(muelle.pos).mulScalar(1 / dt), acel = vel.clone().sub(muelle.vel).mulScalar(1 / dt);
  muelle.pos.copy(pos); muelle.vel.copy(vel);
  qh.transformVector(vg.set(0, -1, 0), vg); qh.transformVector(acel, va2);
  // (el giro de la cabeza alrededor de su vertical: lo que se mueve su delante, de un fotograma al otro)
  const ad = new Vec3(); muelle.giro.clone().invert().transformVector(new Vec3(0, 0, 1), ad); qh.transformVector(ad, ad);
  const giroV = Math.atan2(ad.x, ad.z) / dt; muelle.giro.copy(qh);
  const objetivo = new Vec3(vg.x * MUELLE.gravedad - va2.x * MUELLE.inercia + giroV * MUELLE.giro, 0,
    vg.z * MUELLE.gravedad - va2.z * MUELLE.inercia);
  const w = 2 * Math.PI * MUELLE.hz, pasos = Math.max(1, Math.ceil(dt / 0.008)), h = dt / pasos;
  for (let s = 0; s < pasos; s++) {
    const f = objetivo.clone().sub(muelle.p).mulScalar(w * w).sub(muelle.v.clone().mulScalar(2 * MUELLE.amort * w));
    muelle.v.add(f.mulScalar(h)); muelle.p.add(muelle.v.clone().mulScalar(h));
  }
  const l = muelle.p.length(); if (l > MUELLE.max) muelle.p.mulScalar(MUELLE.max / l);
  if (muelle.p.z > MUELLE.adelante) { muelle.p.z = MUELLE.adelante; muelle.v.z = Math.min(muelle.v.z, 0); }
  if (Math.abs(muelle.p.x) > MUELLE.lado) { muelle.p.x = Math.sign(muelle.p.x) * MUELLE.lado; muelle.v.x = 0; }
  pon('vaiven_izq', Math.max(0, muelle.p.x) / 0.05); pon('vaiven_der', Math.max(0, -muelle.p.x) / 0.05);
  pon('vaiven_ade', Math.max(0, muelle.p.z) / 0.05); pon('vaiven_atr', Math.max(0, -muelle.p.z) / 0.05);
}

// ---- la ropa (prendas de MakeHuman, CC0, ajustadas al cuerpo con sus formas): cada una en su .glb, que se carga al
// elegirla y se ata a los huesos del cuerpo por su nombre; sus formas se mueven con las del cuerpo (mismos nombres), y el
// cuerpo mete hacia dentro la piel que tapa (su forma «oculta:prenda»), para que no asome por la tela
// (más las propias, que no salen de MakeHuman: la melena simulada, src/melena.js)
const todas = [...(datos.prendas || []), ...PROPIAS];
const prendas = new Map(todas.map((p) => [p.clave, p]));
const casquete = mis.find((mi) => mi.material.name === 'pelo');
const provisional = mis.filter((mi) => ['ropa_arriba', 'ropa_abajo'].includes(mi.material.name)).map((mi) => [mi, mi.material]);
const cargadas = new Map(), puestas = {};
function quitarPrenda(tipo) {
  const p = puestas[tipo]; if (!p) return;
  const fuera = new Set(p.mis.map((mi) => mi.morphInstance).filter(Boolean));
  for (const [n, lista] of indices) indices.set(n, lista.filter(([m]) => !fuera.has(m)));
  for (const s of p.pieles) { const k = pieles.indexOf(s); if (k >= 0) pieles.splice(k, 1); }
  p.entidad.destroy(); delete puestas[tipo];
}
function ponPrenda(tipo, clave) {
  estado.ropa[tipo] = clave || null;
  if ((puestas[tipo]?.clave || null) === (clave || null)) return;
  if (!clave || !prendas.has(clave)) { quitarPrenda(tipo); aplicar(); return; }
  if (!cargadas.has(clave)) {
    cargadas.set(clave, (async () => {
      const a = await contenedor('prenda_' + clave, RUTA + 'prendas/' + clave + '.glb');
      app.assets.add(a);
      await new Promise((ok) => { a.ready(ok); app.assets.load(a); });
      if (prendas.get(clave).sim) a.sim = await (await fetch(RUTA + 'prendas/' + clave + '.json')).json();  // (la melena simulada: sus choques y sus capas)
      return a;
    })());
  }
  const montar = (a) => {
    if (estado.ropa[tipo] !== clave) return;  // (mientras cargaba, se eligió otra)
    quitarPrenda(tipo);
    const ent = a.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true });
    raiz.addChild(ent);
    const misP = ent.findComponents('render').flatMap((r) => r.meshInstances), ps = [];
    for (const mi of misP) {
      if (a.sim) continue;  // (la melena simulada lleva sus propios huesos, uno por punto de cada pelo guía)
      if (mi.skinInstance) { mi.skinInstance.resolve(modelo, mi.node); ps.push(mi.skinInstance); }
      mi.morphInstance?.morph.targets.forEach((tg, i) => { if (!indices.has(tg.name)) indices.set(tg.name, []); indices.get(tg.name).push([mi.morphInstance, i]); });
    }
    pieles.push(...ps);
    if (tipo === 'pelo') {
      // (tarjetas con transparencia: recortadas con alfa a cobertura, sin mezcla ni orden, por las dos caras; la textura
      // es gris y el color, el del vello)
      for (const mi of misP) {
        const m = mi.material; m.blendType = BLEND_NONE; m.depthWrite = true; m.alphaTest = 0.35; m.alphaToCoverage = true;
        m.cull = CULLFACE_NONE; m.specularityFactor = 0.15; m.update();
      }
    }
    puestas[tipo] = { clave, entidad: ent, mis: misP, pieles: ps };
    aplicar();
    if (a.sim) {
      // la melena, a la talla de esta cabeza (de su articulación a entre los ojos) y con los choques a la de este
      // cuerpo; se hace con el cuerpo como está ahora, así que si luego cambia se vuelve a montar (abajo, en aplicar)
      const pj = (n) => pos[datos.huesos.indexOf(n)], cab = pj('mixamorig:Head');
      const talla = cab.distance(pj('eye.L').clone().add(pj('eye.R')).mulScalar(0.5)) / a.sim.cabeza_ojos;
      puestas[tipo].melena = crearMelena({ app, entidad: ent, sim: a.sim, q, talla, escala: a.sim.cabeza_alto ? (cab.y + raiz.getLocalPosition().y) / a.sim.cabeza_alto : talla,
        hueso: (n) => huesos[deHueso.get(n)], ibm: (n) => ibp[deHueso.get(n)] });
      puestas[tipo].cuerpo = firmaCuerpo();
    }
  };
  cargadas.get(clave).then(montar).catch((err) => console.error('prenda', clave, err));
}

// ---- la interfaz: pestañas por grupo, un deslizador por parámetro
const GRUPOS = ['Cuerpo', 'Origen', 'Cabeza', 'Ojos', 'Nariz', 'Boca', 'Mandíbula', 'Orejas', 'Piel', 'Pelo', 'Ropa'];
const nav = document.getElementById('pestanas'), cont = document.getElementById('controles');
let grupo = 'Cuerpo';
function fila(nombre, valor, min, max, alCambiar) {
  const d = document.createElement('div'); d.className = 'fila';
  const l = document.createElement('label'); const n = document.createElement('span'); n.textContent = nombre; const v = document.createElement('span');
  const r = document.createElement('input'); r.type = 'range'; r.min = min; r.max = max; r.step = 0.01; r.value = valor;
  const muestra = () => { v.textContent = (+r.value).toFixed(2); };
  r.addEventListener('input', () => { muestra(); alCambiar(+r.value); aplicar(); });
  muestra(); l.append(n, v); d.append(l, r); return d;
}
// (los colores de los ojos y del vello: el nombre a la vista y su muestra)
const OJOS = { marron_oscuro: ['Marrón oscuro', '#3a2414'], marron: ['Marrón', '#6b4220'], avellana: ['Avellana', '#7a6a32'],
  verde: ['Verde', '#5e7a44'], azul: ['Azul', '#5e86aa'], gris: ['Gris', '#8a9196'] };
const VELLOS = [['Negro', [0.03, 0.025, 0.022]], ['Castaño oscuro', [0.09, 0.06, 0.04]], ['Castaño', [0.2, 0.12, 0.07]],
  ['Castaño claro', [0.36, 0.24, 0.14]], ['Rubio', [0.62, 0.48, 0.3]], ['Pelirrojo', [0.45, 0.17, 0.07]], ['Canoso', [0.62, 0.6, 0.57]]];
function opciones(titulo, tipo) {  // (una fila de botones con las prendas de un tipo, y «Ninguno»)
  const d = document.createElement('div'); d.className = 'fila';
  const l = document.createElement('label'); l.textContent = titulo;
  const o = document.createElement('div'); o.className = 'opciones';
  for (const p of [{ clave: null, nombre: 'Ninguno' }, ...todas.filter((x) => x.tipo === tipo)]) {
    const b = document.createElement('button'); b.textContent = p.nombre;
    b.setAttribute('aria-pressed', String((estado.ropa[tipo] || null) === p.clave));
    b.addEventListener('click', () => { ponPrenda(tipo, p.clave); pintar(); }); o.append(b);
  }
  d.append(l, o); return d;
}
function muestras(titulo, lista, activo, alElegir) {
  const d = document.createElement('div'); d.className = 'fila';
  const l = document.createElement('label'); l.textContent = titulo;
  const t_ = document.createElement('div'); t_.className = 'tonos';
  for (const [nombre, fondo, valor] of lista) {
    const b = document.createElement('button'); b.style.background = fondo; b.title = nombre; b.setAttribute('aria-label', nombre);
    b.setAttribute('aria-pressed', String(activo(valor)));
    b.addEventListener('click', () => { alElegir(valor); aplicar(); pintar(); }); t_.append(b);
  }
  d.append(l, t_); return d;
}
const css = (c) => `rgb(${c.map((x) => Math.round(Math.min(1, x * 1.6) * 255)).join(',')})`;
const TONOS = [[0.98, 0.88, 0.8], [0.93, 0.83, 0.74], [0.85, 0.7, 0.58], [0.72, 0.55, 0.42], [0.55, 0.39, 0.29], [0.38, 0.26, 0.19], [0.26, 0.17, 0.12]];
function pintar() {
  nav.replaceChildren(...GRUPOS.map((g) => {
    const b = document.createElement('button'); b.textContent = g; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(g === grupo));
    b.addEventListener('click', () => { grupo = g; pintar(); if (['Cabeza', 'Ojos', 'Nariz', 'Boca', 'Mandíbula', 'Orejas'].includes(g)) verVista('cara'); }); return b;
  }));
  const filas = [];
  for (const p of datos.parametros) if (p.grupo === grupo) filas.push(fila(p.nombre, estado.fenotipo[p.clave], 0, 1, (v) => { estado.fenotipo[p.clave] = v; }));
  for (const d of datos.deslizadores) if (d.grupo === grupo) filas.push(fila(d.nombre, estado.deslizadores[d.clave], -1, 1, (v) => { estado.deslizadores[d.clave] = v; }));
  if (grupo === 'Piel') {
    const d = document.createElement('div'); d.className = 'fila';
    const l = document.createElement('label'); l.textContent = 'Tono de la piel';
    const t_ = document.createElement('div'); t_.className = 'tonos';
    for (const c of TONOS) {
      const b = document.createElement('button'); b.style.background = `rgb(${c.map((x) => Math.round(x * 225)).join(',')})`;
      b.setAttribute('aria-pressed', String(c.every((x, i) => Math.abs(x - estado.tono[i]) < 1e-3))); b.title = 'Tono';
      b.addEventListener('click', () => { estado.tono = c.slice(); aplicar(); pintar(); }); t_.append(b);
    }
    d.append(l, t_); filas.push(d);
  }
  if (grupo === 'Pelo') {
    filas.push(opciones('Peinado', 'pelo'));
    filas.push(muestras('Color del pelo (también cejas y pestañas)', VELLOS.map(([n, c]) => [n, css(c), c]),
      (c) => c.every((x, i) => Math.abs(x - estado.vello[i]) < 1e-3), (c) => { estado.vello = c.slice(); }));
  }
  if (grupo === 'Ropa') { filas.push(opciones('Ropa', 'conjunto')); filas.push(opciones('Calzado', 'calzado')); }
  if (grupo === 'Ojos' && datos.colores_ojos) {
    filas.unshift(muestras('Color de los ojos', datos.colores_ojos.map((c) => [OJOS[c]?.[0] || c, OJOS[c]?.[1] || '#777', c]),
      (c) => c === estado.ojos, (c) => { estado.ojos = c; ponIris(c); }));
  }
  cont.replaceChildren(...filas);
}
function verVista(v) {
  const s = vistas[v]; destino.dist = s.dist; destino.alto = s.alto; destino.mira = new Vec3(0, s.y ?? 1.5, 0);
}
document.querySelectorAll('#vistas [data-vista]').forEach((b) => b.addEventListener('click', () => verVista(b.dataset.vista)));
document.querySelectorAll('#vistas [data-anim]').forEach((b) => b.addEventListener('click', () => {
  animActual = b.dataset.anim; modelo.anim.baseLayer.transition(animActual, 0.3);
}));
document.getElementById('azar').addEventListener('click', () => {
  const r = () => Math.random();
  for (const p of datos.parametros) estado.fenotipo[p.clave] = p.grupo === 'Origen' ? r() : Math.min(1, Math.max(0, 0.5 + (r() - 0.5) * 0.9));
  estado.fenotipo.age = 0.5 + r() * 0.4;  // (adultos)
  for (const d of datos.deslizadores) estado.deslizadores[d.clave] = (r() - 0.5) * 0.9;
  estado.tono = TONOS[Math.floor(r() * TONOS.length)].slice();
  if (datos.colores_ojos) { estado.ojos = datos.colores_ojos[Math.floor(r() * datos.colores_ojos.length)]; ponIris(estado.ojos); }
  estado.vello = VELLOS[Math.floor(r() * (VELLOS.length - 1))][1].slice();
  for (const tipo of TIPOS) {
    const lista = todas.filter((x) => x.tipo === tipo);
    if (lista.length) ponPrenda(tipo, lista[Math.floor(r() * lista.length)].clave);
  }
  aplicar(); pintar();
});
document.getElementById('reiniciar').addEventListener('click', () => {
  reiniciar(); for (const tipo of TIPOS) { const c = estado.ropa[tipo]; estado.ropa[tipo] = undefined; ponPrenda(tipo, c); }
  aplicar(); pintar();
});
document.getElementById('guardar').addEventListener('click', (e) => {
  try { localStorage.setItem('personaje', JSON.stringify(estado)); e.target.textContent = 'Guardado'; setTimeout(() => { e.target.textContent = 'Guardar'; }, 1500); }
  catch (err) { e.target.textContent = 'No se pudo guardar'; }
});
// un personaje de partida: la chica del vídeo (assets/personaje/del_video.json, ajustada con tools/personajes/medir_cuerpo.py)
document.getElementById('video')?.addEventListener('click', async () => {
  const p = await (await fetch('./assets/personaje/del_video.json')).json();
  reiniciar();
  Object.assign(estado.fenotipo, p.fenotipo); Object.assign(estado.deslizadores, p.deslizadores);
  for (const k of ['tono', 'ojos', 'vello']) if (p[k]) estado[k] = p[k];
  ponIris(estado.ojos);
  for (const tipo of TIPOS) ponPrenda(tipo, p.ropa?.[tipo] ?? estado.ropa[tipo]);
  aplicar(); pintar();
});

// salir a la calle: con este personaje (se guarda y se apunta que el juego lo use; la calle lo hornea al cargar,
// src/personaje.js) o con la del juego, que de serie es la chica del vídeo. Dentro de la página del juego (src/entrada.js) se vuelve a ella; en la
// página de pruebas del editor, se va a la del juego
const salir = (conEste) => {
  try {
    if (conEste) { localStorage.setItem('personaje', JSON.stringify(estado)); localStorage.setItem('personaje_en_calle', '1'); }
    else localStorage.removeItem('personaje_en_calle');
  } catch (err) { /* sin almacenamiento: sale la chica */ }
  if (window.EN_JUEGO) window.irA(false); else location.href = './index.html?escena=malfeitos_gris';
};
document.getElementById('calle')?.addEventListener('click', () => salir(true));
document.getElementById('chica')?.addEventListener('click', () => salir(false));

aplicar(); pintar(); verVista('cuerpo');
if (estado.ojos !== 'marron') ponIris(estado.ojos);
estado.ropa = { ...ROPA_DE_SERIE, ...(estado.ropa || {}) };
for (const tipo of TIPOS) { const c = estado.ropa[tipo]; estado.ropa[tipo] = undefined; ponPrenda(tipo, c); }
document.getElementById('carga').hidden = true;
window.editor = { app, estado, aplicar, datos, indices, pesosFenotipo, huesos, destino, ponIris, ponPrenda, puestas, muelle, MUELLE };
