const config = require('../config.js');
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../money_state.json');

let perdidas = 0;
let maxPerdidasAcumuladas = 0;
let lastWasWin = false;
let lastAmount = config.inversion;

// Cargar estado inicial desde el archivo (Sincrónico solo al inicio)
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
            perdidas = data.perdidas || 0;
            maxPerdidasAcumuladas = data.maxPerdidasAcumuladas || 0;
            lastWasWin = data.lastWasWin || false;
            lastAmount = data.lastAmount || config.inversion;
            console.log(`[MONEY] ✓ Estado recuperado: Deuda $${perdidas.toFixed(2)}, Max Drawdown $${maxPerdidasAcumuladas.toFixed(2)}`);
        }
    } catch (err) {
        console.error('[MONEY] ❌ Error cargando estado:', err.message);
    }
}

// Guardar estado de forma asincrónica
function saveState() {
    const state = {
        perdidas,
        maxPerdidasAcumuladas,
        lastWasWin,
        lastAmount,
        updatedAt: new Date().toISOString()
    };
    fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), (err) => {
        if (err) console.error('[MONEY] ❌ Error guardando estado:', err.message);
    });
}

loadState();

/**
 * Calcula el monto a invertir en la próxima operación basándose en el historial de pérdidas
 * implementando una Martingala Dividida (divide las pérdidas entre 2 operaciones).
 * @returns {number} Monto a invertir (toFixed 2)
 */
const calcularInversion = () => {
    // Si no hay pérdidas, empezamos limpios
    if (perdidas <= 0) {
        lastAmount = config.inversion;
        lastWasWin = false; // Reset de la estrategia
        return config.inversion;
    }

    // Si venimos de un WIN en modo recuperación, mantenemos el importe exacto
    // para intentar recuperar la otra mitad.
    if (lastWasWin) {
        return lastAmount;
    }

    // Si venimos de un LOSS o arrancamos la recuperación
    const resultado = perdidas / 2;

    // Solo intentamos la martingala si la mitad de las pérdidas supera a la inversión base
    if (resultado >= config.inversion) {
        lastAmount = resultado / config.profitEstimado;
        // IQ Option usa máximo 2 decimales para divisas fiat, aseguramos que sea así
        lastAmount = parseFloat(lastAmount.toFixed(2));

        // APLICAR CAP de inversión máxima
        if (lastAmount > config.maxInversion) {
            lastAmount = config.maxInversion;
        }

        return Math.max(config.inversion, lastAmount);
    } else {
        // La pérdida es tan baja que no justifica martingala, apostamos el monto base
        lastAmount = config.inversion;
        return lastAmount;
    }
};

/**
 * Registra el resultado financiero de la última operación cerrada.
 * @param {number} amount Monto invertido
 * @param {object} quote Objeto quote desde IQ Option ({ win: boolean, profit: number })
 */
const registrarResultado = (amount, quote) => {
    const win = quote.win;

    if (win) {
        const profitNeto = quote.profit; // asumiendo que quote.profit ya es el profit REAL neto de la opración
        perdidas -= profitNeto;

        if (perdidas < 0) {
            perdidas = 0;
        }

        lastWasWin = true;
    } else {
        // En IQ Option el profit en loss usualmente es 0 o el monto negativo
        // Si es quote.profit y es loss, suele traer 0. Sumaremos el "amount" invertido.
        perdidas += amount;
        lastWasWin = false;
    }

    // Actualizar el máximo histórico de pérdidas acumuladas
    if (perdidas > maxPerdidasAcumuladas) {
        maxPerdidasAcumuladas = perdidas;
    }

    // Guardar estado de forma asincrónica para persistencia
    saveState();
};

/**
 * Retorna las estadísticas para ser mostradas en manager.js
 */
const obtenerEstadisticasFinancieras = () => {
    return {
        perdidas: perdidas.toFixed(2),
        maxPerdidasAcumuladas: maxPerdidasAcumuladas.toFixed(2),
        lastWasWin,
        lastAmount
    };
};

/**
 * Retorna la cantidad exacta de pérdidas actualmente (usado para Risk Management)
 */
const getPerdidas = () => perdidas;

module.exports = {
    calcularInversion,
    registrarResultado,
    obtenerEstadisticasFinancieras,
    getPerdidas
};
