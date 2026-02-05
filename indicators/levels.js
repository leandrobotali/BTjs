const config = require('../config.js')

function getLevels(candles) {
    const levels = []

    // 1. Números Redondos (Psychological Levels)
    // Se calculan dinámicamente cerca del precio actual, pero aquí podemos definir la lógica de validación
    // La verificación se hace mejor en tiempo real contra el precio actual, 
    // pero podemos escanear el rango de precios de las últimas velas para marcar los relevantes.

    // 2. Soportes y Resistencias (Maximos y Minimos locales)
    // Analizamos las últimas 1120 velas (o un subconjunto relevante)
    const scanWindow = 60 // Mirar ventana local para S/R recientes

    for (let i = scanWindow; i < candles.length - scanWindow; i++) {
        const current = candles[i]
        const isHigh = candles.slice(i - 10, i + 10).every(c => c.max <= current.max)
        const isLow = candles.slice(i - 10, i + 10).every(c => c.min >= current.min)

        if (isHigh) levels.push({ price: current.max, type: 'RESISTANCE', source: 'LOCAL_MAX', candleId: current.id })
        if (isLow) levels.push({ price: current.min, type: 'SUPPORT', source: 'LOCAL_MIN', candleId: current.id })
    }

    // 3. Fibonacci (Opcional, basado en la última gran tendencia)
    // Simplificación: Tomar el max y min de las últimas 100 velas
    const recentCandles = candles.slice(-100)
    const highest = Math.max(...recentCandles.map(c => c.max))
    const lowest = Math.min(...recentCandles.map(c => c.min))
    const diff = highest - lowest

    levels.push({ price: lowest + diff * 0.5, type: 'FIBO_50', source: 'FIBONACCI' })
    levels.push({ price: lowest + diff * 0.618, type: 'FIBO_61.8', source: 'FIBONACCI' })

    return levels
}

function checkLevelProximity(price, levels) {
    // Verificar cercanía a niveles guardados
    const threshold = config.strategy.levels.proximity
    const nearbyLevel = levels.find(l => Math.abs(price - l.price) <= threshold)

    // Verificar números redondos dinámicamente
    // Asumimos precio con ~6 decimales. Multiplicamos para chequear terminación.
    // Ej: 1.181235 -> 1181235. Terminación 000 o 500.
    // Simplemente chequeamos el resto.
    // 1.234000 -> termina en 000. 
    // 1.234500 -> termina en 500.
    // Vamos a normalizar: (Price * 1000000) % 1000 == 0 o % 500 == 0?
    // Cuidado con floats. Mejor string parsing para decimales.

    let isRound = false
    const priceStr = price.toFixed(6)
    if (priceStr.endsWith('000') || priceStr.endsWith('500')) {
        isRound = true
    } else {
        // Chequear proximidad al número redondo más cercano
        // Redondear al 0.000500 más cercano
        const step = 0.0005
        const nearestRound = Math.round(price / step) * step
        if (Math.abs(price - nearestRound) <= threshold) {
            // Es un "round level" virtual
            isRound = true
            // Podemos devolverlo como nivel encontrado
            if (!nearbyLevel) {
                return { isAtLevel: true, level: { price: nearestRound, type: 'ROUND_NUMBER' } }
            }
        }
    }

    if (nearbyLevel) {
        return { isAtLevel: true, level: nearbyLevel }
    }

    if (isRound) {
        // Encontrar cual es
        const step = 0.0005
        const nearestRound = Math.round(price / step) * step
        return { isAtLevel: true, level: { price: nearestRound, type: 'ROUND_NUMBER' } }
    }

    return { isAtLevel: false, level: null }
}

module.exports = {
    getLevels,
    checkLevelProximity
}
