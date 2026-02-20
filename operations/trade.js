const config = require('../config.js')
const SimpleMutex = require('../core/mutex.js')
const { checkActiveBeforeOperation } = require('../core/active.js')
const { addOperation } = require('../reports/manager.js')

const operationMutex = new SimpleMutex()

async function executeOperation(API, decision) {
	// Verificar mutex
	if (!operationMutex.lock()) {
		console.log('[OPERATION] Operación en curso, descartando nueva señal')
		return null
	}

	try {
		// Verificar que el activo esté abierto
		// const isOpen = await checkActiveBeforeOperation(API)
		// if (!isOpen) {
		// 	console.log('[OPERATION] Activo cerrado, operación cancelada')
		// 	return {
		// 		executed: false,
		// 		reason: 'Activo cerrado'
		// 	}
		// }

		console.log(`\n[OPERATION] Ejecutando ${decision.direction} en ${config.activePrincipal}`)
		console.log(`[OPERATION] Monto: ${config.inversion}`)
		console.log(`[OPERATION] Duración: ${config.duracion_op} min`)

		const order = await API.trade({
			active: config.activePrincipal,
			action: decision.direction,
			amount: config.inversion,
			type: config.optionType,
			duration: config.duracion_op
		})

		console.log('[OPERATION] Orden abierta, esperando cierre...')

		await order.close()

		const result = order.quote.win ? 'WIN' : 'LOSS'
		const profit = order.quote.win ? order.quote.profit : -parseFloat(config.inversion)

		console.log(`[OPERATION] Resultado: ${result} | Ganancia: ${profit}`)

		const operation = {
			result,
			profit,
			direction: decision.direction,
			amount: config.inversion,
			timestamp: new Date(),
			reason: decision.reason,
			confidence: decision.confidence,
			analysis: decision.analysis,
			ticks: decision.ticks,
			candles: decision.candles, // Últimas 20 velas para contexto
			indicators: decision.indicators
		}

		addOperation(operation)

		return {
			executed: true,
			operation
		}
	} catch (err) {
		console.error('[OPERATION] Error:', err)
		return {
			executed: false,
			error: err.message
		}
	} finally {
		operationMutex.unlock()
	}
}

function isOperating() {
	return operationMutex.isLocked()
}

module.exports = {
	executeOperation,
	isOperating
}
