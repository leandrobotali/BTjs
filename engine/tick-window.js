/**
 * tick-window.js
 *
 * Buffer deslizante continuo de ticks de precio.
 * NUNCA se limpia por minuto nuevo — es continuo en el tiempo.
 * Solo descarta los ticks más viejos cuando supera el máximo (sliding).
 *
 * Esto garantiza que en el segundo 1 de cualquier minuto,
 * el bot ya tiene historia suficiente para analizar estructura.
 *
 * Formato de cada tick: { t: timestamp_ms, p: precio_float }
 */

const config = require('../config.js')
const MAX_BUFFER = 300   // Máximo de ticks almacenados (~3–5 min de historia continua)

let buffer = []

/**
 * Agrega un tick al buffer. Si supera MAX_BUFFER, descarta el más viejo.
 * @param {number} t - Timestamp en milisegundos
 * @param {number} p - Precio
 */
function addTick(t, p) {
	if (typeof p !== 'number' || isNaN(p)) return
	buffer.push({ t, p })
	if (buffer.length > MAX_BUFFER) {
		buffer.shift()
	}
}

/**
 * Retorna la ventana de análisis: los últimos ANALYSIS_WINDOW ticks.
 * Esta es la ventana que se usa para calcular features.
 * @returns {Array<{t: number, p: number}>}
 */
function getWindow() {
	return buffer.slice(-config.engine.windowSize)
}

/**
 * Retorna todo el buffer (para debugging).
 * @returns {Array<{t: number, p: number}>}
 */
function getFullBuffer() {
	return [...buffer]
}

/**
 * Cuántos ticks hay en el buffer en total.
 * @returns {number}
 */
function getBufferSize() {
	return buffer.length
}

/**
 * Cuántos ticks tiene la ventana de análisis activa.
 * @returns {number}
 */
function getWindowSize() {
	return Math.min(buffer.length, config.engine.windowSize)
}

/**
 * Retorna el tamaño mínimo recomendado de ventana para que los features sean confiables.
 * @returns {number}
 */
function getMinReliableSize() {
	return 30  // menos de 30 ticks → features no confiables
}

module.exports = {
	addTick,
	getWindow,
	getFullBuffer,
	getBufferSize,
	getWindowSize,
	getMinReliableSize,
	MAX_BUFFER
}
