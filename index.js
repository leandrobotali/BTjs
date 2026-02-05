const config = require('./config.js')
const { loadActiveSchedule } = require('./core/active.js')
const { loadInitialCandles, addNewCandle, getCandles, addNewTick, clearTicks, getTicks } = require('./core/candles.js')
const { analyzeStrategy } = require('./strategy/strategy-core.js')
const { executeOperation, isOperating } = require('./operations/trade.js')
const { addOperation, checkAndSaveHourly } = require('./reports/manager.js')
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

	try {
		// checkAndSaveHourly() - Deprecated: Se guarda por operación en tiempo real

		const added = addNewCandle(candle)
		if (!added) {
			/* si no se agrego una nueva vela, almacenamos el tick en el array  */
			addNewTick(candle.close)
		} else {
			/* si se agrego una nueva vela, procesamos la operación */
			// console.log('candleee : ', candle);

			console.log(`\n[CANDLE] Nueva vela: ${candle.id} | ${candle.open} -> ${candle.close}`)
			console.log('[STRATEGY] Analizando...')

			const decision = await analyzeStrategy(getCandles(), getTicks())
			console.log('decision : ', {
				shouldOperate: decision.shouldOperate,
				direction: decision.direction,
				amount: decision.amount,
				reason: decision.reason,
				analysis: decision.analysis
			});

			clearTicks()

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
			}
		}
	} catch (err) {
		console.error('[ERROR] Error procesando vela:', err.message)
		console.error('[ERROR] Stack:', err.stack)
	} finally {
		callbackMutex.unlock()
	}
}

module.exports = initialize
