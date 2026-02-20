/**
 * levels.js — Soportes, Resistencias y Zonas Objetivo
 *
 * Basado en CONCEPTOS_BASICOS.md:
 * - Un S/R es válido SOLO cuando hay ≥2 velas en una dirección + ≥2 velas contrarias (reversa confirmada).
 * - El nivel se traza en la MECHA del punto de giro.
 * - La ZONA se define entre la mecha (extreme) y el cuerpo (open/close) de la vela de giro.
 * - Zona máxima: 10 pips de ancho.
 * - Zonas cercanas se unen en clusters.
 * - Cambio de Polaridad (Flip): soporte roto → resistencia, resistencia rota → soporte.
 * - Fuerza: # de rechazos (reversos confirmados), NO solo toques.
 * - Regla de Desgaste: zona con >4 toques sin ser rota = zona debilitada.
 * - Zona Objetivo: El nivel más relevante al que el precio "quiere ir" desde la posición actual.
 */

const config = require('../config.js')

// ============================================================
// DETECCIÓN DE ZONAS (reversa confirmada de 2+ velas)
// ============================================================

/**
 * Escanea candles y retorna zonas válidas de S/R.
 * Regla: 2+ velas en una dirección → 2+ velas contrarias → punto de giro válido.
 *
 * @param {Array} candles - velas cerradas históricas
 * @returns {Array} zonas raw: { price, zoneTop, zoneBottom, type, candleIndex }
 */
function detectRawZones(candles) {
    const cfg = config.strategy.levels
    const zones = []
    const n = candles.length
    const minSwing = cfg.minSwingCandles  // mínimo de velas en cada dirección

    for (let i = minSwing; i < n - minSwing; i++) {
        const curr = candles[i]

        // Verificar impulso ALCISTA previo (minSwing+ velas verdes/subida)
        const prevBullish = countDirectionalCandles(candles, i - 1, -1, 'UP', minSwing)
        // Verificar impulso BAJISTA posterior (minSwing+ velas rojas/bajada)
        const postBearish = countDirectionalCandles(candles, i + 1, +1, 'DOWN', minSwing)

        if (prevBullish && postBearish) {
            // Punto de giro ALTO → Resistencia
            // Zona: entre la mecha superior (high) y el cierre/apertura (cuerpo arriba)
            const bodyTop = Math.max(curr.open, curr.close)
            const zoneTop = curr.max          // mecha = límite real de rechazo
            const zoneBottom = bodyTop           // cuerpo = inicio del área
            const zoneWidth = zoneTop - zoneBottom

            // Filtro: zona no puede ser más ancha que MAX_ZONE_WIDTH
            if (zoneWidth <= cfg.maxZoneWidth) {
                zones.push({
                    price: zoneTop,          // punto de referencia principal = mecha
                    zoneTop: zoneTop,
                    zoneBottom: zoneBottom,
                    type: 'RESISTANCE',
                    candleIndex: i,
                    age: n - i             // cuántas velas hace
                })
            }
        }

        // Verificar impulso BAJISTA previo
        const prevBearish = countDirectionalCandles(candles, i - 1, -1, 'DOWN', minSwing)
        // Verificar impulso ALCISTA posterior
        const postBullish = countDirectionalCandles(candles, i + 1, +1, 'UP', minSwing)

        if (prevBearish && postBullish) {
            // Punto de giro BAJO → Soporte
            const bodyBottom = Math.min(curr.open, curr.close)
            const zoneTop = bodyBottom         // cuerpo = límite superior del área
            const zoneBottom = curr.min           // mecha = límite real de rechazo
            const zoneWidth = zoneTop - zoneBottom

            if (zoneWidth <= cfg.maxZoneWidth) {
                zones.push({
                    price: zoneBottom,       // punto de referencia principal = mecha
                    zoneTop: zoneTop,
                    zoneBottom: zoneBottom,
                    type: 'SUPPORT',
                    candleIndex: i,
                    age: n - i
                })
            }
        }
    }

    return zones
}

/**
 * Cuenta cuántas velas consecutivas van en una dirección desde un índice.
 * @param {Array} candles
 * @param {number} start  - índice de inicio
 * @param {number} step   - +1 hacia adelante, -1 hacia atrás
 * @param {'UP'|'DOWN'} dir
 * @param {number} minCount - cantidad mínima requerida
 * @returns {boolean}
 */
function countDirectionalCandles(candles, start, step, dir, minCount) {
    let count = 0
    let i = start

    while (i >= 0 && i < candles.length) {
        const c = candles[i]
        const isUp = c.close >= c.open
        const isDown = c.close < c.open

        if (dir === 'UP' && isUp) count++
        else if (dir === 'DOWN' && isDown) count++
        else break   // dirección rota, detener

        if (count >= minCount) return true
        i += step
    }

    return false
}

// ============================================================
// FUERZA DE ZONA (rechazos confirmados, no solo toques)
// ============================================================

/**
 * Evalúa la fuerza de una zona usando un score ponderado que considera:
 *   1. Rechazos confirmados (vela siguiente va en dirección opuesta)
 *   2. Intensidad del rechazo (cuerpo grande = rechazo fuerte)
 *   3. Recencia (toques recientes valen más que toques viejos)
 *
 * @param {Object} zone   - zona raw
 * @param {Array}  candles
 * @returns {Object} zona enriquecida con rejections, weightedScore, quality, isWorn
 */
function evaluateZoneStrength(zone, candles) {
    const cfg = config.strategy.levels
    const n = candles.length
    let rejections = 0
    let touches = 0
    let weightedScore = 0
    let lastTouchIdx = -1

    // Tamaño promedio de cuerpo de velas recientes (para normalizar intensidad)
    const sample = candles.slice(-50)
    const avgBody = sample.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / (sample.length || 1) || 0.000050

    for (let i = 0; i < n; i++) {
        const c = candles[i]

        // ¿El precio entró en la zona?
        const enteredZone = c.max >= zone.zoneBottom && c.min <= zone.zoneTop
        if (!enteredZone) continue

        touches++

        if (i + 1 < n) {
            const next = candles[i + 1]
            const isRejectionFromResistance =
                zone.type === 'RESISTANCE' && next.close < next.open
            const isRejectionFromSupport =
                zone.type === 'SUPPORT' && next.close > next.open

            if (isRejectionFromResistance || isRejectionFromSupport) {
                rejections++
                lastTouchIdx = i

                // Factor 1 — Intensidad: qué tan fuerte fue el cuerpo de la vela de rechazo
                // (1.0 = promedio, >1 = más fuerte, cap en 2.0)
                const rejBody = Math.abs(next.close - next.open)
                const intensity = Math.min(rejBody / avgBody, 2.0)

                // Factor 2 — Recencia: cuanto más reciente el toque, más pesa
                // (0.5 para el inicio del histórico, 1.5 para el más reciente)
                const recency = 0.5 + (i / n) * 1.0

                weightedScore += intensity * recency
            }
        }
    }

    // Clasificar fuerza usando el score ponderado
    let quality = 'WEAK'
    if (weightedScore >= cfg.strongScore) quality = 'STRONG'
    else if (weightedScore >= cfg.mediumScore) quality = 'MEDIUM'

    // Desgaste: demasiados toques sin ser rota = zona próxima a romper
    const isWorn = touches >= cfg.wornTouches

    return {
        ...zone,
        rejections,
        touches,
        quality,
        isWorn,
        weightedScore: Math.round(weightedScore * 100) / 100,
        lastTouchIdx
    }
}

// ============================================================
// DETECCIÓN DE RUPTURAS Y CAMBIO DE POLARIDAD (FLIP)
// ============================================================

/**
 * Verifica si una zona fue rota por una vela y aplica cambio de polaridad.
 * Regla de ruptura: la vela cierra fuera de la zona con al menos 20-35% del cuerpo.
 *
 * @param {Object} zone
 * @param {Array}  candles
 * @returns {Object} zona con isBroken y posible nuevo tipo tras flip
 */
function applyPolarityFlip(zone, candles) {
    const cfg = config.strategy.levels

    // Revisar solo las velas DESPUÉS de que se formó la zona
    const startIdx = zone.candleIndex + 1

    for (let i = startIdx; i < candles.length; i++) {
        const c = candles[i]
        const bodySize = Math.abs(c.close - c.open)

        if (bodySize === 0) continue

        if (zone.type === 'RESISTANCE') {
            // Ruptura alcista: cierre por encima del tope de la zona
            if (c.close > zone.zoneTop) {
                const bodyAbove = c.close - zone.zoneTop
                const breakRatio = bodyAbove / bodySize

                if (breakRatio >= cfg.minBreakRatio) {
                    // Zona rota → ahora es SOPORTE (flip)
                    return {
                        ...zone,
                        isBroken: true,
                        breakIdx: i,
                        type: 'SUPPORT',         // flip
                        originalType: 'RESISTANCE',
                        isFlipped: true,
                        // La nueva zona soporte usa las coordenadas originales
                        zoneTop: zone.zoneTop,
                        zoneBottom: zone.zoneBottom
                    }
                }
            }
        } else if (zone.type === 'SUPPORT') {
            // Ruptura bajista: cierre por debajo del piso de la zona
            if (c.close < zone.zoneBottom) {
                const bodyBelow = zone.zoneBottom - c.close
                const breakRatio = bodyBelow / bodySize

                if (breakRatio >= cfg.minBreakRatio) {
                    // Zona rota → ahora es RESISTENCIA (flip)
                    return {
                        ...zone,
                        isBroken: true,
                        breakIdx: i,
                        type: 'RESISTANCE',      // flip
                        originalType: 'SUPPORT',
                        isFlipped: true,
                        zoneTop: zone.zoneTop,
                        zoneBottom: zone.zoneBottom
                    }
                }
            }
        }
    }

    return { ...zone, isBroken: false, isFlipped: false }
}

// ============================================================
// CLUSTERING (unir zonas cercanas < 10 pips)
// ============================================================

/**
 * Agrupa zonas cuyos rangos se solapan o están a ≤ clusterDistance.
 * Se fusionan sumando rechazos y promediando precios.
 *
 * @param {Array}  zones
 * @param {number} clusterDistance - distancia máxima para agrupar
 * @returns {Array} zonas fusionadas
 */
function clusterZones(zones) {
    if (zones.length === 0) return []
    const cfg = config.strategy.levels

    // Ordenar por precio de referencia
    const sorted = [...zones].sort((a, b) => a.price - b.price)
    const clustered = []
    let current = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]
        const curr = sorted[i]

        // Solapan o están muy cerca?
        const overlap = curr.zoneBottom <= prev.zoneTop + cfg.maxZoneWidth
        if (overlap) {
            current.push(curr)
        } else {
            clustered.push(mergeZoneCluster(current))
            current = [curr]
        }
    }
    clustered.push(mergeZoneCluster(current))

    return clustered
}

function mergeZoneCluster(cluster) {
    const totalRejections = cluster.reduce((s, z) => s + (z.rejections || 1), 0)
    const totalTouches = cluster.reduce((s, z) => s + (z.touches || 1), 0)
    const avgPrice = cluster.reduce((s, z) => s + z.price, 0) / cluster.length

    const zoneTop = Math.max(...cluster.map(z => z.zoneTop))
    const zoneBottom = Math.min(...cluster.map(z => z.zoneBottom))

    // Priorizar tipo: FLIP > SUPPORT/RESISTANCE con más rechazos
    const hasFlip = cluster.some(z => z.isFlipped)
    const types = cluster.map(z => z.type)
    const hasSupport = types.includes('SUPPORT')
    const hasResistance = types.includes('RESISTANCE')

    let finalType = cluster[0].type
    if (hasFlip) {
        // Donde hubo flip, es KEY_ZONE (tuvo ambos roles)
        finalType = 'KEY_ZONE'
    } else if (hasSupport && hasResistance) {
        finalType = 'KEY_ZONE'
    }

    const cfg = config.strategy.levels
    let quality = 'WEAK'
    if (totalRejections >= cfg.strongRejections) quality = 'STRONG'
    else if (totalRejections >= cfg.mediumRejections) quality = 'MEDIUM'

    const isWorn = totalTouches >= cfg.wornTouches

    return {
        price: avgPrice,
        zoneTop: zoneTop,
        zoneBottom: zoneBottom,
        type: finalType,
        quality: quality,
        rejections: totalRejections,
        touches: totalTouches,
        isWorn: isWorn,
        isFlipped: hasFlip,
        clusterSize: cluster.length,
        age: Math.min(...cluster.map(z => z.age || 0))
    }
}

// ============================================================
// FUNCIÓN PRINCIPAL: getLevels
// ============================================================

/**
 * Calcula todas las zonas de S/R activas.
 * Retorna solo zonas MEDIUM o STRONG, no desgastadas críticamente.
 *
 * @param {Array} candles
 * @returns {Array} zonas activas ordenadas por precio
 */
function getLevels(candles) {
    if (candles.length < 10) return []

    // 1. Detectar zonas crudas (reversa confirmada)
    const rawZones = detectRawZones(candles)

    // 2. Evaluar fuerza de cada zona (rechazos reales)
    const withStrength = rawZones.map(z => evaluateZoneStrength(z, candles))

    // 3. Aplicar Cambio de Polaridad (Flip)
    const withFlip = withStrength.map(z => applyPolarityFlip(z, candles))

    // 4. Filtrar zonas rotas SIN flip (ya no son válidas)
    const activeZones = withFlip.filter(z => !z.isBroken || z.isFlipped)

    // 5. Agregar números redondos como zonas especiales
    const roundZones = detectRoundNumberZones(candles)

    // 6. Combinar todo y re-evaluar fuerza de round zones
    const allZones = [...activeZones, ...roundZones.map(rz => evaluateZoneStrength(rz, candles))]

    // 7. Clustering: unir zonas cercanas
    const clustered = clusterZones(allZones)

    // 8. Filtrar: KEY_ZONE siempre pasa; STRONG pasa; MEDIUM pasa si no está desgastada
    const filtered = clustered.filter(z => {
        if (z.type === 'KEY_ZONE') return true       // flip zones: máxima confiabilidad, siempre activas
        if (z.quality === 'STRONG') return true
        if (z.quality === 'MEDIUM' && !z.isWorn) return true
        return false
    })

    // 9. Ordenar por precio ascendente
    return filtered.sort((a, b) => a.price - b.price)
}

// ============================================================
// NÚMEROS REDONDOS
// ============================================================

/**
 * Genera zonas de números redondos en el rango de precios actual.
 * (Los institucionales colocan órdenes en precios terminados en .000 y .500)
 */
function detectRoundNumberZones(candles) {
    const recent = candles.slice(-20)
    const allPrices = recent.flatMap(c => [c.max, c.min])
    const priceMin = Math.min(...allPrices)
    const priceMax = Math.max(...allPrices)

    const step = 0.00050  // terminaciones en 000 y 500
    const zones = []

    let roundPrice = Math.floor(priceMin / step) * step

    while (roundPrice <= priceMax + step) {
        if (roundPrice >= priceMin - step) {
            const halfPip = 0.000050
            zones.push({
                price: roundPrice,
                zoneTop: roundPrice + halfPip,
                zoneBottom: roundPrice - halfPip,
                type: 'ROUND_NUMBER',
                candleIndex: 0,
                age: 0,
                rejections: 1,   // mínimo para ser MEDIUM
                touches: 1,
                quality: 'MEDIUM',
                isWorn: false,
                isFlipped: false
            })
        }
        roundPrice = Math.round((roundPrice + step) * 1e6) / 1e6
    }

    return zones
}

// ============================================================
// VERIFICACIÓN DE PROXIMIDAD AL PRECIO ACTUAL
// ============================================================

/**
 * Verifica si el precio actual está dentro o tocando alguna zona.
 *
 * @param {number} price  - precio actual (cierre de vela)
 * @param {Array}  levels - zonas activas
 * @returns {{ isAtLevel: boolean, level: Object|null }}
 */
function checkLevelProximity(price, levels) {
    const tolerance = config.strategy.levels.proximity

    // Buscar zona que contenga el precio (con tolerancia)
    for (const level of levels) {
        const inZone =
            price >= level.zoneBottom - tolerance &&
            price <= level.zoneTop + tolerance

        if (inZone) {
            return { isAtLevel: true, level }
        }
    }

    return { isAtLevel: false, level: null }
}

// ============================================================
// ZONA OBJETIVO (Target Zone)
// ============================================================

/**
 * Determina la ZONA OBJETIVO: el nivel más relevante al que el precio
 * "quiere llegar" desde su posición actual.
 *
 * Lógica:
 * - Si hay una señal de decisión (CALL/PUT), buscar el siguiente nivel relevante
 *   en esa dirección para evaluar si hay recorrido suficiente.
 * - Si el precio ya está en una zona, el objetivo es re-testear ese nivel.
 * - Retorna: el nivel objetivo + la distancia + si hay "espacio libre".
 *
 * @param {number} currentPrice  - precio actual
 * @param {string} direction     - 'CALL' | 'PUT' | null
 * @param {Array}  levels        - zonas activas
 * @param {Array}  candles       - para calcular el rango promedio de vela
 * @returns {Object} targetZone info
 */
function getTargetZone(currentPrice, direction, levels) {
    if (!direction || levels.length === 0) {
        return { hasTarget: false, target: null, distancePips: 0, hasSpace: false }
    }

    const cfg = config.strategy.levels

    // Buscar el nivel más cercano en la dirección de la operación
    let targetLevel = null
    let minDistance = Infinity

    for (const level of levels) {
        let distance

        if (direction === 'CALL') {
            // Para CALL: buscar nivel por ENCIMA (resistencia o key zone)
            distance = level.price - currentPrice
        } else {
            // Para PUT: buscar nivel por DEBAJO (soporte o key zone)
            distance = currentPrice - level.price
        }

        if (distance > 0 && distance < minDistance) {
            minDistance = distance
            targetLevel = level
        }
    }

    if (!targetLevel) {
        return { hasTarget: false, target: null, distancePips: 0, hasSpace: true }
    }

    // ¿Hay espacio suficiente? (al menos N pips = minTargetDistance)
    const hasSpace = minDistance >= cfg.minTargetDistance

    // ¿El precio está "viajando hacia" el objetivo?
    //   (el precio todavía tiene recorrido disponible = buena operación)
    // ¿O está ya pegado al objetivo?
    //   (poca distancia = el precio va a chocar pronto = mala operación)

    return {
        hasTarget: true,
        target: targetLevel,
        distancePips: minDistance,
        hasSpace: hasSpace,
        description: `${targetLevel.type} @ ${targetLevel.price.toFixed(6)} (${minDistance.toFixed(6)} pips, calidad: ${targetLevel.quality})`
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    getLevels,
    checkLevelProximity,
    getTargetZone
}
