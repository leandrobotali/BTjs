/**
 * market-context.js
 * Filtros de Contexto de Mercado - Validan ANTES de operar.
 *
 * Basado en CONCEPTOS_BASICOS.md:
 * 1. TENDENCIA FUERTE (~60°): No operar reversiones, solo continuidad.
 * 2. ESPACIO LIBRE: Debe haber espacio suficiente hasta el próximo nivel.
 * 3. RE-TESTEO INMEDIATO: Si el precio insiste en un nivel, no operar (va a romper).
 */

const config = require('../config')

/**
 * Evalúa el contexto de mercado contra la decisión candidata.
 * Retorna un objeto con allow:bool, reason:string para cada filtro.
 *
 * @param {string} decision    - 'CALL' | 'PUT'
 * @param {Array}  candles     - array de velas cerradas (históricas)
 * @param {Array}  levels      - array de niveles detectados con {price, type, quality}
 * @param {Object} trendInfo   - objeto {direction, strength} del nuevo getTrend()
 * @param {number} closePrice  - precio de cierre de la vela actual
 * @returns {Object} { allowed: boolean, blocks: Array<string> }
 */
const checkMarketContext = (decision, candles, levels, trendInfo, closePrice) => {
    const blocks = []

    // ----- FILTRO 1: TENDENCIA FUERTE -----
    if (config.strategy.marketContext.trendStrength.enabled) {
        const trendBlock = checkTrendStrength(decision, trendInfo)
        if (trendBlock) blocks.push(trendBlock)
    }

    // ----- FILTRO 2: ESPACIO LIBRE -----
    if (config.strategy.marketContext.freeSpace.enabled) {
        const spaceBlock = checkFreeSpace(decision, levels, closePrice, candles)
        if (spaceBlock) blocks.push(spaceBlock)
    }

    // ----- FILTRO 3: RE-TESTEO INMEDIATO -----
    if (config.strategy.marketContext.retest.enabled) {
        const retestBlock = checkImmediateRetest(decision, candles, levels, closePrice)
        if (retestBlock) blocks.push(retestBlock)
    }

    return {
        allowed: blocks.length === 0,
        blocks
    }
}

/**
 * FILTRO 1: TENDENCIA FUERTE
 *
 * Una tendencia fuerte (alta velocidad de movimiento, predominancia de un color)
 * NO debe operarse a la contra (reversión). Solo continuidad.
 *
 * Referencia: "Tendencia Fuerte (~60°): Predominancia de un solo color.
 * El bot debe buscar patrones de continuidad. Las reversiones aquí suelen fallar."
 *
 * @param {string} decision   - 'CALL' | 'PUT'
 * @param {Object} trendInfo  - { direction: 'ALCISTA'|'BAJISTA'|'LATERAL', strength: 'FUERTE'|'MODERADA'|'DEBIL' }
 * @returns {string|null}     - mensaje de bloqueo o null si es OK
 */
const checkTrendStrength = (decision, trendInfo) => {
    const { direction, strength } = trendInfo

    if (strength !== 'FUERTE') return null // Solo bloquear en tendencia FUERTE

    // Detectar si la decisión va en CONTRA de la tendencia fuerte
    const goingAgainstTrend =
        (direction === 'ALCISTA' && decision === 'PUT') ||
        (direction === 'BAJISTA' && decision === 'CALL')

    if (goingAgainstTrend) {
        return `TREND_BLOCK: Tendencia ${direction} FUERTE. Operar ${decision} sería reversión de alta probabilidad de fallo.`
    }

    return null
}

/**
 * FILTRO 2: ESPACIO LIBRE HASTA EL PRÓXIMO NIVEL
 *
 * Si hay un nivel de bloqueo muy cerca en la dirección de la operación,
 * no hay "recorrido" disponible para el precio. Operar sería abrir en el centro
 * de un rango, sin ventaja.
 *
 * Referencia: "filtro_proximidad_zona(): Si una vela de continuidad cierra muy cerca
 * de una zona clave, el bot debe cancelar la operación, ya que no hay espacio."
 *
 * @param {string} decision    - 'CALL' | 'PUT'
 * @param {Array}  levels      - niveles detectados
 * @param {number} closePrice  - precio actual
 * @param {Array}  candles     - para calcular el tamaño promedio de vela
 * @returns {string|null}
 */
const checkFreeSpace = (decision, levels, closePrice, candles) => {
    if (!levels || levels.length === 0) return null

    const cfg = config.strategy.marketContext.freeSpace

    // Calcular el "tamaño promedio de vela" para usarlo como referencia de espacio
    const recentCandles = candles.slice(-cfg.candlesForSize)
    const avgCandleSize = recentCandles.reduce((sum, c) => sum + (c.max - c.min), 0) / recentCandles.length
    const minSpace = avgCandleSize * cfg.minSpaceInCandles

    // Buscar el nivel más cercano EN la dirección de la operación
    let nearestBlockingLevel = null
    let nearestDistance = Infinity

    for (const level of levels) {
        // Solo considerar niveles MEDIO o FUERTE
        if (level.quality === 'WEAK') continue

        const distanceInDirection =
            decision === 'CALL'
                ? level.price - closePrice  // Para CALL, el obstáculo está ARRIBA
                : closePrice - level.price  // Para PUT, el obstáculo está ABAJO

        // El nivel está en la dirección correcta y más cerca que los anteriores
        if (distanceInDirection > 0 && distanceInDirection < nearestDistance) {
            nearestDistance = distanceInDirection
            nearestBlockingLevel = level
        }
    }

    if (nearestBlockingLevel && nearestDistance < minSpace) {
        return `SPACE_BLOCK: Nivel ${nearestBlockingLevel.type} @ ${nearestBlockingLevel.price.toFixed(6)} a solo ${nearestDistance.toFixed(6)} pips (min requerido: ${minSpace.toFixed(6)}). Sin espacio suficiente.`
    }

    return null
}

/**
 * FILTRO 3: RE-TESTEO INMEDIATO DE NIVEL
 *
 * Si el precio está volviendo a un nivel que ya tocó en las últimas N velas
 * SIN que hubieran velas de "aire" (de respiro) en el medio, es señal de que
 * el nivel va a ser roto, no respetado.
 *
 * Referencia: "Si el bot ya ejecutó una operación exitosa en esa zona e inmediatamente
 * el precio vuelve a bajar, no debe volver a comprar. La insistencia indica peligro de ruptura."
 *
 * @param {string} decision    - 'CALL' | 'PUT'
 * @param {Array}  candles     - velas cerradas
 * @param {Array}  levels      - niveles detectados
 * @param {number} closePrice  - precio actual
 * @returns {string|null}
 */
const checkImmediateRetest = (decision, candles, levels, closePrice) => {
    const cfg = config.strategy.marketContext.retest
    if (!levels || levels.length === 0) return null

    // Identificar el nivel más cercano al precio actual
    const proximityThreshold = config.strategy.levels.proximity
    const nearestLevel = levels.find(l =>
        Math.abs(l.price - closePrice) <= proximityThreshold &&
        l.quality !== 'WEAK'
    )

    if (!nearestLevel) return null

    // Revisar las últimas N velas para ver si el precio ya tocó este nivel
    const recentCandles = candles.slice(-cfg.lookback)

    let touchCount = 0
    let lastTouchIdx = -1
    let hadBreak = false

    for (let i = 0; i < recentCandles.length; i++) {
        const c = recentCandles[i]
        const touchedLevel =
            c.max >= nearestLevel.price - proximityThreshold &&
            c.min <= nearestLevel.price + proximityThreshold

        if (touchedLevel) {
            // Si hubo un respiro antes de este toque, reiniciar conteo
            if (hadBreak) {
                touchCount = 1
                hadBreak = false
            } else {
                touchCount++
            }
            lastTouchIdx = i
        } else if (lastTouchIdx !== -1) {
            // Vela que NO toca el nivel = respiro
            hadBreak = true
        }
    }

    // Peligro: Últimos toques son consecutivos (sin respiro al final)
    if (touchCount >= cfg.maxTouchesWithoutBreak && !hadBreak) {
        const levelDir = nearestLevel.type === 'SUPPORT' ? 'soporte' : 'resistencia'
        return `RETEST_BLOCK: El precio tocó el ${levelDir} @ ${nearestLevel.price.toFixed(6)} ${touchCount} veces consecutivas. Alta probabilidad de ruptura, no operar rebote.`
    }

    return null
}

module.exports = { checkMarketContext }
