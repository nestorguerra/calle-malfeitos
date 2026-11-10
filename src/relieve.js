// El relieve (docs/mapa_contraste.md): el pueblo no es plano (24 m de desnivel en el casco), pero la escena se levanta
// en plano y así sigue todo lo que no es dibujar: la física, los coches, los vecinos, las fichas y las herramientas de
// medida. El relieve se pone solo al dibujar: cada vértice sube o baja lo que diga la altura del terreno en su sitio
// (escenas/<escena>/relieve.json, del modelo del terreno del IGN: tools/relieve.py), menos la del sitio de la cámara.
// Es lo mismo que ver el pueblo con sus cuestas desde una cámara que anda por ellas, y cerca de la cámara casi no mueve
// nada, así que lo que el motor da por visible lo sigue siendo. Con ?relieve=0, plano como antes.
import { ADDRESS_CLAMP_TO_EDGE, FILTER_LINEAR, FloatPacking, PIXELFORMAT_RGBA16F, SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL, ShaderChunks, Texture } from 'playcanvas';

export async function cargarRelieve(url) {
  const r = await fetch(url); if (!r.ok) throw new Error('relieve ' + r.status);
  const R = await r.json(), { x0, z0, paso, nx, nz } = R, h = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) h[j * nx + i] = R.h[j][i] / 100;
  // la altura del terreno en un punto del juego, respecto a la del origen (entre los cuatro puntos de la rejilla)
  const alto = (x, z) => {
    const u = Math.min(nx - 1.001, Math.max(0, (x - x0) / paso)), v = Math.min(nz - 1.001, Math.max(0, (z - z0) / paso)), i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j;
    return (h[j * nx + i] * (1 - a) + h[j * nx + i + 1] * a) * (1 - b) + (h[(j + 1) * nx + i] * (1 - a) + h[(j + 1) * nx + i + 1] * a) * b;
  };
  return { x0, z0, paso, nx, nz, h, alto, fuente: R.fuente };
}

// el trozo del motor que pone cada vértice en el mundo, con la altura del terreno sumada (no en lo que va pegado a la pantalla)
const GLSL = `
uniform sampler2D relieveMapa;
uniform vec4 relieveCaja;
uniform float relieveCamara;
`, GLSL_SUBE = `	#ifndef SCREENSPACE
		posW.y += textureLod(relieveMapa, (posW.xz - relieveCaja.xy) * relieveCaja.zw, 0.0).r - relieveCamara;
	#endif
	return posW;
}`;
const WGSL = `
var relieveMapa: texture_2d<f32>;
var relieveMapaSampler: sampler;
uniform relieveCaja: vec4f;
uniform relieveCamara: f32;
`, WGSL_SUBE = `	#ifndef SCREENSPACE
		posW = vec4f(posW.x, posW.y + textureSampleLevel(relieveMapa, relieveMapaSampler, (posW.xz - uniform.relieveCaja.xy) * uniform.relieveCaja.zw, 0.0).r - uniform.relieveCamara, posW.z, posW.w);
	#endif
	return posW;
}`;

// lo activa: la textura de alturas, el trozo cambiado para todos los materiales y, cada fotograma, la altura bajo la cámara
export function activarRelieve(app, R, camara) {
  const device = app.graphicsDevice, { nx, nz, paso } = R;
  const datos = new Uint16Array(nx * nz * 4);
  for (let k = 0; k < nx * nz; k++) datos[4 * k] = FloatPacking.float2Half(R.h[k]);
  const mapa = new Texture(device, { name: 'relieve', width: nx, height: nz, format: PIXELFORMAT_RGBA16F, mipmaps: false, minFilter: FILTER_LINEAR, magFilter: FILTER_LINEAR,
    addressU: ADDRESS_CLAMP_TO_EDGE, addressV: ADDRESS_CLAMP_TO_EDGE, levels: [datos] });
  for (const [lengua, cabecera, sube] of [[SHADERLANGUAGE_GLSL, GLSL, GLSL_SUBE], [SHADERLANGUAGE_WGSL, WGSL, WGSL_SUBE]]) {
    const trozos = ShaderChunks.get(device, lengua), antes = trozos.get('transformVS'), k = antes.indexOf('\treturn posW;\n}');
    if (k < 0) { console.warn('relieve: el motor ha cambiado y no se puede poner'); return false; }
    trozos.set('transformVS', cabecera + antes.slice(0, k) + sube + antes.slice(k + '\treturn posW;\n}'.length));
  }
  // (el centro del primer punto de la rejilla está en x0, z0: media casilla de la textura hacia dentro)
  device.scope.resolve('relieveMapa').setValue(mapa);
  device.scope.resolve('relieveCaja').setValue([R.x0 - paso / 2, R.z0 - paso / 2, 1 / (nx * paso), 1 / (nz * paso)]);
  const bajo = device.scope.resolve('relieveCamara'); bajo.setValue(0);
  app.on('prerender', () => { const c = camara(); if (c) { const p = c.getPosition(); bajo.setValue(R.alto(p.x, p.z)); } });   // («camara»: una función que da la cámara, que se crea después)
  return true;
}
