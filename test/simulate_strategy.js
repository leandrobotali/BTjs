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

// Caso: Doble Techo
function generateDoubleTopTicks() {
    let ticks = [];
    let base = 1.18130;
    // Subida hasta techo
    for (let i = 0; i < 20; i++) ticks.push(base += 0.00001);
    // Baja
    for (let i = 0; i < 10; i++) ticks.push(base -= 0.00001);
    // Segunda subida igual
    for (let i = 0; i < 20; i++) ticks.push(base += 0.00001);
    // Baja final
    for (let i = 0; i < 10; i++) ticks.push(base -= 0.00001);
    return ticks;
}

// Caso: Doble Suelo
function generateDoubleBottomTicks() {
    let ticks = [];
    let base = 1.18150;
    // Baja hasta suelo
    for (let i = 0; i < 20; i++) ticks.push(base -= 0.00001);
    // Sube
    for (let i = 0; i < 10; i++) ticks.push(base += 0.00001);
    // Segunda baja igual
    for (let i = 0; i < 20; i++) ticks.push(base -= 0.00001);
    // Sube final
    for (let i = 0; i < 10; i++) ticks.push(base += 0.00001);
    return ticks;
}

// Caso: Secuencia larga alcista
function generateLongBullishSeqTicks() {
    let ticks = [];
    let base = 1.18100;
    for (let i = 0; i < 60; i++) ticks.push(base += 0.00001);
    return ticks;
}

// Caso: Doji
function generateDojiTicks() {
    let ticks = [];
    let base = 1.18100;
    for (let i = 0; i < 30; i++) ticks.push(base += 0.00001);
    for (let i = 0; i < 30; i++) ticks.push(base -= 0.00001);
    return ticks;
}


// Nuevo: Mercado peligroso (volatilidad extrema)
function generateExtremeVolatilityTicks() {
    let ticks = [];
    let base = 1.18100;
    for (let i = 0; i < 20; i++) ticks.push(base += (Math.random() - 0.5) * 0.0002);
    for (let i = 0; i < 20; i++) ticks.push(base += (Math.random() - 0.5) * 0.0003);
    for (let i = 0; i < 20; i++) ticks.push(base += (Math.random() - 0.5) * 0.0004);
    return ticks;
}

// Nuevo: Latigazo bajista de desesperación contra soporte
function generateWhiplashBearReversalTicks() {
    let ticks = [];
    let currentPrice = 1.18160;
    for (let i = 0; i < 45; i++) {
        currentPrice -= (Math.random() * 0.00001);
        ticks.push(currentPrice);
    }
    for (let i = 0; i < 15; i++) {
        currentPrice -= 0.000015;
        ticks.push(currentPrice);
    }
    return ticks;
}

// Nuevo: Secuencia larga bajista
function generateLongBearishSeqTicks() {
    let ticks = [];
    let base = 1.18160;
    for (let i = 0; i < 60; i++) ticks.push(base -= 0.00001);
    return ticks;
}

// Nuevo: Engulfing alcista y bajista (simulación simple)
function generateEngulfingBullTicks() {
    let ticks = [];
    let base = 1.18100;
    for (let i = 0; i < 20; i++) ticks.push(base += 0.00001);
    for (let i = 0; i < 20; i++) ticks.push(base += 0.00002);
    for (let i = 0; i < 20; i++) ticks.push(base += 0.00003);
    return ticks;
}
function generateEngulfingBearTicks() {
    let ticks = [];
    let base = 1.18160;
    for (let i = 0; i < 20; i++) ticks.push(base -= 0.00001);
    for (let i = 0; i < 20; i++) ticks.push(base -= 0.00002);
    for (let i = 0; i < 20; i++) ticks.push(base -= 0.00003);
    return ticks;
}

// Nuevo: Cambio de tendencia abrupto
function generateAbruptTrendChangeTicks() {
    let ticks = [];
    let base = 1.18100;
    for (let i = 0; i < 30; i++) ticks.push(base += 0.00001);
    for (let i = 0; i < 30; i++) ticks.push(base -= 0.00002);
    return ticks;
}

// Nuevo: Estancamiento prolongado
function generateStagnationTicks() {
    let ticks = [];
    let base = 1.18100;
    for (let i = 0; i < 60; i++) ticks.push(base += (Math.random() - 0.5) * 0.000001);
    return ticks;
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

    console.log('\n\n--- TEST 3: DOBLE TECHO ---')
    const ticks3 = generateDoubleTopTicks()
    const result3 = await analyzeStrategy(mockCandles, ticks3)
    console.log(result3.analysis)
    console.log('RESULTADO:', result3.direction, result3.reason)

    console.log('\n\n--- TEST 4: DOBLE SUELO ---')
    const ticks4 = generateDoubleBottomTicks()
    const result4 = await analyzeStrategy(mockCandles, ticks4)
    console.log(result4.analysis)
    console.log('RESULTADO:', result4.direction, result4.reason)

    console.log('\n\n--- TEST 5: SECUENCIA LARGA ALCISTA ---')
    const ticks5 = generateLongBullishSeqTicks()
    const result5 = await analyzeStrategy(mockCandles, ticks5)
    console.log(result5.analysis)
    console.log('RESULTADO:', result5.direction, result5.reason)

    console.log('\n\n--- TEST 6: DOJI ---')
    const ticks6 = generateDojiTicks()
    const result6 = await analyzeStrategy(mockCandles, ticks6)
    console.log(result6.analysis)
    console.log('RESULTADO:', result6.direction, result6.reason)

    // Nuevos casos
    console.log('\n\n--- TEST 7: MERCADO PELIGROSO (VOLATILIDAD EXTREMA) ---')
    const ticks7 = generateExtremeVolatilityTicks()
    const result7 = await analyzeStrategy(mockCandles, ticks7)
    console.log(result7.analysis)
    console.log('RESULTADO:', result7.direction, result7.reason)

    console.log('\n\n--- TEST 8: LATIGAZO BAJISTA DE DESESPERACIÓN ---')
    const ticks8 = generateWhiplashBearReversalTicks()
    const result8 = await analyzeStrategy(mockCandles, ticks8)
    console.log(result8.analysis)
    console.log('RESULTADO:', result8.direction, result8.reason)

    console.log('\n\n--- TEST 9: SECUENCIA LARGA BAJISTA ---')
    const ticks9 = generateLongBearishSeqTicks()
    const result9 = await analyzeStrategy(mockCandles, ticks9)
    console.log(result9.analysis)
    console.log('RESULTADO:', result9.direction, result9.reason)

    console.log('\n\n--- TEST 10: ENGULFING ALCISTA ---')
    const ticks10 = generateEngulfingBullTicks()
    const result10 = await analyzeStrategy(mockCandles, ticks10)
    console.log(result10.analysis)
    console.log('RESULTADO:', result10.direction, result10.reason)

    console.log('\n\n--- TEST 11: ENGULFING BAJISTA ---')
    const ticks11 = generateEngulfingBearTicks()
    const result11 = await analyzeStrategy(mockCandles, ticks11)
    console.log(result11.analysis)
    console.log('RESULTADO:', result11.direction, result11.reason)

    console.log('\n\n--- TEST 12: CAMBIO ABRUPTO DE TENDENCIA ---')
    const ticks12 = generateAbruptTrendChangeTicks()
    const result12 = await analyzeStrategy(mockCandles, ticks12)
    console.log(result12.analysis)
    console.log('RESULTADO:', result12.direction, result12.reason)

        // Nuevo: Test de volumen bajo
        function generateLowVolumeCandles() {
            // 10 velas con volumen bajo
            let candles = [];
            let base = 1.18100;
            for (let i = 0; i < 10; i++) {
                candles.push({
                    id: 1000 + i,
                    from: 1770147000 + i * 60,
                    to: 1770147000 + (i + 1) * 60,
                    open: base,
                    close: base += 0.00001,
                    min: base - 0.00002,
                    max: base + 0.00002,
                    volume: 20, // volumen bajo
                    direction: 'ALCISTA'
                });
            }
            return candles;
        }
    console.log('\n\n--- TEST 13: ESTANCAMIENTO PROLONGADO ---')
        // Test de volumen bajo
        console.log('\n\n--- TEST 14: VOLUMEN BAJO ---')
        const lowVolCandles = generateLowVolumeCandles();
        const ticks14 = generateLongBullishSeqTicks();
        const result14 = await analyzeStrategy(lowVolCandles, ticks14);
        console.log(result14.analysis);
        console.log('RESULTADO:', result14.direction, result14.reason);
    const ticks13 = generateStagnationTicks()
    const result13 = await analyzeStrategy(mockCandles, ticks13)
    console.log(result13.analysis)
    console.log('RESULTADO:', result13.direction, result13.reason)
}

runTest()
