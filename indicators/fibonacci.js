/**
 * fibonacci.js
 * Detecta zonas de reacción de Fibonacci (50% y 61.8%) sobre el último impulso.
 * Según INFO_ESTRATEGIA.md: los puntos del 50% y 61.8% son zonas de alta reacción.
 */

const FIB_LEVELS = [0.382, 0.500, 0.618]
const FIB_TOLERANCE = 0.000050 // ±5 pips (igual que proximidad de niveles)

/**
 * Detecta el último impulso significativo en las velas y calcula zonas Fibonacci.
 * @param {Array} candles
 * @param {number} lookback - velas a analizar para encontrar el impulso
 * @returns {Array} zonas Fibonacci: [{ price, level, type, quality }]
 */
function getFibonacciZones(candles, lookback = 30) {
	if (!candles || candles.length < lookback) return []

	const recent = candles.slice(-lookback)

	// Encontrar el swing high y swing low del periodo
	let swingHigh = -Infinity
	let swingLow = Infinity
	let swingHighIdx = -1
	let swingLowIdx = -1

	for (let i = 0; i < recent.length; i++) {
		const h = recent[i].max || recent[i].high
		const l = recent[i].min || recent[i].low
		if (h > swingHigh) { swingHigh = h; swingHighIdx = i }
		if (l < swingLow) { swingLow = l; swingLowIdx = i }
	}

	const range = swingHigh - swingLow
	// Impulso mínimo: al menos 10 pips para que sea relevante
	if (range < 0.000100) return []

	// Determinar dirección del impulso (¿el high vino antes o después del low?)
	const isUptrend = swingLowIdx < swingHighIdx

	const zones = []
	for (const fibLevel of FIB_LEVELS) {
		// En uptrend: retroceso desde el high hacia abajo
		// En downtrend: retroceso desde el low hacia arriba
		const price = isUptrend
			? swingHigh - range * fibLevel
			: swingLow + range * fibLevel

		zones.push({
			price,
			zoneTop: price + FIB_TOLERANCE,
			zoneBottom: price - FIB_TOLERANCE,
			type: isUptrend ? 'SUPPORT' : 'RESISTANCE',
			quality: fibLevel === 0.500 || fibLevel === 0.618 ? 'MEDIUM' : 'WEAK',
			isFibonacci: true,
			fibLevel,
			isFlipped: false,
			isWorn: false
		})
	}

	return zones
}

/**
 * Verifica si el precio actual está en una zona Fibonacci relevante.
 * @param {number} price
 * @param {Array} fibZones
 * @returns {{ isAtFib: boolean, zone: Object|null }}
 */
function checkFibProximity(price, fibZones) {
	for (const zone of fibZones) {
		if (price >= zone.zoneBottom && price <= zone.zoneTop) {
			return { isAtFib: true, zone }
		}
	}
	return { isAtFib: false, zone: null }
}

module.exports = { getFibonacciZones, checkFibProximity }
