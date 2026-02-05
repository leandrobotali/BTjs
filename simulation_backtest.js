
const fs = require('fs');
const path = require('path');

// Cargar operaciones
const operationsPath = path.join(__dirname, 'operations.json');
const rawOps = fs.readFileSync(operationsPath, 'utf8').trim().split('\n');
const operations = rawOps.map(line => {
    try { return JSON.parse(line); } catch (e) { return null; }
}).filter(op => op !== null);

console.log(`Analizando ${operations.length} operaciones históricas...`);

let stats = {
    original: { WIN: 0, LOSS: 0, TOTAL: 0 },
    simulated: { WIN: 0, LOSS: 0, DESCARTED: 0, TOTAL: 0 },
    reasons: {}
};

operations.forEach(op => {
    // Stats originales
    stats.original.TOTAL++;
    if (op.result === 'WIN') stats.original.WIN++;
    else if (op.result === 'LOSS') stats.original.LOSS++;

    // --- SIMULACIÓN DE NUEVA LÓGICA ---
    let wouldOperate = true;
    let discardReason = '';

    // 1. Filtro Volatilidad (Noise)
    // Usamos open/close de la vela guardada si está disponible, sino aproximamos con ticks
    // op.analysis contiene texto, parsearlo es duro.
    // Usaremos op.ticks
    const ticks = op.ticks;
    const open = ticks[0];
    const close = ticks[ticks.length - 1];
    const range = Math.abs(close - open);

    if (range < 0.000020 && (!op.indicators.patterns || op.indicators.patterns.length === 0)) {
        wouldOperate = false;
        discardReason = 'NOISE_FILTER';
    }

    // 2. Filtro Estancamiento Extremo en Tierra de Nadie
    // Si la razón original fue Estancamiento...
    if (wouldOperate && (op.reason.includes('Estancamiento extremo') || op.reason.includes('Agotamiento'))) {
        // ...y NO estaba en un nivel
        if (op.indicators && op.indicators.levels && !op.indicators.levels.isAtLevel) {
            // --- NUEVA LÓGICA (Trend Following Exception) ---
            // Si el estancamiento es en contra de la tendencia (pullback), LO TOMAMOS por continuidad.
            // Necesitamos saber qué grupo dominaba para saber si es pullback.
            // Parsing del análisis de texto para sacar dominantGroup es frágil, pero podemos deducirlo de la dirección original.
            // Si la original era PUT es porque detectó estancamiento de COMPRADORES (o fuerza vendedores).
            // Estancamiento de COMPRADORES en tendencia BAJISTA -> GOOD (Continuidad).

            const trend = op.indicators.trend || 'NEUTRAL';
            const originalDir = op.direction; // PUT o CALL

            let keptByTrend = false;

            if (trend !== 'LATERAL' && trend !== 'NEUTRAL') {
                // Si ibamos a meter PUT (vender) y la tendencia es BAJISTA -> Es continuidad (estancamiento de compradores)
                if (originalDir === 'PUT' && trend === 'BAJISTA') {
                    keptByTrend = true;
                }
                // Si ibamos a meter CALL (comprar) y la tendencia es ALCISTA -> Es continuidad (estancamiento de vendedores)
                else if (originalDir === 'CALL' && trend === 'ALCISTA') {
                    keptByTrend = true;
                }
            }

            if (!keptByTrend) {
                wouldOperate = false;
                discardReason = 'STAGNATION_NO_LEVEL';
            }
        }
    }

    // 2.1 NUEVO FILTRO: Umbral de Estancamiento más alto
    // Si la razón es Estancamiento (con o sin nivel), verificar que sea al menos 10 ticks.
    // Actualmente el config es 8. Muchos loss son con 8.
    if (wouldOperate && (op.reason.includes('Estancamiento') || op.reason.includes('Agotamiento'))) {
        // Extraer el maxStagnation del análisis
        const matches = op.analysis.match(/Estancamiento Max: (\d+)/g);
        let maxStag = 0;
        if (matches) {
            matches.forEach(m => {
                const val = parseInt(m.split(': ')[1]);
                if (val > maxStag) maxStag = val;
            });
        }

        if (maxStag < 10) {
            wouldOperate = false;
            discardReason = 'STAGNATION_THRESHOLD_10';
        }
    }

    // 3. Veto de Patrones
    if (wouldOperate && op.indicators.patterns && op.indicators.patterns.length > 0) {
        const contrary = op.indicators.patterns.find(p => p.prediction !== op.direction);
        if (contrary) {
            wouldOperate = false;
            discardReason = 'PATTERN_VETO';
        }
    }

    // 5. Filtro de Tendencia para Fuerza Natural
    // Si la razón es "Fuerza natural..." debemos exigir que vaya con la tendencia.
    if (wouldOperate && op.reason.includes('Fuerza natural')) {
        const trend = op.indicators.trend || 'NEUTRAL';

        // Si la tendencia es FUERTE (no lateral/neutral) y vamos en contra -> DESCARTAR
        if (trend !== 'LATERAL' && trend !== 'NEUTRAL') {
            if (op.direction === 'CALL' && trend === 'BAJISTA') {
                wouldOperate = false;
                discardReason = 'TREND_ALIGNMENT';
            }
            else if (op.direction === 'PUT' && trend === 'ALCISTA') {
                wouldOperate = false;
                discardReason = 'TREND_ALIGNMENT';
            }
        }
    }

    // RESULTADOS SIMULADOS
    if (wouldOperate) {
        if (op.result === 'WIN') stats.simulated.WIN++;
        else {
            stats.simulated.LOSS++;
            console.log(`[SURVIVOR LOSS] ${op.timestamp} | Reason: ${op.reason} | Trend: ${op.indicators.trend} | Stagnation: ${op.analysis.match(/Estancamiento Max: (\d+)/g)}`);
        }
    } else {
        stats.simulated.DESCARTED++;
        if (!stats.reasons[discardReason]) stats.reasons[discardReason] = { wins_avoided: 0, losses_avoided: 0 };

        if (op.result === 'WIN') stats.reasons[discardReason].wins_avoided++;
        else stats.reasons[discardReason].losses_avoided++;
    }
});

// CALCULAR WINRATES
const winrateOriginal = (stats.original.WIN / stats.original.TOTAL) * 100;
const winrateSimulated = (stats.simulated.WIN / (stats.simulated.WIN + stats.simulated.LOSS)) * 100;

console.log('\n=== RESULTADOS DE SIMULACIÓN ===');
console.log(`Total Operaciones: ${operations.length}`);
console.log(`Original: ${stats.original.WIN} W - ${stats.original.LOSS} L (${winrateOriginal.toFixed(2)}%)`);
console.log(`-----------------------------------`);
console.log(`Simulado: ${stats.simulated.WIN} W - ${stats.simulated.LOSS} L (${winrateSimulated.toFixed(2)}%)`);
console.log(`Descartadas: ${stats.simulated.DESCARTED}`);
console.log('\nDetalle de Descartes (Impacto):');
for (const [reason, data] of Object.entries(stats.reasons)) {
    console.log(`- ${reason}: Evitó ${data.losses_avoided} LOSS, Eliminó ${data.wins_avoided} WIN. (Neto: ${data.losses_avoided - data.wins_avoided})`);
}
