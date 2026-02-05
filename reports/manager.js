const fs = require('fs').promises
const path = require('path')

// Archivo donde se guardarán los logs detallados (JSON Lines)
const LOG_FILE = path.join(__dirname, '../../operations.json')

async function addOperation(operation) {
	// Procesamiento asíncrono para no bloquear el worker principal
	// No usamos await aquí para retornar control rápido, pero gestionamos errores en la promesa
	saveOperationToFile(operation).catch(err => {
		console.error('[REPORTS] Error guardando operación en disco:', err)
	})
}

async function saveOperationToFile(operation) {
	try {
		const timestamp = new Date().toISOString()
		const logEntry = JSON.stringify({
			...operation,
			savedAt: timestamp
		}) + '\n' // JSONL format (one JSON per line)

		await fs.appendFile(LOG_FILE, logEntry, 'utf8')

		console.log(`[REPORTS] Operación guardada exitosamente en ${path.basename(LOG_FILE)}`)
	} catch (err) {
		console.error('[REPORTS] Fallo crítico al escribir archivo de logs:', err.message)
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

module.exports = {
	addOperation,
	checkAndSaveHourly,
	saveHourlyReport,
	getOperationsBuffer
}
