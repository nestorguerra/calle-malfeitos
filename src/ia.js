// Los vecinos con IA (15-11-2026; el usuario: «que los NPC usen una IA para comportarse de forma inteligente (busca algo
// gratis por internet)… en comportamiento y en hablar»; eligió la IA gratis que funciona dentro del navegador):
// - El modelo: Qwen 2.5 de 1.500 millones de parámetros (Alibaba, Apache 2.0), cuantizado a 4 bits para WebGPU por MLC
//   (WebLLM, Apache 2.0). La primera vez que se le habla se bajan sus 880 MB de Hugging Face y quedan en la caché del
//   navegador; después arranca en unos segundos. Nada sale del navegador: ni lo que se escribe ni lo que contestan.
// - Corre en un trabajador (src/ia_trabajador.js), con su propia GPU.
// - Solo en el ordenador con WebGPU y medias precisiones (shader-f16); en el móvil, o sin eso, los vecinos hablan con sus
//   frases de siempre (src/acciones.js). ?ia=0 la quita; ?ia=1 la deja también en el móvil.
// - Cada vecino tiene su nombre, su edad, lo que estaba haciendo, dónde y a qué hora, y se acuerda de la charla. Contesta
//   en una o dos frases y elige qué hace (lo cumple src/gente.js): nada, saludar, acompañarla un rato, irse o sentarse.
//   La respuesta va con una gramática JSON (la de WebLLM), así que siempre trae las dos cosas bien escritas.
const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.87/+esm';
export const MODELO = 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC';
export const HACE = ['nada', 'saludar', 'acompanar', 'irse', 'sentarse'];
const ESQUEMA = JSON.stringify({
  type: 'object',
  properties: { dice: { type: 'string' }, hace: { type: 'string', enum: HACE } },
  required: ['dice', 'hace'],
});

// ---- quién es cada vecino: un nombre del pueblo según su edad y si es hombre o mujer, su edad, y de qué vive
const NOMBRES = {
  mayor: [['Antonia', 'Isabel', 'Juana', 'Francisca', 'Dolores', 'Petra', 'Manuela', 'Rosario'], ['Manuel', 'Antonio', 'Francisco', 'José', 'Juan', 'Pedro', 'Agustín', 'Ramón']],
  adulto: [['Carmen', 'María José', 'Ana', 'Mercedes', 'Lourdes', 'Pilar', 'Inmaculada', 'Rocío'], ['José Luis', 'Juan Carlos', 'Miguel', 'Fernando', 'Javier', 'Ángel', 'Pedro', 'Luis']],
  joven: [['Lucía', 'Paula', 'Marta', 'Irene', 'Laura', 'Andrea', 'Sara', 'Elena'], ['Álvaro', 'Pablo', 'Sergio', 'Adrián', 'David', 'Jorge', 'Rubén', 'Iván']],
  nino: [['Martina', 'Sofía', 'Lola', 'Valeria', 'Carla', 'Noa'], ['Hugo', 'Mario', 'Leo', 'Daniel', 'Marcos', 'Alejandro']],
};
const OFICIO = {
  mayor: ['jubilado del campo, de toda la vida en las viñas y el olivar', 'jubilada; tuvo una tienda de ultramarinos', 'jubilado; fue albañil', 'jubilada; trabajó en la conservera', 'jubilado; fue panadero'],
  adulto: ['trabajas en el campo, en el tomate y el arroz', 'tienes un bar cerca de la plaza', 'das clase en el colegio', 'trabajas en una cooperativa', 'trabajas en el centro de salud', 'tienes un taller mecánico', 'trabajas en el ayuntamiento'],
  joven: ['estudias en Badajoz y vienes los fines de semana', 'acabas de terminar el instituto', 'trabajas en la cooperativa en verano', 'estudias un ciclo en Don Benito'],
  nino: ['vas al colegio del pueblo'],
};
const azarDe = (n) => { let s = n * 2654435761 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
let cuenta = 0;
export function persona(v) {
  if (v.ia) return v.ia;
  const r = azarDe(++cuenta * 7919 + (v.pi || 0) * 31), t = v.info?.tipo || 'adulto', h = v.info?.sexo ? 1 : 0;
  const lista = NOMBRES[t] || NOMBRES.adulto, nombre = lista[h][Math.floor(r() * lista[h].length)];
  const edad = { mayor: 68 + Math.floor(r() * 20), adulto: 32 + Math.floor(r() * 25), joven: 16 + Math.floor(r() * 9), nino: 7 + Math.floor(r() * 5) }[t] || 40;
  const of = (OFICIO[t] || OFICIO.adulto)[Math.floor(r() * (OFICIO[t] || OFICIO.adulto).length)];
  v.ia = { nombre, edad, tipo: t, hombre: !!h, oficio: of.replace(/^jubilado/, h ? 'jubilado' : 'jubilada').replace(/^jubilada/, h ? 'jubilado' : 'jubilada'), historial: [] };
  return v.ia;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function cuandoTexto(h, dia) {
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60), parte = h < 6 ? 'de la madrugada' : h < 13 ? 'de la mañana' : h < 21 ? 'de la tarde' : 'de la noche';
  return `${DIAS[dia]}, a las ${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${parte}`;
}
function haciendoTexto(v, o) {
  const a = o ? 'a' : 'o';
  switch (v.estado) {
    case 'sentado': return `sentad${a} en un banco, tomando el ${v.ia?.hora < 17 ? 'sol' : 'fresco'}`;
    case 'misa': return `en misa, sentad${a} en un banco de la iglesia`;
    case 'charla': return 'charlando con otros vecinos';
    case 'jugar': return 'jugando con otros niños';
    case 'andar': case 'andar_directo': return 'yendo andando a hacer un recado';
    case 'seguir': return 'acompañándola';
    default: return `parad${a} en la calle`;
  }
}

function sistema(p, c) {
  const o = !p.hombre, quien = p.tipo === 'nino' ? `Eres ${o ? 'una niña' : 'un niño'} de ${p.edad} años de Guareña; ${p.oficio}.`
    : `Eres ${p.nombre}, ${o ? 'una vecina' : 'un vecino'} de Guareña de ${p.edad} años; ${p.oficio}.`;
  return `${quien} Te llamas ${p.nombre}.
Guareña es un pueblo de unos 6.700 vecinos de la provincia de Badajoz, en Extremadura. Lo que sabes de él: la iglesia de Santa María, grande y de piedra, con la torre acabada en 1700 y un retablo dorado; la plaza de España, donde juegan los niños por la tarde; la calle Grande y la calle Malfeitos; el poeta Luis Chamizo, que escribía en castúo, era de aquí. Hay mucho campo alrededor: viñas, olivos, tomate y arroz.
Ahora es ${c.cuando} y estás ${c.donde}, ${c.haciendo}. ${c.lugares}
Una chica joven que no es del pueblo se ha parado a hablar contigo. Ella no se llama como tú: no sabes su nombre hasta que te lo diga.
Cómo hablas: como ${p.tipo === 'nino' ? 'un niño' : 'la gente'} de un pueblo extremeño, cercano y natural, en español de España. Eres amable con los forasteros. Frases cortas: una o dos, de menos de 35 palabras en total. La tratas de tú. Para indicar un sitio, usa solo lo que se dice arriba (lo lejos que está y hacia dónde); no inventes calles, nombres de personas ni datos que no sepas. Nunca digas que eres una IA, un programa o un personaje.
Además de hablar, decides qué haces ("hace"): "nada"; "saludar" (levantas la mano); "acompanar" (te vas con ella un rato: si te lo pide, o para llevarla a un sitio); "irse" (te despides y te vas: si te falta al respeto, si se despide o si tienes prisa); "sentarse" (te vas a sentar a un banco cercano, si te lo propone). Lo que haces tiene que ir con lo que dices.
Contesta solo con JSON: {"dice": "lo que dices", "hace": "nada"}`;
}
// (ejemplos, como si fueran charlas de antes: el modelo pequeño aprende de ellos el formato, a decir su nombre y qué
// hacer en cada caso. Lo que hay entre corchetes es una nota que pone el juego, src/acciones.js no la enseña)
// (cada vecino, con sus propios ejemplos de entre varios: con uno solo, el modelo lo repetía palabra por palabra)
function ejemplos(p) {
  const h = p.hombre ? 'o' : 'a', r = azarDe(p.nombre.length * 131 + p.edad * 7), uno = (l) => l[Math.floor(r() * l.length)];
  return [
    ['Hola, ¿cómo te llamas?', uno([`Me llamo ${p.nombre}. ¿Y tú, de dónde vienes?`, `${p.nombre}, para servirte. ¿Qué te trae por Guareña?`, `Yo soy ${p.nombre}. Tú no eres de aquí, ¿verdad?`]), 'saludar'],
    ['¿Vienes conmigo? [Te pide que la acompañes]', uno(['Venga, vamos, que me viene bien andar.', 'Anda, sí, te acompaño un rato.', 'Claro, vamos, que no tengo nada que hacer.']), 'acompanar'],
    ['Qué tonto eres. [Te está faltando al respeto]', uno(['Pues adiós, que no tengo por qué aguantar esto.', 'Hala, me voy, qué poca educación.', 'Mira, me voy, que así no se habla.']), 'irse'],
    ['¿Te sientas un rato? [Te propone sentarte]', uno([`Pues sí, que ya estoy cansad${h}.`, 'Venga, me siento un poco en ese banco.', 'No es mala idea, me voy a sentar.']), 'sentarse'],
  ].flatMap(([u, d, a]) => [{ role: 'user', content: u }, { role: 'assistant', content: JSON.stringify({ dice: d, hace: a }) }]);
}
// lo que pide la chica, por sus palabras: va como nota al modelo y sirve para que lo que hace cuadre con lo que dice
const INTENTOS = [
  ['insulto', /\b(pesad[oa]s?|imb[eé]cil|idiota|tont[oa]|est[uú]pid[oa]|maleducad[oa]|gilipollas|c[aá]llate|l[aá]rgate|vete ya|d[eé]jame en paz|feo|fea|asqueros[oa]|in[uú]til)\b/i, 'Te está faltando al respeto'],
  ['acompanar', /(acompa[ñn](a|e|as|es|arme|ame|[aá]me|ar)\b|ven(te)? conmigo|vienes conmigo|me llevas|ll[eé]vame|me ense[ñn]as|vamos juntos|v[eé]nte)/i, 'Te pide que la acompañes'],
  ['sentarse', /(si[eé]ntate|sentarte|t[eé] sientas|te sientas|descans(a|ar|es) un rato|si[eé]ntese)/i, 'Te propone sentarte'],
  ['despedida', /^(adi[oó]s|hasta (luego|pronto|ma[ñn]ana)|nos vemos|chao|me voy)/i, 'Se está despidiendo'],
];
const intento = (m) => { for (const [k, re, nota] of INTENTOS) if (re.test(m)) return { k, nota }; return null; };
const NIEGA = /(^\W*no\b|\bno\b.{0,25}\b(puedo|me apetece|tengo tiempo|voy|quiero|me viene)|lo siento|ahora no|otro d[ií]a|imposible|no,? gracias)/i;
// que lo que hace vaya con lo que dice y con lo que le han pedido: insultado, se va; si se le pide algo y no dice que no,
// lo hace; y no hace lo que nadie le ha pedido (acompañar o sentarse de la nada)
function coherente(hace, dice, it) {
  if (it?.k === 'insulto') return 'irse';
  if (it?.k === 'despedida') return 'despedirse';
  if (it?.k === 'acompanar' || it?.k === 'sentarse') return NIEGA.test(dice) ? (hace === 'irse' ? 'irse' : 'nada') : it.k;
  if (hace === 'acompanar' && !/(te acompa[ñn]o|vamos|ven conmigo|te llevo|te ense[ñn]o)/i.test(dice)) return 'nada';
  if (hace === 'sentarse' && !/(me siento|sentarme|me voy a sentar)/i.test(dice)) return 'nada';
  if (hace === 'irse' && !/(me voy|adi[oó]s|hasta luego|tengo prisa|me tengo que ir)/i.test(dice)) return 'nada';
  return hace;
}

export function montarIA({ q, movil }) {
  const apagada = q.get('ia') === '0' || (movil && q.get('ia') !== '1');
  let motor = null, cargando = null, progreso = 0, aviso = '', fallo = null, sirve = null;
  async function puede() {
    if (apagada || !navigator.gpu) return false;
    if (sirve !== null) return sirve;
    try { const a = await navigator.gpu.requestAdapter(); sirve = !!a && a.features.has('shader-f16'); } catch (e) { sirve = false; }
    return sirve;
  }
  function preparar(alAvanzar) {
    if (motor) return Promise.resolve(motor);
    if (cargando) return cargando;
    fallo = null;
    cargando = (async () => {
      const { CreateWebWorkerMLCEngine } = await import(WEBLLM);
      const trabajador = new Worker(new URL('./ia_trabajador.js', import.meta.url), { type: 'module' });
      motor = await CreateWebWorkerMLCEngine(trabajador, MODELO, { initProgressCallback: (r) => { progreso = r.progress || 0; aviso = r.text || ''; alAvanzar?.(progreso, aviso); } });
      return motor;
    })().catch((e) => { fallo = e; cargando = null; console.warn('ia:', e); throw e; });
    return cargando;
  }
  // una respuesta: lo que dice (llamando a alEscribir con lo que lleva, mientras lo escribe) y lo que hace
  async function responder({ v, contexto, mensaje, alEscribir }) {
    const p = persona(v); p.hora = contexto.hora;
    const c = { cuando: cuandoTexto(contexto.hora, contexto.dia), donde: contexto.donde, haciendo: haciendoTexto(v, !p.hombre), lugares: contexto.lugares || '' };
    const it = intento(mensaje);
    const mensajes = [{ role: 'system', content: sistema(p, c) }, ...ejemplos(p), ...p.historial.slice(-8), { role: 'user', content: it ? `${mensaje} [${it.nota}]` : mensaje }];
    const m = await preparar();
    let todo = '';
    const flujo = await m.chat.completions.create({ messages: mensajes, temperature: 0.7, top_p: 0.9, max_tokens: 140, stream: true, response_format: { type: 'json_object', schema: ESQUEMA } });
    for await (const trozo of flujo) {
      todo += trozo.choices?.[0]?.delta?.content || '';
      const d = /"dice"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(todo);
      if (d && alEscribir) alEscribir(desescapar(d[1]));
    }
    let r = null; try { r = JSON.parse(todo); } catch (e) { const d = /"dice"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(todo); r = { dice: d ? desescapar(d[1]) : '…', hace: 'nada' }; }
    const dice = String(r.dice || '').trim() || '…', propuesto = HACE.includes(r.hace) ? r.hace : 'nada', hace = coherente(propuesto, dice, it);
    p.historial.push({ role: 'user', content: mensaje }, { role: 'assistant', content: JSON.stringify({ dice, hace: hace === 'despedirse' ? 'nada' : hace }) });
    return { dice, hace, propuesto };
  }
  return { puede, preparar, responder, persona, estado: () => ({ apagada, listo: !!motor, cargando: !!cargando && !motor, progreso, aviso, fallo: fallo ? String(fallo) : null }) };
}
const desescapar = (s) => { try { return JSON.parse('"' + s.replace(/\\$/, '') + '"'); } catch (e) { return s.replace(/\\n/g, ' ').replace(/\\"/g, '"'); } };
