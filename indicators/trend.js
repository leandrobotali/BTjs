/**
 * trend.js
 * Detecta la dirección Y la FUERZA de la tendencia.
 *
 * Fuerza según CONCEPTOS_BASICOS.md:
 *   - DEBIL   (~30°): Mercado en rango, equilibrio entre colores → ideal para REVERSIONES
 *   - MODERADA(~45°): Tendencia saludable, mezcla de colores → ideal para REVERSIONES con nivel fuerte
 *   - FUERTE  (~60°): Predominancia de un color, precio muy vertical → solo CONTINUIDAD
 */

const config = require('../config')

/**
 * Calcula la dirección y fuerza de la tendencia.
 * @param {Array} candles - array de velas cerradas
 * @param {number} period - periodo de análisis (default 20)
 * @returns {{ direction: string, strength: string, slope: number, dominantRatio: number }}
 */
function getTrend(candles, period = 20) {
	if (candles.length < period) {
		return { direction: 'LATERAL', strength: 'DEBIL', slope: 0, dominantRatio: 0.5 }
	}

	const recent = candles.slice(-period)
	const first = recent[0]
	const last = recent[recent.length - 1]

	// --- DIRECCIÓN ---
	const totalMove = last.close - first.open
	const threshold = config.strategy.trend.minThreshold

	let direction
	if (totalMove > threshold) direction = 'ALCISTA'
	else if (totalMove < -threshold) direction = 'BAJISTA'
	else direction = 'LATERAL'

	// --- FUERZA: calcular con 3 métricas ---

	// 1. Ratio de color dominante
	// (en tendencia fuerte, predomina un solo color)
	const greenCandles = recent.filter(c => c.close >= c.open).length
	const redCandles = recent.length - greenCandles
	const dominantCandles = Math.max(greenCandles, redCandles)
	const dominantRatio = dominantCandles / recent.length  // [0.5 ... 1.0]

	// 2. Consistencia del movimiento (regresión lineal simple)
	// Cuanto más los cierres siguen una línea recta, más fuerte la tendencia
	const closes = recent.map(c => c.close)
	const slope = linearRegressionSlope(closes)
	// Normalizar la pendiente en pips absolutos por período
	const slopeAbs = Math.abs(slope) * period

	// 3. Rango promedio vs. desplazamiento neto
	// Si el precio se mueve mucho en relación a la volatilidad individual de velas → fuerte
	const avgCandleRange = recent.reduce((sum, c) => sum + (c.max - c.min), 0) / recent.length
	const netMove = Math.abs(totalMove)
	const directionEfficiency = avgCandleRange > 0 ? netMove / (avgCandleRange * period) : 0

	// --- CLASIFICAR FUERZA ---
	const cfg = config.strategy.trend

	let strength
	if (
		dominantRatio >= cfg.strongDominantRatio &&
		directionEfficiency >= cfg.strongEfficiency
	) {
		strength = 'FUERTE'     // ~60°: muy vertical, predominancia clara, poco retroceso
	} else if (
		dominantRatio >= cfg.moderateDominantRatio &&
		directionEfficiency >= cfg.moderateEfficiency
	) {
		strength = 'MODERADA'   // ~45°: equilibrio saludable con dirección clara
	} else {
		strength = 'DEBIL'      // ~30°: rango o movimiento sin convicción
	}

	// En lateral siempre es DEBIL
	if (direction === 'LATERAL') strength = 'DEBIL'

	return { direction, strength, slope: slopeAbs, dominantRatio }
}

/**
 * Calcula la pendiente de una regresión lineal simple sobre un array de valores.
 * @param {number[]} values
 * @returns {number} pendiente (positiva = subiendo, negativa = bajando)
 */
function linearRegressionSlope(values) {
	const n = values.length
	if (n < 2) return 0

	let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0

	for (let i = 0; i < n; i++) {
		sumX += i
		sumY += values[i]
		sumXY += i * values[i]
		sumX2 += i * i
	}

	const denom = (n * sumX2 - sumX * sumX)
	if (denom === 0) return 0

	return (n * sumXY - sumX * sumY) / denom
}

module.exports = { getTrend }
