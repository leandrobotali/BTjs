const fs = require('fs').promises
const path = require('path')
const config = require('../config')
const { obtenerEstadisticasFinancieras } = require('../operations/money-management.js')

// Función para obtener la fecha de hoy en formato DDMMYYYY
function getTodayDate() {
	const today = new Date()
	const day = String(today.getDate()).padStart(2, '0')
	const month = String(today.getMonth() + 1).padStart(2, '0')
	const year = today.getFullYear()
	return `${day}${month}${year}`
}

// Función para obtener la fecha del día siguiente en formato DDMMYYYY
function getNextDayDate() {
	const tomorrow = new Date()
	tomorrow.setDate(tomorrow.getDate() + 1)

	const day = String(tomorrow.getDate()).padStart(2, '0')
	const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
	const year = tomorrow.getFullYear()

	return `${day}${month}${year}`
}

function getInitialDate() {
	const now = new Date()
	const hour = now.getHours()

	// Si arrancamos después de las 22:00, ya es la sesión del día siguiente
	if (hour >= 22) {
		return getNextDayDate()
	}
	return getTodayDate()
}

let date = getInitialDate() // Autodetectar si usar hoy o mañana al arrancar
let sesion = 'S1'
// Paths dinámicos: se recalculan con cada escritura para reflejar cambios de fecha/sesión
function getLogFile() {
	return path.join(__dirname, config.rep_directory, `operations_${config.version}_${date}.json`)
}
function getSkippedFile() {
	return path.join(__dirname, config.rep_directory, `skipped_${config.version}_${date}_${sesion}.json`)
}

// Variables para estadísticas en memoria
let stats = {
	total: { wins: 0, losses: 0 },
	daily: { wins: 0, losses: 0 }
}

async function addOperation(operation) {
	// Actualizar estadísticas
	const isWin = operation.result === 'WIN'
	if (isWin) {
		stats.total.wins++
		stats.daily.wins++
	} else {
		stats.total.losses++
		stats.daily.losses++
	}

	saveOperationToFile(operation).then(() => {
		printStats()
	}).catch(err => {
		console.error('[REPORTS] Error guardando operación en disco:', err)
	})
}

async function addSkipped(decision) {
	saveSkippedToFile(decision).catch(err => {
		console.error('[REPORTS] Error guardando vela saltada en disco:', err)
	})
}

async function saveOperationToFile(operation) {
	try {
		const logFile = getLogFile()
		const logEntry = JSON.stringify({ ...operation, savedAt: new Date().toISOString() }) + '\n'
		await fs.appendFile(logFile, logEntry, 'utf8')
		console.log(`[REPORTS] Operación guardada en ${path.basename(logFile)}`)
	} catch (err) {
		console.error('[REPORTS] Fallo crítico al escribir operación:', err.message)
	}
}

function printStats() {
	const tOps = stats.total.wins + stats.total.losses
	const tWr = tOps > 0 ? ((stats.total.wins / tOps) * 100).toFixed(2) : 0

	const dOps = stats.daily.wins + stats.daily.losses
	const dWr = dOps > 0 ? ((stats.daily.wins / dOps) * 100).toFixed(2) : 0

	const moneyStats = obtenerEstadisticasFinancieras()

	console.log(`\n================= ESTADÍSTICAS =================`)
	console.log(`TOTAL : ${tOps} Ops | ${stats.total.wins} W / ${stats.total.losses} L | WR: ${tWr}%`)
	console.log(`DIARIO: ${dOps} Ops | ${stats.daily.wins} W / ${stats.daily.losses} L | WR: ${dWr}%`)
	console.log(`-------------------------------------------------`)
	console.log(`PÉRDIDAS A RECUPERAR: $${moneyStats.perdidas}`)
	console.log(`MÁX PÉRDIDAS ACUMULADAS: $${moneyStats.maxPerdidasAcumuladas}`)
	console.log(`PRÓXIMA INVERSIÓN (REF): $${moneyStats.lastAmount}`)
	console.log(`=================================================\n`)
}

function resetDailyStats() {
	stats.daily.wins = 0
	stats.daily.losses = 0
	console.log('[REPORTS] Estadísticas diarias reiniciadas.')
}

async function saveSkippedToFile(decision) {
	try {
		const skippedFile = getSkippedFile()
		const entry = {
			type: 'SKIPPED',
			timestamp: new Date().toISOString(),
			direction: decision.direction || '',
			reason: decision.reason || 'Sin señal clara',
			confidence: decision.confidence || 0,
			analysis: decision.analysis,
			ticks: decision.ticks,
			candles: decision.candles,
			indicators: decision.indicators,
			savedAt: new Date().toISOString()
		}
		await fs.appendFile(skippedFile, JSON.stringify(entry) + '\n', 'utf8')
	} catch (err) {
		console.error('[REPORTS] Fallo al escribir vela saltada:', err.message)
	}
}

// Funciones obsoletas mantenidas por compatibilidad (si index.js las llama)
// En un refactor futuro, eliminar las llamadas en index.js
function checkAndSaveHourly() {
	// No-op: Ya no se guarda por hora, se guarda en tiempo real
}

function saveHourlyReport() {
	// No-op
}

function getOperationsBuffer() {
	return []
}

function clearOperationsBuffer() {
	// No hay buffer en memoria, pero se puede usar para limpiar archivos si es necesario
	console.log('[REPORTS] Buffer de operaciones limpiado')
}

function setDate() {
	// Setea el valor de la variable date
	date = getNextDayDate()
	resetDailyStats() // Reiniciar stats diarios cuando cambia el día
}

function setSesion(newSesion) {
	// Setea el valor de la variable sesion
	sesion = newSesion
}

function getStats() {
	return stats
}

module.exports = {
	addOperation,
	addSkipped,
	checkAndSaveHourly,
	saveHourlyReport,
	getOperationsBuffer,
	clearOperationsBuffer,
	setDate,
	setSesion,
	getStats,
	resetDailyStats,
	printStats
}
