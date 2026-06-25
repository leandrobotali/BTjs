const config = require('./config.js')
const { loadActiveSchedule } = require('./core/active.js')
const { loadInitialCandles, addNewCandle, getCandles, addNewTick, clearTicks, setLastStatusCandle } = require('./core/candles.js')
const { analyzeStrategy } = require('./strategy/strategy-core.js')
const { executeOperation, isOperating } = require('./operations/trade.js')
const { addOperation, addSkipped, printStats, reloadStatsFromFiles } = require('./reports/manager.js')
const SimpleMutex = require('./core/mutex.js')
const { checkActiveBeforeOperation } = require('./core/active.js')
const { initScheduler, resetWatchdog } = require('./core/scheduler.js')
const { loadState } = require('./operations/money-management.js')

const callbackMutex = new SimpleMutex()

async function initialize(API) {
	try {
		console.log('\n[INIT] Inicializando Peter Trend 1.0...')

		// Cargar estado de dinero y estadísticas previas
		loadState()
		await reloadStatsFromFiles()

		const shouldContinue = await initScheduler(API, connectMarket)

		if (!shouldContinue) {
			console.log('[INIT] ⏸️ Mercado cerrado - Bot en espera (Monitor activo)')
			return
		}

		await connectMarket(API)
	} catch (err) {
		throw new Error(`Error en inicialización: ${err.message}`)
	}
}

async function connectMarket(API) {
	console.log('\n[INIT] Cargando activo:', config.activePrincipal)

	// Aumentado a 90s para manejar lentitud del Broker
	const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout en conexión con el Broker (90s)')), ms))

	try {
		await Promise.race([
			(async () => {
				console.log('[INIT] ⏳ Solicitando horarios del activo...')
				await loadActiveSchedule(API)

				console.log('[INIT] ⏳ Cargando historial de velas...')
				await loadInitialCandles(API, config.activePrincipal)

				console.log('[INIT] ⏳ Suscribiéndose al flujo de datos...')
				API.onCandleGenerate(config.activePrincipal, async (candle) => {
					await handleNewCandle(API, candle)
				})
			})(),
			timeout(90000)
		])

		console.log('[INIT] ✅ Bot listo y operando con Peter Trend 1.0\n')
	} catch (err) {
		console.error('[INIT] ❌ Fallo en conexión al mercado:', err.message)
		throw err
	}
}

async function handleNewCandle(API, candle) {
	if (!callbackMutex.lock()) return

	let newCandle = false
	try {
		resetWatchdog()

		const added = addNewCandle(candle)
		if (!added) {
			addNewTick(candle.close)
			setLastStatusCandle(candle)
		} else {
			newCandle = true

			const currentCandles = getCandles()
			console.log(`[PETER_TREND] Analizando nueva vela...`)

			// Imprimir estadísticas actuales
			printStats()

			if (isOperating()) {
				console.log('[OPERATION] ⏳ Operación en curso, omitiendo análisis')
				return
			}

			// 1. Ejecutar Análisis
			const decision = await analyzeStrategy(currentCandles)

			console.log('[ANÁLISIS]', {
				shouldOperate: decision.shouldOperate,
				direction: decision.direction || 'NINGUNA',
				reason: decision.reason
			})

			if (decision.analysis) {
				console.log('[DETALLE]', decision.analysis)
			}

			// 2. Ejecutar si cumple condiciones
			if (decision.shouldOperate) {
				// Verificar disponibilidad del activo
				const canOperate = await checkActiveBeforeOperation(API)
				if (!canOperate) {
					console.log('[OPERATION] ❌ Activo no disponible para operar')
					return
				}

				console.log(`[OPERATION] 🚀 Ejecutando ${decision.direction}...`)
				const operationResult = await executeOperation(API, decision)

				if (operationResult) {
					// El resultado se guarda automáticamente en manager.js vía executeOperation -> addOperation
					console.log('[OPERATION] ✅ Orden enviada exitosamente')
				}
			} else {
				// Guardar en skipped para auditoría si hay algún análisis válido
				if (decision.analysis) {
					addSkipped(decision)
				}
			}
		}
	} catch (err) {
		console.error('[ERROR] Error crítico:', err.message)
	} finally {
		if (newCandle) clearTicks()
		callbackMutex.unlock()
	}
}

module.exports = initialize
