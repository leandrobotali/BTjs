/**
 * Calcula EMA sobre los cierres de las velas.
 * @param {Array} candles
 * @param {number} period
 * @returns {number|null} valor actual de la EMA, o null si no hay suficientes datos
 */
function calculateEMA(candles, period) {
	if (!candles || candles.length < period) return null
	const k = 2 / (period + 1)
	let ema = candles.slice(0, period).reduce((s, c) => s + c.close, 0) / period
	for (let i = period; i < candles.length; i++) {
		ema = candles[i].close * k + ema * (1 - k)
	}
	return ema
}

/**
 * Calcula SMA sobre los cierres de las velas.
 * @param {Array} candles
 * @param {number} period
 * @returns {number|null}
 */
function calculateSMA(candles, period) {
	if (!candles || candles.length < period) return null
	const slice = candles.slice(-period)
	return slice.reduce((s, c) => s + c.close, 0) / period
}

module.exports = { calculateSMA, calculateEMA }
