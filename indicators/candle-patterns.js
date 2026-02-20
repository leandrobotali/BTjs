// Este archivo integra el análisis de patrones de velas en la estrategia principal.
// Se debe importar y usar en strategy-core.js

const {
    isDoji,
    isHammer,
    isInvertedHammer,
    isPinBar,
    isEngulfing,
    isMarubozu
} = require('./candle-types.js');

/**
 * Analiza la última vela cerrada y retorna los patrones detectados
 * @param {Array} candles - Array de velas [{open, close, high, low}, ...]
 * @returns {Array} - Lista de patrones detectados
 */
function detectCandlePatterns(candles) {
    if (!candles || candles.length < 2) return [];
    const patterns = [];
    const prev = candles[candles.length - 2];
    const curr = candles[candles.length - 1];

    if (isDoji(curr)) patterns.push('DOJI');
    if (isHammer(curr)) patterns.push('HAMMER');
    if (isInvertedHammer(curr)) patterns.push('INVERTED_HAMMER');
    if (isPinBar(curr)) patterns.push('PIN_BAR');
    if (isEngulfing(prev, curr)) patterns.push('ENGULFING');
    if (isMarubozu(curr)) patterns.push('MARUBOZU');

    return patterns;
}

module.exports = {
    detectCandlePatterns
};
