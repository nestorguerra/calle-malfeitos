// El trabajador de la IA de los vecinos (src/ia.js): el modelo corre aquí, con su propia GPU, para no frenar el juego.
// WebLLM (MLC, Apache 2.0), de jsDelivr, con la versión fija.
import { WebWorkerMLCEngineHandler } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.87/+esm';

const manejador = new WebWorkerMLCEngineHandler();
self.onmessage = (m) => manejador.onmessage(m);
