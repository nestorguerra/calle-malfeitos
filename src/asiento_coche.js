// Posturas y cuerpo sentado dentro del coche (compartido entre conducción en solitario y multijugador):
// - Carga una sola vez escenas/<escena>/coches_sentados.json y los clips medidos
//   escenas/chica/conduciendo_<tipo>.glb y copiloto_<tipo>.glb (tools/blender/chica_coche.py).
// - Sienta el muñeco propio dentro del coche que se conduce (src/conducir.js) o en el que se va de copiloto
//   (src/multi_coches.js), tanto con ?multi=0 como en sala.
// - En primera persona oculta únicamente cabeza/pelo/ojos (sin romper cuerpo, brazos, manos ni piernas), y los
//   restaura íntegros en vista exterior o al bajar.
import { Asset, Quat, Vec3 } from 'playcanvas';

const sentadosPorCarpeta = new Map(); // carpeta → { datos, promesa }
const clipsPorClave = new Map();      // clave → { asset, promesa }

export function cargarSentados(carpeta, q = null) {
  if (!carpeta || q?.get('sentados') === '0') return Promise.resolve({});
  const ya = sentadosPorCarpeta.get(carpeta);
  if (ya) return ya.promesa;
  const reg = { datos: {}, promesa: null };
  reg.promesa = fetch(carpeta + 'coches_sentados.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      if (j?.tipos) reg.datos = j.tipos;
      return reg.datos;
    })
    .catch(() => reg.datos);
  sentadosPorCarpeta.set(carpeta, reg);
  return reg.promesa;
}

export function sentadosListos(carpeta) {
  return sentadosPorCarpeta.get(carpeta)?.datos || {};
}

export function cargarClipCoche({ app, glb = (u) => u, carpetaChica = './escenas/chica/', nombre }) {
  if (!nombre) return Promise.resolve(null);
  const clave = carpetaChica + nombre;
  const ya = clipsPorClave.get(clave);
  if (ya) return ya.promesa;
  const reg = { asset: null, promesa: null };
  reg.promesa = new Promise((ok) => {
    const a = new Asset('coche_clip_' + nombre, 'container', { url: glb(carpetaChica + nombre + '.glb') });
    a.once('load', () => { reg.asset = a; ok(a); });
    a.once('error', (e) => { console.warn('coche_clip: ' + nombre, e); reg.asset = false; ok(null); });
    app.assets.add(a); app.assets.load(a);
  });
  clipsPorClave.set(clave, reg);
  return reg.promesa;
}

export function clipCocheListo({ app, glb = (u) => u, carpetaChica = './escenas/chica/', nombre }) {
  if (!nombre) return null;
  const clave = carpetaChica + nombre;
  let ya = clipsPorClave.get(clave);
  if (!ya) {
    cargarClipCoche({ app, glb, carpetaChica, nombre });
    ya = clipsPorClave.get(clave);
  }
  return ya?.asset || null;
}

const MAT_CABEZA_CHICA = /^(cabeza|pelo|pelo_mechones|long01|mechon|eyebrow|eyelashes)/i;
const MAT_CABEZA_PROPIO = /^(ojo|cornea|cejas|pestanas|cuero|pelo)$/i;
const ES_PELO_PRENDA = (mi) => {
  const n = mi.node?.name || '';
  const m = mi.material?.name || '';
  return MAT_CABEZA_PROPIO.test(m) || /pelo|melena|hair|coleta|trenza|afro|corto/i.test(n);
};

export function montarCuerpoCoche({ app, q, ctrl, muneco, mi, pista, glb, carpeta, carpetaChica = './escenas/chica/' }) {
  const sinCuerpo = q?.get('cuerpocoche') === '0';
  const promesaSentados = cargarSentados(carpeta, q);
  const capa = muneco?.anim?.baseLayer || null;
  const asignados = new Map(); // estado → nombre del clip cargado
  const est = {
    dentro: false,
    puesto: null,
    tipo: null,
    primeraPersona: false,
    cabezaOculta: false,
    clip: null,
    posLocal: null,
    token: 0,
    ocultas: [],
    sombrasAntes: [],
    huesoCabeza: null,
    escalaCabeza: null,
    escalaBase: muneco ? muneco.getLocalScale().clone() : new Vec3(1, 1, 1),
  };

  const huesoCabeza = () => {
    if (est.huesoCabeza) return est.huesoCabeza;
    est.huesoCabeza = muneco?.findByName('mixamorig:Head') || muneco?.findByName('Head') || null;
    return est.huesoCabeza;
  };

  function restaurarCabeza() {
    for (const mi_ of est.ocultas) mi_.visible = true;
    est.ocultas.length = 0;
    for (const [mi_, cs] of est.sombrasAntes) mi_.castShadow = cs;
    est.sombrasAntes.length = 0;
    const h = huesoCabeza();
    if (h && est.escalaCabeza) {
      h.setLocalScale(est.escalaCabeza);
      est.escalaCabeza = null;
    }
    if (mi) mi.ocultarMelena?.(false);
    est.cabezaOculta = false;
  }

  function aplicarCabeza(ocultar) {
    if (!muneco) return;
    if (!ocultar) { restaurarCabeza(); return; }
    if (est.cabezaOculta) {
      // (asegurar también si la melena simulada de personaje.js se reactivó)
      if (mi) mi.ocultarMelena?.(true);
      return;
    }
    est.ocultas.length = 0;
    est.sombrasAntes.length = 0;
    for (const r of muneco.findComponents('render')) {
      for (const m_ of r.meshInstances) {
        if (!m_.visible) continue;
        const mn = m_.material?.name || '';
        const en = r.entity?.name || '';
        const esCab = mi
          ? (ES_PELO_PRENDA(m_) || (mi.misPelo && mi.misPelo.includes(m_)))
          : (MAT_CABEZA_CHICA.test(mn) || /cabeza|pelo/i.test(en));
        if (esCab) {
          m_.visible = false;
          est.ocultas.push(m_);
        } else if (m_.castShadow) {
          // (en 1.ª persona de cerca, la autosombra del propio torso/brazos dibuja triángulos duros sobre la camiseta;
          // sigue recibiendo las sombras reales de la cabina y del techo)
          est.sombrasAntes.push([m_, m_.castShadow]);
          m_.castShadow = false;
        }
      }
    }
    if (mi) {
      mi.ocultarMelena?.(true);
      const h = huesoCabeza();
      if (h) {
        est.escalaCabeza = h.getLocalScale().clone();
        h.setLocalScale(0.001, 0.001, 0.001);
      }
    }
    est.cabezaOculta = true;
  }

  // (si el personaje del editor tiene melena simulada o el animador toca algo de la cabeza, mantenerla oculta en 1.ª persona)
  app.on('update', () => {
    if (!est.dentro || !est.cabezaOculta) return;
    if (mi) {
      mi.ocultarMelena?.(true);
      const h = huesoCabeza();
      if (h) h.setLocalScale(0.001, 0.001, 0.001);
    }
  });

  async function sentar({ padre, tipo, puesto = 'conductor', primeraPersona = false, ajuste = null }) {
    if (sinCuerpo || !muneco || !padre) return null;
    const tok = ++est.token;
    if (est.dentro) salir();
    est.token = tok; // (mantener token de esta llamada tras limpiar un estado previo)
    est.primeraPersona = !!primeraPersona;

    // (si la cámara de pie había ocultado las mallas por estar contra una pared, volver a encenderlas)
    for (const r of muneco.findComponents('render')) for (const m_ of r.meshInstances) m_.visible = true;
    restaurarCabeza();

    const datos = await promesaSentados;
    if (est.token !== tok || padre.destroyed) return null;

    const S = datos[tipo] || null;
    const base = S?.[puesto] || (puesto === 'conductor' ? [-0.15, 0.09, -0.36] : [-0.15, 0.09, 0.36]);
    const o = ajuste ? [base[0] + ajuste[0], base[1] + ajuste[1], base[2] + ajuste[2]] : base;
    const nombreClip = (puesto === 'conductor' ? 'conduciendo_' : 'copiloto_') + tipo;
    const estadoAnim = puesto === 'conductor' ? 'Conduciendo' : 'Copiloto';

    est.dentro = true;
    est.puesto = puesto;
    est.tipo = tipo;
    est.posLocal = [o[0], o[1], o[2]];

    muneco.reparent(padre);
    muneco.setLocalPosition(o[0], o[1], o[2]);
    muneco.setLocalEulerAngles(0, 90, 0);
    muneco.setLocalScale(est.escalaBase);
    muneco.enabled = true;
    // (quitar cualquier ladeo residual del tronco al entrar)
    const hijo = mi ? mi.raiz : muneco.children[0];
    if (hijo) hijo.setLocalEulerAngles(0, 0, 0);

    aplicarCabeza(est.primeraPersona);

    const asset = await cargarClipCoche({ app, glb, carpetaChica, nombre: nombreClip });
    if (est.token !== tok || !est.dentro || padre.destroyed) return null;

    if (asset && capa) {
      if (asignados.get(estadoAnim) !== nombreClip) {
        const track = mi?.retargetar ? mi.retargetar(asset) : (pista ? pista(asset, {}) : asset.resource?.animations?.[0]?.resource);
        if (track) {
          capa.assignAnimation(estadoAnim, track, 1, true);
          asignados.set(estadoAnim, nombreClip);
        }
      }
      if (asignados.get(estadoAnim) === nombreClip) {
        capa.transition(estadoAnim, 0);
        muneco.anim.speed = 1;
        est.clip = nombreClip;
      }
    }
    return S;
  }

  function primeraPersona(on) {
    est.primeraPersona = !!on;
    if (est.dentro) aplicarCabeza(est.primeraPersona);
  }

  function salir() {
    est.token++;
    if (!est.dentro) return;
    est.dentro = false;
    est.puesto = null;
    est.tipo = null;
    est.primeraPersona = false;
    est.clip = null;
    est.posLocal = null;
    restaurarCabeza();
    if (muneco && !muneco.destroyed && ctrl && !ctrl.destroyed) {
      muneco.reparent(ctrl);
      muneco.setLocalPosition(0, -1, 0);
      muneco.setLocalRotation(Quat.IDENTITY);
      muneco.setLocalScale(est.escalaBase);
      for (const r of muneco.findComponents('render')) for (const m_ of r.meshInstances) m_.visible = true;
      if (capa) {
        try { capa.transition('Quieto', 0); } catch (e) { /* sin grafo */ }
        muneco.anim.speed = 1;
      }
    }
  }

  return {
    sentar,
    primeraPersona,
    salir,
    datos: () => sentadosListos(carpeta),
    promesaSentados,
    estado: () => ({
      dentro: est.dentro,
      puesto: est.puesto,
      tipo: est.tipo,
      primeraPersona: est.primeraPersona,
      cabezaOculta: est.cabezaOculta,
      clip: est.clip,
      posLocal: est.posLocal,
      padre: muneco?.parent?.name || null,
      anim: capa?.activeState || null,
    }),
  };
}
