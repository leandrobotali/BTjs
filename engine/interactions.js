/**
 * interactions.js
 *
 * Cross-interactions no lineales entre features.
 * Una interacción captura patrones que ninguna feature puede detectar sola.
 * Si una de las features es débil (≈0), el producto cae automáticamente
 * (el sistema se auto-protege de señales parciales).
 *
 * Interacciones implementadas:
 *   PED = ED * PS   → Presión Efectiva Direccional
 *   EV  = CET * CI  → Expansión Válida (no ruido)
 *   AR  = FD * AFT  → Agotamiento Real
 *   BV  = IAL * VR  → Barrera Viva (para reversiones)
 */

/**
 * Calcula las 4 interacciones no lineales a partir del objeto de features.
 * @param {Object} features — resultado de computeFeatures()
 * @returns {Object} interactions
 */
function computeInteractions(features) {
    // PED: Presión Efectiva Direccional
    // Solo hay presión real si AMBAS (ED y PS) apuntan en la misma dirección y con fuerza.
    // Ej: ED=0.3, PS=0.6 → PED=0.18 (moderada)
    //     ED=0.3, PS=-0.2 → PED=-0.06 (señales contradictorias → casi cero)
    const PED = features.ED * features.PS

    // EV: Expansión Válida
    // Solo hay expansión real si el mercado está acelerado Y es coherente.
    // Si CI es bajo (ruido), EV cae a cero aunque CET sea alto.
    const EV = Math.max(features.CET, 0) * features.CI

    // AR: Agotamiento Real
    // Hay agotamiento real cuando el movimiento está fatigado (FD < 0)
    // Y además subir/bajar cuesta más tiempo (AFT indica fricción alta).
    // FD negativo + AFT positivo → fuerte señal de reversión.
    const AR = features.FD * features.AFT

    // BV: Barrera Viva
    // La barrera es relevante si hay absorción real (IAL alto)
    // y las reversiones son fuertes (VR alto).
    const BV = features.IAL * Math.abs(features.VR)

    return { PED, EV, AR, BV }
}

module.exports = { computeInteractions }
