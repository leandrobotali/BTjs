
function getTrend(candles, period = 20) {
	if (candles.length < period) return 'NEUTRAL'

	const recent = candles.slice(-period)
	const first = recent[0]
	const last = recent[recent.length - 1]

	// Simple: Comparar apertura del inicio del periodo con cierre del final
	// Mejor: Linear Regression Slope, pero empezaremos simple como pide la inclinación de los cierres

	const diff = last.close - first.open

	// Umbral mínimo para considerar tendencia
	const threshold = 0.0001 // Ajustar según volatilidad del activo

	if (diff > threshold) return 'ALCISTA'
	if (diff < -threshold) return 'BAJISTA'
	return 'LATERAL'
}

module.exports = {
	getTrend
}
