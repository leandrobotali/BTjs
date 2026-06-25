/**
 * Calcula el RSI (Relative Strength Index) utilizando el suavizado de Wilder.
 * @param {Array} candles - Array de objetos vela {close}
 * @param {number} period - Periodo del RSI (ej: 14)
 * @returns {number|null} Valor del RSI o null si no hay suficientes datos
 */
function calculateRSI(candles, period = 14) {
	if (!candles || candles.length < period + 1) return null

	let gains = 0
	let losses = 0

	// Primer promedio (SMA de los cambios)
	for (let i = 1; i <= period; i++) {
		const change = candles[i].close - candles[i - 1].close
		if (change > 0) gains += change
		else losses += Math.abs(change)
	}

	let avgGain = gains / period
	let avgLoss = losses / period

	// Suavizado Wilder para el resto de las velas
	for (let i = period + 1; i < candles.length; i++) {
		const change = candles[i].close - candles[i - 1].close
		const gain = change > 0 ? change : 0
		const loss = change < 0 ? Math.abs(change) : 0

		avgGain = (avgGain * (period - 1) + gain) / period
		avgLoss = (avgLoss * (period - 1) + loss) / period
	}

	if (avgLoss === 0) return 100
	const rs = avgGain / avgLoss
	return 100 - (100 / (1 + rs))
}

module.exports = { calculateRSI }
