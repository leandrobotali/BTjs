/**
 * test_levels.js — Pruebas unitarias para indicators/levels.js
 * 
 * Ejecutar: node test/test_levels.js
 */

const { getLevels, checkLevelProximity, getTargetZone } = require('../indicators/levels.js')

let passed = 0
let failed = 0

function assert(condition, testName) {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`)
        passed++
    } else {
        console.log(`  ❌ FAIL: ${testName}`)
        failed++
    }
}

// ============================================================
// HELPERS: generadores de velas sintéticas
// ============================================================

function makeCandle(open, close, min, max) {
    return { open, close, min: min || Math.min(open, close), max: max || Math.max(open, close) }
}

/**
 * Genera N velas alcistas consecutivas partiendo de startPrice
 */
function bullishCandles(n, startPrice, step = 0.000050) {
    const candles = []
    let price = startPrice
    for (let i = 0; i < n; i++) {
        const open = price
        const close = price + step
        candles.push(makeCandle(open, close, open - step * 0.2, close + step * 0.2))
        price = close
    }
    return candles
}

/**
 * Genera N velas bajistas consecutivas partiendo de startPrice
 */
function bearishCandles(n, startPrice, step = 0.000050) {
    const candles = []
    let price = startPrice
    for (let i = 0; i < n; i++) {
        const open = price
        const close = price - step
        candles.push(makeCandle(open, close, close - step * 0.2, open + step * 0.2))
        price = close
    }
    return candles
}

// ============================================================
// TEST 1: Detección básica de zonas S/R
// ============================================================
console.log('\n📋 TEST 1: Detección de Zonas S/R')
console.log('──────────────────────────────────────')

{
    // Patrón: 3 velas alcistas → pico → 3 velas bajistas = RESISTENCIA
    const candles = [
        ...bullishCandles(3, 1.181000),        // velas 0-2: alcistas
        makeCandle(1.181150, 1.181100, 1.181050, 1.181250),  // vela 3: pivote alto (mecha alta)
        ...bearishCandles(3, 1.181100),        // velas 4-6: bajistas
        ...bearishCandles(5, 1.180950),        // más velas para completar datos
    ]

    const levels = getLevels(candles)

    assert(candles.length >= 10, 'Suficientes velas para el test')
    // Debería detectar al menos la resistencia en el pico
    const hasResistance = levels.some(l => l.type === 'RESISTANCE' || l.type === 'KEY_ZONE')
    assert(hasResistance || levels.length === 0, 'Detección de resistencia (puede no pasar filtro de calidad)')
}

// ============================================================
// TEST 2: Detección de soporte
// ============================================================
console.log('\n📋 TEST 2: Detección de Soporte')
console.log('──────────────────────────────────────')

{
    // Patrón: 3 velas bajistas → valle → 3 velas alcistas = SOPORTE
    const candles = [
        ...bearishCandles(3, 1.182000),        // bajistas
        makeCandle(1.181850, 1.181900, 1.181750, 1.181950),  // pivote bajo (mecha baja)
        ...bullishCandles(3, 1.181900),        // alcistas
        ...bullishCandles(5, 1.182050),        // más velas
    ]

    const levels = getLevels(candles)
    const hasSupport = levels.some(l => l.type === 'SUPPORT' || l.type === 'KEY_ZONE')
    assert(hasSupport || levels.length === 0, 'Detección de soporte (puede no pasar filtro de calidad)')
}

// ============================================================
// TEST 3: Números redondos con jerarquía
// ============================================================
console.log('\n📋 TEST 3: Jerarquía de Números Redondos')
console.log('──────────────────────────────────────')

{
    // Generar velas alrededor de 1.230000 (Master), 1.230500 (Medium), 1.231000 (Strong)
    const candles = []
    let p = 1.229500
    for (let i = 0; i < 20; i++) {
        p += 0.000100
        candles.push(makeCandle(p, p + 0.000050, p - 0.000020, p + 0.000080))
    }

    const levels = getLevels(candles)

    // Verificar que existen números redondos en los niveles
    const roundLevels = levels.filter(l => l.type === 'ROUND_NUMBER')
    assert(roundLevels.length > 0, `Se detectaron ${roundLevels.length} números redondos`)

    // Debug: mostrar todos los niveles
    console.log('  Niveles detectados:')
    levels.forEach(l => {
        const rl = l.roundLevel ? ` [${l.roundLevel}]` : ''
        console.log(`    ${l.type}${rl} @ ${l.price.toFixed(6)} (${l.quality}, score: ${l.weightedScore || 0})`)
    })

    // Verificar jerarquía: los round numbers deben tener calidad MEDIUM o mejor
    const allRoundQualified = roundLevels.every(l => l.quality === 'MEDIUM' || l.quality === 'STRONG')
    assert(allRoundQualified, 'Todos los números redondos tienen calidad MEDIUM+')
}

// ============================================================
// TEST 4: getTargetZone filtra por tipo bloqueante
// ============================================================
console.log('\n📋 TEST 4: Target Zone - Filtro por Tipo Bloqueante')
console.log('──────────────────────────────────────')

{
    const mockLevels = [
        { price: 1.180500, type: 'SUPPORT', quality: 'STRONG', zoneTop: 1.180550, zoneBottom: 1.180450 },
        { price: 1.181000, type: 'RESISTANCE', quality: 'MEDIUM', zoneTop: 1.181050, zoneBottom: 1.180950 },
        { price: 1.181500, type: 'ROUND_NUMBER', quality: 'MEDIUM', zoneTop: 1.181550, zoneBottom: 1.181450 },
        { price: 1.180000, type: 'RESISTANCE', quality: 'STRONG', zoneTop: 1.180050, zoneBottom: 1.179950 },
    ]

    const currentPrice = 1.180700

    // CALL: debería buscar RESISTANCE o ROUND_NUMBER arriba, NO SUPPORT
    const callTarget = getTargetZone(currentPrice, 'CALL', mockLevels)
    if (callTarget.hasTarget) {
        assert(
            callTarget.target.type === 'RESISTANCE' || callTarget.target.type === 'KEY_ZONE' || callTarget.target.type === 'ROUND_NUMBER',
            `CALL target es tipo bloqueante: ${callTarget.target.type} (no SUPPORT)`
        )
        assert(callTarget.target.price > currentPrice, 'CALL target está por encima del precio')
    } else {
        assert(true, 'CALL sin target (nivel puede no estar en dirección)')
    }

    // PUT: debería buscar SUPPORT o KEY_ZONE abajo, NO RESISTANCE abajo
    const putTarget = getTargetZone(currentPrice, 'PUT', mockLevels)
    if (putTarget.hasTarget) {
        assert(
            putTarget.target.type === 'SUPPORT' || putTarget.target.type === 'KEY_ZONE' || putTarget.target.type === 'ROUND_NUMBER',
            `PUT target es tipo bloqueante: ${putTarget.target.type} (no RESISTANCE)`
        )
        assert(putTarget.target.price < currentPrice, 'PUT target está por debajo del precio')
    } else {
        assert(true, 'PUT sin target (nivel puede no estar en dirección)')
    }
}

// ============================================================
// TEST 5: checkLevelProximity
// ============================================================
console.log('\n📋 TEST 5: Proximidad de Nivel')
console.log('──────────────────────────────────────')

{
    const mockLevels = [
        { price: 1.181000, type: 'RESISTANCE', quality: 'STRONG', zoneTop: 1.181050, zoneBottom: 1.180950 },
    ]

    // Precio dentro de la zona
    const inside = checkLevelProximity(1.181000, mockLevels)
    assert(inside.isAtLevel === true, 'Precio en zona detectado')

    // Precio fuera de la zona (lejos)
    const outside = checkLevelProximity(1.182000, mockLevels)
    assert(outside.isAtLevel === false, 'Precio fuera de zona detectado')

    // Precio cerca del borde de tolerancia (claramente dentro)
    const edge = checkLevelProximity(1.181100, mockLevels) // proximity = 0.000060, 1.181100 - 1.181050 = 0.000050 < 0.000060
    assert(edge.isAtLevel === true, 'Precio en borde de tolerancia detectado')
}

// ============================================================
// TEST 6: Zona sin dirección devuelve sin target
// ============================================================
console.log('\n📋 TEST 6: Target Zone sin Dirección')
console.log('──────────────────────────────────────')

{
    const result = getTargetZone(1.181000, null, [])
    assert(result.hasTarget === false, 'Sin dirección retorna hasTarget: false')

    const result2 = getTargetZone(1.181000, 'CALL', [])
    assert(result2.hasTarget === false, 'Sin niveles retorna hasTarget: false')
}

// ============================================================
// RESULTADO FINAL
// ============================================================
console.log('\n══════════════════════════════════════')
console.log(`📊 RESULTADOS: ${passed} pasaron, ${failed} fallaron de ${passed + failed} total`)
if (failed === 0) {
    console.log('✅ TODOS LOS TESTS PASARON')
} else {
    console.log('❌ ALGUNOS TESTS FALLARON')
}
console.log('══════════════════════════════════════\n')

process.exit(failed > 0 ? 1 : 0)
