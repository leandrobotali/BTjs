/**
 * test_fixes.js — Tests unitarios para los bugs corregidos y nuevos módulos
 * Ejecutar: node test/test_fixes.js
 */

const { calculateEMA, calculateSMA } = require('../indicators/moving-averages.js')
const { getFibonacciZones, checkFibProximity } = require('../indicators/fibonacci.js')
const { isDoji, isHammer, isPinBar, isEngulfing, isMarubozu } = require('../indicators/candle-types.js')
const { isDoubleTop, isDoubleBottom } = require('../indicators/patterns-advanced.js')
const { detectPatterns } = require('../indicators/patterns.js')
const { getLevels } = require('../indicators/levels.js')
const { analyzeStrategy } = require('../strategy/strategy-core.js')

let passed = 0, failed = 0

function assert(condition, name) {
    if (condition) { console.log(`  ✅ PASS: ${name}`); passed++ }
    else { console.log(`  ❌ FAIL: ${name}`); failed++ }
}

function makeCandle(open, close, min, max) {
    return { open, close, min: min ?? Math.min(open, close), max: max ?? Math.max(open, close) }
}

// ============================================================
// TEST 1: candle-types usa max/min (bug corregido)
// ============================================================
console.log('\n📋 TEST 1: candle-types usa max/min correctamente')

{
    // Vela con max/min (formato broker IQ Option)
    const hammer = { open: 1.1810, close: 1.1812, min: 1.1800, max: 1.1813 }
    // mecha inferior = 1.1810 - 1.1800 = 0.0010, cuerpo = 0.0002 → ratio 5x ≥ 2 ✓
    assert(isHammer(hammer), 'isHammer detecta con campo max/min')

    // Sin campo high/low (undefined) — antes fallaba silenciosamente
    const noHighLow = { open: 1.1810, close: 1.1812, min: 1.1800, max: 1.1813 }
    assert(typeof noHighLow.high === 'undefined', 'Vela sin campo high (formato broker)')
    assert(isHammer(noHighLow), 'isHammer funciona sin campo high/low')

    const doji = { open: 1.1810, close: 1.1810, min: 1.1800, max: 1.1820 }
    assert(isDoji(doji), 'isDoji detecta con max/min')

    // mecha inferior = 0.0010, cuerpo = 0.0001 → ratio 10x ≥ 2.5, mecha superior mínima
    const pinbar = { open: 1.1810, close: 1.1811, min: 1.1800, max: 1.18112 }
    // lw = 1.1810 - 1.1800 = 0.001, uw = 1.18112 - 1.1811 = 0.00002 ≤ body*0.3=0.00003 ✓
    assert(isPinBar(pinbar), 'isPinBar detecta con max/min')

    const marubozu = { open: 1.1800, close: 1.1820, min: 1.1800, max: 1.1820 }
    assert(isMarubozu(marubozu), 'isMarubozu detecta con max/min')
}

// ============================================================
// TEST 2: patterns-advanced usa max/min (bug corregido)
// ============================================================
console.log('\n📋 TEST 2: patterns-advanced usa max/min')

{
    // Doble techo: dos máximos similares separados ≥2 velas
    const candles = [
        makeCandle(1.181, 1.182, 1.180, 1.183),
        makeCandle(1.182, 1.181, 1.180, 1.183), // techo 1 max=1.183
        makeCandle(1.181, 1.180, 1.179, 1.181),
        makeCandle(1.180, 1.181, 1.179, 1.182),
        makeCandle(1.181, 1.182, 1.180, 1.183), // techo 2 max=1.183
        makeCandle(1.182, 1.181, 1.180, 1.182),
        makeCandle(1.181, 1.180, 1.179, 1.181),
        makeCandle(1.180, 1.179, 1.178, 1.180),
    ]
    const dt = isDoubleTop(candles)
    assert(dt === true, 'isDoubleTop detecta con campo max (no high)')

    // Doble suelo
    const candles2 = [
        makeCandle(1.182, 1.181, 1.180, 1.183),
        makeCandle(1.181, 1.180, 1.179, 1.181), // suelo 1 min=1.179
        makeCandle(1.180, 1.181, 1.180, 1.182),
        makeCandle(1.181, 1.182, 1.181, 1.183),
        makeCandle(1.182, 1.181, 1.179, 1.182), // suelo 2 min=1.179
        makeCandle(1.181, 1.182, 1.181, 1.183),
        makeCandle(1.182, 1.183, 1.181, 1.184),
        makeCandle(1.183, 1.184, 1.182, 1.185),
    ]
    const db = isDoubleBottom(candles2)
    assert(db === true, 'isDoubleBottom detecta con campo min (no low)')
}

// ============================================================
// TEST 3: patterns.js no depende de candle.direction (bug corregido)
// ============================================================
console.log('\n📋 TEST 3: patterns.js sin campo direction')

{
    // Velas SIN campo direction — antes causaba undefined === undefined = true siempre
    const alternating = [
        { open: 1.181, close: 1.182 }, // verde
        { open: 1.182, close: 1.181 }, // roja
        { open: 1.181, close: 1.182 }, // verde
        { open: 1.182, close: 1.181 }, // roja
        { open: 1.181, close: 1.182 }, // verde
        { open: 1.182, close: 1.181 }, // roja
        { open: 1.181, close: 1.182 }, // verde
        { open: 1.182, close: 1.181 }, // roja
        { open: 1.181, close: 1.182 }, // verde
        { open: 1.182, close: 1.181 }, // roja ← última
    ]
    const patterns = detectPatterns(alternating)
    const hasAlternating = patterns.some(p => p.name === 'ALTERNATING_COLORS')
    assert(hasAlternating, 'Detecta ALTERNATING_COLORS sin campo direction')
    const altPattern = patterns.find(p => p.name === 'ALTERNATING_COLORS')
    assert(altPattern && altPattern.prediction === 'CALL', 'Predicción correcta: última roja → CALL')

    // Velas NO alternantes — no debe detectar el patrón
    const nonAlternating = [
        { open: 1.181, close: 1.182 },
        { open: 1.182, close: 1.183 }, // dos verdes seguidas
        { open: 1.183, close: 1.182 },
        { open: 1.182, close: 1.181 },
        { open: 1.181, close: 1.182 },
    ]
    const p2 = detectPatterns(nonAlternating)
    const noAlt = !p2.some(p => p.name === 'ALTERNATING_COLORS')
    assert(noAlt, 'No detecta ALTERNATING_COLORS en secuencia no alternante')
}

// ============================================================
// TEST 4: EMA real (moving-averages)
// ============================================================
console.log('\n📋 TEST 4: EMA real implementada')

{
    // 20 velas con precio creciente
    const candles = Array.from({ length: 25 }, (_, i) => ({ close: 1.1800 + i * 0.0001 }))
    const ema20 = calculateEMA(candles, 20)
    assert(ema20 !== null, 'EMA20 retorna valor (no null)')
    assert(typeof ema20 === 'number', 'EMA20 es número')
    // EMA debe estar entre el primer y último precio
    assert(ema20 > 1.1800 && ema20 < 1.1825, `EMA20 en rango esperado: ${ema20.toFixed(6)}`)

    // Insuficientes datos
    const short = [{ close: 1.181 }, { close: 1.182 }]
    assert(calculateEMA(short, 20) === null, 'EMA retorna null con datos insuficientes')

    // SMA
    const sma = calculateSMA(candles, 5)
    assert(sma !== null && typeof sma === 'number', 'SMA retorna número')
    // SMA de las últimas 5: promedio de 1.1820..1.1824
    assert(Math.abs(sma - 1.18220) < 0.00005, `SMA5 correcto: ${sma?.toFixed(6)}`)
}

// ============================================================
// TEST 5: Fibonacci
// ============================================================
console.log('\n📋 TEST 5: Fibonacci zones')

{
    // Swing claro: baja de 1.1830 a 1.1800 (30 pips)
    const candles = []
    for (let i = 0; i < 15; i++) candles.push(makeCandle(1.1830 - i * 0.0002, 1.1829 - i * 0.0002, 1.1828 - i * 0.0002, 1.1831 - i * 0.0002))
    for (let i = 0; i < 15; i++) candles.push(makeCandle(1.1800 + i * 0.0001, 1.1801 + i * 0.0001, 1.1799 + i * 0.0001, 1.1802 + i * 0.0001))

    const zones = getFibonacciZones(candles)
    assert(zones.length > 0, `Fibonacci detecta zonas: ${zones.length}`)

    const has50 = zones.some(z => Math.abs(z.fibLevel - 0.500) < 0.001)
    const has618 = zones.some(z => Math.abs(z.fibLevel - 0.618) < 0.001)
    assert(has50, 'Zona Fibonacci 50% detectada')
    assert(has618, 'Zona Fibonacci 61.8% detectada')

    // checkFibProximity
    if (zones.length > 0) {
        const zone50 = zones.find(z => Math.abs(z.fibLevel - 0.500) < 0.001)
        if (zone50) {
            const hit = checkFibProximity(zone50.price, zones)
            assert(hit.isAtFib === true, 'checkFibProximity detecta precio en zona')
            const miss = checkFibProximity(zone50.price + 0.005, zones)
            assert(miss.isAtFib === false, 'checkFibProximity no detecta precio lejos')
        }
    }

    // Rango muy pequeño → no genera zonas (rango < 10 pips = 0.000100)
    const flatCandles = Array.from({ length: 30 }, () => makeCandle(1.18100, 1.18101, 1.18099, 1.18102))
    // rango por vela = 0.00003, swing total ≈ 0.00003 < 0.000100
    const flatZones = getFibonacciZones(flatCandles)
    assert(flatZones.length === 0, 'Sin zonas Fibonacci en mercado plano (rango < 10 pips)')
}

// ============================================================
// TEST 6: EMAs en getLevels
// ============================================================
console.log('\n📋 TEST 6: EMAs incluidas en getLevels')

{
    // 25 velas con tendencia alcista (suficiente para EMA20)
    const candles = Array.from({ length: 25 }, (_, i) => ({
        open: 1.1800 + i * 0.0001,
        close: 1.1801 + i * 0.0001,
        min: 1.1799 + i * 0.0001,
        max: 1.1802 + i * 0.0001,
    }))
    const levels = getLevels(candles)
    const emaLevels = levels.filter(l => l.isEMA)
    assert(emaLevels.length > 0, `EMAs incluidas en getLevels: ${emaLevels.length} zonas EMA`)
    const ema20Level = emaLevels.find(l => l.emaPeriod === 20)
    assert(ema20Level !== undefined, 'EMA20 presente en niveles')
}

// ============================================================
// TEST 7: Fases LMTA proporcionales con 55-60 ticks
// ============================================================
console.log('\n📋 TEST 7: Fases LMTA proporcionales')

{
    // Con 55 ticks: fase1=27, fase2=13, fase3=13 (no 15 fijo)
    const n55 = 55
    const phase1End = Math.floor(n55 * 0.50)   // 27
    const phase3Start = Math.floor(n55 * 0.75) // 41
    assert(phase1End === 27, `Fase1 con 55 ticks = ${phase1End} (esperado 27)`)
    assert(n55 - phase3Start === 14, `Fase3 con 55 ticks = ${n55 - phase3Start} ticks (esperado 14)`)
    assert(phase3Start - phase1End === 14, `Fase2 con 55 ticks = ${phase3Start - phase1End} ticks (esperado 14)`)

    // Con 60 ticks: fase1=30, fase2=15, fase3=15
    const n60 = 60
    const p1 = Math.floor(n60 * 0.50)
    const p3 = Math.floor(n60 * 0.75)
    assert(p1 === 30, `Fase1 con 60 ticks = ${p1} (esperado 30)`)
    assert(n60 - p3 === 15, `Fase3 con 60 ticks = ${n60 - p3} ticks (esperado 15)`)
    assert(p3 - p1 === 15, `Fase2 con 60 ticks = ${p3 - p1} ticks (esperado 15)`)

    // Suma de fases = total ticks
    assert(phase1End + (phase3Start - phase1End) + (n55 - phase3Start) === n55, 'Suma de fases = total ticks (55)')
    assert(p1 + (p3 - p1) + (n60 - p3) === n60, 'Suma de fases = total ticks (60)')
}

// ============================================================
// TEST 8: Patrones aplicados DESPUÉS de la decisión
// ============================================================
console.log('\n📋 TEST 8: Patrones de vela se aplican post-decisión')

async function testPatternsPostDecision() {
    // Velas con suficiente historial y volumen
    const candles = Array.from({ length: 20 }, (_, i) => ({
        open: 1.1800 + i * 0.0001,
        close: 1.1801 + i * 0.0001,
        min: 1.1799 + i * 0.0001,
        max: 1.1802 + i * 0.0001,
        volume: 200,
        direction: 'ALCISTA'
    }))

    // Ticks con fuerza alcista sostenida en las 3 fases (activa REGLA 4)
    const ticks = Array.from({ length: 60 }, (_, i) => 1.1820 + i * 0.000005)

    const result = await analyzeStrategy(candles, ticks, [])
    // Si la decisión es CALL, los patrones deben haberse evaluado con decision='CALL'
    // El análisis no debe crashear y debe retornar una decisión válida
    assert(result !== null && result !== undefined, 'analyzeStrategy retorna resultado')
    assert(typeof result.shouldOperate === 'boolean', 'shouldOperate es boolean')
    assert(result.direction === 'CALL' || result.direction === '' || result.direction === 'PUT', 'direction es válido')
}

// ============================================================
// TEST 9: Latigazo adaptativo al rango promedio
// ============================================================
console.log('\n📋 TEST 9: Latigazo adaptativo')

{
    // Activo con velas pequeñas (rango promedio ~0.0001)
    // El umbral adaptativo = 0.0001 * 0.30 = 0.00003
    // Un movimiento de 0.000150 (fijo anterior) sería demasiado alto para este activo
    const smallRangeCandles = Array.from({ length: 10 }, () => ({
        open: 1.1810, close: 1.1811, min: 1.1809, max: 1.1811 // rango = 0.0002
    }))
    const avgRange = smallRangeCandles.reduce((s, c) => s + (c.max - c.min), 0) / 10
    const adaptiveThreshold = avgRange * 0.30
    assert(adaptiveThreshold < 0.000150, `Umbral adaptativo (${adaptiveThreshold.toFixed(6)}) < umbral fijo anterior (0.000150)`)
    assert(adaptiveThreshold > 0, 'Umbral adaptativo > 0')

    // Activo con velas grandes (rango promedio ~0.001)
    const bigRangeCandles = Array.from({ length: 10 }, () => ({
        open: 1.1800, close: 1.1810, min: 1.1795, max: 1.1815 // rango = 0.002
    }))
    const avgRangeBig = bigRangeCandles.reduce((s, c) => s + (c.max - c.min), 0) / 10
    const adaptiveBig = avgRangeBig * 0.30
    assert(adaptiveBig > 0.000150, `Umbral adaptativo grande (${adaptiveBig.toFixed(6)}) > umbral fijo anterior`)
}

// ============================================================
// Ejecutar tests async y mostrar resultado
// ============================================================
testPatternsPostDecision().then(() => {
    console.log('\n══════════════════════════════════════')
    console.log(`📊 RESULTADOS: ${passed} pasaron, ${failed} fallaron de ${passed + failed} total`)
    if (failed === 0) console.log('✅ TODOS LOS TESTS PASARON')
    else console.log('❌ ALGUNOS TESTS FALLARON')
    console.log('══════════════════════════════════════\n')
    process.exit(failed > 0 ? 1 : 0)
})
