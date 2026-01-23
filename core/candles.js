const config = require('../config.js')
const SimpleMutex = require('./mutex.js')

let candles = []
let ticks = []
let lastCandleId = null
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
		if(lastCandleId === null){
			lastCandleId = candle.id
		}
		// Verificar si es una vela nueva
		if (lastCandleId === candle.id) {
			return false
		}
		
		lastCandleId = candle.id
		
		const newCandle = {
			...candle,
			direction: candle.open < candle.close ? 'ALCISTA' : (candle.open > candle.close ? 'BAJISTA' : 'NONE')
		}
		
		candles.push(newCandle)
		
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
		ticks.push(tick)
		return true
	} finally {
		candleMutexTick.unlock()
	}
}

function clearTicks() {
	ticks = []
	return
}

function getTicks() {
	return [...ticks]
}

module.exports = {
	loadInitialCandles,
	addNewCandle,
	getCandles,
	getLastCandles,
	addNewTick,
	clearTicks,
	getTicks
}
