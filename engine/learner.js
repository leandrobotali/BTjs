/**
 * learner.js
 *
 * Sistema de autoaprendizaje online de pesos.
 * Ajusta los pesos w1..w8 en base a los resultados de operaciones pasadas.
 *
 * Algoritmo: Perceptron online simplificado
 *   w_i += learning_rate * resultado * feature_i
 * Donde resultado = +1 (WIN) o -1 (LOSS). TIE se ignora.
 *
 * PERSISTENCIA: Los pesos se guardan en engine/weights.json después de cada
 * actualización. Al arrancar, el bot carga los pesos desde ese archivo.
 * Si no existe, comienza con pesos iguales (sistema imparcial).
 *
 * SEGURIDAD: Los pesos se normalizan (L2 norm) para evitar divergencia.
 */

const fs = require('fs')
const path = require('path')

const WEIGHTS_FILE = path.join(__dirname, 'weights.json')
const LOG_FILE = path.join(__dirname, 'learning_log.json')

const LEARNING_RATE = 0.005          // Reducido para mayor estabilidad
const NUM_WEIGHTS = 8
const MIN_OPS_TO_LEARN = 50          // No ajustar pesos hasta tener 50 operaciones

// Pesos iniciales: todos iguales (sistema imparcial)
const INITIAL_WEIGHTS = Array(NUM_WEIGHTS).fill(1.0 / NUM_WEIGHTS)

// Etiquetas de los pesos para logging
const WEIGHT_LABELS = ['ED', 'PS', 'VR', 'AFT', 'FD', 'PED', 'EV', 'SR']

let weights = [...INITIAL_WEIGHTS]
let operationCount = 0
let winCount = 0
let lossCount = 0

/**
 * Carga los pesos desde el archivo JSON al arrancar el bot.
 * Si el archivo no existe, usa los pesos iniciales.
 */
function loadWeights() {
    try {
        if (fs.existsSync(WEIGHTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'))
            if (Array.isArray(data.weights) && data.weights.length === NUM_WEIGHTS) {
                weights = data.weights
                operationCount = data.operationCount || 0
                winCount = data.winCount || 0
                lossCount = data.lossCount || 0
                console.log(`[LEARNER] ✅ Pesos cargados desde weights.json (${operationCount} operaciones previas)`)
                console.log(`[LEARNER] Pesos actuales:`, formatWeights(weights))
            } else {
                console.log('[LEARNER] ⚠️ weights.json inválido, usando pesos iniciales')
                weights = [...INITIAL_WEIGHTS]
            }
        } else {
            console.log('[LEARNER] 📄 No existe weights.json, iniciando con pesos uniformes')
            weights = [...INITIAL_WEIGHTS]
            saveWeights()  // crear el archivo inicial
        }
    } catch (err) {
        console.error('[LEARNER] ❌ Error cargando pesos:', err.message)
        weights = [...INITIAL_WEIGHTS]
    }
}

/**
 * Guarda los pesos actuales en weights.json.
 */
function saveWeights() {
    try {
        const data = {
            weights,
            operationCount,
            winCount,
            lossCount,
            winRate: operationCount > 0 ? (winCount / operationCount * 100).toFixed(1) + '%' : 'N/A',
            lastUpdate: new Date().toISOString(),
            weightLabels: WEIGHT_LABELS
        }
        fs.writeFileSync(WEIGHTS_FILE, JSON.stringify(data, null, 2), 'utf8')
    } catch (err) {
        console.error('[LEARNER] ❌ Error guardando pesos:', err.message)
    }
}

/**
 * Normaliza los pesos usando norma L2 para evitar divergencia.
 * @param {number[]} w
 * @returns {number[]}
 */
function normalizeWeights(w) {
    const norm = Math.sqrt(w.reduce((sum, x) => sum + x * x, 0))
    if (norm < 1e-10) return Array(w.length).fill(1.0 / w.length)
    // Normalizar y luego escalar para que la media sea ~0.125 (1/8)
    const target = 1.0 / w.length
    return w.map(x => (x / norm) * target * Math.sqrt(w.length))
}

/**
 * Formatea los pesos para logging legible.
 */
function formatWeights(w) {
    return WEIGHT_LABELS.map((label, i) => `${label}=${w[i].toFixed(4)}`).join(', ')
}

/**
 * Extrae el vector de features en el mismo orden que los pesos.
 * @param {Object} features — snapshot de gatedFeatures+gatedInteractions al momento de operar
 * @returns {number[]}
 */
function extractFeatureVector(snapshot) {
    return [
        snapshot.ED || 0,
        snapshot.PS || 0,
        snapshot.VR || 0,
        snapshot.AFT || 0,
        snapshot.FD || 0,
        snapshot.PED || 0,
        snapshot.EV || 0,
        snapshot.SR_contribution || 0
    ]
}

/**
 * Registra el resultado de una operación y actualiza los pesos.
 * @param {Object} featureSnapshot — features+interactions al momento de operar
 * @param {string} result — 'WIN', 'LOSS' o 'TIE'
 * @param {string} direction — 'call' o 'put'
 */
function recordResult(featureSnapshot, result, direction) {
    if (result === 'TIE') {
        console.log('[LEARNER] TIE ignorado (no actualiza pesos)')
        return
    }

    operationCount++
    const outcome = result === 'WIN' ? 1 : -1
    if (result === 'WIN') winCount++
    else lossCount++

    const featureVector = extractFeatureVector(featureSnapshot)

    // FASE DE OBSERVACIÓN: No ajustar pesos hasta tener suficientes operaciones.
    // Los primeros MIN_OPS_TO_LEARN trades se registran pero los pesos quedan uniformes.
    // Esto evita que el learner desestabilice el sistema con poca data.
    if (operationCount < MIN_OPS_TO_LEARN) {
        const winRate = (winCount / operationCount * 100).toFixed(1)
        console.log(`[LEARNER] ${result} registrado (FASE OBSERVACIÓN ${operationCount}/${MIN_OPS_TO_LEARN}) | WinRate: ${winRate}%`)
        console.log(`[LEARNER] Pesos sin cambios (esperando ${MIN_OPS_TO_LEARN} operaciones para activar aprendizaje)`)
        saveWeights()
        appendToLog({
            timestamp: new Date().toISOString(),
            result,
            direction,
            outcome,
            featureVector,
            prevWeights: [...weights],
            newWeights: [...weights],
            winRate,
            operationCount,
            phase: 'OBSERVATION'
        })
        return
    }

    // FASE DE APRENDIZAJE: Ajustar pesos con perceptron online
    const directionMultiplier = direction === 'call' ? 1 : -1

    const prevWeights = [...weights]
    for (let i = 0; i < NUM_WEIGHTS; i++) {
        weights[i] += LEARNING_RATE * outcome * directionMultiplier * featureVector[i]
    }

    // Normalizar para evitar divergencia
    weights = normalizeWeights(weights)

    // Guardar en archivo (persistencia)
    saveWeights()

    // Log de aprendizaje
    const winRate = (winCount / operationCount * 100).toFixed(1)
    console.log(`[LEARNER] ${result} registrado (APRENDIZAJE ACTIVO) | WinRate: ${winRate}% (${winCount}/${operationCount})`)
    console.log(`[LEARNER] Pesos actualizados:`, formatWeights(weights))

    // Guardar en log histórico (append)
    appendToLog({
        timestamp: new Date().toISOString(),
        result,
        direction,
        outcome,
        featureVector,
        prevWeights,
        newWeights: [...weights],
        winRate,
        operationCount,
        phase: 'LEARNING'
    })
}

/**
 * Agrega una entrada al log histórico de aprendizaje.
 */
function appendToLog(entry) {
    try {
        let log = []
        if (fs.existsSync(LOG_FILE)) {
            const raw = fs.readFileSync(LOG_FILE, 'utf8')
            try { log = JSON.parse(raw) } catch { log = [] }
        }
        log.push(entry)
        // Mantener solo los últimos 500 registros para no crecer indefinidamente
        if (log.length > 500) log = log.slice(-500)
        fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf8')
    } catch (err) {
        console.error('[LEARNER] ❌ Error escribiendo log:', err.message)
    }
}

/**
 * Retorna los pesos actuales.
 * @returns {number[]}
 */
function getWeights() {
    return [...weights]
}

/**
 * Retorna estadísticas del learner.
 */
function getStats() {
    return {
        operationCount,
        winCount,
        lossCount,
        winRate: operationCount > 0 ? (winCount / operationCount * 100).toFixed(1) + '%' : 'N/A',
        weights: [...weights],
        weightLabels: WEIGHT_LABELS
    }
}

module.exports = {
    loadWeights,
    recordResult,
    getWeights,
    getStats,
    formatWeights
}
