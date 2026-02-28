/**
 * zone-z.js - Detector de Zonas Z Institucionales
 * 
 * MEJORA 8: Detecta zonas entre mecha y cuerpo de velas grandes (>1.5x promedio)
 * que indican inyecciones de capital institucional.
 * 
 * Mantiene las últimas 5 zonas activas, se invalidan después de 2 toques.
 */

const config = require('../config.js')

// Buffer de Zonas Z activas (máximo 5)
let zonesZBuffer = []
const MAX_ZONES_Z = 5

/**
 * Actualiza el buffer de Zonas Z con la última vela cerrada
 * @param {Array} candles - velas históricas
 * @param {number} currentPrice - precio actual
 */
function updateZoneZBuffer(candles, currentPrice) {
	if (candles.length < 20) return

	// Calcular promedio de las últimas 20 velas
	const recent20 = candles.slice(-20)
	const avgBody = recent20.reduce((s, c) => s + Math.abs(c.close - c.open), 0) / 20
	const avgWick = recent20.reduce((s, c) => s + Math.max(c.max - Math.max(c.open, c.close), Math.min(c.open, c.close) - c.min), 0) / 20
	const avgSize = Math.max(avgBody, avgWick)

	// Detectar secuencia de 3+ velas grandes consecutivas con cierres en extremos
	const MIN_SEQUENCE = 3
	const recentCandles = candles.slice(-5) // Analizar últimas 5 velas para detectar secuencias
	
	let largeSequence = []
	let sequenceDirection = null
	
	for (const candle of recentCandles) {
		const bodySize = Math.abs(candle.close - candle.open)
		const upperWick = candle.max - Math.max(candle.open, candle.close)
		const lowerWick = Math.min(candle.open, candle.close) - candle.min
		const maxWick = Math.max(upperWick, lowerWick)
		
		const isLargeCandle = bodySize > avgSize * 1.5 || maxWick > avgSize * 1.5
		
		// Verificar cierre en extremos (cerca de máximo o mínimo)
		const range = candle.max - candle.min
		const closeNearExtreme = range > 0 && (
			Math.abs(candle.close - candle.max) < range * 0.15 || // Cierre cerca del máximo (15%)
			Math.abs(candle.close - candle.min) < range * 0.15    // Cierre cerca del mínimo (15%)
		)
		
		if (isLargeCandle && closeNearExtreme) {
			const direction = candle.close > candle.open ? 'ALCISTA' : 'BAJISTA'
			
			// Verificar consistencia de dirección (permitir 1 vela diferente)
			if (sequenceDirection === null || sequenceDirection === direction) {
				sequenceDirection = direction
				largeSequence.push(candle)
			}
		}
	}

	// Si hay secuencia de 3+ velas grandes, crear Zona Z en la PRIMERA vela
	if (largeSequence.length >= MIN_SEQUENCE) {
		const firstCandle = largeSequence[0]
		const direction = sequenceDirection
		
		// Crear Zona Z entre mecha y cuerpo de la PRIMERA vela del impulso
		let zoneZ
		if (direction === 'ALCISTA') {
			// Zona Z en la mecha inferior (donde compraron institucionales)
			const bodyBottom = Math.min(firstCandle.open, firstCandle.close)
			zoneZ = {
				price: firstCandle.min,
				zoneTop: bodyBottom,
				zoneBottom: firstCandle.min,
				direction: 'ALCISTA',
				candleIndex: candles.length - MIN_SEQUENCE,
				touches: 0,
				sequenceLength: largeSequence.length,
				createdAt: new Date().toISOString()
			}
		} else {
			// Zona Z en la mecha superior (donde vendieron institucionales)
			const bodyTop = Math.max(firstCandle.open, firstCandle.close)
			zoneZ = {
				price: firstCandle.max,
				zoneTop: firstCandle.max,
				zoneBottom: bodyTop,
				direction: 'BAJISTA',
				candleIndex: candles.length - MIN_SEQUENCE,
				touches: 0,
				sequenceLength: largeSequence.length,
				createdAt: new Date().toISOString()
			}
		}

		// Verificar que no exista ya una zona similar
		const alreadyExists = zonesZBuffer.some(z => 
			Math.abs(z.price - zoneZ.price) < 0.000050 && z.direction === zoneZ.direction
		)
		
		if (!alreadyExists) {
			// Agregar al buffer (mantener solo las últimas 5)
			zonesZBuffer.push(zoneZ)
			if (zonesZBuffer.length > MAX_ZONES_Z) {
				zonesZBuffer.shift()
			}

			console.log(`[ZONE_Z] Nueva Zona Z detectada: ${direction} @ ${zoneZ.price.toFixed(6)} [${zoneZ.zoneBottom.toFixed(6)}, ${zoneZ.zoneTop.toFixed(6)}] (${largeSequence.length} velas)`)
		}
	}

	// Actualizar toques y eliminar zonas invalidadas (>2 toques)
	zonesZBuffer = zonesZBuffer.filter(z => {
		const inZone = currentPrice >= z.zoneBottom && currentPrice <= z.zoneTop
		if (inZone) {
			z.touches++
			console.log(`[ZONE_Z] Toque en Zona Z ${z.direction} @ ${z.price.toFixed(6)} (${z.touches} toques)`)
		}
		return z.touches < 2 // Invalidar después de 2 toques
	})
}

/**
 * Verifica si el precio actual está en una Zona Z
 * @param {number} price - precio actual
 * @returns {{ isAtZoneZ: boolean, zone: Object|null }}
 */
function checkZoneZProximity(price) {
	const tolerance = 0.000050 // 5 pips

	for (const zone of zonesZBuffer) {
		const inZone = price >= zone.zoneBottom - tolerance && price <= zone.zoneTop + tolerance
		if (inZone) {
			return { isAtZoneZ: true, zone }
		}
	}

	return { isAtZoneZ: false, zone: null }
}

/**
 * Retorna las Zonas Z activas
 * @returns {Array}
 */
function getActiveZonesZ() {
	return [...zonesZBuffer]
}

/**
 * Limpia el buffer de Zonas Z (usado en desconexión)
 */
function clearZonesZ() {
	zonesZBuffer = []
	console.log('[ZONE_Z] Buffer limpiado')
}

module.exports = {
	updateZoneZBuffer,
	checkZoneZProximity,
	getActiveZonesZ,
	clearZonesZ
}
