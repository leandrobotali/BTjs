
function detectPatterns(candles) {
    const patterns = []
    const recent = candles.slice(-10) // Analizar ultimas 10 velas

    if (recent.length < 5) return patterns

    // 1. Pattern Killer "Uno gira" (Verde, Rojo, Verde, Rojo...)
    let isAlternating = true
    for (let i = recent.length - 1; i > recent.length - 5; i--) {
        if (recent[i].direction === recent[i - 1].direction) {
            isAlternating = false
            break
        }
    }

    if (isAlternating) {
        const lastCandle = recent[recent.length - 1]
        // Si la ultima fue ROJA, la prediccion del patron es VERDE
        const prediction = lastCandle.direction === 'BAJISTA' ? 'CALL' : 'PUT'
        patterns.push({ name: 'ALTERNATING_COLORS', prediction, confidence: 0.8 })
    }

    // 2. ConteoSimple (3 velas mismo color -> Gira la 4ta?)
    // A veces es continuidad. Depende de la estrategia. 
    // INFO_ESTRATEGIA dice "3 rojas - 1 gira" como ejemplo.

    const lastDir = recent[recent.length - 1].direction
    let count = 0
    for (let i = recent.length - 1; i >= 0; i--) {
        if (recent[i].direction === lastDir) count++
        else break
    }

    if (count >= 3) {
        // Ejemplo de patrón de agotamiento tras 3 velas
        const prediction = lastDir === 'BAJISTA' ? 'CALL' : 'PUT'
        patterns.push({ name: '3_CANDLES_REVERSAL', prediction, confidence: 0.6 })
    }

    return patterns
}

module.exports = {
    detectPatterns
}
