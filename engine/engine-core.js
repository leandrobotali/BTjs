const { computeFeatures } = require('./features.js')
const { computeInteractions } = require('./interactions.js')
const { applyGating } = require('./gating.js')
const { detectRegime, isTradeableRegime } = require('./regime.js')
const { evaluateDecision } = require('./scoring.js')
const { getWeights, recordResult, getStats, loadWeights } = require('./learner.js')

/**
 * engine-core.js
 *
 * Orquesta todos los pasos del motor de micro-dinámica.
 */

function getHumanReadableReason(regime, score) {
    if (regime === 'NOISE') return "Mercado ruidoso/sucio: demasiadas sombras y poca dirección clara.";
    if (regime === 'WAIT') return "Mercado estancado/comprimido: perdió velocidad y está muy lento.";
    if (regime === 'EXHAUSTION') return "Fuerza agotada: el precio intentó moverse pero muestra fatiga o absorción.";
    if (regime === 'INDECISION') return "Indecisión del mercado: no hay inercia fuerte ni ruido rotundo, precio divagando. Se ignora por precaución.";
    if (regime === 'ACTIVE') {
        if (Math.abs(score) < 0.35) return "Tendencia detectada pero la inercia/rebote no es lo suficientemente fuerte para arriesgar capital.";
        return "Estructura perfecta: alta inercia direccional con espacio seguro detectado.";
    }
    return "Evaluando...";
}

function analyzeCurrentTicks(ticks) {
    // 1. Calcular features
    const features = computeFeatures(ticks)
    if (!features.valid) {
        return {
            shouldOperate: false,
            direction: null,
            regime: 'NOISE',
            score: 0,
            reason: features.reason,
            featureSnapshot: null
        }
    }

    // 2. Calcular interacciones
    const interactions = computeInteractions(features)

    // 3. Aplicar gating
    const { gatedFeatures, gatedInteractions, activeGates } = applyGating(features, interactions)

    // 4. Detectar régimen
    const { regime, reason: regimeReason } = detectRegime(gatedFeatures, gatedInteractions)

    // 5. Evaluar si se debe operar y en qué dirección
    let decision = { shouldOperate: false, direction: null, score: 0, reason: regimeReason }
    const weights = getWeights()

    if (isTradeableRegime(regime)) {
        decision = evaluateDecision(gatedFeatures, gatedInteractions, regime, weights)
    } else {
        decision.reason = 'Sistema inoperable: ' + regime + ' | Detalles: ' + regimeReason
    }

    // El snapshot es fundamental para el learner
    const featureSnapshot = { ...gatedFeatures, ...gatedInteractions }

    const humanReason = getHumanReadableReason(regime, decision.score)

    return {
        shouldOperate: decision.shouldOperate,
        direction: decision.direction,
        regime,
        score: decision.score,
        reason: decision.reason || regimeReason,
        humanReason,
        featureSnapshot
    }
}

module.exports = {
    analyzeCurrentTicks,
    recordResult,
    loadWeights,
    getStats
}
