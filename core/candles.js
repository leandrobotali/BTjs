const config = require('../config.js')
const SimpleMutex = require('./mutex.js')

let lastCandleId = null
let lastStatusCandle = {}     // Volumen del último tick de la vela en curso
let volumeEMA = null   // EMA de volumen
const VOLUME_EMA_PERIOD = 50
const VOLUME_EMA_K = 2 / (VOLUME_EMA_PERIOD + 1)
const VOLUME_EMA_MIN_ACTIVE = 10
const candleMutex = new SimpleMutex()

async function loadInitialCandles(API, active) {
	// [OBSOLETO] El nuevo motor (micro-dinámica) no requiere velas históricas pre-cargadas.
	// Se conserva la firma para compatibilidad de inicialización, pero no hace request pesado.
	console.log(`[CANDLES] Precarga de historia de velas deshabilitada (Se usa tick-window dinámico).`)
	return []
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

		// Actualizar EMA de volumen con la vela completada
		updateVolumeEMA(lastStatusCandle.volume)

		console.log(`[CANDLES] Límite de Vela cerrado. Nueva vela en marcha.`)
		lastStatusCandle = {}

		return true
	} finally {
		candleMutex.unlock()
	}
}

function setLastStatusCandle(candle) {
	if (candle) lastStatusCandle = candle
}

function clearCandles() {
	lastCandleId = null
	lastStatusCandle = {}
	volumeEMA = null
	console.log('[CANDLES] Estado de velas en memoria fue limpiado.')
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
	setLastStatusCandle,
	updateVolumeEMA,
	getVolumeEMA,
	clearCandles
}
