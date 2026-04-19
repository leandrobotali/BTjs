const config = require('./config.js')
const { loadActiveSchedule } = require('./core/active.js')
const { loadInitialCandles, addNewCandle, getCandles, addNewTick, clearTicks, getTicks, setCachedLevels, setLastStatusCandle } = require('./core/candles.js')
const { getLevels } = require('./indicators/levels.js')
const { analyzeStrategy } = require('./strategy/strategy-core.js')
const { executeOperation, isOperating } = require('./operations/trade.js')
const { addOperation, checkAndSaveHourly, addSkipped, printStats } = require('./reports/manager.js')
const SimpleMutex = require('./core/mutex.js')
const { checkActiveBeforeOperation } = require('./core/active.js')
const { initScheduler } = require('./core/scheduler.js')
const { startWaitingForEntry, checkEntryPoint, getStoredDecision, isWaitingForEntry, resetEntryPointState } = require('./operations/entry-point.js')
const { getPerdidas } = require('./operations/money-management.js')

const callbackMutex = new SimpleMutex()

async function initialize(API) {
	try {
		console.log('\n[INIT] Inicializando scheduler de tareas programadas...')
		const shouldContinue = initScheduler(API, initialize)

		// Si el mercado está cerrado, no continuar con la inicialización
		if (!shouldContinue) {
			console.log('[INIT] ⏸️ Inicialización pausada - Esperando apertura de mercado')
			return
		}

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

		const added = addNewCandle(candle)
		if (!added) {
			/* si no se agrego una nueva vela, almacenamos el tick en el array  */
			addNewTick(candle.close)
			setLastStatusCandle(candle) // guardar volumen del ultimo tick de la vela en curso

			// MEJORA 6: Verificar punto de entrada si está esperando
			if (isWaitingForEntry()) {
				const entryCheck = checkEntryPoint(candle.close)

				if (entryCheck.reached) {
					// Precio alcanzó el punto de entrada, ejecutar operación
					const storedDecision = getStoredDecision()
					console.log('[ENTRY_POINT] Ejecutando operación en punto de entrada protector')
					resetEntryPointState()

					// Ejecutar y guardar operación
					const operationResult = await executeOperation(API, storedDecision)
					if (operationResult) {
						console.log('[ENTRY_POINT] Operación ejecutada')
					}
				} else if (entryCheck.shouldAbort) {
					// Timeout: precio no llegó al punto de entrada
					const storedDecision = getStoredDecision()
					console.log(`[ENTRY_POINT] ${entryCheck.reason}`)
					console.log(`[ENTRY_POINT] Precio objetivo: ${entryCheck.details.targetPrice}, Precio alcanzado: ${entryCheck.details.currentPrice}`)

					// Guardar en skipped con razón detallada
					const skippedDecision = {
						...storedDecision,
						reason: entryCheck.reason,
						entryPointDetails: entryCheck.details
					}
					addSkipped(skippedDecision)
					resetEntryPointState()
				}
			}
		} else {
			newCandle = true
			/* si se agrego una nueva vela, procesamos la operación */

			// MEJORA 6: Si está esperando punto de entrada y se acabó el tiempo, abortar
			if (isWaitingForEntry()) {
				console.log('[ENTRY_POINT] Nueva vela iniciada - Timeout de punto de entrada')
				const storedDecision = getStoredDecision()
				const lastTick = getTicks()[getTicks().length - 1] || candle.close

				// Guardar en skipped
				const skippedDecision = {
					...storedDecision,
					reason: `⚠️ Precio no alcanzó punto de entrada protector (timeout al finalizar vela)`,
					entryPointDetails: {
						targetPrice: 'N/A',
						currentPrice: lastTick.toFixed(6),
						elapsed: '60+ segundos',
						operationType: 'TIMEOUT'
					}
				}
				addSkipped(skippedDecision)
				resetEntryPointState()
				console.log('[ENTRY_POINT] Estado reseteado - Continuando con análisis normal')
			}

			console.log('[STRATEGY] Calculando niveles S/R...')

			// Calcular y cachear niveles S/R una sola vez por vela nueva
			const currentCandles = getCandles()
			const levels = getLevels(currentCandles)
			setCachedLevels(levels)
			console.log(`[LEVELS] ${levels.length} zonas activas calculadas`)
			if (levels.length > 0) {
				console.log('[LEVELS] Detalle de zonas activas:')
				levels.forEach((lvl, idx) => {
					console.log(`  ${idx + 1}. ${lvl.type} @ ${lvl.price.toFixed(6)} | zona: [${lvl.zoneBottom.toFixed(6)}, ${lvl.zoneTop.toFixed(6)}] | calidad: ${lvl.quality} | rechazos: ${lvl.rejections || lvl.touches || 0} | flip: ${lvl.isFlipped ? 'SI' : 'NO'} | desgastada: ${lvl.isWorn ? 'SI' : 'NO'}`)
				})
			} else {
				console.log('[LEVELS] No hay zonas activas detectadas.')
			}

			console.log('[STRATEGY] Analizando...')
			const decision = await analyzeStrategy(currentCandles, getTicks(), levels)

			console.log('-DECISION-', {
				shouldOperate: decision.shouldOperate,
				reason: decision.reason,
				analysis: decision.analysis
			})

			// Imprimir siempre las estadísticas de operaciones actuales
			printStats()

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
				// == REGLA STOP VIERNES (RISK MANAGEMENT) ==
				// Si faltan <= 8 hs para el cierre (Viernes 16:00 hs Argentina), es decir Viernes >= 08:00
				// UTC-3 para Argentina
				const nowUtc = new Date()
				const argTime = new Date(nowUtc.getTime() - 3 * 3600 * 1000)
				const isFriday = argTime.getUTCDay() === 5
				const hourArg = argTime.getUTCHours()

				if (isFriday && hourArg >= 8) {
					const perdidas = getPerdidas()
					if (perdidas <= parseFloat(config.inversion)) {
						console.log(`[OPERATION] ⏸️ Abortada: Faltan < 8hs para el cierre semanal y riesgo aceptable (Pérdidas: $${perdidas.toFixed(2)})`)
						decision.shouldOperate = false
						decision.reason = 'Filtro Riesgo Viernes: Cuenta asegurada antes del cierre'
						addSkipped(decision)
						return
					} else {
						console.log(`[OPERATION] ⚠️ Alerta Riesgo: Viernes < 8hs para cierre, se autoriza intentar recuperar $${perdidas.toFixed(2)}.`)
					}
				}

				// MEJORA 6: En lugar de ejecutar inmediatamente, esperar punto de entrada
				const previousCandle = currentCandles[currentCandles.length - 1]
				startWaitingForEntry(decision, previousCandle)
				console.log('[DECISION] Se debe operar - Esperando punto de entrada protector')
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
