const config = require('./config.js')
const { loadActiveSchedule } = require('./core/active.js')
const { loadInitialCandles, addNewCandle, setLastStatusCandle, clearCandles } = require('./core/candles.js')
const { executeOperation, isOperating } = require('./operations/trade.js')
const { addSkipped, printStats } = require('./reports/manager.js')
const SimpleMutex = require('./core/mutex.js')
const { checkActiveBeforeOperation } = require('./core/active.js')
const { initScheduler, resetWatchdog } = require('./core/scheduler.js')
const { getPerdidas, loadState } = require('./operations/money-management.js')

// ENGINE IMPORTS
const { addTick, getWindow } = require('./engine/tick-window.js')
const { analyzeCurrentTicks, loadWeights } = require('./engine/engine-core.js')

const callbackMutex = new SimpleMutex()
let operationExecutedThisCandle = false // Reset cada nueva vela

async function initialize(API) {
	try {
		// Cargar estado de deuda persistente
		loadState()
		// Cargar pesos del Motor de Autoaprendizaje
		loadWeights()

		console.log('\n[INIT] Inicializando scheduler de tareas programadas...')
		const shouldContinue = initScheduler(API, connectMarket)  // pasa connectMarket, NO initialize

		// Si el mercado está cerrado, no continuar con la inicialización
		if (!shouldContinue) {
			console.log('[INIT] ⏸️ Inicialización pausada - Esperando apertura de mercado')
			return
		}

		await connectMarket(API)
	} catch (err) {
		throw new Error(`Error en inicialización: ${err.message}`)
	}
}

/**
 * Conecta al mercado: carga velas históricas y suscribe a generación de velas.
 * Se usa tanto en el arranque inicial como en reconexiones (watchdog / lunes).
 * NO reinicia el scheduler ni los crons.
 */
async function connectMarket(API) {
	console.log('\n[INIT] Cargando información del activo...')
	await loadActiveSchedule(API)

	console.log('[INIT] Cargando velas históricas...')
	await loadInitialCandles(API, config.activePrincipal)

	console.log('[INIT] Suscribiéndose a generación de velas...')
	API.onCandleGenerate(config.activePrincipal, async (candle) => {
		await handleNewCandle(API, candle)
	})

	console.log('[INIT] Bot inicializado correctamente\n')
}

async function handleNewCandle(API, candle) {
	if (!callbackMutex.lock()) {
		return
	}

	let newCandle = false
	try {
		// Watchdog: resetear timer en cada evento del broker (tick o vela)
		resetWatchdog()

		// ALIMENTAR MOTOR SIEMPRE
		addTick(Date.now(), candle.close)

		const added = addNewCandle(candle)

		if (added) {
			newCandle = true
			operationExecutedThisCandle = false // Resetear flag de operación por vela
		} else {
			setLastStatusCandle(candle)
		}

		if (added) {
			// Imprimir siempre las estadísticas de operaciones al cerrar una vela
			printStats()
		}

		// LOGICA DE EJECUCION: Entre segundo 1 y 25
		const currentSecond = new Date().getSeconds()
		const inExecutionWindow = currentSecond >= config.engine.entryWindowStart && currentSecond <= config.engine.entryWindowEnd

		if (inExecutionWindow && !operationExecutedThisCandle) {
			// El motor usa la ventana deslizante continua
			const tickWindow = getWindow()

			// Solo arranca si el bot tiene la memoria completamente llena con los 100 ticks requeridos
			if (tickWindow.length < config.engine.windowSize) {
				// Solo avisamos una vez por vela para no spamear
				if (currentSecond === 5) {
					console.log(`[ENGINE] (${currentSecond}s) Cargando memoria inicial tras el reinicio... (${tickWindow.length}/${config.engine.windowSize} ticks adquiridos)`)
				}
				return // Silencioso hasta tener la memoria requerida
			}

			const decision = analyzeCurrentTicks(tickWindow)

			// Si el motor decide operar en CUALQUIER segundo de la ventana (1 al 25)
			if (decision.shouldOperate) {
				const snap = decision.featureSnapshot || {}
				const detalles = `CI=${(snap.CI || 0).toFixed(3)}, ACEL=${(snap.CET || 0).toFixed(3)}, INERCIA=${(snap.PED || 0).toFixed(3)}, RANGE=${((snap.RANGE || 0) * 10000).toFixed(4)}`

				console.log(`\n[ENGINE] ✅ SE OPERA [${decision.direction}] | Segundo: ${currentSecond}`)
				console.log(`[ENGINE] 💬 Resolución: ${decision.humanReason}`)
				console.log(`[ENGINE] ⚙️ Técnicos: ${detalles} | Score: ${(decision.score).toFixed(3)} | Detalle interno: ${decision.reason}`)
				// Verificar que el activo esté abierto
				const canOperate = await checkActiveBeforeOperation(API)
				if (!canOperate) {
					console.log('[OPERATION] No se puede operar, el activo no está disponible')
					return
				}

				// == REGLA STOP VIERNES (RISK MANAGEMENT) ==
				const nowUtc = new Date()
				const argTime = new Date(nowUtc.getTime() - 3 * 3600 * 1000)
				const isFriday = argTime.getUTCDay() === 5
				const hourArg = argTime.getUTCHours()

				if (isFriday && hourArg >= 8) {
					const perdidas = getPerdidas()
					if (perdidas <= parseFloat(config.inversion)) {
						console.log(`[OPERATION] ⏸️ Abortada: Faltan < 8hs para el cierre semanal y riesgo aceptable (Pérdidas: $${perdidas.toFixed(2)})`)

						const skippedDecision = {
							direction: decision.direction,
							reason: 'Filtro Riesgo Viernes: Cuenta asegurada antes del cierre',
							confidence: Math.round(Math.abs(decision.score) * 100),
							analysis: `Regime: ${decision.regime} | Motor dijo: ${decision.humanReason}`
						}
						addSkipped(skippedDecision)
						operationExecutedThisCandle = true // Evitar reintentos esta vela
						return
					} else {
						console.log(`[OPERATION] ⚠️ Alerta Riesgo: Viernes < 8hs para cierre, se autoriza intentar recuperar $${perdidas.toFixed(2)}.`)
					}
				}

				// Ejecutar directamente
				operationExecutedThisCandle = true

				const tradeDecision = {
					direction: decision.direction,
					reason: decision.humanReason,
					confidence: Math.round(Math.abs(decision.score) * 100),
					analysis: `Regime: ${decision.regime} | Score: ${(decision.score).toFixed(3)} | Detalles: ${detalles}`,
					featureSnapshot: decision.featureSnapshot
				}

				await executeOperation(API, tradeDecision)
			}

			// Si alcanzamos el fin de la ventana (segundo 25) y NO operamos, logueamos el cierre y a skipped
			if (currentSecond === config.engine.entryWindowEnd && !operationExecutedThisCandle && !decision.shouldOperate) {
				// Aseguramos de anotarlo una sola vez
				operationExecutedThisCandle = true

				const snap = decision.featureSnapshot || {}
				const detalles = `CI=${(snap.CI || 0).toFixed(3)}, ACEL=${(snap.CET || 0).toFixed(3)}, INERCIA=${(snap.PED || 0).toFixed(3)}, RANGE=${((snap.RANGE || 0) * 10000).toFixed(4)}`

				console.log(`\n[ENGINE] ❌ NO SE OPERÓ (Fin de ventana analítica | Segundo 25)`)
				console.log(`[ENGINE] 💬 Resolución: ${decision.humanReason}`)
				console.log(`[ENGINE] ⚙️ Técnicos Finales: ${detalles} | Régimen: ${decision.regime} | Motivo: ${decision.reason}`)

				const skippedDecision = {
					direction: 'NONE',
					reason: decision.humanReason,
					confidence: 0,
					analysis: `Regime: ${decision.regime} | ${decision.reason} | ${detalles}`,
					featureSnapshot: snap
				}
				addSkipped(skippedDecision)
			}
		}
	} catch (err) {
		console.error('[ERROR] Error procesando vela/tick:', err.message)
		console.error('[ERROR] Stack:', err.stack)
	} finally {
		callbackMutex.unlock()
	}
}

module.exports = initialize
