const { isDoubleTop, isDoubleBottom, countSameColor } = require('../indicators/patterns-advanced.js')
const config = require('../config.js')
const { checkLevelProximity, getTargetZone } = require('../indicators/levels.js')
const { getTrend } = require('../indicators/trend.js')
const { detectPatterns } = require('../indicators/patterns.js')
const { detectCandlePatterns } = require('../indicators/candle-patterns.js')
const { detectDangerousMarket } = require('../indicators/dangerous-markets.js')
const { detectCandleSequence } = require('../indicators/sequences.js')
const { checkMarketContext } = require('../indicators/market-context.js')

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
	// Considerar las últimas N velas (ejemplo: 10)
	const VOLUME_LOOKBACK = 10;
	const MIN_AVG_VOLUME = 100; // Ajustar según el activo
	if (candles.length >= VOLUME_LOOKBACK) {
		const recentVolumes = candles.slice(-VOLUME_LOOKBACK).map(c => c.volume || 0);
		const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / VOLUME_LOOKBACK;
		logger.add(`[VOLUMEN] Promedio últimas ${VOLUME_LOOKBACK} velas: ${avgVolume.toFixed(2)}`);
		if (avgVolume < MIN_AVG_VOLUME) {
			logger.add(`[ABORT] Volumen bajo (${avgVolume.toFixed(2)} < ${MIN_AVG_VOLUME}) - Mercado sin interés real. No operar.`);
			return {
				shouldOperate: false,
				direction: '',
				reason: 'Volumen bajo',
				analysis: logger.getReport(),
				candles: candles.slice(-20)
			}
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

	// Dividir en 3 fases según INFO_ESTRATEGIA.md
	const phase1End = Math.floor(ticks.length * 0.5) // Primeros 30s
	const phase2Start = phase1End
	const phase2End = ticks.length - 15 // Hasta 15s antes del final
	const phase3Start = phase2End // Últimos 15s

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

	// Clasificar latigazo según INFO_ESTRATEGIA.md
	if (Math.abs(whiplashMove) > 0.000150 && whiplashVelocity > 0.000010) {
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

	// Verificar si un grupo aprovechó la debilidad del otro
	if (phase1.dominantGroup !== phase2.dominantGroup) {
		const phase1Weak = phase1.isWeak
		const phase2Strong = !phase2.isWeak && phase2.velocity > phase1.velocity

		if (phase1Weak && phase2Strong) {
			exploitation = phase2.dominantGroup
			logger.add(`✓ ${phase2.dominantGroup} APROVECHARON la debilidad de ${phase1.dominantGroup}`)
			logger.add(`   Velocidad Fase 1: ${phase1.velocity.toFixed(6)} pips/tick`)
			logger.add(`   Velocidad Fase 2: ${phase2.velocity.toFixed(6)} pips/tick`)
			logger.add(`   Ratio: ${(phase2.velocity / phase1.velocity).toFixed(2)}x más rápido`)
		} else {
			logger.add(`Sin aprovechamiento claro (ambos grupos con fuerza similar)`)
		}
	} else {
		logger.add(`Sin cambio de dominio entre fases`)
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

	// ==========================================
	// LÓGICA DE DECISIÓN (Jerarquía LMTA)
	// ==========================================
	logger.add(``)
	logger.add(`[STEP 7] LÓGICA DE DECISIÓN`)
	logger.add(`═════════════════════════════════════════════════════════════`)

	let decision = 'WAIT'
	let confidence = 0
	let reason = ''


	// FILTRO Y REFUERZO SEGÚN PATRONES DE VELA Y AVANZADOS
	// 1. DOJI: indecisión, cancelar operación
	if (candlePatterns.includes('DOJI')) {
		logger.add('⚠️ DOJI detectado: indecisión, se cancela la operación')
		return {
			shouldOperate: false,
			direction: '',
			reason: 'Doji detectado (indecisión)',
			analysis: logger.getReport(),
			candles: candles.slice(-20)
		}
	}
	// DOBLE TECHO: refuerza venta si la señal es PUT
	if (doubleTop && decision === 'PUT') {
		confidence += 15
		logger.add('🔺 Doble Techo: refuerza venta (+15% confianza)')
	}
	// DOBLE SUELO: refuerza compra si la señal es CALL
	if (doubleBottom && decision === 'CALL') {
		confidence += 15
		logger.add('🔻 Doble Suelo: refuerza compra (+15% confianza)')
	}

	// Secuencia de velas del mismo color: penaliza si es demasiado larga (agotamiento)
	const maxSeq = 4; // penalizar si hay 5 o más velas del mismo color
	let bullishSeq = 0, bearishSeq = 0;
	for (let i = candles.length - 1; i >= 0 && i >= candles.length - 10; i--) {
		if (candles[i].close > candles[i].open) {
			if (bearishSeq === 0) bullishSeq++;
			else break;
		} else if (candles[i].close < candles[i].open) {
			if (bullishSeq === 0) bearishSeq++;
			else break;
		} else break;
	}
	if (bullishSeq >= maxSeq) {
		confidence -= 15;
		logger.add(`⚠️ Secuencia alcista de ${bullishSeq} velas: penaliza compra (-15% confianza) por posible agotamiento`);
	} else if (bearishSeq >= maxSeq) {
		confidence -= 15;
		logger.add(`⚠️ Secuencia bajista de ${bearishSeq} velas: penaliza venta (-15% confianza) por posible agotamiento`);
	} else if (sameColorSeq === 'BULLISH' && decision === 'CALL') {
		confidence += 5;
		logger.add('⏳ Secuencia alcista: refuerza compra (+5% confianza)');
	} else if (sameColorSeq === 'BEARISH' && decision === 'PUT') {
		confidence += 5;
		logger.add('⏳ Secuencia bajista: refuerza venta (+5% confianza)');
	}

	// LÓGICA DE MEJOR PUNTO DE ENTRADA (hasta el segundo 25)
	// Si se detecta doble techo/suelo o secuencia larga, buscar mejor punto de entrada
	let buscarMejorEntrada = false;
	let motivoMejorEntrada = '';
	if ((doubleTop && decision === 'PUT')) {
		buscarMejorEntrada = true;
		motivoMejorEntrada = 'doble techo';
	} else if ((doubleBottom && decision === 'CALL')) {
		buscarMejorEntrada = true;
		motivoMejorEntrada = 'doble suelo';
	} else if (bullishSeq >= maxSeq && decision === 'PUT') {
		buscarMejorEntrada = true;
		motivoMejorEntrada = 'agotamiento alcista';
	} else if (bearishSeq >= maxSeq && decision === 'CALL') {
		buscarMejorEntrada = true;
		motivoMejorEntrada = 'agotamiento bajista';
	}
	if (buscarMejorEntrada) {
		logger.add(`⏳ Buscar mejor punto de entrada hasta el segundo 25 por ${motivoMejorEntrada}`);
	}
	// 2. HAMMER: refuerza compra si la señal es CALL
	if (candlePatterns.includes('HAMMER') && decision === 'CALL') {
		confidence += 10
		logger.add('🔨 HAMMER detectado: refuerza compra (+10% confianza)')
	}
	// 3. INVERTED_HAMMER: refuerza venta si la señal es PUT
	if (candlePatterns.includes('INVERTED_HAMMER') && decision === 'PUT') {
		confidence += 10
		logger.add('🔨 INVERTED HAMMER detectado: refuerza venta (+10% confianza)')
	}
	// 4. PIN BAR: refuerza la dirección opuesta a la mecha dominante
	if (candlePatterns.includes('PIN_BAR')) {
		// Si la señal es CALL y la vela es pin bar alcista, refuerza
		if (decision === 'CALL') {
			confidence += 10
			logger.add('📍 PIN BAR alcista detectado: refuerza compra (+10% confianza)')
		} else if (decision === 'PUT') {
			confidence += 10
			logger.add('📍 PIN BAR bajista detectado: refuerza venta (+10% confianza)')
		}
	}
	// 5. ENGULFING: refuerza la dirección del patrón
	if (candlePatterns.includes('ENGULFING')) {
		// Si la señal es CALL y el patrón es envolvente alcista, refuerza
		if (decision === 'CALL') {
			confidence += 15
			logger.add('🟩 ENGULFING alcista detectado: refuerza compra (+15% confianza)')
		} else if (decision === 'PUT') {
			confidence += 15
			logger.add('🟥 ENGULFING bajista detectado: refuerza venta (+15% confianza)')
		}
	}
	// 6. MARUBOZU: refuerza la dirección de la vela
	if (candlePatterns.includes('MARUBOZU')) {
		if (decision === 'CALL' && closePrice > openPrice) {
			confidence += 10
			logger.add('⬆️ MARUBOZU alcista detectado: refuerza compra (+10% confianza)')
		} else if (decision === 'PUT' && closePrice < openPrice) {
			confidence += 10
			logger.add('⬇️ MARUBOZU bajista detectado: refuerza venta (+10% confianza)')
		}
	}

	// Penalización por mechas extremas
	if (mechaExtremaDetectada) {
		confidence = Math.max(0, confidence - 20);
		logger.add('⚠️ Penalización: Mechas extremas recientes (-20% confianza)');
	}
	// === SECUENCIAS DE FALSOS QUIEBRES ===
	// Detectar si hubo varios intentos fallidos de romper un nivel
	// Simplificado: contar cuántas veces el precio tocó un nivel fuerte sin romperlo en las últimas N velas
	const FALSO_QUIEBRE_LOOKBACK = 10;
	const FALSO_QUIEBRE_MIN = 2;
	let falsoQuiebreDireccion = null;
	if (levels && levels.length > 0 && candles.length >= FALSO_QUIEBRE_LOOKBACK) {
		const recentCandles = candles.slice(-FALSO_QUIEBRE_LOOKBACK);
		for (const lvl of levels) {
			if (lvl.quality === 'STRONG') {
				let toquesArriba = 0, toquesAbajo = 0;
				for (const c of recentCandles) {
					if (Math.abs(c.max - lvl.price) < 0.00005) toquesArriba++;
					if (Math.abs(c.min - lvl.price) < 0.00005) toquesAbajo++;
				}
				if (toquesArriba >= FALSO_QUIEBRE_MIN) falsoQuiebreDireccion = 'RESISTENCIA';
				if (toquesAbajo >= FALSO_QUIEBRE_MIN) falsoQuiebreDireccion = 'SOPORTE';
			}
		}
	}

	// Si la señal va en contra de los falsos quiebres, aumentar confianza
	if (falsoQuiebreDireccion && ((falsoQuiebreDireccion === 'RESISTENCIA' && decision === 'PUT') || (falsoQuiebreDireccion === 'SOPORTE' && decision === 'CALL'))) {
		confidence += 15;
		logger.add('🔄 Secuencia de falsos quiebres detectada: aumenta confianza (+15%)');
	}
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
	// STEP 7.5: ZONA OBJETIVO (TARGET ZONE)
	// ==========================================
	// Identificar el nivel al que el precio "quiere ir" si operamos
	const targetZoneInfo = getTargetZone(closePrice, decision === 'WAIT' ? null : decision, levels)

	if (decision !== 'WAIT') {
		logger.add(``)
		logger.add(`[STEP 7.5] ZONA OBJETIVO`)
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

		// Patrones en contra
		const contraryPattern = patterns.find(p => p.prediction !== decision)
		if (contraryPattern) {
			confidence -= 40
			logger.add(`⚠️ Patrón en contra (${contraryPattern.name}) → -40% confianza`)
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

	// === GESTIÓN DINÁMICA DE CONFIANZA ===
	// Simulación: usar un array global global._botResults para score reciente
	if (typeof global !== 'undefined') {
		global._botResults = global._botResults || [];
		// Guardar resultado actual si hay decisión
		if (decision !== 'WAIT') {
			global._botResults.push({
				ts: Date.now(),
				result: confidence >= 60 // éxito si confianza alta
			});
			// Limitar a las últimas 20 operaciones
			if (global._botResults.length > 20) global._botResults = global._botResults.slice(-20);
		}
		// Calcular score de las últimas N
		const recent = global._botResults.slice(-10);
		const score = recent.filter(r => r.result).length / (recent.length || 1);
		if (recent.length >= 5) {
			if (score > 0.7) {
				confidence += 10;
				logger.add('📈 Score reciente alto: +10% confianza');
			} else if (score < 0.4) {
				confidence = Math.max(0, confidence - 10);
				logger.add('📉 Score reciente bajo: -10% confianza');
			}
		}
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