const { analyzeStrategy } = require('../strategy/strategy-core.js')

// Mock de velas
const mockCandles = [
    {
        id: 769854,
        from: 1770147780,
        to: 1770147840,
        open: 1.18145,
        close: 1.181395,
        min: 1.18134,
        max: 1.18152,
        volume: 232,
        direction: 'BAJISTA'
    },
    {
        id: 769855,
        from: 1770147840,
        to: 1770147900,
        open: 1.1814,
        close: 1.18139,
        min: 1.18137,
        max: 1.18144,
        volume: 215,
        direction: 'BAJISTA'
    },
    {
        id: 769856,
        from: 1770147900,
        to: 1770147960,
        open: 1.181385,
        close: 1.181305,
        min: 1.181305,
        max: 1.181425,
        volume: 185,
        direction: 'BAJISTA'
    }
]

// Generador de Ticks Sintéticos
function generateTicks(pattern) {
    let ticks = []
    let currentPrice = 1.18130 // Start price

    if (pattern === 'WHIPLASH_REVERSAL') {
        // 45 ticks estancados/lentos bajistas
        for (let i = 0; i < 45; i++) {
            currentPrice += (Math.random() - 0.5) * 0.00001 // Ruido
            ticks.push(currentPrice)
        }
        // 15 ticks latigazo alcista fuerte hacia numero redondo
        // Objetivo: 1.181500 (termina en 500)
        for (let i = 0; i < 15; i++) {
            currentPrice += 0.000015 // Subida rápida
            ticks.push(currentPrice)
        }
    } else if (pattern === 'NATURAL_TREND') {
        // 60 ticks subida constante
        for (let i = 0; i < 60; i++) {
            currentPrice += 0.000005 + (Math.random() * 0.000002) // Subida constante
            ticks.push(currentPrice)
        }
    }

    return ticks
}

async function runTest() {
    console.log('--- TEST 1: LATIGAZO DE DESESPERACIÓN ---')
    const ticks1 = generateTicks('WHIPLASH_REVERSAL')
    const result1 = await analyzeStrategy(mockCandles, ticks1)
    console.log(result1.analysis)
    console.log('RESULTADO:', result1.direction, result1.reason)

    console.log('\n\n--- TEST 2: TENDENCIA NATURAL ---')
    const ticks2 = generateTicks('NATURAL_TREND')
    const result2 = await analyzeStrategy(mockCandles, ticks2)
    console.log(result2.analysis)
    console.log('RESULTADO:', result2.direction, result2.reason)
}

runTest()
