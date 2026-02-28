const fs = require('fs').promises
const path = require('path')
const config = require('../config')

let date = '27022026' // Formato DDMMYYYY, se puede parametrizar si se desea
let sesion = 'S1'
// Archivo donde se guardarán los logs detallados (JSON Lines)
const archive_name = `operations_${config.version}_${date}.json`
const LOG_FILE = path.join(__dirname, config.rep_directory, archive_name)
const SKIPPED_FILE = path.join(__dirname, config.rep_directory, `skipped_${config.version}_${date}_${sesion}.json`)

async function addOperation(operation) {
	saveOperationToFile(operation).catch(err => {
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
		const logEntry = JSON.stringify({ ...operation, savedAt: new Date().toISOString() }) + '\n'
		await fs.appendFile(LOG_FILE, logEntry, 'utf8')
		console.log(`[REPORTS] Operación guardada en ${path.basename(LOG_FILE)}`)
	} catch (err) {
		console.error('[REPORTS] Fallo crítico al escribir operación:', err.message)
	}
}

async function saveSkippedToFile(decision) {
	try {
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
		await fs.appendFile(SKIPPED_FILE, JSON.stringify(entry) + '\n', 'utf8')
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

module.exports = {
	addOperation,
	addSkipped,
	checkAndSaveHourly,
	saveHourlyReport,
	getOperationsBuffer,
	clearOperationsBuffer
}
