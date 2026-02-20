const config = require('../config.js')
const SimpleMutex = require('./mutex.js')

let candles = []
let ticks = []
let lastCandleId = null
let lastSaveCandleId = null
let cachedLevels = []  // Niveles de S/R cacheados — solo se recalculan en vela nueva
let lastStatusCandle = {}     // Volumen del último tick de la vela en curso (acumulado real)
let volumeEMA = null   // EMA de volumen de velas activas (se actualiza con cada vela nueva)
const VOLUME_EMA_PERIOD = 50
const VOLUME_EMA_K = 2 / (VOLUME_EMA_PERIOD + 1)
const VOLUME_EMA_MIN_ACTIVE = 10 // Mínimo de ticks para considerar vela "activa" (proxy de volumen)
const candleMutex = new SimpleMutex()
const candleMutexTick = new SimpleMutex()

async function loadInitialCandles(API, active) {
	try {
		const historicalCandles = await API.getCandles(
			active,
			parseInt(config.candleSize),
			parseInt(config.cantCandles),
			Date.now()
		)

		// Eliminar última vela (está en formación)
		// historicalCandles.pop()

		candles = historicalCandles.map(c => ({
			...c,
			direction: c.open < c.close ? 'ALCISTA' : (c.open > c.close ? 'BAJISTA' : 'NONE')
		}))

		console.log(`[CANDLES] Cargadas ${candles.length} velas en memoria`)
		// console.log('[CANDLES] Últimas 3 velas:', candles.slice(-3))
		console.log('[CANDLES] Últimas 3 velas:', candles.slice(-3).map(c => ({
			id: c.id,
			open: c.open,
			close: c.close,
			direction: c.direction
		})))

		return candles
	} catch (err) {
		throw new Error(`Error cargando velas iniciales: ${err.message}`)
	}
}

function addNewCandle(candle) {
	if (!candleMutex.lock()) {
		return false // Mutex ocupado, descartar
	}

	try {
		if (lastCandleId === null) {
			lastCandleId = candle.id
		}
		// Verificar si es una vela nueva
		if (lastCandleId === candle.id) {
			return false
		}

		lastCandleId = candle.id

		const newCandle = {
			...lastStatusCandle,
			direction: lastStatusCandle.open < lastStatusCandle.close ? 'ALCISTA' : (lastStatusCandle.open > lastStatusCandle.close ? 'BAJISTA' : 'NONE')
		}

		candles.push(newCandle)

		// Actualizar EMA de volumen con la vela nueva
		updateVolumeEMA(lastStatusCandle.volume)
		lastStatusCandle = {}
		console.log('[CANDLES] Nueva vela agregada:', newCandle)

		// Mantener solo las últimas cantCandles
		if (candles.length > parseInt(config.cantCandles)) {
			candles.shift()
		}

		return true
	} finally {
		candleMutex.unlock()
	}
}

function getCandles() {
	return [...candles]
}

function getLastCandles(count) {
	return candles.slice(-count)
}

function addNewTick(tick) {
	if (!candleMutexTick.lock()) {
		return false
	}

	try {
		// console.log('[TICK] Nuevo tick:', tick)
		ticks.push(tick)
		// console.log('ticks: ', ticks);

		return true
	} finally {
		candleMutexTick.unlock()
	}
}

function setLastStatusCandle(candle) {
	if (candle) lastStatusCandle = candle
}

function clearTicks() {
	ticks = []
	return
}

function getTicks() {
	return [...ticks]
}

function getCachedLevels() {
	return cachedLevels
}

function setCachedLevels(levels) {
	cachedLevels = levels
}

/**
 * Actualiza la EMA de volumen con el volumen de la vela más reciente.
 * Solo se actualiza si el volumen supera el mínimo de vela activa.
 */
function updateVolumeEMA(volume) {
	if (!volume || volume < VOLUME_EMA_MIN_ACTIVE) return
	if (volumeEMA === null) {
		volumeEMA = volume
	} else {
		volumeEMA = volume * VOLUME_EMA_K + volumeEMA * (1 - VOLUME_EMA_K)
	}
}

/** Retorna la EMA de volumen actual, o null si aún no hay datos. */
function getVolumeEMA() {
	return volumeEMA
}

module.exports = {
	loadInitialCandles,
	addNewCandle,
	getCandles,
	getLastCandles,
	addNewTick,
	clearTicks,
	getTicks,
	getCachedLevels,
	setCachedLevels,
	setLastStatusCandle,
	updateVolumeEMA,
	getVolumeEMA
}
