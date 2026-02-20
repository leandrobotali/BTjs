const config = require('./config.js')
const { loadActiveSchedule } = require('./core/active.js')
const { loadInitialCandles, addNewCandle, getCandles, addNewTick, clearTicks, getTicks, setCachedLevels, setLastVolume } = require('./core/candles.js')
const { getLevels } = require('./indicators/levels.js')
const { analyzeStrategy } = require('./strategy/strategy-core.js')
const { executeOperation, isOperating } = require('./operations/trade.js')
const { addOperation, checkAndSaveHourly, addSkipped } = require('./reports/manager.js')
const SimpleMutex = require('./core/mutex.js')
const { checkActiveBeforeOperation } = require('./core/active.js')

const callbackMutex = new SimpleMutex()

async function initialize(API) {
	try {
		console.log('\n[INIT] Cargando información del activo...')
		await loadActiveSchedule(API)

		console.log('[INIT] Cargando velas históricas...')
		await loadInitialCandles(API, config.activePrincipal)

		console.log('[INIT] Suscribiéndose a generación de velas...')
		API.onCandleGenerate(config.activePrincipal, async (candle) => {
			await handleNewCandle(API, candle)
		})

		console.log('[INIT] Bot inicializado correctamente\n')
	} catch (err) {
		throw new Error(`Error en inicialización: ${err.message}`)
	}
}

async function handleNewCandle(API, candle) {
	if (!callbackMutex.lock()) {
		return
	}

	let newCandle = false
	try {
		// checkAndSaveHourly() - Deprecated: Se guarda por operación en tiempo real
		console.log(candle);

		const added = addNewCandle(candle)
		if (!added) {
			/* si no se agrego una nueva vela, almacenamos el tick en el array  */
			addNewTick(candle.close)
			setLastVolume(candle.volume) // guardar volumen del ultimo tick de la vela en curso
		} else {
			newCandle = true
			/* si se agrego una nueva vela, procesamos la operación */
			// console.log('candleee : ', candle);

			console.log(`\n[CANDLE] Nueva vela: ${candle.id} | ${candle.open} -> ${candle.close}`)
			console.log('[STRATEGY] Calculando niveles S/R...')

			// Calcular y cachear niveles S/R una sola vez por vela nueva
			const currentCandles = getCandles()
			const levels = getLevels(currentCandles)
			setCachedLevels(levels)
			console.log(`[LEVELS] ${levels.length} zonas activas calculadas`)

			console.log('[STRATEGY] Analizando...')
			const decision = await analyzeStrategy(currentCandles, getTicks(), levels)

			console.log('-DECISION-', {
				shouldOperate: decision.shouldOperate,
				reason: decision.reason,
				analysis: decision.analysis
			})

			if (isOperating()) {
				console.log('[OPERATION] Operación en curso, no se ejecuta nueva operación')
				return
			}

			// Verificar que el activo esté abierto
			const canOperate = await checkActiveBeforeOperation(API)
			if (!canOperate) {
				console.log('[OPERATION] No se puede operar, el activo no está disponible')
				return
			}

			if (decision.shouldOperate) {
				executeOperation(API, decision)
			} else {
				console.log('[DECISION] No se opera en esta vela')
				addSkipped(decision)
			}
		}
	} catch (err) {
		console.error('[ERROR] Error procesando vela:', err.message)
		console.error('[ERROR] Stack:', err.stack)
	} finally {
		if (newCandle) clearTicks()
		callbackMutex.unlock()
	}
}

module.exports = initialize
