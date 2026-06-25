const config = require('../config')
const { calculateEMA } = require('../indicators/moving-averages')

/**
 * trend-analyzer.js
 * Módulo para detectar tendencias "perfectas" (bien definidas y fuertes).
 */

/**
 * Evalúa si el mercado está en una tendencia perfecta en base a las EMAs y la estructura reciente.
 * @param {Array} candles - Array de velas cerradas
 * @returns {Object} { isPerfectTrend: boolean, direction: 'UP'|'DOWN'|'NONE', reason: string }
 */
function checkPerfectTrend(candles) {
    const cfg = config.strategy.peterTrend
    const perfCfg = config.strategy.perfectTrend

    if (candles.length < Math.max(cfg.ema_slow + cfg.slope_bars, 20)) {
        return { isPerfectTrend: false, direction: 'NONE', reason: 'Insuficientes velas para análisis de tendencia' }
    }

    // 1. Calcular EMAs actuales y pasadas (para pendiente)
    const emaFastCurrent = calculateEMA(candles, cfg.ema_fast)
    const emaSlowCurrent = calculateEMA(candles, cfg.ema_slow)

    const candlesPrevious = candles.slice(0, -cfg.slope_bars)
    const emaFastPast = calculateEMA(candlesPrevious, cfg.ema_fast)
    const emaSlowPast = calculateEMA(candlesPrevious, cfg.ema_slow)

    if (!emaFastCurrent || !emaSlowCurrent || !emaFastPast || !emaSlowPast) {
        return { isPerfectTrend: false, direction: 'NONE', reason: 'Error calculando EMAs' }
    }

    const lastCandle = candles[candles.length - 1]
    const emaGap = Math.abs(emaFastCurrent - emaSlowCurrent)

    const fastSlope = (emaFastCurrent - emaFastPast) / cfg.slope_bars
    const slowSlope = (emaSlowCurrent - emaSlowPast) / cfg.slope_bars

    // 2. Evaluar Tendencia ALCISTA (UP)
    const isUpEmaAlignment = emaFastCurrent > emaSlowCurrent + perfCfg.minEmaGap
    const isUpPriceAlignment = lastCandle.close > emaFastCurrent
    const isUpSlope = fastSlope > perfCfg.minSlope && slowSlope > perfCfg.minSlope

    // 3. Evaluar Tendencia BAJISTA (DOWN)
    const isDownEmaAlignment = emaFastCurrent < emaSlowCurrent - perfCfg.minEmaGap
    const isDownPriceAlignment = lastCandle.close < emaFastCurrent
    const isDownSlope = fastSlope < -perfCfg.minSlope && slowSlope < -perfCfg.minSlope

    // 4. Conteo de velas consecutivas (Estructura)
    const recentDirection = getConsecutiveDirection(candles.slice(-perfCfg.minCandlesAtDirection))

    if (isUpEmaAlignment && isUpPriceAlignment && isUpSlope && recentDirection === 'UP') {
        return {
            isPerfectTrend: true,
            direction: 'UP',
            reason: `Tendencia ALCISTA perfecta. Gap: ${emaGap.toFixed(6)}, Slope: ${fastSlope.toFixed(6)}`
        }
    }

    if (isDownEmaAlignment && isDownPriceAlignment && isDownSlope && recentDirection === 'DOWN') {
        return {
            isPerfectTrend: true,
            direction: 'DOWN',
            reason: `Tendencia BAJISTA perfecta. Gap: ${emaGap.toFixed(6)}, Slope: ${fastSlope.toFixed(6)}`
        }
    }

    return {
        isPerfectTrend: false,
        direction: 'NONE',
        reason: 'Tendencia no definida o sin fuerza suficiente'
    }
}

/**
 * Determina si las últimas N velas tienen una dirección predominante aceptable.
 */
function getConsecutiveDirection(candles) {
    const count = candles.length
    const bullCount = candles.filter(c => c.close > c.open).length
    const bearCount = candles.filter(c => c.close < c.open).length

    if (bullCount / count >= 0.70) return 'UP'
    if (bearCount / count >= 0.70) return 'DOWN'
    return 'NONE'
}

module.exports = { checkPerfectTrend }
