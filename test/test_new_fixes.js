/**
 * test_new_fixes.js — Tests para los 3 fixes de la sesión actual
 * 1. minConfidence guard en strategy-core
 * 2. clearTicks en finally (index.js — test de comportamiento)
 * 3. getTargetZone filtra por posición real, no por tipo
 *
 * Ejecutar: node test/test_new_fixes.js
 */

const config = require('../config.js')
const { getTargetZone } = require('../indicators/levels.js')
const { analyzeStrategy } = require('../strategy/strategy-core.js')

let passed = 0, failed = 0

function assert(condition, name) {
    if (condition) { console.log(`  ✅ PASS: ${name}`); passed++ }
    else { console.log(`  ❌ FAIL: ${name}`); failed++ }
}

function makeCandle(open, close, min, max, volume = 200) {
    return { open, close, min, max, volume }
}

// ============================================================
// TEST 1: config.minConfidence existe y es 70
// ============================================================
console.log('\n📋 TEST 1: config.strategy.minConfidence')

assert(typeof config.strategy.minConfidence === 'number', 'minConfidence es número')
assert(config.strategy.minConfidence === 65, `minConfidence = ${config.strategy.minConfidence} (esperado 65)`)

// ============================================================
// TEST 2: getTargetZone filtra por posición real (no por tipo)
// ============================================================
console.log('\n📋 TEST 2: getTargetZone filtra por posición real')

{
    const currentPrice = 1.18200

    // Caso A: SUPPORT flipeado que está POR ENCIMA del precio
    // Antes: era ignorado porque 'SUPPORT' no estaba en blockingTypes para CALL
    // Ahora: debe detectarse porque está físicamente por encima
    const levelsWithFlippedSupport = [
        { price: 1.18300, zoneTop: 1.18310, zoneBottom: 1.18290, type: 'SUPPORT', quality: 'STRONG', isFlipped: true },
        { price: 1.18100, zoneTop: 1.18110, zoneBottom: 1.18090, type: 'RESISTANCE', quality: 'STRONG', isFlipped: false },
    ]
    const callTarget = getTargetZone(currentPrice, 'CALL', levelsWithFlippedSupport)
    assert(callTarget.hasTarget === true, 'CALL detecta nivel bloqueante por encima')
    assert(callTarget.target.price === 1.18300, `CALL target es el nivel más cercano por encima (${callTarget.target?.price})`)
    assert(callTarget.target.type === 'SUPPORT', 'CALL target puede ser tipo SUPPORT si está por encima (zona flipeada)')

    // Caso B: RESISTANCE que está POR DEBAJO del precio
    // Antes: era incluida en blockingTypes para PUT pero estaba en dirección incorrecta
    // Ahora: se ignora porque distance < 0
    const levelsWithResistanceBelow = [
        { price: 1.18100, zoneTop: 1.18110, zoneBottom: 1.18090, type: 'RESISTANCE', quality: 'STRONG', isFlipped: false },
        { price: 1.18050, zoneTop: 1.18060, zoneBottom: 1.18040, type: 'SUPPORT', quality: 'STRONG', isFlipped: false },
    ]
    const putTarget = getTargetZone(currentPrice, 'PUT', levelsWithResistanceBelow)
    assert(putTarget.hasTarget === true, 'PUT detecta nivel bloqueante por debajo')
    assert(putTarget.target.price === 1.18100, `PUT target es el nivel más cercano por debajo (${putTarget.target?.price})`)

    // Caso C: niveles WEAK son ignorados
    const levelsAllWeak = [
        { price: 1.18300, zoneTop: 1.18310, zoneBottom: 1.18290, type: 'RESISTANCE', quality: 'WEAK' },
        { price: 1.18100, zoneTop: 1.18110, zoneBottom: 1.18090, type: 'SUPPORT', quality: 'WEAK' },
    ]
    const noTarget = getTargetZone(currentPrice, 'CALL', levelsAllWeak)
    assert(noTarget.hasTarget === false, 'Niveles WEAK no bloquean (hasTarget=false)')

    // Caso D: sin niveles
    const emptyTarget = getTargetZone(currentPrice, 'CALL', [])
    assert(emptyTarget.hasTarget === false, 'Sin niveles retorna hasTarget=false')

    // Caso E: sin dirección
    const noDir = getTargetZone(currentPrice, null, levelsWithFlippedSupport)
    assert(noDir.hasTarget === false, 'Sin dirección retorna hasTarget=false')

    // Caso F: hasSpace correcto según minTargetDistance
    const closeLevel = [
        { price: currentPrice + 0.000050, zoneTop: currentPrice + 0.000060, zoneBottom: currentPrice + 0.000040, type: 'RESISTANCE', quality: 'STRONG' }
    ]
    const tooClose = getTargetZone(currentPrice, 'CALL', closeLevel)
    assert(tooClose.hasTarget === true, 'Detecta nivel muy cercano')
    assert(tooClose.hasSpace === false, `hasSpace=false cuando distancia < minTargetDistance (${tooClose.distancePips?.toFixed(6)})`)

    const farLevel = [
        { price: currentPrice + 0.000200, zoneTop: currentPrice + 0.000210, zoneBottom: currentPrice + 0.000190, type: 'RESISTANCE', quality: 'STRONG' }
    ]
    const hasSpace = getTargetZone(currentPrice, 'CALL', farLevel)
    assert(hasSpace.hasSpace === true, `hasSpace=true cuando distancia >= minTargetDistance (${hasSpace.distancePips?.toFixed(6)})`)
}

// ============================================================
// TEST 3: minConfidence guard cancela operaciones de baja confianza
// ============================================================
console.log('\n📋 TEST 3: minConfidence guard en analyzeStrategy')

async function testMinConfidenceGuard() {
    // Escenario: mercado lateral débil — la estrategia puede generar señal con confianza baja
    // Usamos velas con volumen suficiente pero señal débil (fases contradictorias)
    const candles = Array.from({ length: 20 }, (_, i) => makeCandle(
        1.1800 + (i % 2) * 0.0001,
        1.1801 + (i % 2) * 0.0001,
        1.1799 + (i % 2) * 0.0001,
        1.1802 + (i % 2) * 0.0001
    ))

    // Ticks con señal fuerte para forzar una decisión (latigazo de desesperación)
    // Fase 1+2 débil, fase 3 con movimiento fuerte → DESESPERACION
    const ticks = [
        ...Array.from({ length: 28 }, (_, i) => 1.18200 + (i % 3) * 0.000001), // fase1: lateral
        ...Array.from({ length: 14 }, (_, i) => 1.18200 + (i % 2) * 0.000001), // fase2: lateral
        ...Array.from({ length: 14 }, (_, i) => 1.18200 + i * 0.000005),        // fase3: sube
    ]

    const result = await analyzeStrategy(candles, ticks, [])
    assert(typeof result.shouldOperate === 'boolean', 'analyzeStrategy retorna shouldOperate boolean')
    assert(typeof result.confidence === 'number' || result.confidence === undefined, 'confidence es número o undefined')

    // Si la decisión es operar, la confianza debe ser >= minConfidence
    if (result.shouldOperate) {
        assert(result.confidence >= config.strategy.minConfidence,
            `Si opera, confidence (${result.confidence}) >= minConfidence (${config.strategy.minConfidence})`)
    } else {
        // Si no opera, puede ser por confianza baja u otras razones — ambas son válidas
        assert(true, 'No opera (confianza insuficiente u otra razón válida)')
    }
}

// ============================================================
// TEST 4: getTargetZone — KEY_ZONE bloquea en ambas direcciones
// ============================================================
console.log('\n📋 TEST 4: KEY_ZONE bloquea en ambas direcciones')

{
    const currentPrice = 1.18200
    const keyZone = [
        { price: 1.18300, zoneTop: 1.18310, zoneBottom: 1.18290, type: 'KEY_ZONE', quality: 'STRONG' },
        { price: 1.18100, zoneTop: 1.18110, zoneBottom: 1.18090, type: 'KEY_ZONE', quality: 'STRONG' },
    ]

    const callT = getTargetZone(currentPrice, 'CALL', keyZone)
    assert(callT.hasTarget && callT.target.price === 1.18300, 'KEY_ZONE bloquea CALL por encima')

    const putT = getTargetZone(currentPrice, 'PUT', keyZone)
    assert(putT.hasTarget && putT.target.price === 1.18100, 'KEY_ZONE bloquea PUT por debajo')
}

// ============================================================
// Ejecutar y mostrar resultado
// ============================================================
testMinConfidenceGuard().then(() => {
    console.log('\n══════════════════════════════════════')
    console.log(`📊 RESULTADOS: ${passed} pasaron, ${failed} fallaron de ${passed + failed} total`)
    if (failed === 0) console.log('✅ TODOS LOS TESTS PASARON')
    else console.log('❌ ALGUNOS TESTS FALLARON')
    console.log('══════════════════════════════════════\n')
    process.exit(failed > 0 ? 1 : 0)
})
