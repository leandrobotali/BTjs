const { isDoubleTop, isDoubleBottom, countSameColor } = require('../indicators/patterns-advanced.js')
const config = require('../config.js')
const { checkLevelProximity, getTargetZone } = require('../indicators/levels.js')
const { getTrend } = require('../indicators/trend.js')
const { detectPatterns } = require('../indicators/patterns.js')
const { detectCandlePatterns } = require('../indicators/candle-patterns.js')
const { detectDangerousMarket } = require('../indicators/dangerous-markets.js')
const { detectCandleSequence } = require('../indicators/sequences.js')
const { checkMarketContext } = require('../indicators/market-context.js')
const { getFibonacciZones, checkFibProximity } = require('../indicators/fibonacci.js')
const { getVolumeEMA } = require('../core/candles.js')

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
 * Analiza una secuencia de ticks para detectar características clave
 */
const analyzeTickSequence = (sequence, phaseName, logger) => {
	let stagnationCount = 0
	let maxStagnation = 0
	let movements = []
	let prices = []

	// Calcular movimientos
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
		prices.push(sequence[i])
	}

	// Evaluar Naturalidad (Simetría)
	let irregularMovements = 0
	for (let i = 1; i < movements.length; i++) {
		const prev = Math.abs(movements[i - 1])
		const curr = Math.abs(movements[i])

		if (prev > 0.000001 && curr > prev * config.strategy.naturality.ratioThreshold) {
			irregularMovements++
			logger.add(`  [${phaseName}] Movimiento irregular: ${prev.toFixed(6)} → ${curr.toFixed(6)} (${(curr / prev).toFixed(1)}x)`)
		}
	}

	// Calcular movimiento neto y velocidad (inclinación)
	const netMovement = sequence[sequence.length - 1] - sequence[0]
	const timeSpan = sequence.length
	const velocity = Math.abs(netMovement) / timeSpan // pips por tick
	const dominantGroup = netMovement > 0 ? 'COMPRADORES' : 'VENDEDORES'

	// Detectar si hubo avance previo (para distinguir agotamiento de debilidad)
	let hadProgress = false
	let maxReached = sequence[0]
	let minReached = sequence[0]

	for (const price of sequence) {
		if (netMovement > 0) {
			// Alcista: verificar si hizo nuevos máximos
			if (price > maxReached) {
				maxReached = price
				hadProgress = true
			}
		} else {
			// Bajista: verificar si hizo nuevos mínimos
			if (price < minReached) {
				minReached = price
				hadProgress = true
			}
		}
	}

	return {
		dominantGroup,
		netMovement,
		velocity,
		maxStagnation,
		irregularMovements,
		hadProgress,
		isWeak: irregularMovements > 2 || velocity < 0.000003 // Débil si muy irregular o muy lento
	}
}

/**
 * Función principal de estrategia
 */

const analyzeStrategy = async (candles, ticks, levels = []) => {
	const logger = new AnalysisLogger()
	// PATRONES AVANZADOS
	const doubleTop = isDoubleTop(candles)
	const doubleBottom = isDoubleBottom(candles)
	const sameColorSeq = countSameColor(candles)

	if (doubleTop) logger.add('🔺 Doble Techo detectado en el historial reciente')
	if (doubleBottom) logger.add('🔻 Doble Suelo detectado en el historial reciente')
	if (sameColorSeq) logger.add(`⏳ Secuencia de velas: ${sameColorSeq}`)
	logger.add(`╔═══════════════════════════════════════════════════════════════╗`)
	logger.add(`║ ANÁLISIS COMPLETO - ${new Date().toISOString()}`)
	logger.add(`╚═══════════════════════════════════════════════════════════════╝`)
	logger.add(``)
	logger.add(`[DATA] ${ticks.length} ticks | ${candles.length} velas históricas`)

	// === FILTRO DE VOLUMEN BAJO ===
	const VOLUME_LOOKBACK = config.strategy.volume.lookback
	if (candles.length >= VOLUME_LOOKBACK) {
		const recentVolumes = candles.slice(-VOLUME_LOOKBACK).map(c => c.volume || 0)
		const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / VOLUME_LOOKBACK

		// Umbral dinámico: 50% de la EMA de volumen típico aprendida
		// Si la EMA aún no tiene datos suficientes, usar el valor inicial de config
		const emaVol = getVolumeEMA()
		const dynamicMin = emaVol !== null
			? Math.round(emaVol * config.strategy.volume.volumeEmaRatio)
			: config.strategy.volume.minAvg

		logger.add(`[VOLUMEN] Actual (prom ${VOLUME_LOOKBACK} velas): ${avgVolume.toFixed(1)} | EMA típico: ${emaVol !== null ? emaVol.toFixed(1) : 'calibrando...'} | Umbral mínimo: ${dynamicMin}`)

		if (avgVolume < dynamicMin) {
			logger.add(`[ABORT] Volumen bajo (${avgVolume.toFixed(1)} < ${dynamicMin}) - No operar.`)
			return { shouldOperate: false, direction: '', reason: 'Volumen bajo', analysis: logger.getReport(), candles: candles.slice(-20) }
		}
	}

	// 1. Validación de Datos Mínimos
	if (ticks.length < config.strategy.minTicks) {
		logger.add(`[ABORT] Ticks insuficientes (${ticks.length} < ${config.strategy.minTicks})`)
		return {
			shouldOperate: false,
			direction: '',
			reason: 'Datos insuficientes',
			analysis: logger.getReport(),
			candles: candles.slice(-20) // Últimas 20 velas para contexto
		}
	}

	// ==========================================
	// 0. FILTRO DE MERCADOS PELIGROSOS
	// ==========================================
	logger.add(``)
	logger.add(`[STEP 1] FILTRO DE SEGURIDAD - Mercados Peligrosos`)
	logger.add(`─────────────────────────────────────────────────────────────`)

	const dangerCheck = detectDangerousMarket(candles, ticks)
	if (dangerCheck.isDangerous) {
		logger.add(`❌ MERCADO PELIGROSO: ${dangerCheck.reason}`)
		dangerCheck.details.forEach(detail => logger.add(`   ${detail}`))
		logger.add(``)
		logger.add(`[DECISION] NO OPERAR - Condiciones inseguras`)

		return {
			shouldOperate: false,
			direction: '',
			reason: `Mercado Peligroso (${dangerCheck.reason})`,
			analysis: logger.getReport(),
			candles: candles.slice(-20)
		}
	} else {
		logger.add(`✓ Mercado seguro - Continuar análisis`)
	}

	// Identificar vela actual
	const openPrice = ticks[0]
	const closePrice = ticks[ticks.length - 1]
	const candleColor = closePrice > openPrice ? 'VERDE' : 'ROJA'

	logger.add(``)
	logger.add(`[STEP 2] CONTEXTO DE MERCADO`)
	logger.add(`─────────────────────────────────────────────────────────────`)
	logger.add(`Vela Actual: ${candleColor} (${openPrice.toFixed(6)} → ${closePrice.toFixed(6)})`)



	// 2. Análisis de Contexto (Velas Cerradas)
	const trendInfo = getTrend(candles)
	const trend = trendInfo.direction  // mantener compatibilidad con logging existente
	// levels viene pre-calculado desde index.js (una sola vez por vela nueva)
	const patterns = detectPatterns(candles)
	const candlePatterns = detectCandlePatterns(candles)

	logger.add(`Tendencia: ${trendInfo.direction} (${trendInfo.strength})`)
	logger.add(`Niveles Detectados: ${levels.length}`)
	levels.forEach((level, idx) => {
		const flip = level.isFlipped ? ' [FLIP]' : ''
		const worn = level.isWorn ? ' [DESGASTADO]' : ''
		logger.add(`  ${idx + 1}. ${level.type}${flip}${worn} @ ${level.price.toFixed(6)} (${level.quality}, ${level.rejections || level.touches} rechazos)`)
	})

	if (patterns.length > 0) {
		logger.add(`Patrones: ${patterns.map(p => p.name + '→' + p.prediction).join(', ')}`)
	}
	if (candlePatterns.length > 0) {
		logger.add(`Patrones de vela: ${candlePatterns.join(', ')}`)
	}

	// === ANÁLISIS DE MECHAS EXTREMAS ===
	// Penalizar si la vela actual o las últimas N tienen mechas largas respecto al cuerpo
	const MECHA_LOOKBACK = 3;
	const MECHA_RATIO_UMBRAL = 2.5; // Mecha > 2.5x cuerpo
	let mechaExtremaDetectada = false;
	if (candles.length >= MECHA_LOOKBACK) {
		const recentCandles = candles.slice(-MECHA_LOOKBACK);
		for (const c of recentCandles) {
			const cuerpo = Math.abs(c.close - c.open);
			const mechaSup = c.max - Math.max(c.close, c.open);
			const mechaInf = Math.min(c.close, c.open) - c.min;
			const mechaMax = Math.max(mechaSup, mechaInf);
			if (cuerpo > 0 && (mechaSup / cuerpo > MECHA_RATIO_UMBRAL || mechaInf / cuerpo > MECHA_RATIO_UMBRAL)) {
				mechaExtremaDetectada = true;
				logger.add(`[MECHA] Vela con mecha extrema detectada (mecha/cuerpo > ${MECHA_RATIO_UMBRAL})`);
			}
		}
	}


	// ==========================================
	// 3. ANÁLISIS DE TICKS (LMTA - 3 FASES)
	// ==========================================
	logger.add(``)
	logger.add(`[STEP 3] ANÁLISIS DE MICRO-MOVIMIENTOS (LMTA)`)
	logger.add(`─────────────────────────────────────────────────────────────`)

	// Dividir en 3 fases proporcionales según INFO_ESTRATEGIA.md
	// Fase 1: primeros 50% (aprox 30s), Fase 2: 30s-45s, Fase 3: últimos 25% (aprox 15s)
	// Con 55-60 ticks: fase3 = últimos 25% = 13-15 ticks, fase1 = primeros 50% = 27-30 ticks
	const n = ticks.length
	const phase1End = Math.floor(n * 0.50)       // primeros 50%
	const phase3Start = Math.floor(n * 0.75)     // últimos 25%
	const phase2Start = phase1End
	const phase2End = phase3Start

	const phase1Ticks = ticks.slice(0, phase1End)
	const phase2Ticks = ticks.slice(phase2Start, phase2End)
	const phase3Ticks = ticks.slice(phase3Start)

	logger.add(`Fase 1 (Inicio): ${phase1Ticks.length} ticks`)
	logger.add(`Fase 2 (Medio): ${phase2Ticks.length} ticks`)
	logger.add(`Fase 3 (Final 15s): ${phase3Ticks.length} ticks`)
	logger.add(``)

	const phase1 = analyzeTickSequence(phase1Ticks, 'FASE_1', logger)
	const phase2 = analyzeTickSequence(phase2Ticks, 'FASE_2', logger)
	const phase3 = analyzeTickSequence(phase3Ticks, 'FASE_3', logger)

	logger.add(``)
	logger.add(`📊 FASE 1 (Primeros 30s):`)
	logger.add(`   Dominio: ${phase1.dominantGroup}`)
	logger.add(`   Movimiento: ${phase1.netMovement.toFixed(6)} pips`)
	logger.add(`   Velocidad: ${phase1.velocity.toFixed(6)} pips/tick`)
	logger.add(`   Irregularidades: ${phase1.irregularMovements}`)
	logger.add(`   Estancamiento Max: ${phase1.maxStagnation} ticks`)
	logger.add(`   Tuvo Progreso: ${phase1.hadProgress ? 'SÍ' : 'NO'}`)
	logger.add(`   Estado: ${phase1.isWeak ? '⚠️ DÉBIL' : '✓ FUERTE'}`)

	logger.add(``)
	logger.add(`📊 FASE 2 (Medio):`)
	logger.add(`   Dominio: ${phase2.dominantGroup}`)
	logger.add(`   Movimiento: ${phase2.netMovement.toFixed(6)} pips`)
	logger.add(`   Velocidad: ${phase2.velocity.toFixed(6)} pips/tick`)
	logger.add(`   Irregularidades: ${phase2.irregularMovements}`)
	logger.add(`   Estancamiento Max: ${phase2.maxStagnation} ticks`)
	logger.add(`   Tuvo Progreso: ${phase2.hadProgress ? 'SÍ' : 'NO'}`)
	logger.add(`   Estado: ${phase2.isWeak ? '⚠️ DÉBIL' : '✓ FUERTE'}`)

	logger.add(``)
	logger.add(`📊 FASE 3 (Últimos 15s - CRÍTICO):`)
	logger.add(`   Dominio: ${phase3.dominantGroup}`)
	logger.add(`   Movimiento: ${phase3.netMovement.toFixed(6)} pips`)
	logger.add(`   Velocidad: ${phase3.velocity.toFixed(6)} pips/tick`)
	logger.add(`   Irregularidades: ${phase3.irregularMovements}`)
	logger.add(`   Estancamiento Max: ${phase3.maxStagnation} ticks`)
	logger.add(`   Tuvo Progreso: ${phase3.hadProgress ? 'SÍ' : 'NO'}`)
	logger.add(`   Estado: ${phase3.isWeak ? '⚠️ DÉBIL' : '✓ FUERTE'}`)

	// ==========================================
	// 4. DETECCIÓN DE LATIGAZO (Clasificado)
	// ==========================================
	logger.add(``)
	logger.add(`[STEP 4] DETECCIÓN DE LATIGAZO`)
	logger.add(`─────────────────────────────────────────────────────────────`)

	const whiplashMove = phase3.netMovement
	const whiplashVelocity = phase3.velocity
	let whiplashType = 'NONE'
	let whiplashDirection = 'NONE'

	// Latigazo adaptativo: umbral relativo al rango promedio de las últimas velas
	const avgCandleRange = candles.slice(-10).reduce((s, c) => s + (c.max - c.min), 0) / 10
	const whiplashMinMove = avgCandleRange * config.strategy.whiplash.minRangeRatio

	if (Math.abs(whiplashMove) >= whiplashMinMove && whiplashVelocity > config.strategy.whiplash.minVelocity) {
		whiplashDirection = whiplashMove > 0 ? 'ALCISTA' : 'BAJISTA'

		// Distinguir Fuerza vs Desesperación
		const previousPhaseWasWeak = phase2.isWeak || phase2.maxStagnation >= 5

		if (previousPhaseWasWeak) {
			whiplashType = 'DESESPERACION'
			logger.add(`⚡ LATIGAZO DE DESESPERACIÓN detectado (${whiplashDirection})`)
			logger.add(`   Movimiento: ${whiplashMove.toFixed(6)} pips en ${phase3Ticks.length} ticks`)
			logger.add(`   Velocidad: ${whiplashVelocity.toFixed(6)} pips/tick`)
			logger.add(`   Contexto: Fase previa mostró debilidad/estancamiento`)
		} else {
			whiplashType = 'FUERZA'
			logger.add(`💪 LATIGAZO DE FUERZA detectado (${whiplashDirection})`)
			logger.add(`   Movimiento: ${whiplashMove.toFixed(6)} pips en ${phase3Ticks.length} ticks`)
			logger.add(`   Velocidad: ${whiplashVelocity.toFixed(6)} pips/tick`)
			logger.add(`   Contexto: Continuación de fuerza natural`)
		}
	} else {
		logger.add(`Sin latigazo significativo`)
	}

	// ==========================================
	// 5. DETECCIÓN DE APROVECHAMIENTO
	// ==========================================
	logger.add(``)
	logger.add(`[STEP 5] ANÁLISIS DE APROVECHAMIENTO`)
	logger.add(`─────────────────────────────────────────────────────────────`)

	let exploitation = 'NONE'

	// Verificar aprovechamiento entre fases 1→2 y 2→3 (la fase 3 es la más crítica)
	const checkExploitation = (weakPhase, strongPhase) => {
		if (weakPhase.dominantGroup !== strongPhase.dominantGroup &&
			weakPhase.isWeak && !strongPhase.isWeak &&
			strongPhase.velocity > weakPhase.velocity) {
			return strongPhase.dominantGroup
		}
		return null
	}

	// Priorizar aprovechamiento en fase 3 (más reciente = más relevante)
	const exploit3 = checkExploitation(phase2, phase3)
	const exploit2 = checkExploitation(phase1, phase2)

	if (exploit3) {
		exploitation = exploit3
		logger.add(`✓ ${exploit3} APROVECHARON la debilidad en FASE 3 (crítico)`)
		logger.add(`   Velocidad Fase 2: ${phase2.velocity.toFixed(6)} | Fase 3: ${phase3.velocity.toFixed(6)}`)
	} else if (exploit2) {
		exploitation = exploit2
		logger.add(`✓ ${exploit2} APROVECHARON la debilidad en FASE 2`)
		logger.add(`   Velocidad Fase 1: ${phase1.velocity.toFixed(6)} | Fase 2: ${phase2.velocity.toFixed(6)}`)
	} else {
		logger.add(`Sin aprovechamiento claro`)
	}

	// ==========================================
	// 6. VERIFICACIÓN DE NIVELES
	// ==========================================
	logger.add(``)
	logger.add(`[STEP 6] VERIFICACIÓN DE NIVELES`)
	logger.add(`─────────────────────────────────────────────────────────────`)

	const levelCheck = checkLevelProximity(closePrice, levels)
	if (levelCheck.isAtLevel) {
		const lvl = levelCheck.level
		logger.add(`✓ Precio en nivel: ${lvl.type} @ ${lvl.price.toFixed(6)}`)
		logger.add(`   Calidad: ${lvl.quality} (${lvl.touches || 1} toques)`)
		logger.add(`   Distancia: ${Math.abs(closePrice - lvl.price).toFixed(6)} pips`)
	} else {
		logger.add(`Sin nivel cercano`)
	}

	// Fibonacci
	const fibZones = getFibonacciZones(candles)
	const fibCheck = checkFibProximity(closePrice, fibZones)
	if (fibCheck.isAtFib) {
		logger.add(`✓ Precio en zona Fibonacci ${(fibCheck.zone.fibLevel * 100).toFixed(1)}% @ ${fibCheck.zone.price.toFixed(6)}`)
	}

	// ==========================================
	// LÓGICA DE DECISIÓN (Jerarquía LMTA)
	// ==========================================
	logger.add(``)
	logger.add(`[STEP 7] LÓGICA DE DECISIÓN`)
	logger.add(`═════════════════════════════════════════════════════════════`)

	let decision = 'WAIT'
	let confidence = 0
	let reason = ''

	// JERARQUÍA 1: Latigazo de Desesperación en Nivel (Máxima Prioridad)
	if (whiplashType === 'DESESPERACION' && levelCheck.isAtLevel) {
		logger.add(``)
		logger.add(`🎯 REGLA 1: Latigazo de Desesperación en Nivel`)

		if (whiplashDirection === 'ALCISTA' && (levelCheck.level.type === 'RESISTANCE' || levelCheck.level.type === 'ROUND_NUMBER')) {
			decision = 'PUT'
			reason = 'Latigazo de desesperación contra resistencia'
			confidence = 90
			logger.add(`   ✓ Latigazo ALCISTA contra RESISTENCIA → VENTA`)

			if (levelCheck.level.quality === 'STRONG') {
				confidence += 5
				logger.add(`   ✓ Nivel FUERTE → +5% confianza`)
			}
		}
		else if (whiplashDirection === 'BAJISTA' && (levelCheck.level.type === 'SUPPORT' || levelCheck.level.type === 'ROUND_NUMBER')) {
			decision = 'CALL'
			reason = 'Latigazo de desesperación contra soporte'
			confidence = 90
			logger.add(`   ✓ Latigazo BAJISTA contra SOPORTE → COMPRA`)

			if (levelCheck.level.quality === 'STRONG') {
				confidence += 5
				logger.add(`   ✓ Nivel FUERTE → +5% confianza`)
			}
		}
	}

	// JERARQUÍA 2: Agotamiento (Estancamiento DESPUÉS de progreso)
	else if (phase3.maxStagnation >= config.strategy.stagnation.maxTicks && phase3.hadProgress) {
		logger.add(``)
		logger.add(`🎯 REGLA 2: Agotamiento (Estancamiento tras Progreso)`)
		logger.add(`   Estancamiento: ${phase3.maxStagnation} ticks`)
		logger.add(`   Tuvo Progreso Previo: ${phase3.hadProgress ? 'SÍ' : 'NO'}`)

		const isValidContext = levelCheck.isAtLevel || phase3.maxStagnation >= 12

		if (isValidContext) {
			if (phase3.dominantGroup === 'COMPRADORES') {
				decision = 'PUT'
				reason = phase3.maxStagnation >= 12 ? 'Agotamiento extremo de compradores' : 'Agotamiento en nivel clave'
				confidence = 75
				logger.add(`   ✓ COMPRADORES agotados → VENTA`)

				if (levelCheck.isAtLevel && levelCheck.level.quality === 'STRONG') {
					confidence += 10
					logger.add(`   ✓ Agotamiento en nivel FUERTE → +10% confianza`)
				}
			} else if (phase3.dominantGroup === 'VENDEDORES') {
				decision = 'CALL'
				reason = phase3.maxStagnation >= 12 ? 'Agotamiento extremo de vendedores' : 'Agotamiento en nivel clave'
				confidence = 75
				logger.add(`   ✓ VENDEDORES agotados → COMPRA`)

				if (levelCheck.isAtLevel && levelCheck.level.quality === 'STRONG') {
					confidence += 10
					logger.add(`   ✓ Agotamiento en nivel FUERTE → +10% confianza`)
				}
			}
		} else {
			logger.add(`   ✗ Estancamiento sin nivel de apoyo → Ignorado (Tierra de Nadie)`)
		}
	}

	// JERARQUÍA 3: Aprovechamiento (Grupo B responde con fuerza)
	else if (exploitation !== 'NONE') {
		logger.add(``)
		logger.add(`🎯 REGLA 3: Aprovechamiento del Grupo Contrario`)
		logger.add(`   ${exploitation} aprovecharon la debilidad`)

		if (exploitation === 'COMPRADORES') {
			decision = 'CALL'
			reason = 'Compradores aprovecharon debilidad de vendedores'
			confidence = 80
			logger.add(`   ✓ COMPRADORES dominan → COMPRA`)
		} else {
			decision = 'PUT'
			reason = 'Vendedores aprovecharon debilidad de compradores'
			confidence = 80
			logger.add(`   ✓ VENDEDORES dominan → VENTA`)
		}
	}

	// JERARQUÍA 4: Continuidad de Fuerza Natural
	else if (
		phase1.dominantGroup === phase2.dominantGroup &&
		phase2.dominantGroup === phase3.dominantGroup &&
		!phase1.isWeak &&
		!phase2.isWeak &&
		!phase3.isWeak &&
		!levelCheck.isAtLevel
	) {
		logger.add(``)
		logger.add(`🎯 REGLA 4: Continuidad de Fuerza Natural`)
		logger.add(`   Las 3 fases muestran dominio de ${phase3.dominantGroup}`)
		logger.add(`   Sin irregularidades ni bloqueos`)

		if (phase3.dominantGroup === 'COMPRADORES') {
			decision = 'CALL'
			reason = 'Fuerza alcista sostenida sin bloqueos'
			confidence = 75
			logger.add(`   ✓ COMPRADORES fuertes → COMPRA`)
		} else {
			decision = 'PUT'
			reason = 'Fuerza bajista sostenida sin bloqueos'
			confidence = 75
			logger.add(`   ✓ VENDEDORES fuertes → VENTA`)
		}
	}

	// Si no hay decisión clara
	if (decision === 'WAIT') {
		logger.add(``)
		logger.add(`⚠️ Sin señal clara - Esperando mejor oportunidad`)
		logger.add(`   Razones:`)
		if (phase3.isWeak) logger.add(`   - Fase 3 muestra debilidad`)
		if (levelCheck.isAtLevel && decision === 'WAIT') logger.add(`   - Precio en nivel pero sin señal de reversión`)
		if (phase1.dominantGroup !== phase2.dominantGroup && exploitation === 'NONE') {
			logger.add(`   - Cambio de dominio sin aprovechamiento claro`)
		}
	}

	// ==========================================
	// STEP 7.5: REFUERZO POR PATRONES DE VELA
	// ==========================================
	// Se aplica DESPUÉS de tener una decisión base para que los refuerzos sean válidos
	if (decision !== 'WAIT') {
		// DOJI: cancela la operación por indecisión
		if (candlePatterns.includes('DOJI')) {
			logger.add('⚠️ DOJI detectado: indecisión, se cancela la operación')
			return { shouldOperate: false, direction: '', reason: 'Doji detectado (indecisión)', analysis: logger.getReport(), candles: candles.slice(-20) }
		}

		// Doble Techo/Suelo
		if (doubleTop && decision === 'PUT') { confidence += 15; logger.add('🔺 Doble Techo: +15% confianza') }
		if (doubleBottom && decision === 'CALL') { confidence += 15; logger.add('🔻 Doble Suelo: +15% confianza') }

		// Patrones de vela
		if (candlePatterns.includes('HAMMER') && decision === 'CALL') { confidence += 10; logger.add('🔨 HAMMER: +10%') }
		if (candlePatterns.includes('INVERTED_HAMMER') && decision === 'PUT') { confidence += 10; logger.add('🔨 INVERTED HAMMER: +10%') }
		if (candlePatterns.includes('PIN_BAR')) { confidence += 10; logger.add('📍 PIN BAR: +10%') }
		if (candlePatterns.includes('ENGULFING')) { confidence += 15; logger.add(decision === 'CALL' ? '🟩 ENGULFING alcista: +15%' : '🟥 ENGULFING bajista: +15%') }
		if (candlePatterns.includes('MARUBOZU')) {
			if ((decision === 'CALL' && closePrice > openPrice) || (decision === 'PUT' && closePrice < openPrice)) {
				confidence += 10; logger.add('⬆️ MARUBOZU: +10%')
			}
		}

		// Fibonacci: si el precio está en zona Fib 50% o 61.8%, suma confianza
		if (fibCheck.isAtFib && (fibCheck.zone.fibLevel === 0.500 || fibCheck.zone.fibLevel === 0.618)) {
			confidence += 10
			logger.add(`📌 Fibonacci ${(fibCheck.zone.fibLevel * 100).toFixed(0)}%: +10% confianza`)
		}

		// Secuencia de velas del mismo color
		const maxSeq = 4
		let bullishSeq = 0, bearishSeq = 0
		for (let i = candles.length - 1; i >= 0 && i >= candles.length - 10; i--) {
			if (candles[i].close > candles[i].open) { if (bearishSeq === 0) bullishSeq++; else break }
			else if (candles[i].close < candles[i].open) { if (bullishSeq === 0) bearishSeq++; else break }
			else break
		}
		if (bullishSeq >= maxSeq && decision === 'CALL') { confidence -= 15; logger.add(`⚠️ Secuencia alcista ${bullishSeq} velas: -15% (agotamiento)`) }
		if (bearishSeq >= maxSeq && decision === 'PUT') { confidence -= 15; logger.add(`⚠️ Secuencia bajista ${bearishSeq} velas: -15% (agotamiento)`) }
		if (sameColorSeq === 'BULLISH' && decision === 'CALL') { confidence += 5; logger.add('⏳ Secuencia alcista: +5%') }
		if (sameColorSeq === 'BEARISH' && decision === 'PUT') { confidence += 5; logger.add('⏳ Secuencia bajista: +5%') }

		// Mechas extremas
		if (mechaExtremaDetectada) { confidence = Math.max(0, confidence - 20); logger.add('⚠️ Mechas extremas: -20%') }

		// Falsos quiebres en nivel fuerte
		if (levels && levels.length > 0) {
			for (const lvl of levels) {
				if (lvl.quality !== 'STRONG') continue
				const recent10 = candles.slice(-10)
				const toquesArr = recent10.filter(c => Math.abs(c.max - lvl.price) < 0.00005).length
				const toquesAbj = recent10.filter(c => Math.abs(c.min - lvl.price) < 0.00005).length
				if (toquesArr >= 2 && decision === 'PUT') { confidence += 15; logger.add('🔄 Falsos quiebres en resistencia: +15%'); break }
				if (toquesAbj >= 2 && decision === 'CALL') { confidence += 15; logger.add('🔄 Falsos quiebres en soporte: +15%'); break }
			}
		}
	}

	// ==========================================
	// STEP 7.6: ZONA OBJETIVO (TARGET ZONE)
	// ==========================================
	// Identificar el nivel al que el precio "quiere ir" si operamos
	const targetZoneInfo = getTargetZone(closePrice, decision === 'WAIT' ? null : decision, levels)

	if (decision !== 'WAIT') {
		logger.add(``)
		logger.add(`[STEP 7.6] ZONA OBJETIVO`)
		logger.add(`─────────────────────────────────────────────────────────────`)

		if (targetZoneInfo.hasTarget) {
			logger.add(`Objetivo: ${targetZoneInfo.description}`)
			if (targetZoneInfo.hasSpace) {
				logger.add(`✓ Espacio suficiente hasta el objetivo (${targetZoneInfo.distancePips.toFixed(6)} pips)`)
				// Penalización adicional si el objetivo está cerca de un nivel fuerte
				const STRONG_LEVEL_DISTANCE = 0.00020; // 20 pips, ajustar según activo
				if (targetZoneInfo.closestStrongLevel && targetZoneInfo.closestStrongLevel.distance < STRONG_LEVEL_DISTANCE) {
					confidence = Math.max(0, confidence - 20);
					logger.add(`⚠️ Target muy cerca de nivel fuerte (${targetZoneInfo.closestStrongLevel.distance.toFixed(6)} pips). -20% confianza`);
				}
			} else {
				logger.add(`⚠️ Objetivo demasiado cercano (${targetZoneInfo.distancePips.toFixed(6)} pips). El precio puede rebotar antes.`)
				confidence = Math.max(0, confidence - 15)
				logger.add(`   -15% confianza por objetivo cercano`)
			}
		} else {
			logger.add(`Sin nivel bloqueante visible en dirección ${decision} → precio tiene espacio libre`)
		}
	}

	// ==========================================
	// STEP 8: FILTRO DE CONTEXTO DE MERCADO
	// ==========================================
	if (decision !== 'WAIT') {
		logger.add(``)
		logger.add(`[STEP 8] FILTRO DE CONTEXTO DE MERCADO`)
		logger.add(`─────────────────────────────────────────────────────────────`)

		const contextCheck = checkMarketContext(decision, candles, levels, trendInfo, closePrice)

		if (!contextCheck.allowed) {
			contextCheck.blocks.forEach(block => logger.add(`❌ ${block}`))
			decision = 'WAIT'
			reason = 'Bloqueado por contexto de mercado'
			confidence = 0
			logger.add(`✗ Operación CANCELADA por filtro de contexto`)
		} else {
			logger.add(`✓ Contexto de mercado favorable - Proceder`)
		}
	}

	// ==========================================
	// STEP 9: VALIDACIÓN Y AJUSTE FINAL
	// ==========================================
	if (decision !== 'WAIT') {
		logger.add(``)
		logger.add(`[STEP 9] VALIDACIÓN Y AJUSTE`)
		logger.add(`─────────────────────────────────────────────────────────────`)

		// Tendencia
		if ((decision === 'CALL' && trend === 'ALCISTA') || (decision === 'PUT' && trend === 'BAJISTA')) {
			confidence += 10
			logger.add(`✓ A favor de tendencia (${trend}) → +10% confianza`)
		}

		// Patrones en contra — penalización proporcional a la confianza del patrón
		const contraryPattern = patterns.find(p => p.prediction !== decision)
		if (contraryPattern) {
			const penalty = Math.round((contraryPattern.confidence || 0.6) * 40)
			confidence -= penalty
			logger.add(`⚠️ Patrón en contra (${contraryPattern.name}) → -${penalty}% confianza`)
			if (confidence < 60) {
				decision = 'WAIT'
				reason = 'Cancelado por conflicto con patrones'
				logger.add(`✗ Confianza insuficiente → CANCELADO`)
			}
		}

		// Secuencias
		if (config.strategy.sequences.enabled && decision !== 'WAIT') {
			const sequenceContext = detectCandleSequence(candles)
			if (sequenceContext.found) {
				logger.add(`Secuencia: ${sequenceContext.pattern} → Predicción: ${sequenceContext.nextPrediction}`)

				if (sequenceContext.nextPrediction === decision) {
					confidence += 10
					logger.add(`✓ Secuencia apoya decisión → +10% confianza`)
				} else if (sequenceContext.nextPrediction !== 'NEUTRAL') {
					confidence -= 20
					logger.add(`⚠️ Secuencia contradice → -20% confianza`)

					if (confidence < 60) {
						decision = 'WAIT'
						reason = `Cancelado por contradicción de secuencia (${sequenceContext.pattern})`
						logger.add(`✗ Confianza insuficiente → CANCELADO`)
					}
				}
			}
		}
	}

	// === GESTIÓN DE CONFIANZA: basada en resultados REALES de operaciones ===
	// global._botRealResults se actualiza desde operations/trade.js con el resultado real
	if (typeof global !== 'undefined' && global._botRealResults && global._botRealResults.length >= 5) {
		const recent = global._botRealResults.slice(-10)
		const score = recent.filter(r => r.win).length / recent.length
		if (score > 0.7) {
			confidence += 10
			logger.add('📈 Score reciente alto (resultados reales): +10%')
		} else if (score < 0.4) {
			confidence = Math.max(0, confidence - 10)
			logger.add('📉 Score reciente bajo (resultados reales): -10%')
		}
	}

	// Guard final: confianza mínima para operar
	if (decision !== 'WAIT' && confidence < config.strategy.minConfidence) {
		logger.add(`✗ Confianza insuficiente (${confidence}% < ${config.strategy.minConfidence}%) → CANCELADO`)
		decision = 'WAIT'
		reason = `Confianza insuficiente (${confidence}%)`
	}

		// ==========================================
	// RESULTADO FINAL
	// ==========================================
	logger.add(``)
	logger.add(`╔═══════════════════════════════════════════════════════════════╗`)
	logger.add(`║ DECISIÓN FINAL`)
	logger.add(`╚═══════════════════════════════════════════════════════════════╝`)
	logger.add(``)
	logger.add(`Operación: ${decision === 'WAIT' ? '❌ NO OPERAR' : `✅ ${decision}`}`)
	logger.add(`Razón: ${reason || 'Sin señal clara'}`)
	logger.add(`Confianza: ${confidence}%`)
	logger.add(``)

	return {
		shouldOperate: decision !== 'WAIT',
		direction: decision === 'WAIT' ? '' : decision,
		reason: reason,
		confidence: confidence,
		analysis: logger.getReport(),
		// Datos crudos para reporte detallado
		ticks: ticks,
		candles: candles.slice(-20), // Últimas 20 velas para contexto
		indicators: {
			trend,
			trendStrength: trendInfo.strength,
			levels: levels.map(l => ({ price: l.price, zoneTop: l.zoneTop, zoneBottom: l.zoneBottom, type: l.type, quality: l.quality, rejections: l.rejections, touches: l.touches, isWorn: l.isWorn, isFlipped: l.isFlipped })),
			targetZone: targetZoneInfo,
			levelCheck,
			patterns,
			whiplash: { type: whiplashType, direction: whiplashDirection, move: whiplashMove, velocity: whiplashVelocity },
			phases: {
				phase1: { ...phase1, ticks: phase1Ticks.length },
				phase2: { ...phase2, ticks: phase2Ticks.length },
				phase3: { ...phase3, ticks: phase3Ticks.length }
			},
			exploitation
		}
	}
}

module.exports = {
	analyzeStrategy
}