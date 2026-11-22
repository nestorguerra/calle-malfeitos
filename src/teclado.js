// El teclado del ordenador para andar, correr y conducir (22-11-2026; el usuario, con un MacBook: «arregla la jugabilidad
// con las teclas… que sea fácil manejar con WASD… andar, correr y conducir»). Lo que pasaba:
// - La fuente de teclado de PlayCanvas (KeyboardMouseSource, con pointerLock) no lee ninguna tecla mientras el ratón no
//   está capturado: hasta hacer clic en el juego, WASD no hacía nada, y al pulsar Esc (o al abrir un panel) dejaba de
//   andar. Ahora las teclas mueven siempre; el ratón capturado solo hace falta para mirar sin arrastrar.
// - En macOS, con Cmd pulsado no llega el «soltar» de la otra tecla, y al cambiar de ventana (Cmd+Tab) tampoco: la chica
//   (o el coche) seguía andando sola. Ahora, al perder el foco, al esconder la pestaña, con Cmd y al capturar o soltar el
//   ratón, se suelta todo.
// - Un botón de la pantalla pulsado con el ratón (subir al coche, la vista) se quedaba con el foco y el Espacio (saltar,
//   freno de mano) lo volvía a pulsar. Ahora el botón suelta el foco al pulsarlo con el ratón.
// - Las flechas y el Espacio no mueven la página.
// Las teclas son las del controlador: WASD o flechas andar (en el coche: acelerar, frenar y marcha atrás, girar), Shift
// correr, Espacio saltar (en el coche: freno de mano). Por su código físico (e.code): valen en cualquier distribución.
export function montarTeclado(tpc) {
  const src = tpc?._desktopInput;
  if (!src?._setKey || !src._keyNow || new URLSearchParams(location.search).get('teclado') === '0') return;   // (?teclado=0: como antes, para comparar)
  const escribiendo = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  const soltarTodo = () => { src._keyNow.fill(0); };
  addEventListener('keydown', (e) => {
    if (escribiendo(e.target)) return;
    if (e.metaKey) { soltarTodo(); return; }  // (Cmd+algo es del sistema: lo que hubiera pulsado ya no se soltará)
    if (/^Arrow(Up|Down|Left|Right)$|^Space$/.test(e.code)) e.preventDefault();
    src._setKey(e.code, 1);   // (con el ratón capturado la fuente ya lo pone: ponerlo otra vez no cambia nada)
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'Meta' || e.code === 'MetaLeft' || e.code === 'MetaRight') soltarTodo();
    else src._setKey(e.code, 0);
  });
  addEventListener('blur', soltarTodo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) soltarTodo(); });
  document.addEventListener('pointerlockchange', soltarTodo);
  // (los botones pulsados con el ratón no se quedan el foco: el Espacio y el Intro son del juego)
  addEventListener('click', (e) => {
    const b = e.target?.closest?.('button, [role="button"]');
    if (b && e.detail > 0 && document.activeElement === b) b.blur();
  }, true);
}
