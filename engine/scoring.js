/**
 * scoring.js
 *
 * Motor de decisión direccional.
 * Calcula un score UP vs DOWN usando suma ponderada de features y interactions.
 * NO predice precio — evalúa qué dirección tiene MENOR resistencia estructural.
 *
 * Fórmula:
 *   Score_UP = w1*ED + w2*PS + w3*VR - w4*AFT + w5*FD + w6*PED + w7*EV + w8*SR_contribution
 *   Score_DOWN = -Score_UP
 *
 * Decisión:
 *   Si |Score_UP| > entry_threshold → operar hacia el mayor score
 *   Si no supera → NO TRADE (no hay asimetría clara)
 */

const ENTRY_THRESHOLD = 0.35   // Score mínimo para ejecutar una operación

/**
 * Calcula el score direccional UP usando los pesos actuales.
 * @param {Object} gf — gatedFeatures
 * @param {Object} gi — gatedInteractions
 * @param {number[]} weights — array de pesos [w1..w8]
 * @returns {number} Score_UP en [-1, +1]
 */
function computeScore(gf, gi, weights) {
    const [w1, w2, w3, w4, w5, w6, w7, w8] = weights

    // Aporte de SR: si SR_dir es +1 → señal alcista, modulada por la magnitud de SR
    const SR_contribution = gf.SR * gf.SR_dir

    const score = (
        w1 * gf.ED         // elasticidad a favor de UP
        + w2 * gf.PS         // presión sostenida hacia UP
        + w3 * gf.VR         // reversiones alcistas más fuertes
        - w4 * gf.AFT        // AFT > 0 → subir cuesta más → resta a UP
        + w5 * gf.FD         // fatiga del movimiento (+ = expansión, favorece dirección)
        + w6 * gi.PED        // presión efectiva combinada
        + w7 * gi.EV         // expansión válida
        + w8 * SR_contribution  // simetría rota (con dirección)
    )

    // Constrain a [-1, +1]
    return Math.max(-1, Math.min(1, score))
}

/**
 * Evalúa la decisión direccional a partir del score.
 * @param {Object} gf — gatedFeatures
 * @param {Object} gi — gatedInteractions
 * @param {string} regime — régimen detectado
 * @param {number[]} weights — pesos actuales
 * @returns {{ shouldOperate: boolean, direction: string|null, score: number, confidence: number }}
 */
function evaluateDecision(gf, gi, regime, weights) {
    const scoreUp = computeScore(gf, gi, weights)
    const scoreDown = -scoreUp
    const absScore = Math.abs(scoreUp)

    const direction = scoreUp > 0 ? 'call' : 'put'

    // El score absoluto representa cuánto más fácil es una dirección vs la otra
    if (absScore > ENTRY_THRESHOLD) {
        return {
            shouldOperate: true,
            direction,
            score: scoreUp,
            confidence: Math.round(absScore * 100),
            scoreUp,
            scoreDown
        }
    }

    return {
        shouldOperate: false,
        direction: null,
        score: scoreUp,
        confidence: Math.round(absScore * 100),
        scoreUp,
        scoreDown,
        reason: `Score insuficiente: |${scoreUp.toFixed(3)}| < umbral ${ENTRY_THRESHOLD}`
    }
}

module.exports = { computeScore, evaluateDecision, ENTRY_THRESHOLD }
