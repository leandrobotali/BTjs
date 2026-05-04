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
    // Filtro de VOL: garantiza que no sea un 'mercado muerto' moviendo 1 decimal.
    const isActiveVol = gatedFeatures.VOL > 0.00002; // Al menos 0.2 pips de movimiento promedio por tick

    if (CI >= 0.45 && Math.abs(CET) >= 0.20 && Math.abs(PED) >= 0.09 && isActiveVol) {
        return {
            regime: REGIMES.ACTIVE,
            reason: `CI=${CI.toFixed(3)}, CET=${CET.toFixed(3)}, PED=${PED.toFixed(3)}, VOL=${gatedFeatures.VOL.toFixed(6)}`
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
