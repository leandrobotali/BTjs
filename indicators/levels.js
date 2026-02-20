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
 * - Fuerza: score ponderado (intensidad × recencia × progresión × obviedad), NO solo toques.
 * - Regla de Desgaste: zona con >4 toques sin ser rota = zona debilitada.
 * - Zona Objetivo: El nivel más relevante al que el precio "quiere ir" desde la posición actual.
 * - Números Redondos: jerarquía Master (.xx0000) > Strong (.xxx000) > Medium (.xxx500).
 * - Recencia: niveles de más de 200 velas pierden relevancia.
 */

const config = require('../config.js')

// ============================================================
// DETECCIÓN DE ZONAS (reversa confirmada de 2+ velas)
// ============================================================

/**
 * Escanea candles y retorna zonas válidas de S/R.
 * Regla: 2+ velas en una dirección → 2+ velas contrarias → punto de giro válido.
 * Incluye "obviousness" (magnitud del reverso) como métrica de calidad.
 *
 * @param {Array} candles - velas cerradas históricas
 * @returns {Array} zonas raw: { price, zoneTop, zoneBottom, type, candleIndex, magnitude }
 */
function detectRawZones(candles) {
    const cfg = config.strategy.levels
    const zones = []
    const n = candles.length
    const minSwing = cfg.minSwingCandles  // mínimo de velas en cada dirección

    // Tamaño promedio de vela para normalizar la magnitud del reverso
    const sample = candles.slice(-50)
    const avgRange = sample.reduce((s, c) => s + (c.max - c.min), 0) / (sample.length || 1) || 0.000050

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

            // Calcular magnitud del reverso: cuánto bajó después del pivote
            const magnitude = calcReversalMagnitude(candles, i, 'DOWN', avgRange)

            // Filtro: zona no puede ser más ancha que MAX_ZONE_WIDTH
            if (zoneWidth <= cfg.maxZoneWidth) {
                zones.push({
                    price: zoneTop,          // punto de referencia principal = mecha
                    zoneTop: zoneTop,
                    zoneBottom: zoneBottom,
                    type: 'RESISTANCE',
                    candleIndex: i,
                    age: n - i,            // cuántas velas hace
                    magnitude              // obviedad: qué tan grande fue el reverso
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

            // Calcular magnitud del reverso: cuánto subió después del pivote
            const magnitude = calcReversalMagnitude(candles, i, 'UP', avgRange)

            if (zoneWidth <= cfg.maxZoneWidth) {
                zones.push({
                    price: zoneBottom,       // punto de referencia principal = mecha
                    zoneTop: zoneTop,
                    zoneBottom: zoneBottom,
                    type: 'SUPPORT',
                    candleIndex: i,
                    age: n - i,
                    magnitude
                })
            }
        }
    }

    return zones
}

/**
 * Calcula la magnitud del reverso después de un punto de giro.
 * Mide cuánto se movió el precio en la dirección opuesta después del pivote.
 * Normalizado contra avgRange: 1.0 = promedio, >2.0 = muy obvio.
 *
 * @param {Array}  candles
 * @param {number} pivotIdx - índice del pivote
 * @param {'UP'|'DOWN'} reversalDir - dirección del reverso
 * @param {number} avgRange - rango promedio para normalizar
 * @returns {number} magnitud normalizada (0-3, capped)
 */
function calcReversalMagnitude(candles, pivotIdx, reversalDir, avgRange) {
    let totalMove = 0
    const lookAhead = Math.min(5, candles.length - pivotIdx - 1)

    for (let j = 1; j <= lookAhead; j++) {
        const c = candles[pivotIdx + j]
        const move = Math.abs(c.close - c.open)
        const isCorrectDir = (reversalDir === 'UP' && c.close > c.open) ||
            (reversalDir === 'DOWN' && c.close < c.open)
        if (isCorrectDir) totalMove += move
        else break
    }

    return Math.min(totalMove / avgRange, 3.0) // cap at 3.0
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
 *   4. Progresión (toques 2-3 fortalecen, toques 4+ debilitan)
 *   5. Obviedad (magnitud del reverso original)
 *
 * @param {Object} zone   - zona raw (con magnitude)
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

    // Factor 3 — Progresión: toques 2-3 fortalecen, 4+ debilitan (doc: "desgaste")
    // "El primer toque crea zona débil; segundo y tercero la confirman como zona fuerte."
    // "Demasiados toques (más de 4 o 5) = zona debilitada."
    let progressionMultiplier = 1.0
    if (touches >= 2 && touches <= 3) {
        progressionMultiplier = 1.2  // confirmación = bonus
    } else if (touches >= 4) {
        progressionMultiplier = 0.7  // desgaste = penalización
    }
    weightedScore *= progressionMultiplier

    // Factor 4 — Obviedad: magnitud del reverso original
    // Una zona formada por un reverso grande es más "obvia" y atrae más órdenes
    const magnitude = zone.magnitude || 0
    if (magnitude > 0) {
        // Bonus: magnitud 1.0 = +20%, magnitud 2.0 = +40%, cap en +60%
        const magnitudeBonus = 1.0 + Math.min(magnitude * 0.2, 0.6)
        weightedScore *= magnitudeBonus
    }

    // Clasificar fuerza usando el score ponderado
    let quality = 'WEAK'
    if (weightedScore >= cfg.strongScore) quality = 'STRONG'
    else if (weightedScore >= cfg.mediumScore) quality = 'MEDIUM'

    // Preservar calidad mínima de zonas especiales (ROUND_NUMBER tiene calidad inherente)
    // Los números redondos tienen importancia psicológica/institucional sin necesitar rechazos
    const qualityRank = { 'WEAK': 0, 'MEDIUM': 1, 'STRONG': 2 }
    if (zone.quality && qualityRank[zone.quality] > qualityRank[quality]) {
        quality = zone.quality
    }

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
 * Se fusionan sumando scores ponderados y promediando precios.
 *
 * @param {Array}  zones
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
    const totalWeightedScore = cluster.reduce((s, z) => s + (z.weightedScore || 0), 0)
    const avgPrice = cluster.reduce((s, z) => s + z.price, 0) / cluster.length
    const maxMagnitude = Math.max(...cluster.map(z => z.magnitude || 0))

    const zoneTop = Math.max(...cluster.map(z => z.zoneTop))
    const zoneBottom = Math.min(...cluster.map(z => z.zoneBottom))

    // Preservar roundLevel del miembro más importante
    const qualityRank = { 'WEAK': 0, 'MEDIUM': 1, 'STRONG': 2 }
    const roundMember = cluster
        .filter(z => z.roundLevel)
        .sort((a, b) => (qualityRank[b.quality] || 0) - (qualityRank[a.quality] || 0))[0]
    const roundLevel = roundMember ? roundMember.roundLevel : undefined

    // Priorizar tipo: FLIP > SUPPORT/RESISTANCE con más rechazos
    const hasFlip = cluster.some(z => z.isFlipped)
    const types = cluster.map(z => z.type)
    const hasSupport = types.includes('SUPPORT')
    const hasResistance = types.includes('RESISTANCE')
    const hasRoundNumber = types.includes('ROUND_NUMBER')

    let finalType = cluster[0].type
    if (hasFlip) {
        // Donde hubo flip, es KEY_ZONE (tuvo ambos roles)
        finalType = 'KEY_ZONE'
    } else if (hasSupport && hasResistance) {
        finalType = 'KEY_ZONE'
    }

    // Clasificar usando el score ponderado acumulado (no solo conteo de rechazos)
    const cfg = config.strategy.levels
    let quality = 'WEAK'
    if (totalWeightedScore >= cfg.strongScore) quality = 'STRONG'
    else if (totalWeightedScore >= cfg.mediumScore) quality = 'MEDIUM'
    // Fallback: si el score es 0 (por ejemplo, zonas de números redondos sin toques previos)
    // usar el conteo de rechazos como respaldo
    else if (totalRejections >= cfg.strongRejections) quality = 'STRONG'
    else if (totalRejections >= cfg.mediumRejections) quality = 'MEDIUM'

    // Preservar calidad mínima de miembros especiales (round numbers, etc.)
    // La mejor calidad pre-existente actúa como piso
    const bestPreExisting = cluster.reduce((best, z) => {
        return (qualityRank[z.quality] || 0) > (qualityRank[best] || 0) ? z.quality : best
    }, 'WEAK')
    if (qualityRank[bestPreExisting] > qualityRank[quality]) {
        quality = bestPreExisting
    }

    const isWorn = totalTouches >= cfg.wornTouches

    return {
        price: avgPrice,
        zoneTop: zoneTop,
        zoneBottom: zoneBottom,
        type: finalType,
        quality: quality,
        rejections: totalRejections,
        touches: totalTouches,
        weightedScore: Math.round(totalWeightedScore * 100) / 100,
        magnitude: maxMagnitude,
        isWorn: isWorn,
        isFlipped: hasFlip,
        roundLevel: roundLevel,
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
 * Aplica filtro de recencia: niveles viejos (>maxAge) se depriorizan un tier.
 *
 * @param {Array} candles
 * @returns {Array} zonas activas ordenadas por precio
 */
function getLevels(candles) {
    if (candles.length < 10) return []

    const cfg = config.strategy.levels

    // 1. Detectar zonas crudas (reversa confirmada + magnitud de reverso)
    const rawZones = detectRawZones(candles)

    // 2. Evaluar fuerza de cada zona (rechazos reales + intensidad + recencia + progresión + obviedad)
    const withStrength = rawZones.map(z => evaluateZoneStrength(z, candles))

    // 3. Aplicar Cambio de Polaridad (Flip)
    const withFlip = withStrength.map(z => applyPolarityFlip(z, candles))

    // 4. Filtrar zonas rotas SIN flip (ya no son válidas)
    const activeZones = withFlip.filter(z => !z.isBroken || z.isFlipped)

    // 5. Agregar números redondos como zonas especiales (con jerarquía)
    const roundZones = detectRoundNumberZones(candles)

    // 6. Combinar todo y re-evaluar fuerza de round zones
    const allZones = [...activeZones, ...roundZones.map(rz => evaluateZoneStrength(rz, candles))]

    // 7. Clustering: unir zonas cercanas
    const clustered = clusterZones(allZones)

    // 8. Filtro de recencia: deprioritizar zonas viejas (>maxAge velas)
    const withRecency = clustered.map(z => {
        if (z.age > cfg.maxAge && z.type !== 'KEY_ZONE' && z.type !== 'ROUND_NUMBER') {
            // Demote quality by one tier (STRONG → MEDIUM, MEDIUM → WEAK)
            let adjustedQuality = z.quality
            if (z.quality === 'STRONG') adjustedQuality = 'MEDIUM'
            else if (z.quality === 'MEDIUM') adjustedQuality = 'WEAK'
            return { ...z, quality: adjustedQuality, agedOut: true }
        }
        return { ...z, agedOut: false }
    })

    // 9. Filtrar: KEY_ZONE siempre pasa; STRONG pasa; MEDIUM pasa si no está desgastada
    const filtered = withRecency.filter(z => {
        if (z.type === 'KEY_ZONE') return true       // flip zones: máxima confiabilidad, siempre activas
        if (z.quality === 'STRONG') return true
        if (z.quality === 'MEDIUM' && !z.isWorn) return true
        return false
    })

    // 10. Ordenar por precio ascendente
    return filtered.sort((a, b) => a.price - b.price)
}

// ============================================================
// NÚMEROS REDONDOS (con jerarquía de importancia)
// ============================================================

/**
 * Genera zonas de números redondos en el rango de precios actual.
 * Jerarquía basada en CONCEPTOS_BASICOS.md:
 *   - MASTER (.xx0000): Nivel más fuerte de reacción
 *   - STRONG (.xxx000): Líneas principales del broker
 *   - MEDIUM (.xxx500): Punto de apoyo frecuente
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

            // Determinar jerarquía de importancia
            const roundInfo = classifyRoundNumber(roundPrice)

            zones.push({
                price: roundPrice,
                zoneTop: roundPrice + halfPip,
                zoneBottom: roundPrice - halfPip,
                type: 'ROUND_NUMBER',
                candleIndex: 0,
                age: 0,
                rejections: 1,   // mínimo para ser considerado
                touches: 1,
                quality: roundInfo.quality,
                roundLevel: roundInfo.level,
                magnitude: 0,
                isWorn: false,
                isFlipped: false
            })
        }
        roundPrice = Math.round((roundPrice + step) * 1e6) / 1e6
    }

    return zones
}

/**
 * Clasifica un número redondo según su importancia psicológica.
 * @param {number} price
 * @returns {{ level: string, quality: string }}
 */
function classifyRoundNumber(price) {
    // Convertir a entero en micropips (6 decimales) para analizar trailing zeros
    const microPips = Math.round(price * 1e6)

    if (microPips % 10000 === 0) {
        // Terminación en .xx0000 → Nivel Maestro (e.g., 1.230000)
        return { level: 'MASTER', quality: 'STRONG' }
    } else if (microPips % 1000 === 0) {
        // Terminación en .xxx000 → Nivel Fuerte (e.g., 1.234000)
        return { level: 'STRONG', quality: 'MEDIUM' }
    } else if (microPips % 500 === 0) {
        // Terminación en .xxx500 → Nivel Medio (e.g., 1.234500)
        return { level: 'MEDIUM', quality: 'MEDIUM' }
    }

    // Fallback (no debería llegar aquí con step 0.00050)
    return { level: 'MINOR', quality: 'WEAK' }
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
// ZONA OBJETIVO (Target Zone) — Solo niveles BLOQUEANTES
// ============================================================

/**
 * Determina la ZONA OBJETIVO: el nivel más relevante al que el precio
 * "quiere llegar" desde su posición actual.
 *
 * Lógica:
 * - Para CALL: busca RESISTANCE, KEY_ZONE o ROUND_NUMBER por encima (bloqueantes).
 *   (Un SUPPORT por encima no es bloqueante para un CALL.)
 * - Para PUT: busca SUPPORT, KEY_ZONE o ROUND_NUMBER por debajo (bloqueantes).
 *   (Una RESISTANCE por debajo no es bloqueante para un PUT.)
 * - Retorna: el nivel objetivo + la distancia + si hay "espacio libre".
 *
 * @param {number} currentPrice  - precio actual
 * @param {string} direction     - 'CALL' | 'PUT' | null
 * @param {Array}  levels        - zonas activas
 * @returns {Object} targetZone info
 */
function getTargetZone(currentPrice, direction, levels) {
    if (!direction || levels.length === 0) {
        return { hasTarget: false, target: null, distancePips: 0, hasSpace: false }
    }

    const cfg = config.strategy.levels

    // Tipos de nivel que actúan como bloqueantes según la dirección
    const blockingTypes = direction === 'CALL'
        ? ['RESISTANCE', 'KEY_ZONE', 'ROUND_NUMBER']  // para CALL: bloqueantes arriba
        : ['SUPPORT', 'KEY_ZONE', 'ROUND_NUMBER']     // para PUT: bloqueantes abajo

    // Buscar el nivel bloqueante más cercano en la dirección de la operación
    let targetLevel = null
    let minDistance = Infinity

    for (const level of levels) {
        // Solo considerar niveles que actúen como bloqueantes
        if (!blockingTypes.includes(level.type)) continue

        let distance

        if (direction === 'CALL') {
            // Para CALL: buscar nivel por ENCIMA
            distance = level.price - currentPrice
        } else {
            // Para PUT: buscar nivel por DEBAJO
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
