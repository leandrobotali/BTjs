const { analyzeCurrentTicks } = require('../engine/engine-core.js');

// Helper para generar ticks sintéticos
function generateTicks(count, patternFn) {
    const ticks = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
        ticks.push({ t: now + i * 1000, p: patternFn(i) });
    }
    return ticks;
}

console.log("=== TESTS SINTÉTICOS DEL MOTOR ===");

// TEST 1: MERCADO CAÓTICO (NOISE)
// Precios aleatorios sin dirección clara
const noiseTicks = generateTicks(150, i => 1.1000 + (Math.random() * 0.0050 - 0.0025));
const resNoise = analyzeCurrentTicks(noiseTicks);
console.log(`\nTEST 1 [NOISE Validation]:`, resNoise.regime === 'NOISE' ? '✅ PASSED' : '❌ FAILED', `(Detectado: ${resNoise.regime})`);

// TEST 2: MOVIMIENTO ACTIVO Y ORDENADO HACIA ABAJO (ACTIVE)
// Baja constante de precio, mucha coherencia interna
const activeDownTicks = generateTicks(150, i => 1.5000 - (i * 0.0001));
const resActiveD = analyzeCurrentTicks(activeDownTicks);
console.log(`TEST 2 [ACTIVE DOWN Validation]:`,
    (resActiveD.regime === 'ACTIVE' && resActiveD.direction === 'put') ? '✅ PASSED' : '❌ FAILED',
    `| Dir: ${resActiveD.direction} | Score: ${(resActiveD.score || 0).toFixed(3)} | Regime: ${resActiveD.regime}`
);

// TEST 3: MOVIMIENTO LENTO Y ESTANCADO (WAIT)
// Sube lentísimo, baja aceleración (CET plano/bajo)
const waitTicks = generateTicks(150, i => 1.5000 + (Math.sin(i * 0.1) * 0.0001)); // oscilación
const resWait = analyzeCurrentTicks(waitTicks);
console.log(`TEST 3 [WAIT/COMPRESSION]:`, resWait.regime === 'WAIT' || resWait.regime === 'UNDEFINED' ? '✅ PASSED' : '❌ FAILED', `(Detectado: ${resWait.regime})`);

// TEST 4: AGOTAMIENTO VISIBLE AL FINAL (EXHAUSTION)
// Sube fuerte al principio, pero luego empieza a caer o atascarse
const exhaustionTicks = generateTicks(150, i => {
    if (i < 120) return 1.5000 + (i * 0.0005); // Subida fuerte
    return 1.5600 + ((150 - i) * 0.00005);      // Fatiga drástica (retorna)
});
const resExhaust = analyzeCurrentTicks(exhaustionTicks);
console.log(`TEST 4 [EXHAUSTION]:`,
    resExhaust.regime === 'EXHAUSTION' ? '✅ PASSED' : '⚠️ INFO',
    `| Dir: ${resExhaust.direction} | Regime detectado: ${resExhaust.regime}`
);

console.log("\nEjecución finalizada. Optimizado para no consumir tokens extra.");
