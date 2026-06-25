const config = require('../config')
const { calculateEMA } = require('../indicators/moving-averages')
const { calculateRSI } = require('../indicators/rsi')
const { checkPerfectTrend } = require('../core/trend-analyzer')

/**
 * strategy-core.js
 * Implementación de Peter Trend 1.0 (Pine Script)
 */

/**
 * Analiza la estrategia Peter Trend 1.0 basada en la última vela cerrada.
 * @param {Array} candles - Array de velas cerradas
 * @returns {Object} { shouldOperate: boolean, reason: string, analysis: Object }
 */
async function analyzeStrategy(candles) {
	const cfg = config.strategy.peterTrend

	// Necesitamos suficientes velas para EMA 30 + RSI 14 + buffer
	if (candles.length < 50) {
		return {
			shouldOperate: false,
			reason: 'Esperando más datos históricos (mínimo 50 velas)',
			analysis: { candleCount: candles.length }
		}
	}

	// 1. Obtener tendencia "Perfecta"
	const trend = checkPerfectTrend(candles)

	// 2. Obtener datos de la vela CERRADA [1]
	const candle1 = candles[candles.length - 1]

	const body = Math.abs(candle1.close - candle1.open)
	const range = candle1.max - candle1.min
	const upperWick = candle1.max - Math.max(candle1.open, candle1.close)
	const lowerWick = Math.min(candle1.open, candle1.close) - candle1.min

	const bodyRatio = range > 0 ? body / range : 0
	const isStrongBody = bodyRatio >= cfg.min_body_ratio

	const isBull = candle1.close > candle1.open
	const isBear = candle1.close < candle1.open

	// 3. Calcular indicadores para la vela [1]
	const ema10 = calculateEMA(candles, cfg.ema_fast)
	const rsi = calculateRSI(candles, cfg.rsi_period)

	if (ema10 === null || rsi === null) {
		return { shouldOperate: false, reason: 'Error calculando indicadores en la vela actual' }
	}

	// 4. Evaluar condiciones de entrada (Peter Trend 1.0)

	// --- CALL SIGNAL ---
	const callRejection =
		isBull &&
		isStrongBody &&
		lowerWick >= body * cfg.wick_factor &&
		candle1.min <= ema10 &&
		candle1.close > ema10

	const callSignal =
		trend.isPerfectTrend &&
		trend.direction === 'UP' &&
		callRejection &&
		rsi >= cfg.rsi_call_min

	if (callSignal) {
		return {
			shouldOperate: true,
			direction: 'CALL',
			reason: 'PETER_TREND_1.0: Continuidad ALCISTA detectada',
			analysis: {
				trend: trend.reason,
				rsi: rsi.toFixed(2),
				ema10: ema10.toFixed(6),
				pullback_touch: candle1.min <= ema10,
				body_strength: bodyRatio.toFixed(2),
				wick_rejection: (lowerWick / body).toFixed(2) + 'x',
				is_strong_body: isStrongBody,
				valid_wick: lowerWick >= body * cfg.wick_factor
			}
		}
	}

	// --- PUT SIGNAL ---
	const putRejection =
		isBear &&
		isStrongBody &&
		upperWick >= body * cfg.wick_factor &&
		candle1.max >= ema10 &&
		candle1.close < ema10

	const putSignal =
		trend.isPerfectTrend &&
		trend.direction === 'DOWN' &&
		putRejection &&
		rsi <= cfg.rsi_put_max

	if (putSignal) {
		return {
			shouldOperate: true,
			direction: 'PUT',
			reason: 'PETER_TREND_1.0: Continuidad BAJISTA detectada',
			analysis: {
				trend: trend.reason,
				rsi: rsi.toFixed(2),
				ema10: ema10.toFixed(6),
				pullback_touch: candle1.max >= ema10,
				body_strength: bodyRatio.toFixed(2),
				wick_rejection: (upperWick / body).toFixed(2) + 'x',
				is_strong_body: isStrongBody,
				valid_wick: upperWick >= body * cfg.wick_factor
			}
		}
	}

	// Log de estado si no hay operación
	let statusReason = trend.isPerfectTrend ? `Esperando patrón en tendencia ${trend.direction}` : trend.reason

	return {
		shouldOperate: false,
		reason: statusReason,
		analysis: {
			trend: trend.direction,
			rsi: rsi.toFixed(2),
			bodyRatio: bodyRatio.toFixed(2)
		}
	}
}

module.exports = { analyzeStrategy }