const config = require('../config')

/**
 * Detecta si el mercado está en un estado peligroso para operar.
 * Basado en CONCEPTOS_BASICOS.md:
 * - La volatilidad ideal es "controlada y predecible", no extrema.
 * - Evitar: gaps, mechas EXTREMAS (no normales), mercado sin movimiento real.
 * - Preferir: mechas cortas, movimientos fluidos, ritmo claro.
 *
 * @param {Array} candles - Array de velas cerradas
 * @param {Array} ticks - Array de ticks de la vela actual (opcional)
 * @returns {Object} { isDangerous: boolean, reason: string, details: Array }
 */
const detectDangerousMarket = (candles, ticks = []) => {
    const report = { isDangerous: false, reason: '', details: [] }

    if (candles.length < 30) {
        return report
    }

    // 1. MERCADO "SUCIO" - Exceso de mechas confusas (no Pin Bars aislados, sino patrón de caos)
    if (config.strategy.dangerousMarkets.dirtyMarket.enabled) {
        const dirtyCheck = checkDirtyMarket(candles)
        if (dirtyCheck.isDetected) {
            report.isDangerous = true
            report.reason = 'DIRTY_MARKET'
            report.details.push(`Mercado Sucio: ${dirtyCheck.message}`)
        }
    }

    // 2. MICRO-RANGOS (Caja) - Alternancia sin dirección
    if (config.strategy.dangerousMarkets.microRange.enabled && !report.isDangerous) {
        const microRangeCheck = checkMicroRanges(candles)
        if (microRangeCheck.isDetected) {
            report.isDangerous = true
            report.reason = 'MICRO_RANGE'
            report.details.push(`Micro Rango: ${microRangeCheck.count} velas alternadas y superpuestas (mercado sin dirección).`)
        }
    }

    // 3. MERCADO SIN MOVIMIENTO (Doji saturado / Bajo volumen real)
    if (config.strategy.dangerousMarkets.deadMarket.enabled && !report.isDangerous) {
        const deadCheck = checkDeadMarket(candles)
        if (deadCheck.isDetected) {
            report.isDangerous = true
            report.reason = 'DEAD_MARKET'
            report.details.push(`Mercado sin movimiento: ${deadCheck.message}`)
        }
    }

    // 4. VOLATILIDAD EXTREMA - Saltos de precio (Gaps) reales
    if (config.strategy.dangerousMarkets.extremeVolatility.enabled && !report.isDangerous) {
        const volCheck = checkExtremeVolatility(candles)
        if (volCheck.isDetected) {
            report.isDangerous = true
            report.reason = 'EXTREME_VOLATILITY'
            report.details.push(`Volatilidad Extrema: ${volCheck.message}`)
        }
    }

    // 5. OSCILACIÓN CAÓTICA DE TICKS (si hay ticks disponibles)
    if (config.strategy.dangerousMarkets.chaoticTicks.enabled && ticks.length > 20 && !report.isDangerous) {
        const tickCheck = checkChaoticTicks(ticks)
        if (tickCheck.isDetected) {
            report.isDangerous = true
            report.reason = 'CHAOTIC_TICKS'
            report.details.push(`Ticks Caóticos: ${tickCheck.message}`)
        }
    }

    return report
}

/**
 * MERCADO SUCIO: Velas con exceso de mechas en AMBAS direcciones de forma consistente.
 * Mejora 10: Si en las últimas 10 velas, el 60% tiene una mecha > 2.5x el tamaño del cuerpo,
 * el bot debe desactivarse automáticamente por DIRTY_MARKET.
 * 
 * Esto NO es un Pin Bar aislado (que es una señal válida).
 * Es cuando VARIAS velas consecutivas tienen mechas grandes = confusión.
 */
const checkDirtyMarket = (candles) => {
    const cfg = config.strategy.dangerousMarkets.dirtyMarket
    const recent = candles.slice(-cfg.lookback) // últimas 10 velas

    let dirtyCount = 0

    for (const c of recent) {
        const bodySize = Math.abs(c.close - c.open)
        const upperWick = c.max - Math.max(c.open, c.close)
        const lowerWick = Math.min(c.open, c.close) - c.min
        const maxWick = Math.max(upperWick, lowerWick)

        // Mejora 10: Mecha > 2.5x cuerpo
        if (bodySize > 0.000001 && maxWick > bodySize * cfg.mechaBodyRatio) {
            dirtyCount++
        }
    }

    const dirtyRatio = dirtyCount / recent.length

    // Mejora 10: Si 60%+ de velas tienen mecha > 2.5x cuerpo → DIRTY_MARKET
    if (dirtyRatio >= cfg.minDirtyRatio) {
        return {
            isDetected: true,
            message: `${dirtyCount}/${recent.length} velas con mecha > 2.5x cuerpo (${(dirtyRatio * 100).toFixed(0)}%). Mercado con ruido excesivo.`
        }
    }

    return { isDetected: false }
}

/**
 * MICRO-RANGOS: Velas que alternan de color y se superponen = choppiness.
 * Indica que el mercado no tiene dirección clara.
 */
const checkMicroRanges = (candles) => {
    const cfg = config.strategy.dangerousMarkets.microRange
    let count = 0
    let i = candles.length - 1

    while (i > 0) {
        const current = candles[i]
        const prev = candles[i - 1]

        const currentColor = current.close > current.open ? 'G' : 'R'
        const prevColor = prev.close > prev.open ? 'G' : 'R'

        // Deben alternar colores
        if (currentColor === prevColor) break

        // Deben superponerse (overlap de cuerpos)
        const currentHigh = Math.max(current.open, current.close)
        const currentLow = Math.min(current.open, current.close)
        const prevHigh = Math.max(prev.open, prev.close)
        const prevLow = Math.min(prev.open, prev.close)

        const isOverlapping = (currentLow < prevHigh) && (currentHigh > prevLow)

        if (!isOverlapping) break

        count++
        i--
    }

    return {
        isDetected: count >= (cfg.minOverlaps - 1),
        count: count + 1
    }
}

/**
 * MERCADO MUERTO: Muy poco movimiento real, demasiados dojis, velas planas.
 * IMPORTANTE: Diferente a "mercado en rango operable".
 * Un mercado en rango puede ser operable si tiene ritmo claro (sube/baja con amplitud suficiente).
 * Un mercado muerto tiene velas tan pequeñas que no hay información útil.
 *
 * Referencia: "Bajo Volumen: Velas muy pequeñas o sin movimiento (dojis grises)"
 */
const checkDeadMarket = (candles) => {
    const cfg = config.strategy.dangerousMarkets.deadMarket
    const recent = candles.slice(-cfg.recentCandles)
    const history = candles.slice(-(cfg.recentCandles + cfg.historyCandles), -cfg.recentCandles)

    if (history.length < cfg.historyCandles) return { isDetected: false }

    const getAvgTotal = (arr) => arr.reduce((sum, c) => sum + (c.max - c.min), 0) / arr.length

    const recentAvgTotal = getAvgTotal(recent)
    const historyAvgTotal = getAvgTotal(history)

    // Evitar división por cero
    if (historyAvgTotal === 0) return { isDetected: false }

    // Comparamos el rango total (max-min), no solo el cuerpo.
    // Así reconocemos velas muy pequeñas aunque tengan mechas.
    const ratio = recentAvgTotal / historyAvgTotal

    if (ratio < cfg.minSizeRatio) {
        return {
            isDetected: true,
            message: `Velas recientes ${(ratio * 100).toFixed(0)}% del tamaño histórico (umbral: ${(cfg.minSizeRatio * 100).toFixed(0)}%). Mercado sin energía.`
        }
    }

    // Conteo de Dojis puros (cuerpo < 10% del total)
    let dojiCount = 0
    for (const c of recent) {
        const body = Math.abs(c.close - c.open)
        const total = c.max - c.min
        if (total > 0 && (body / total) < 0.10) {
            dojiCount++
        }
    }

    if (dojiCount >= cfg.maxDojis) {
        return {
            isDetected: true,
            message: `${dojiCount}/${recent.length} dojis en velas recientes. Mercado sin decisión.`
        }
    }

    return { isDetected: false }
}

/**
 * VOLATILIDAD EXTREMA: Saltos reales de precio (gaps) entre velas.
 * Esto invalida el análisis técnico de zonas fijas.
 *
 * NOTA: Las mechas largas POR SÍ SOLAS no son peligrosas (pueden ser Pin Bars válidos).
 * Lo peligroso es cuando los GAPS son grandes (precio "salta" sin razón estructural).
 *
 * Referencia: "Detección de Gaps y Saltos: señal de volatilidad extrema"
 * "Una mecha larga en zona de soporte fuerte tiene peso algorítmico MAYOR" 
 * → Las mechas NO deben filtrarse, son información valiosa.
 */
const checkExtremeVolatility = (candles) => {
    const cfg = config.strategy.dangerousMarkets.extremeVolatility
    const recent = candles.slice(-cfg.lookback)

    // Calcular tamaño promedio de las últimas velas para referencia
    const avgTotal = recent.reduce((sum, c) => sum + (c.max - c.min), 0) / recent.length

    for (let i = 1; i < recent.length; i++) {
        const prev = recent[i - 1]
        const curr = recent[i]

        // Gap = diferencia entre cierre anterior y apertura actual
        const gap = Math.abs(curr.open - prev.close)

        // El gap es peligroso si es grande en términos absolutos
        // O grande relativo al tamaño promedio de velas
        const isAbsoluteGap = gap > cfg.maxAbsoluteGap
        const isRelativeGap = avgTotal > 0 && (gap / avgTotal) > cfg.maxRelativeGap

        if (isAbsoluteGap || isRelativeGap) {
            return {
                isDetected: true,
                message: `Gap de ${gap.toFixed(6)} entre velas (${((gap / avgTotal) * 100).toFixed(0)}% del tamaño promedio). Precio inestable.`
            }
        }
    }

    return { isDetected: false }
}

/**
 * TICKS CAÓTICOS: Oscilación excesiva dentro de la vela actual.
 * Referencia: "El bot debe observar la oscilación del precio mientras la vela se está creando.
 * Si el precio baja o sube mucho más allá de soporte/resistencia antes de que la vela finalice,
 * indica una volatilidad que hace peligroso operar."
 *
 * Mide: cuántas veces el precio cambia de dirección violentamente durante la vela.
 */
const checkChaoticTicks = (ticks) => {
    const cfg = config.strategy.dangerousMarkets.chaoticTicks

    // Calcular el rango total de ticks
    const maxTick = Math.max(...ticks)
    const minTick = Math.min(...ticks)
    const totalRange = maxTick - minTick

    if (totalRange === 0) return { isDetected: false }

    // Contar reversiones de dirección significativas
    let reversals = 0
    let prevDirection = null
    let runLength = 0
    const minMove = totalRange * cfg.minReversalRatio // reversal mínimo significativo

    for (let i = 1; i < ticks.length; i++) {
        const diff = ticks[i] - ticks[i - 1]
        if (Math.abs(diff) < 0.000001) continue // ignorar micro-ruido

        const direction = diff > 0 ? 'UP' : 'DOWN'

        if (prevDirection === null) {
            prevDirection = direction
            runLength = 1
            continue
        }

        if (direction !== prevDirection) {
            // Cambio de dirección: verificar si el movimiento previo fue significativo
            const runMove = Math.abs(ticks[i - 1] - ticks[i - 1 - runLength + 1]) // aproximado
            if (runMove >= minMove) {
                reversals++
            }
            prevDirection = direction
            runLength = 1
        } else {
            runLength++
        }
    }

    if (reversals >= cfg.maxReversals) {
        return {
            isDetected: true,
            message: `${reversals} reversiones violentas en los ticks (umbral: ${cfg.maxReversals}). Precio oscilando caóticamente.`
        }
    }

    return { isDetected: false }
}

module.exports = { detectDangerousMarket }
