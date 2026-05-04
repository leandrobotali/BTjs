/**
 * gating.js
 *
 * Sistema de gating: apaga features que "mienten" en ciertos contextos.
 * No pondera hacia abajo → las apaga completamente (→ 0).
 *
 * Reglas de gate (condiciones + qué features se apagan):
 *   Gate 1 — CI bajo: si el mercado es incoherente, las features direccionales mienten
 *   Gate 2 — CET bajo: si no hay actividad, no tiene sentido analizar fatiga ni presión
 *   Gate 3 — IAL bajo: no hay barrera viva, BV no es válida
 *
 * Retorna una copia de features con los campos apagados en 0.
 */

const CONFIG = {
    CI_min: 0.25,    // Coherencia mínima para confiar en features direccionales
    CET_min: 0.10,   // Actividad mínima para confiar en fatiga y presión
    IAL_min: 0.20,   // Absorción mínima para confiar en barrera viva
}

/**
 * Aplica el sistema de gating al objeto de features+interactions.
 * @param {Object} features — resultado de computeFeatures()
 * @param {Object} interactions — resultado de computeInteractions()
 * @returns {{ gatedFeatures, gatedInteractions, gates: string[] }}
 */
function applyGating(features, interactions) {
    const gf = { ...features }
    const gi = { ...interactions }
    const activeGates = []

    // GATE 1 — Coherencia mínima
    // Sin coherencia, las features direccionales son ruido disfrazado de señal.
    if (features.CI < CONFIG.CI_min) {
        activeGates.push('LOW_CI')
        gf.ED = 0
        gf.PS = 0
        gf.VR = 0
        gf.AFT = 0
        gi.PED = 0
        gi.BV = 0
    }

    // GATE 2 — Actividad mínima
    // Sin movimiento real, fatiga y presión no tienen base para calcularse.
    if (features.CET < CONFIG.CET_min) {
        activeGates.push('LOW_CET')
        gf.FD = 0
        gi.EV = 0
        gi.PED = 0
    }

    // GATE 3 — Absorción local mínima
    // Si no hay barrera viva, BV no aporta información útil.
    if (features.IAL < CONFIG.IAL_min) {
        activeGates.push('NO_BARRIER')
        gi.BV = 0
    }

    return { gatedFeatures: gf, gatedInteractions: gi, activeGates }
}

module.exports = { applyGating, CONFIG }
