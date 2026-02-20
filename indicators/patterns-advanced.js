// indicators/patterns-advanced.js
// Detección de patrones avanzados: doble techo, doble suelo y conteo de velas

/**
 * Detecta un doble techo en las últimas N velas
 * @param {Array} candles - Array de velas [{open, close, high, low}, ...]
 * @param {number} lookback - Cuántas velas mirar hacia atrás (default 8)
 * @param {number} tolerance - Diferencia máxima entre los dos techos (default 0.00005)
 * @returns {boolean}
 */
function isDoubleTop(candles, lookback = 8, tolerance = 0.00005) {
    if (!candles || candles.length < lookback) return false;
    const highs = candles.slice(-lookback).map(c => c.max);
    const max1 = Math.max(...highs);
    const idx1 = highs.lastIndexOf(max1);
    // Buscar segundo máximo separado al menos 2 velas
    let max2 = -Infinity, idx2 = -1;
    for (let i = 0; i < highs.length; i++) {
        if (i !== idx1 && Math.abs(highs[i] - max1) <= tolerance && Math.abs(i - idx1) >= 2) {
            if (highs[i] > max2) {
                max2 = highs[i];
                idx2 = i;
            }
        }
    }
    return idx2 !== -1;
}

/**
 * Detecta un doble suelo en las últimas N velas
 */
function isDoubleBottom(candles, lookback = 8, tolerance = 0.00005) {
    if (!candles || candles.length < lookback) return false;
    const lows = candles.slice(-lookback).map(c => c.min);
    const min1 = Math.min(...lows);
    const idx1 = lows.lastIndexOf(min1);
    let min2 = Infinity, idx2 = -1;
    for (let i = 0; i < lows.length; i++) {
        if (i !== idx1 && Math.abs(lows[i] - min1) <= tolerance && Math.abs(i - idx1) >= 2) {
            if (lows[i] < min2) {
                min2 = lows[i];
                idx2 = i;
            }
        }
    }
    return idx2 !== -1;
}

/**
 * Detecta una secuencia de velas del mismo color (alcistas o bajistas)
 * @param {Array} candles
 * @param {number} minCount
 * @returns {string|null} - 'BULLISH', 'BEARISH' o null
 */
function countSameColor(candles, minCount = 3) {
    if (!candles || candles.length < minCount) return null;
    let bullish = true, bearish = true;
    for (let i = candles.length - minCount; i < candles.length; i++) {
        if (candles[i].close <= candles[i].open) bullish = false;
        if (candles[i].close >= candles[i].open) bearish = false;
    }
    if (bullish) return 'BULLISH';
    if (bearish) return 'BEARISH';
    return null;
}

module.exports = {
    isDoubleTop,
    isDoubleBottom,
    countSameColor
};
