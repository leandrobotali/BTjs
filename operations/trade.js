const config = require('../config.js')
const SimpleMutex = require('../core/mutex.js')
const { addOperation } = require('../reports/manager.js')
const { calcularInversion, registrarResultado } = require('./money-management.js')
const { recordResult } = require('../engine/engine-core.js')

const operationMutex = new SimpleMutex()

async function executeOperation(API, decision) {
	// Verificar mutex
	if (!operationMutex.lock()) {
		console.log('[OPERATION] Operación en curso, descartando nueva señal')
		return null
	}

	try {
		const amount = calcularInversion()

		console.log(`\n[OPERATION] Ejecutando ${decision.direction} en ${config.activePrincipal}`)
		console.log(`[OPERATION] Monto: ${amount}`)
		console.log(`[OPERATION] Duración: ${config.duracion_op} min`)

		const order = await API.trade({
			active: config.activePrincipal,
			action: decision.direction,
			amount: amount,
			type: config.optionType,
			duration: config.duracion_op
		})

		console.log('[OPERATION] Orden abierta, esperando cierre...')

		const closeInfo = await order.close()
		console.log('[OPERATION] Orden cerrada', JSON.stringify(closeInfo))

		let isWin = false
		let isTie = false
		let result = 'LOSS'
		let realProfit = -amount

		if (closeInfo && closeInfo.invest !== undefined && closeInfo.close_profit !== undefined) {
			const invest = parseFloat(closeInfo.invest)
			const closeProfit = parseFloat(closeInfo.close_profit)

			if (closeProfit > invest) {
				isWin = true
				result = 'WIN'
				realProfit = closeProfit - invest
			} else if (closeProfit === invest) {
				isTie = true
				result = 'TIE'
				realProfit = 0
			} else {
				isWin = false
				result = 'LOSS'
				realProfit = closeProfit - invest
			}
		} else {
			isWin = order.quote.win
			result = isWin ? 'WIN' : 'LOSS'
			realProfit = (closeInfo && !isNaN(closeInfo.profit_amount))
				? closeInfo.profit_amount
				: (isWin ? (amount * config.profitEstimado) : -amount)
		}

		order.quote.win = isWin
		order.quote.tie = isTie
		order.quote.profit = realProfit

		// Registrar el resultado en la gestión de capital dinámica
		registrarResultado(amount, order.quote)

		// Registrar resultado real para gestión dinámica de confianza
		global._botRealResults = global._botRealResults || []
		global._botRealResults.push({ win: order.quote.win, tie: order.quote.tie, ts: Date.now() })
		if (global._botRealResults.length > 20) global._botRealResults = global._botRealResults.slice(-20)

		// ENVIAR AL LEARNER (Nuevo Motor)
		if (decision.featureSnapshot) {
			console.log(`[LEARNER] Enviando snapshot y resultado: ${result} a la dirección ${decision.direction}`)
			recordResult(decision.featureSnapshot, result, decision.direction)
		} else {
			console.log('[LEARNER] No se encontró featureSnapshot en esta decisión')
		}

		console.log(`[OPERATION] Resultado: ${result} | Ganancia: $${realProfit.toFixed(2)}`)

		const operation = {
			result,
			profit: realProfit,
			direction: decision.direction,
			amount: amount,
			timestamp: new Date(),
			reason: decision.reason,
			confidence: decision.confidence,
			analysis: decision.analysis,
			featureSnapshot: decision.featureSnapshot
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
