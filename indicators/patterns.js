
function detectPatterns(candles) {
    const patterns = []
    const recent = candles.slice(-10)

    if (recent.length < 5) return patterns

    // Helper: color de vela sin depender del campo 'direction'
    const isGreen = c => c.close > c.open
    const isRed = c => c.close < c.open

    // 1. Pattern Killer "Uno gira" (Verde, Rojo, Verde, Rojo...)
    let isAlternating = true
    for (let i = recent.length - 1; i > recent.length - 5; i--) {
        const currGreen = isGreen(recent[i])
        const prevGreen = isGreen(recent[i - 1])
        if (currGreen === prevGreen) {
            isAlternating = false
            break
        }
    }

    if (isAlternating) {
        const lastCandle = recent[recent.length - 1]
        const prediction = isRed(lastCandle) ? 'CALL' : 'PUT'
        patterns.push({ name: 'ALTERNATING_COLORS', prediction, confidence: 0.8 })
    }

    // 2. Conteo simple (3 velas mismo color -> posible giro)
    const lastIsGreen = isGreen(recent[recent.length - 1])
    let count = 0
    for (let i = recent.length - 1; i >= 0; i--) {
        if (isGreen(recent[i]) === lastIsGreen && !(!isGreen(recent[i]) && !isRed(recent[i]))) count++
        else break
    }

    if (count >= 3) {
        const prediction = !lastIsGreen ? 'CALL' : 'PUT'
        patterns.push({ name: '3_CANDLES_REVERSAL', prediction, confidence: 0.6 })
    }

    return patterns
}

module.exports = {
    detectPatterns
}
