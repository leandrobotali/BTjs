// indicators/candle-types.js
// Analizador de patrones de velas japonesas para trading algorítmico
// Cada función recibe un objeto candle: { open, close, high, low }

/**
 * Determina si la vela es un Doji
 */
function isDoji(candle, threshold = 0.1) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    return body <= range * threshold;
}

/**
 * Determina si la vela es un Martillo (Hammer)
 */
function isHammer(candle, ratio = 2.0) {
    const body = Math.abs(candle.close - candle.open);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    return lowerWick >= body * ratio && upperWick <= body * 0.5;
}

/**
 * Determina si la vela es un Martillo Invertido (Inverted Hammer)
 */
function isInvertedHammer(candle, ratio = 2.0) {
    const body = Math.abs(candle.close - candle.open);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    return upperWick >= body * ratio && lowerWick <= body * 0.5;
}

/**
 * Determina si la vela es una Pin Bar
 */
function isPinBar(candle, ratio = 2.5) {
    const body = Math.abs(candle.close - candle.open);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    return (
        (lowerWick >= body * ratio && upperWick <= body * 0.3) ||
        (upperWick >= body * ratio && lowerWick <= body * 0.3)
    );
}

/**
 * Determina si la vela es Envolvente (Engulfing)
 * Recibe dos velas: anterior y actual
 */
function isEngulfing(prev, curr) {
    const prevBody = Math.abs(prev.close - prev.open);
    const currBody = Math.abs(curr.close - curr.open);
    // Engulfing alcista
    if (prev.close < prev.open && curr.close > curr.open) {
        return curr.open < prev.close && curr.close > prev.open && currBody > prevBody * 0.8;
    }
    // Engulfing bajista
    if (prev.close > prev.open && curr.close < curr.open) {
        return curr.open > prev.close && curr.close < prev.open && currBody > prevBody * 0.8;
    }
    return false;
}

/**
 * Determina si la vela es Marubozu (sin mechas)
 */
function isMarubozu(candle, threshold = 0.05) {
    const body = Math.abs(candle.close - candle.open);
    const range = candle.high - candle.low;
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    return upperWick <= range * threshold && lowerWick <= range * threshold;
}

module.exports = {
    isDoji,
    isHammer,
    isInvertedHammer,
    isPinBar,
    isEngulfing,
    isMarubozu
};
