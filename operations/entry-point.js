/**
 * entry-point.js - Sistema de Espera de Punto de Entrada
 * 
 * MEJORA 6: Cuando el bot decide operar, NO ejecuta inmediatamente.
 * Espera hasta 25 segundos para que el precio retroceda al 50% de la mecha
 * de la vela anterior, buscando un mejor punto de entrada.
 * 
 * Regla de cierre:
 * - Operación antes del segundo 30 → Cierra en la vela actual (segundo 60)
 * - Operación después del segundo 30 → Cierra en la vela siguiente
 */

// Estado del sistema de espera
let isWaiting = false
let storedDecision = null
let entryStartTime = null
let targetPrice = null
const MAX_WAIT_SECONDS = 25

/**
 * Inicia el estado de espera de punto de entrada
 * @param {Object} decision - Decisión de estrategia (shouldOperate, direction, operationType, etc.)
 * @param {Object} previousCandle - Vela anterior cerrada
 */
function startWaitingForEntry(decision, previousCandle) {
	isWaiting = true
	storedDecision = decision
	entryStartTime = Date.now()
	
	const operationType = decision.operationType || 'REVERSAL' // Por defecto reversión
	
	if (operationType === 'REVERSAL') {
		// REVERSIÓN: 50% de la MECHA
		if (decision.direction === 'CALL') {
			// Para CALL: esperar retroceso al 50% de la mecha inferior
			const bodyBottom = Math.min(previousCandle.open, previousCandle.close)
			const wickBottom = previousCandle.min
			const wickSize = bodyBottom - wickBottom
			
			if (wickSize > 0) {
				targetPrice = wickBottom + wickSize * 0.5
				console.log(`[ENTRY_POINT] REVERSIÓN CALL - Precio objetivo: ${targetPrice.toFixed(6)} (50% mecha inferior)`)
				console.log(`[ENTRY_POINT] Rango mecha: [${wickBottom.toFixed(6)}, ${bodyBottom.toFixed(6)}]`)
			} else {
				// Sin mecha, usar el mínimo de la vela
				targetPrice = wickBottom
				console.log(`[ENTRY_POINT] REVERSIÓN CALL - Sin mecha, usando mínimo: ${targetPrice.toFixed(6)}`)
			}
		} else if (decision.direction === 'PUT') {
			// Para PUT: esperar retroceso al 50% de la mecha superior
			const bodyTop = Math.max(previousCandle.open, previousCandle.close)
			const wickTop = previousCandle.max
			const wickSize = wickTop - bodyTop
			
			if (wickSize > 0) {
				targetPrice = bodyTop + wickSize * 0.5
				console.log(`[ENTRY_POINT] REVERSIÓN PUT - Precio objetivo: ${targetPrice.toFixed(6)} (50% mecha superior)`)
				console.log(`[ENTRY_POINT] Rango mecha: [${bodyTop.toFixed(6)}, ${wickTop.toFixed(6)}]`)
			} else {
				// Sin mecha, usar el máximo de la vela
				targetPrice = wickTop
				console.log(`[ENTRY_POINT] REVERSIÓN PUT - Sin mecha, usando máximo: ${targetPrice.toFixed(6)}`)
			}
		}
	} else if (operationType === 'CONTINUITY') {
		// CONTINUIDAD: 25% del CUERPO
		const bodyTop = Math.max(previousCandle.open, previousCandle.close)
		const bodyBottom = Math.min(previousCandle.open, previousCandle.close)
		const bodySize = bodyTop - bodyBottom
		
		if (decision.direction === 'CALL') {
			// Para CALL: esperar retroceso al 25% del cuerpo (desde arriba)
			targetPrice = bodyTop - bodySize * 0.25
			console.log(`[ENTRY_POINT] CONTINUIDAD CALL - Precio objetivo: ${targetPrice.toFixed(6)} (25% cuerpo)`)
			console.log(`[ENTRY_POINT] Rango cuerpo: [${bodyBottom.toFixed(6)}, ${bodyTop.toFixed(6)}]`)
		} else if (decision.direction === 'PUT') {
			// Para PUT: esperar retroceso al 25% del cuerpo (desde abajo)
			targetPrice = bodyBottom + bodySize * 0.25
			console.log(`[ENTRY_POINT] CONTINUIDAD PUT - Precio objetivo: ${targetPrice.toFixed(6)} (25% cuerpo)`)
			console.log(`[ENTRY_POINT] Rango cuerpo: [${bodyBottom.toFixed(6)}, ${bodyTop.toFixed(6)}]`)
		}
	}
}

/**
 * Verifica si el precio actual alcanzó el punto de entrada
 * @param {number} currentPrice - Precio actual del tick
 * @returns {Object} { reached: boolean, shouldAbort: boolean, reason: string, details: Object }
 */
function checkEntryPoint(currentPrice) {
	if (!isWaiting) {
		return { reached: false, shouldAbort: false }
	}
	
	const elapsedSeconds = (Date.now() - entryStartTime) / 1000
	
	// Timeout: se acabó el tiempo de espera (25 segundos)
	if (elapsedSeconds >= MAX_WAIT_SECONDS) {
		return {
			reached: false,
			shouldAbort: true,
			reason: `⚠️ Precio no alcanzó punto de entrada protector (timeout ${MAX_WAIT_SECONDS}s)`,
			details: {
				targetPrice: targetPrice.toFixed(6),
				currentPrice: currentPrice.toFixed(6),
				elapsed: `${elapsedSeconds.toFixed(1)} segundos`,
				operationType: 'TIMEOUT'
			}
		}
	}
	
	// Verificar si el precio alcanzó el objetivo
	const tolerance = 0.000020 // 2 pips de tolerancia
	let priceReached = false
	
	if (storedDecision.direction === 'CALL') {
		// Para CALL: precio debe bajar hasta el objetivo (o más abajo)
		priceReached = currentPrice <= targetPrice + tolerance
	} else if (storedDecision.direction === 'PUT') {
		// Para PUT: precio debe subir hasta el objetivo (o más arriba)
		priceReached = currentPrice >= targetPrice - tolerance
	}
	
	if (priceReached) {
		console.log(`[ENTRY_POINT] ✓ Precio alcanzó punto de entrada: ${currentPrice.toFixed(6)} (objetivo: ${targetPrice.toFixed(6)})`)
		console.log(`[ENTRY_POINT] Tiempo transcurrido: ${elapsedSeconds.toFixed(1)} segundos`)
		return {
			reached: true,
			shouldAbort: false,
			details: {
				targetPrice: targetPrice.toFixed(6),
				currentPrice: currentPrice.toFixed(6),
				elapsed: `${elapsedSeconds.toFixed(1)} segundos`,
				operationType: 'ENTRY_POINT_REACHED'
			}
		}
	}
	
	// Aún esperando
	return { reached: false, shouldAbort: false }
}

/**
 * Retorna la decisión almacenada
 * @returns {Object|null}
 */
function getStoredDecision() {
	return storedDecision
}

/**
 * Verifica si está esperando punto de entrada
 * @returns {boolean}
 */
function isWaitingForEntry() {
	return isWaiting
}

/**
 * Resetea el estado de espera
 */
function resetEntryPointState() {
	isWaiting = false
	storedDecision = null
	entryStartTime = null
	targetPrice = null
}

module.exports = {
	startWaitingForEntry,
	checkEntryPoint,
	getStoredDecision,
	isWaitingForEntry,
	resetEntryPointState
}
