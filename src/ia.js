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
// - Con GPT (15-11-2026; el usuario: «te voy a dar una API key para que utilices el modelo de GPT, el de Luna alto… para
//   mantener conversaciones coherentes y comportamientos coherentes»): si en este navegador se ha guardado una clave de
//   OpenAI (el botón «Usar GPT» de la charla, src/acciones.js), contesta GPT-5.6 Luna por la API de Respuestas de
//   OpenAI, con el razonamiento «alto» y la respuesta en un esquema JSON estricto. La clave se guarda solo en este
//   navegador (localStorage) y solo se manda a api.openai.com: no va en el código ni en la web publicada, que cualquiera
//   puede leer. ?iamodelo= y ?iaesfuerzo= (minimal, low, medium, high) los cambian. Sin clave, o si OpenAI falla, la IA
//   del navegador de siempre.
// - Para todos, por defecto (15-11-2026; el usuario: «que se quede guardado para siempre, aunque le pase el enlace a otra
//   persona»): GPT a través del servidor de 388 Pueblos en Render (/api/vecinos, en el repositorio 388-pueblos). La clave
//   va allí, en su panel, y no en esta web; el servidor monta las instrucciones del vecino con los datos que se le
//   mandan (quién es, dónde está, la hora, la charla de antes y lo que le dice la chica) y contesta lo que dice y lo que
//   hace. Va también en el móvil, que no tiene que bajar nada. Al cargar se le da un toque, que en el plan gratis de
//   Render se duerme y tarda en despertar. Si no tiene clave o falla, la IA del navegador (o, en el móvil, las frases de
//   siempre). ?iaproxy=<url> lo cambia y ?iaproxy=0 lo quita.
const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.87/+esm';
const OPENAI = 'https://api.openai.com/v1/responses', CLAVE = 'vecinos_openai_clave';
const SERVIDOR = 'https://three88-pueblos.onrender.com/api/vecinos';
export const claveGPT = () => { try { return localStorage.getItem(CLAVE) || ''; } catch (e) { return ''; } };
export const guardarClaveGPT = (k) => { try { if (k) localStorage.setItem(CLAVE, k.trim()); else localStorage.removeItem(CLAVE); } catch (e) { /* (sin almacén: solo esta vez) */ } };
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
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60),   // (truncados, como la pastilla: redondeando salía «a las 7:60»)
    parte = h < 6 ? 'de la madrugada' : h < 13 ? 'de la mañana' : h < 21 ? 'de la tarde' : 'de la noche';
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

// una respuesta de GPT por la API de Respuestas, escribiéndose mientras llega (eventos «response.output_text.delta»)
async function preguntarGPT({ clave, modelo, esfuerzo, mensajes, alTexto }) {
  const r = await fetch(OPENAI, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: JSON.stringify({
      model: modelo, stream: true, max_output_tokens: esfuerzo === 'high' ? 2500 : 900, reasoning: { effort: esfuerzo }, store: false,
      input: mensajes.map((m) => ({ role: m.role, content: m.content })),
      text: { format: { type: 'json_schema', name: 'respuesta_vecino', strict: true, schema: { type: 'object', additionalProperties: false, properties: { dice: { type: 'string' }, hace: { type: 'string', enum: HACE } }, required: ['dice', 'hace'] } } },
    }),
  });
  if (!r.ok) { let m = ''; try { m = (await r.json())?.error?.message || ''; } catch (e) { /* */ } const err = new Error(`OpenAI ${r.status}${m ? ': ' + m : ''}`); err.estado = r.status; throw err; }
  const lector = r.body.getReader(), dec = new TextDecoder(); let resto = '', todo = '';
  for (;;) {
    const { value, done } = await lector.read(); if (done) break;
    resto += dec.decode(value, { stream: true }); const lineas = resto.split('\n'); resto = lineas.pop();
    for (const l of lineas) {
      if (!l.startsWith('data:')) continue; const d = l.slice(5).trim(); if (!d || d === '[DONE]') continue;
      let ev = null; try { ev = JSON.parse(d); } catch (e) { continue; }
      if (ev.type === 'response.output_text.delta' && ev.delta) { todo += ev.delta; alTexto?.(todo); }
      else if (ev.type === 'response.failed' || ev.type === 'error') throw new Error(ev.error?.message || ev.response?.error?.message || 'OpenAI: fallo');
    }
  }
  return todo;
}

// una respuesta del servidor de 388 (/api/vecinos): {dice, hace}; 503 si allí no hay clave
async function preguntarServidor(url, datos) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos), signal: ctl.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(`vecinos ${r.status}${j.error ? ': ' + j.error : ''}`); e.estado = r.status; throw e; }
    return j;
  } finally { clearTimeout(t); }
}

export function montarIA({ q, movil }) {
  const servidor = q.get('iaproxy') === '0' || q.get('ia') === '0' ? null : (q.get('iaproxy') || SERVIDOR);
  let servidorVivo = null; // (false: no tiene clave, no se insiste)
  if (servidor) fetch(servidor.replace(/\/vecinos$/, '/online'), { cache: 'no-store' }).catch(() => {}); // (el toque para despertarlo)
  const apagada = q.get('ia') === '0' || (movil && q.get('ia') !== '1' && !claveGPT() && !servidor);
  const MODELO_GPT = q.get('iamodelo') || 'gpt-5.6-luna', ESFUERZO = ({ alto: 'high', medio: 'medium', bajo: 'low', minimo: 'minimal' })[q.get('iaesfuerzo')] || q.get('iaesfuerzo') || 'high';
  let motor = null, cargando = null, progreso = 0, aviso = '', fallo = null, sirve = null, ultimoFalloGPT = null;
  async function puede() {
    if ((claveGPT() || (servidor && servidorVivo !== false)) && q.get('ia') !== '0') return true;   // (con GPT basta la conexión)
    if (apagada || !navigator.gpu) return false;
    if (sirve !== null) return sirve;
    try { const a = await navigator.gpu.requestAdapter(); sirve = !!a && a.features.has('shader-f16'); } catch (e) { sirve = false; }
    return sirve;
  }
  function preparar(alAvanzar) {
    if (motor) return Promise.resolve(motor);
    if (movil && q.get('ia') !== '1') return Promise.reject(new Error('En el móvil no se baja la IA del navegador.'));   // (880 MB y la memoria justa)
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
    let todo = '', quien = 'navegador';
    const escribe = (s) => { const d = /"dice"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(s); if (d && alEscribir) alEscribir(desescapar(d[1])); };
    const clave = claveGPT();
    if (clave) {
      // (con GPT, sin los ejemplos: no le hacen falta, y el sistema le pide lo mismo)
      try { todo = await preguntarGPT({ clave, modelo: MODELO_GPT, esfuerzo: ESFUERZO, mensajes: [mensajes[0], ...p.historial.slice(-12), mensajes[mensajes.length - 1]], alTexto: escribe }); quien = 'gpt'; }
      catch (e) { ultimoFalloGPT = String(e); console.warn('ia (GPT):', e); if (e.estado === 401) throw new Error('La clave de OpenAI no vale.'); }
    }
    if (quien !== 'gpt' && servidor && servidorVivo !== false) {
      // (el servidor de 388, con su clave: el historial va en claro, sin las notas, y él monta las instrucciones)
      try {
        const r = await preguntarServidor(servidor, { persona: { nombre: p.nombre, edad: p.edad, tipo: p.tipo, hombre: p.hombre, oficio: p.oficio }, contexto: c,
          historial: p.historial.slice(-12).map((m) => ({ role: m.role, content: m.role === 'assistant' ? (() => { try { return JSON.parse(m.content).dice; } catch (e) { return m.content; } })() : m.content })),
          mensaje: it ? `${mensaje} [${it.nota}]` : mensaje });
        todo = JSON.stringify({ dice: r.dice, hace: r.hace }); escribe(todo); quien = 'servidor'; servidorVivo = true;
      } catch (e) {
        ultimoFalloGPT = String(e); console.warn('ia (servidor):', e);
        if (e.estado === 503) servidorVivo = false;   // (allí no hay clave: la IA del navegador)
        else if (!motor) throw new Error('Los vecinos no contestan ahora.');   // (sin la del navegador ya despierta, no se baja ahora sin avisar)
      }
    }
    if (quien !== 'gpt' && quien !== 'servidor') {
      // (con el servidor puesto y la IA del navegador sin despertar, no se bajan sus 880 MB a escondidas porque el servidor
      // falle o diga que no tiene clave: el vecino dice sus frases de siempre. 15-11-2026, la revisión del juego)
      if (servidor && !motor) throw new Error('Los vecinos no contestan ahora.');
      const m = await preparar();
      const flujo = await m.chat.completions.create({ messages: mensajes, temperature: 0.7, top_p: 0.9, max_tokens: 140, stream: true, response_format: { type: 'json_object', schema: ESQUEMA } });
      for await (const trozo of flujo) { todo += trozo.choices?.[0]?.delta?.content || ''; escribe(todo); }
    }
    let r = null; try { r = JSON.parse(todo); } catch (e) { const d = /"dice"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(todo); r = { dice: d ? desescapar(d[1]) : '…', hace: 'nada' }; }
    const dice = String(r.dice || '').trim() || '…', propuesto = HACE.includes(r.hace) ? r.hace : 'nada', hace = coherente(propuesto, dice, it);
    p.historial.push({ role: 'user', content: mensaje }, { role: 'assistant', content: JSON.stringify({ dice, hace: hace === 'despedirse' ? 'nada' : hace }) });
    return { dice, hace, propuesto, quien };
  }
  return { puede, preparar, responder, persona, gpt: () => !!claveGPT(), modelo: MODELO_GPT, esfuerzo: ESFUERZO,
    servidor: () => (servidor && servidorVivo !== false ? servidor : null),
    estado: () => ({ apagada, listo: !!motor || !!claveGPT() || !!(servidor && servidorVivo !== false), gpt: !!claveGPT(), servidor: servidor && servidorVivo !== false ? servidor : null, cargando: !!cargando && !motor, progreso, aviso, fallo: fallo ? String(fallo) : null, falloGPT: ultimoFalloGPT }) };
}
const desescapar = (s) => { try { return JSON.parse('"' + s.replace(/\\$/, '') + '"'); } catch (e) { return s.replace(/\\n/g, ' ').replace(/\\"/g, '"'); } };
