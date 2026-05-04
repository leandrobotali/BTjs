/**
 * features.js
 *
 * Calcula las 9 features de micro-dinámica del precio a partir de una ventana de ticks.
 * Cada feature retorna un valor normalizado:
 *   - Features direccionales: [-1, +1] donde +1 = señal alcista, -1 = señal bajista
 *   - Features de estado: [0, 1] donde mayor = más intensidad del estado
 *
 * Input: Array de ticks [{ t: timestamp_ms, p: precio }]
 * Output: Objeto con los 9 features calculados
 *
 * IMPORTANTE: Todos los cálculos son puramente sobre precio y tiempo de los ticks.
 * Sin velas, sin indicadores clásicos, sin niveles históricos.
 */

const ε = 1e-10  // evita división por cero

/**
 * Calcula la varianza de un array de números.
 */
function variance(arr) {
    if (arr.length < 2) return 0
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length
    return arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / arr.length
}

/**
 * Calcula la media de un array de números.
 */
function mean(arr) {
    if (arr.length === 0) return 0
    return arr.reduce((a, b) => a + b, 0) / arr.length
}

/**
 * Pendiente de regresión lineal simple (mínimos cuadrados).
 * Retorna la pendiente de y respecto a x (índice).
 */
function linearSlope(arr) {
    const n = arr.length
    if (n < 2) return 0
    const xMean = (n - 1) / 2
    const yMean = mean(arr)
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
        num += (i - xMean) * (arr[i] - yMean)
        den += (i - xMean) ** 2
    }
    return den === 0 ? 0 : num / den
}

/**
 * Calcula los deltas (Δp y Δt) de la ventana.
 */
function computeDeltas(ticks) {
    const dp = [], dt = []
    for (let i = 1; i < ticks.length; i++) {
        dp.push(ticks[i].p - ticks[i - 1].p)
        dt.push(Math.max(ticks[i].t - ticks[i - 1].t, 1))  // mínimo 1ms
    }
    return { dp, dt }
}

// ─────────────────────────────────────────────────────────────
// FEATURE 1 — CI: Coherencia Interna
// Detecta si el sistema está ordenado o caótico.
// Alta CI → movimiento estructurado → features confiables
// Baja CI → ruido → NO TRADE
// ─────────────────────────────────────────────────────────────
function computeCI(dp, dt) {
    if (dp.length < 5) return 0

    const absDp = dp.map(Math.abs)
    const meanDp = mean(absDp)
    const meanDt = mean(dt)

    // Coeficiente de variación al cuadrado (normalizado por unidad)
    const cv2_dp = variance(absDp) / (meanDp ** 2 + ε)
    const cv2_dt = variance(dt) / (meanDt ** 2 + ε)

    const CI_raw = 1 / (cv2_dp + cv2_dt + ε)

    // Normalizar: CI típico está entre 0 y 5, mapeamos a [0,1]
    return Math.min(CI_raw / 5, 1)
}

// ─────────────────────────────────────────────────────────────
// FEATURE 2 — CET: Compresión / Expansión Temporal
// Anticipa acción inminente. No da dirección, da estado.
// CET > 0 → aceleración (ticks más seguidos) → algo se viene
// CET < 0 → enfriamiento → mercado dormido
// ─────────────────────────────────────────────────────────────
function computeCET(dt, dp) {
    if (dt.length < 10) return 0

    const half = Math.floor(dt.length / 2)
    const dtOld = dt.slice(0, half)
    const dtRecent = dt.slice(-half)

    const meanOldDt = mean(dtOld)
    const meanRecentDt = mean(dtRecent)

    // Si la conexión envía ticks a un ratio estable (ej. 1 vez por segundo, dt variance ≈ 0)
    // El tiempo nunca 'acelera'. En ese escenario calculamos la Compresión/Expansión basándonos
    // en la amplitud de la distancia recorrida en el mismo tiempo (velocidad geométrica).
    const isUniformTime = variance(dt) < 1000; // umbral de varianza rígida (< 31ms de desvío est.)

    if (isUniformTime) {
        const dpOld = dp.slice(0, half).map(Math.abs)
        const dpRecent = dp.slice(-half).map(Math.abs)

        const meanOldDp = mean(dpOld)
        const meanRecentDp = mean(dpRecent)

        // Aceleración = Los saltos de precio actuales son mayores que los pasados
        const rawDp = (meanRecentDp - meanOldDp) / (meanOldDp + ε)
        return Math.max(-1, Math.min(1, rawDp * 3))
    }

    // Diferencia relativa en tiempo: positivo = aceleración (ticks más rápidos ahora)
    const raw = (meanOldDt - meanRecentDt) / (meanOldDt + ε)
    return Math.max(-1, Math.min(1, raw * 3))
}

// ─────────────────────────────────────────────────────────────
// FEATURE 3 — ED: Elasticidad Direccional
// Cuánto se desplaza el precio por tick en cada dirección.
// ED > 0 → subir es más elástico (fácil) → señal alcista
// ED < 0 → bajar es más elástico → señal bajista
// ─────────────────────────────────────────────────────────────
function computeED(dp) {
    const upMoves = dp.filter(d => d > 0)
    const downMoves = dp.filter(d => d < 0).map(Math.abs)

    if (upMoves.length < 3 || downMoves.length < 3) return 0

    const ED_up = mean(upMoves)
    const ED_down = mean(downMoves)

    const ratio = ED_up / (ED_down + ε)
    // tanh(log(ratio)): 0 si igual, + si up es más elástico, - si down
    const logRatio = Math.log(ratio + ε)
    return Math.tanh(logRatio * 2)
}

// ─────────────────────────────────────────────────────────────
// FEATURE 4 — AFT: Asimetría de Fricción Temporal
// Cuánto tiempo tarda el precio en moverse en cada dirección.
// AFT > 0 → subir cuesta más tiempo → señal bajista
// AFT < 0 → bajar cuesta más tiempo → señal alcista
// ─────────────────────────────────────────────────────────────
function computeAFT(dp, dt) {
    const tUp = [], tDown = []

    for (let i = 0; i < dp.length; i++) {
        if (dp[i] === 0) continue
        const timePerUnit = dt[i] / (Math.abs(dp[i]) + ε)
        if (dp[i] > 0) tUp.push(timePerUnit)
        else tDown.push(timePerUnit)
    }

    if (tUp.length < 3 || tDown.length < 3) return 0

    const T_up = mean(tUp)
    const T_down = mean(tDown)

    // Diferencia relativa: positivo = subir es más lento
    const raw = (T_up - T_down) / (T_up + T_down + ε)
    return Math.max(-1, Math.min(1, raw * 3))
}

// ─────────────────────────────────────────────────────────────
// FEATURE 5 — PS: Persistencia de Signo
// Presión direccional sostenida sin importar amplitud.
// PS > 0 → secuencias alcistas más largas → presión latente hacia arriba
// PS < 0 → secuencias bajistas más largas
// ─────────────────────────────────────────────────────────────
function computePS(dp) {
    const signs = dp.map(d => d > 0 ? 1 : d < 0 ? -1 : 0).filter(s => s !== 0)
    if (signs.length < 5) return 0

    const seqUp = [], seqDown = []
    let currentSign = signs[0], currentLen = 1

    for (let i = 1; i < signs.length; i++) {
        if (signs[i] === currentSign) {
            currentLen++
        } else {
            if (currentSign === 1) seqUp.push(currentLen)
            else seqDown.push(currentLen)
            currentSign = signs[i]
            currentLen = 1
        }
    }
    // Última secuencia
    if (currentSign === 1) seqUp.push(currentLen)
    else seqDown.push(currentLen)

    const PS_up = seqUp.length > 0 ? mean(seqUp) : 1
    const PS_down = seqDown.length > 0 ? mean(seqDown) : 1

    const raw = (PS_up - PS_down) / (PS_up + PS_down + ε)
    return Math.max(-1, Math.min(1, raw * 3))
}

// ─────────────────────────────────────────────────────────────
// FEATURE 6 — VR: Velocidad de Reversión
// Quién domina después del movimiento: impulso o reversión.
// VR > 0 → reversiones alcistas más fuertes → presión compradora
// VR < 0 → reversiones bajistas más fuertes → presión vendedora
// ─────────────────────────────────────────────────────────────
function computeVR(dp, dt) {
    if (dp.length < 10) return 0

    const vrAfterUp = []    // VR de reversiones bajistas tras impulsos alcistas
    const vrAfterDown = []  // VR de reversiones alcistas tras impulsos bajistas

    // Detectar pares impulso/reversión
    let i = 0
    while (i < dp.length - 1) {
        // Detectar impulso
        const impulseSign = dp[i] > 0 ? 1 : dp[i] < 0 ? -1 : 0
        if (impulseSign === 0) { i++; continue }

        let impulseEnd = i
        let impulseDp = 0, impulseDt = 0
        while (impulseEnd < dp.length && Math.sign(dp[impulseEnd]) === impulseSign) {
            impulseDp += Math.abs(dp[impulseEnd])
            impulseDt += dt[impulseEnd]
            impulseEnd++
        }

        if (impulseEnd >= dp.length) break

        // Detectar reversión
        let revEnd = impulseEnd
        let revDp = 0, revDt = 0
        const revSign = -impulseSign
        while (revEnd < dp.length && Math.sign(dp[revEnd]) === revSign) {
            revDp += Math.abs(dp[revEnd])
            revDt += dt[revEnd]
            revEnd++
        }

        if (impulseDt > 0 && revDt > 0 && revDp > 0) {
            const vImpulse = impulseDp / impulseDt
            const vRev = revDp / revDt
            const ratio = vRev / (vImpulse + ε)

            if (impulseSign === 1) vrAfterUp.push(ratio)      // reversión bajista tras alza
            else vrAfterDown.push(ratio)                        // reversión alcista tras baja
        }

        i = revEnd > impulseEnd ? revEnd : impulseEnd + 1
    }

    const vrUp = vrAfterUp.length > 0 ? mean(vrAfterUp) : 1
    const vrDown = vrAfterDown.length > 0 ? mean(vrAfterDown) : 1

    // vrDown alto → reversiones alcistas fuertes → señal UP
    // vrUp alto → reversiones bajistas fuertes → señal DOWN
    const logR = Math.log((vrDown + ε) / (vrUp + ε))
    return Math.tanh(logR)
}

// ─────────────────────────────────────────────────────────────
// FEATURE 7 — FD: Fatiga Direccional
// Detecta agotamiento de un movimiento antes del colapso.
// FD > 0 → expansión (movimientos crecientes) → fuerza
// FD < 0 → agotamiento (movimientos decrecientes) → posible reversión
// ─────────────────────────────────────────────────────────────
function computeFD(dp) {
    // Tomar los últimos 20 movimientos direccionales con signo predominante
    const recent = dp.slice(-20)
    if (recent.length < 5) return 0

    // Identificar la dirección predominante
    const upSum = recent.filter(d => d > 0).reduce((a, b) => a + b, 0)
    const downSum = recent.filter(d => d < 0).reduce((a, b) => a + Math.abs(b), 0)
    const dominantSign = upSum >= downSum ? 1 : -1

    const magnitudes = recent
        .filter(d => Math.sign(d) === dominantSign || d !== 0)
        .map(d => Math.abs(d))

    if (magnitudes.length < 4) return 0

    const slope = linearSlope(magnitudes)
    const scale = mean(magnitudes) + ε

    // Pendiente normalizada: positiva = expansión, negativa = fatiga
    return Math.tanh(slope / scale * 10)
}

// ─────────────────────────────────────────────────────────────
// FEATURE 8 — IAL: Índice de Absorción Local
// Detecta barreras pasivas sin verlas: muchos intentos, poco avance.
// IAL alto → hay absorción/barrera → precio atrapado
// ─────────────────────────────────────────────────────────────
function computeIAL(ticks, dp) {
    if (ticks.length < 10) return 0

    const prices = ticks.map(t => t.p)
    const meanPrice = mean(prices)
    const zoneWidth = mean(dp.map(Math.abs)) * 5  // zona = 5x el movimiento promedio

    const zoneMin = meanPrice - zoneWidth / 2
    const zoneMax = meanPrice + zoneWidth / 2

    // Contar entradas a la zona
    let attempts = 0
    let inZone = prices[0] >= zoneMin && prices[0] <= zoneMax

    for (let i = 1; i < prices.length; i++) {
        const nowInZone = prices[i] >= zoneMin && prices[i] <= zoneMax
        if (nowInZone && !inZone) attempts++  // entró a la zona
        inZone = nowInZone
    }

    const netMove = Math.abs(prices[prices.length - 1] - prices[0])
    const minPip = mean(dp.map(Math.abs)) + ε

    const IAL_raw = attempts / (netMove / minPip + ε)
    return Math.min(Math.tanh(IAL_raw / 3), 1)
}

// ─────────────────────────────────────────────────────────────
// FEATURE 9 — SR: Simetría Rota
// Un mercado simétrico no tiene dirección clara.
// SR alto → dominancia direccional latente
// ─────────────────────────────────────────────────────────────
function computeSR(dp) {
    const upMoves = dp.filter(d => d > 0)
    const downMoves = dp.filter(d => d < 0).map(Math.abs)

    if (upMoves.length < 3 || downMoves.length < 3) return { value: 0, direction: 0 }

    const varUp = variance(upMoves)
    const varDown = variance(downMoves)

    const SR = Math.abs(varUp - varDown) / (varUp + varDown + ε)

    // Dirección: +1 si upside es más caótico (posible presión), -1 si downside
    const direction = varUp > varDown ? -1 : 1  // más caos arriba → probablemente baje

    return {
        value: Math.min(SR, 1),
        direction
    }
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────

/**
 * Calcula todas las features a partir de una ventana de ticks.
 * @param {Array<{t: number, p: number}>} ticks
 * @returns {Object} features — objeto con todos los valores calculados
 */
function computeFeatures(ticks) {
    const n = ticks.length

    // Mínimo de ticks para calcular features confiables
    if (n < 10) {
        return {
            valid: false,
            reason: `Ticks insuficientes: ${n} (mínimo 10)`,
            CI: 0, CET: 0, ED: 0, AFT: 0, PS: 0, VR: 0, FD: 0, IAL: 0,
            SR: 0, SR_dir: 0
        }
    }

    const { dp, dt } = computeDeltas(ticks)

    const CI = computeCI(dp, dt)
    const CET = computeCET(dt, dp)
    const ED = computeED(dp)
    const AFT = computeAFT(dp, dt)
    const PS = computePS(dp)
    const VR = computeVR(dp, dt)
    const FD = computeFD(dp)
    const IAL = computeIAL(ticks, dp)
    const srResult = computeSR(dp)

    return {
        valid: true,
        tickCount: n,
        CI,    // [0, 1]     coherencia interna
        CET,   // [-1, +1]   compresión temporal (+ = aceleración)
        ED,    // [-1, +1]   elasticidad direccional (+ = alcista)
        AFT,   // [-1, +1]   fricción temporal (+ = subir cuesta más → bajista)
        PS,    // [-1, +1]   persistencia de signo (+ = alcista)
        VR,    // [-1, +1]   velocidad de reversión (+ = alcista)
        FD,    // [-1, +1]   fatiga direccional (+ = expansión)
        IAL,   // [0, 1]     absorción local (+ = barrera presente)
        SR: srResult.value,    // [0, 1]    simetría rota
        SR_dir: srResult.direction,  // -1 o +1   dirección de la asimetría
        VOL: mean(dp.map(Math.abs)), // Volatilidad media absoluta (intensidad real)
        RANGE: (Math.max(...ticks.map(t => t.p)) - Math.min(...ticks.map(t => t.p))) / (mean(ticks.map(t => t.p)) + ε) // Rango relativo de la ventana
    }
}

module.exports = { computeFeatures }
