const config = require('../config.js')
const { getLevels, checkLevelProximity } = require('../indicators/levels.js')
const { getTrend } = require('../indicators/trend.js')
const { detectPatterns } = require('../indicators/patterns.js')

// Helper para logging detallado
class AnalysisLogger {
	constructor() {
		this.logs = []
	}

	add(message) {
		this.logs.push(message)
	}

	getReport() {
		return this.logs.join('\n')
	}
}

/**
 * Función principal de estrategia
 */
const analyzeStrategy = async (candles, ticks) => {
	const logger = new AnalysisLogger()
	logger.add(`[ANALYSIS] Iniciando análisis con ${ticks.length} ticks y ${candles.length} velas históricas.`)

	// 1. Validación de Datos Mínimos
	if (ticks.length < config.strategy.minTicks) {
		logger.add(`[WARNING] Ticks insuficientes (${ticks.length} < ${config.strategy.minTicks}). No se opera.`)
		return { shouldOperate: false, direction: '', reason: 'Datos insuficientes', analysis: logger.getReport() }
	}

	// Identificar vela actual (la última cerrada que estamos analizando)
	// Ticks corresponden a esta vela recién cerrada.
	// Necesitamos el precio de apertura para calcular colores y direcciones de ticks relativos?
	// Asumiremos que ticks[0] es muy cercano a la apertura.

	const openPrice = ticks[0]
	const closePrice = ticks[ticks.length - 1]
	const candleColor = closePrice > openPrice ? 'VERDE' : 'ROJA'
	logger.add(`[CANDLE] Vela cerrada: ${candleColor} (Open: ${openPrice}, Close: ${closePrice})`)

	// 2. Análisis de Contexto (Velas Cerradas)
	const trend = getTrend(candles)
	const levels = getLevels(candles)
	const patterns = detectPatterns(candles)

	logger.add(`[CONTEXT] Tendencia General: ${trend}`)
	if (patterns.length > 0) {
		logger.add(`[CONTEXT] Patrones detectados: ${patterns.map(p => p.name + '->' + p.prediction).join(', ')}`)
	}

	// 3. Análisis de Ticks (Micro-movimientos)
	// Dividir en fases: Inicio (0-30s) y Fin (30-60s)
	// Asumiendo ~1 tick por segundo, array index 0-29 y 30-end

	const midPoint = Math.floor(ticks.length / 2)
	const firstHalf = ticks.slice(0, midPoint)
	const secondHalf = ticks.slice(midPoint)

	// Función auxiliar para analizar una secuencia de ticks
	const analyzeSequence = (sequence, phaseName) => {
		let naturalityScore = 0 // Positivo: Natural, Negativo: Irregular
		let stagnationCount = 0
		let maxStagnation = 0
		let dominantGroup = 'NEUTRAL' // BUYERS vs SELLERS

		let movements = []
		for (let i = 1; i < sequence.length; i++) {
			const diff = sequence[i] - sequence[i - 1]
			const absDiff = Math.abs(diff)

			// Detección de estancamiento
			if (absDiff < config.strategy.stagnation.priceThreshold) {
				stagnationCount++
			} else {
				maxStagnation = Math.max(maxStagnation, stagnationCount)
				stagnationCount = 0
			}

			movements.push(diff)
		}

		// Evaluar Naturalidad (Simetría)
		// Comparar saltos consecutivos. Si uno es > 2x el anterior (que no sea ruido), es irregular
		let irregularMovements = 0
		for (let i = 1; i < movements.length; i++) {
			const prev = Math.abs(movements[i - 1])
			const curr = Math.abs(movements[i])

			if (prev > 0.000001 && curr > prev * config.strategy.naturality.ratioThreshold) {
				irregularMovements++
				logger.add(`[${phaseName}] Movimiento irregular detectado en tick ${i}: ${prev.toFixed(6)} -> ${curr.toFixed(6)}`)
			}
		}

		const netMovement = sequence[sequence.length - 1] - sequence[0]
		dominantGroup = netMovement > 0 ? 'COMPRADORES' : 'VENDEDORES'

		return {
			dominantGroup,
			netMovement,
			maxStagnation,
			irregularMovements
		}
	}

	const startAnalysis = analyzeSequence(firstHalf, 'PHASE_1')
	const endAnalysis = analyzeSequence(secondHalf, 'PHASE_2')

	logger.add(`[PHASE 1] Dominio: ${startAnalysis.dominantGroup}, Estancamiento Max: ${startAnalysis.maxStagnation} ticks`)
	logger.add(`[PHASE 2] Dominio: ${endAnalysis.dominantGroup}, Estancamiento Max: ${endAnalysis.maxStagnation} ticks`)

	// 4. Detección de Latigazo (Whiplash) - Últimos 10-15s
	const whiplashWindow = ticks.slice(-config.strategy.whiplashWindow)
	let isWhiplash = false
	let whiplashDirection = 'NONE'

	// Definimos latigazo como un movimiento fuerte al final sin retroceso
	const whiplashStart = whiplashWindow[0]
	const whiplashEnd = whiplashWindow[whiplashWindow.length - 1]
	const whiplashMove = whiplashEnd - whiplashStart

	// Si el movimiento final representa una gran parte del cuerpo total de la vela o es muy vertical
	// Simplificación: si en los ultimos 15s movió más que en los primeros 45s de promedio
	if (Math.abs(whiplashMove) > 0.000150) { // Umbral arbitrario de "fuerza repentina", ajustar
		isWhiplash = true
		whiplashDirection = whiplashMove > 0 ? 'ALCISTA' : 'BAJISTA'
		logger.add(`[WHIPLASH] Latigazo detectado al final (${whiplashDirection}). Movimiento: ${whiplashMove.toFixed(6)}`)
	}

	// 5. Verificación de Niveles en el momento del cierre
	const levelCheck = checkLevelProximity(closePrice, levels)
	if (levelCheck.isAtLevel) {
		logger.add(`[LEVEL] Precio cerró en nivel: ${levelCheck.level.type} (${levelCheck.level.price})`)
	}

	// ==========================================
	// LÓGICA DE DECISIÓN (Jerarquía LMTA)
	// ==========================================

	let decision = 'WAIT'
	let confidence = 0
	let reason = ''

	// FILTRO 0: Volatilidad Mínima
	// Si la vela se movió menos de X pips en total, es ruido. Ignorar.
	const totalMove = Math.abs(closePrice - openPrice)
	// Unumbral conservador: 0.000020 (20 micro-pips/ticks). Si es menor, el mercado está muerto.
	if (totalMove < 0.000020 && !patterns.length) { // Excepción si hay patrón chartista muy claro
		logger.add(`[FILTER] Mercado estático (Movimiento: ${totalMove.toFixed(6)}). Ignorando ruido.`)
		return { shouldOperate: false, direction: '', reason: 'Mercado sin volumen (Ruido)', analysis: logger.getReport() }
	}

	// Caso: Latigazo de Desesperación
	// REFINAMIENTO: El latigazo debe mostrar rechazo inmediato. 
	// Si cierra EN EL MÁXIMO del latigazo (sin mecha), es rotura, no reversión.
	if (isWhiplash && levelCheck.isAtLevel) {
		const closeNearExtremes = Math.abs(closePrice - ticks[ticks.length - 1]) < 0.000010

		// Latigazo alcista contra resistencia -> VENTA
		if (whiplashDirection === 'ALCISTA' && (levelCheck.level.type === 'RESISTANCE' || levelCheck.level.type === 'ROUND_NUMBER')) {
			// Verificar que no cerró rompiendo con fuerza (necesitamos rechazo/mecha o cierre bajo nivel)
			// Si el precio de cierre > nivel + buffer, es rotura.
			const isBreakout = closePrice > (levelCheck.level.price + 0.000020)

			if (!isBreakout) {
				decision = 'PUT'
				reason = 'Latigazo de desesperación contra resistencia/nivel'
				confidence = 90
			} else {
				logger.add(`[FILTER] Latigazo alcista rompió nivel (Cierre: ${closePrice} > Nivel: ${levelCheck.level.price}). Posible ruptura. WAIT.`)
			}
		}
		// Latigazo bajista contra soporte -> COMPRA
		else if (whiplashDirection === 'BAJISTA' && (levelCheck.level.type === 'SUPPORT' || levelCheck.level.type === 'ROUND_NUMBER')) {
			const isBreakout = closePrice < (levelCheck.level.price - 0.000020)

			if (!isBreakout) {
				decision = 'CALL'
				reason = 'Latigazo de desesperación contra soporte/nivel'
				confidence = 90
			} else {
				logger.add(`[FILTER] Latigazo bajista rompió nivel. Posible ruptura. WAIT.`)
			}
		}
	}

	// Caso: Agotamiento / Estancamiento al final
	// MEJORA CRÍTICA: "Estancamiento Extremo" SIN NIVEL es un suicidio en tendencia.
	// Solo operamos reversión por estancamiento si ESTAMOS EN UN NIVEL.
	else if (endAnalysis.maxStagnation >= config.strategy.stagnation.maxTicks) {

		const isExtremeStagnation = endAnalysis.maxStagnation >= 12
		// REGLA DE ORO: Si hay estancamiento, SOLO operamos si estamos en un nivel.
		// El estancamiento en "tierra de nadie" a menudo es continuación.
		if (levelCheck.isAtLevel) {
			// Si se estancó arriba -> VENTA (posible)
			if (endAnalysis.dominantGroup === 'COMPRADORES') {
				decision = 'PUT'
				reason = isExtremeStagnation ? 'Estancamiento extremo de compradores en Nivel' : 'Agotamiento en Nivel clave'
				confidence = 80
			} else if (endAnalysis.dominantGroup === 'VENDEDORES') {
				decision = 'CALL'
				reason = isExtremeStagnation ? 'Estancamiento extremo de vendedores en Nivel' : 'Agotamiento en Nivel clave'
				confidence = 80
			}
		} else {
			// Si es estancamiento extremo PERO no hay nivel, operamos A FAVOR DE LA TENDENCIA si existe.
			// "Escurriendo el precio"
			if (isExtremeStagnation && trend !== 'LATERAL' && trend !== 'NEUTRAL') {
				logger.add(`[INFO] Estancamiento extremo sin nivel. Evaluando continuidad de tendencia ${trend}.`)
				// Si tendencia es Alcista y se estancan los Vendedores (pullback) -> CALL
				if (trend === 'ALCISTA' && endAnalysis.dominantGroup === 'VENDEDORES') {
					decision = 'CALL'
					reason = 'Continuidad: Estancamiento de vendedores en tendencia alcista'
					confidence = 70
				}
				// Si tendencia es Bajista y se estancan los Compradores -> PUT
				else if (trend === 'BAJISTA' && endAnalysis.dominantGroup === 'COMPRADORES') {
					decision = 'PUT'
					reason = 'Continuidad: Estancamiento de compradores en tendencia bajista'
					confidence = 70
				} else {
					logger.add(`[FILTER] Estancamiento en contra de tendencia sin nivel. Ignorar.`)
				}
			} else {
				logger.add(`[FILTER] Estancamiento detectado (${endAnalysis.maxStagnation} ticks) en Tierra de Nadie. Se ignora.`)
			}
		}
	}


	// Caso: Continuidad de Fuerza Natural
	else if (
		startAnalysis.dominantGroup === endAnalysis.dominantGroup &&
		startAnalysis.irregularMovements === 0 &&
		endAnalysis.irregularMovements === 0 &&
		!levelCheck.isAtLevel // No chocamos con nivel
	) {
		// Validar que realmente hubo movimiento (filtro de ruido extra)
		const bodySize = Math.abs(closePrice - openPrice)
		if (bodySize > 0.000050) { // Mínimo 5 pips de cuerpo para confiar en fuerza

			// NUEVO: Filtro de Alineación con Tendencia (Solo para Fuerza Natural)
			const isTrendAligned = (startAnalysis.dominantGroup === 'COMPRADORES' && (trend === 'ALCISTA' || trend === 'LATERAL' || trend === 'NEUTRAL')) ||
				(startAnalysis.dominantGroup === 'VENDEDORES' && (trend === 'BAJISTA' || trend === 'LATERAL' || trend === 'NEUTRAL'))

			if (isTrendAligned) {
				if (startAnalysis.dominantGroup === 'COMPRADORES') {
					decision = 'CALL'
					reason = 'Fuerza natural alcista sostenida sin bloqueos'
					confidence = 85 // Subimos confianza si pasa filtros
				} else {
					decision = 'PUT'
					reason = 'Fuerza natural bajista sostenida sin bloqueos'
					confidence = 85
				}
			} else {
				logger.add(`[FILTER] Fuerza natural (${startAnalysis.dominantGroup}) en contra de tendencia general (${trend}). Riesgo alto. WAIT.`)
			}
		} else {
			logger.add(`[FILTER] Fuerza natural detectada pero vela muy pequeña (${bodySize.toFixed(6)}). Ignorar.`)
		}
	}

	// Desempate con Patrones y Tendencia
	if (decision !== 'WAIT') {
		// Aumentar confianza si tendencia coincide
		if ((decision === 'CALL' && trend === 'ALCISTA') || (decision === 'PUT' && trend === 'BAJISTA')) {
			confidence += 10
			logger.add(`[BONUS] A favor de tendencia general (${trend}). +10% confianza.`)
		}

		// VETO POR PATRONES (Hard Block)
		// Si un patrón dice lo contrario, NO OPERAMOS. La vista gana a los ticks.
		const contraryPattern = patterns.find(p => p.prediction !== decision)
		if (contraryPattern) {
			logger.add(`[VETO] Operación CANCELADA. Patrón visual (${contraryPattern.name} -> ${contraryPattern.prediction}) contradice estrategia de ticks (${decision}).`)
			decision = 'WAIT'
			reason = `Cancelado por conflicto con patrón ${contraryPattern.name}`
			confidence = 0
		}
	}

	logger.add(`[DECISION] Resultado Final: ${decision} (Confianza: ${confidence}%)`)

	return {
		shouldOperate: decision !== 'WAIT',
		direction: decision === 'WAIT' ? '' : decision,
		reason: reason,
		analysis: logger.getReport(),
		// Datos crudos para reporte
		ticks: ticks,
		indicators: {
			trend,
			levels: levelCheck,
			patterns,
			whiplash: { isWhiplash, whiplashDirection, whiplashMove },
			phase1: startAnalysis,
			phase2: endAnalysis
		}
	}
}

module.exports = {
	analyzeStrategy
}