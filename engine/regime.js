/**
 * regime.js
 *
 * Detector de régimen de mercado.
 * Un régimen es el "modo operativo" actual del precio.
 * Cada régimen requiere lógica distinta: ninguna feature funciona igual en todos.
 *
 * Regímenes:
 *   NOISE      → CI bajo + CET bajo. Mercado ilegible. NO TRADE obligatorio.
 *   WAIT       → CI alto + CET plano. Mercado comprimido, posible escape inminente.
 *   ACTIVE     → CI alto + CET alto + PED fuerte. Mercado en movimiento estructurado.
 *   EXHAUSTION → FD negativo + AFT alto. Movimiento previo agotado, posible reversión.
 *   UNDEFINED  → No encaja en ningún patrón. NO TRADE por precaución.
 */

const REGIMES = {
    NOISE: 'NOISE',
    WAIT: 'WAIT',
    ACTIVE: 'ACTIVE',
    EXHAUSTION: 'EXHAUSTION',
    INDECISION: 'INDECISION'
}

/**
 * Detecta el régimen actual del mercado.
 * @param {Object} gatedFeatures — resultado de applyGating().gatedFeatures
 * @param {Object} gatedInteractions — resultado de applyGating().gatedInteractions
 * @returns {{ regime: string, reason: string }}
 */
function detectRegime(gatedFeatures, gatedInteractions) {
    const { CI, CET, FD, AFT } = gatedFeatures
    const { PED } = gatedInteractions

    // NOISE: Sin coherencia y sin actividad → todo es ruido
    if (CI < 0.25 && Math.abs(CET) < 0.10) {
        return {
            regime: REGIMES.NOISE,
            reason: `CI=${CI.toFixed(3)} < 0.25 y CET=${CET.toFixed(3)} ≈ 0`
        }
    }

    // EXHAUSTION: Movimiento agotado → posible reversión inminente
    // FD negativo fuerte + AFT indica que la dirección actual cuesta cada vez más
    if (FD < -0.25 && AFT > 0.20) {
        return {
            regime: REGIMES.EXHAUSTION,
            reason: `FD=${FD.toFixed(3)} (agotamiento) y AFT=${AFT.toFixed(3)} (fricción alta)`
        }
    }

    // ACTIVE: Mercado estructurado en movimiento
    // Coherencia estable + aceleración + presión efectiva clara
    // DINÁMICO: El rango debe ser suficiente para no ser mercado muerto (umbral ~0.4 pips relativo)
    const minRangeNeeded = 0.00004; // Umbral dinámico base para 100 ticks
    const isDynamicVolActive = (gatedFeatures.RANGE || 0) > minRangeNeeded;

    // CET = ACELERACIÓN (Temporal o Geométrica)
    // PED = INERCIA / PRESIÓN (Elasticidad * Persistencia)
    if (CI >= 0.40 && Math.abs(CET) >= 0.09 && Math.abs(PED) >= 0.07 && isDynamicVolActive) {
        return {
            regime: REGIMES.ACTIVE,
            reason: `CI=${CI.toFixed(3)}, ACEL(CET)=${CET.toFixed(3)}, INERCIA(PED)=${PED.toFixed(3)}, RANGE=${(gatedFeatures.RANGE * 10000).toFixed(4)}`
        }
    }

    // WAIT: Alta coherencia pero sin movimiento aún
    // Señal de compresión: algo se viene, esperar confirmación
    if (CI >= 0.48 && Math.abs(CET) < 0.10) {
        return {
            regime: REGIMES.WAIT,
            reason: `CI=${CI.toFixed(3)} alto pero CET=${CET.toFixed(3)} plano → compresión`
        }
    }

    // Si no encaja en ningún patrón claro
    return {
        regime: REGIMES.INDECISION,
        reason: `Patrón mixto: CI=${CI.toFixed(3)}, CET=${CET.toFixed(3)}, PED=${PED.toFixed(3)}`
    }
}

/**
 * Retorna true si el régimen permite intentar una operación.
 * Solo ACTIVE y EXHAUSTION son operables.
 * @param {string} regime
 * @returns {boolean}
 */
function isTradeableRegime(regime) {
    return regime === REGIMES.ACTIVE || regime === REGIMES.EXHAUSTION
}

module.exports = { detectRegime, isTradeableRegime, REGIMES }
