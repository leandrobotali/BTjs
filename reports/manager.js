const fs = require('fs').promises
const path = require('path')

let operationsBuffer = []
let lastHourSave = new Date().getHours()

function formatDate(date) {
	const d = new Date(date)
	const day = String(d.getDate()).padStart(2, '0')
	const month = String(d.getMonth() + 1).padStart(2, '0')
	const year = d.getFullYear()
	const hours = String(d.getHours()).padStart(2, '0')
	const minutes = String(d.getMinutes()).padStart(2, '0')
	const seconds = String(d.getSeconds()).padStart(2, '0')
	return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`
}

function addOperation(operation) {
	operationsBuffer.push({
		...operation,
		formattedTime: formatDate(operation.timestamp)
	})
}

function generateHourlyReport() {
	if (operationsBuffer.length === 0) {
		return null
	}
	
	const wins = operationsBuffer.filter(op => op.result === 'WIN').length
	const losses = operationsBuffer.filter(op => op.result === 'LOSS').length
	const total = wins + losses
	const winRate = total > 0 ? ((wins / total) * 100).toFixed(2) : 0
	const totalProfit = operationsBuffer.reduce((sum, op) => sum + (op.profit || 0), 0)
	
	let report = `\n${'='.repeat(80)}\n`
	report += `REPORTE HORARIO - ${formatDate(new Date())}\n`
	report += `${'='.repeat(80)}\n\n`
	report += `RESUMEN:\n`
	report += `  Total Operaciones: ${total}\n`
	report += `  Ganadas: ${wins}\n`
	report += `  Perdidas: ${losses}\n`
	report += `  Win Rate: ${winRate}%\n`
	report += `  Ganancia Total: ${totalProfit.toFixed(2)}\n\n`
	report += `${'='.repeat(80)}\n\n`
	
	operationsBuffer.forEach((op, idx) => {
		report += `OPERACIÓN #${idx + 1}\n`
		report += `${'-'.repeat(80)}\n`
		report += `Fecha/Hora: ${op.formattedTime}\n`
		report += `Dirección: ${op.direction}\n`
		report += `Resultado: ${op.result}\n`
		report += `Ganancia: ${op.profit ? op.profit.toFixed(2) : 'N/A'}\n`
		report += `Monto: ${op.amount}\n\n`
		report += `${op.analysis}\n\n`
	})
	
	return report
}

async function saveHourlyReport() {
	const report = generateHourlyReport()
	
	if (!report) {
		console.log('[REPORTS] No hay operaciones para reportar')
		return
	}
	
	try {
		const reportPath = path.join(__dirname, '../../reporte.txt')
		
		// Verificar si existe el archivo
		let existingContent = ''
		try {
			existingContent = await fs.readFile(reportPath, 'utf8')
		} catch (err) {
			// Archivo no existe, se creará
		}
		
		const newContent = existingContent + report
		await fs.writeFile(reportPath, newContent, 'utf8')
		
		console.log(`[REPORTS] Reporte guardado: ${operationsBuffer.length} operaciones`)
		
		// Limpiar buffer
		operationsBuffer = []
	} catch (err) {
		console.error('[REPORTS] Error guardando reporte:', err.message)
	}
}

function checkAndSaveHourly() {
	const currentHour = new Date().getHours()
	
	if (currentHour !== lastHourSave) {
		lastHourSave = currentHour
		saveHourlyReport()
	}
}

function getOperationsBuffer() {
	return [...operationsBuffer]
}

module.exports = {
	addOperation,
	saveHourlyReport,
	checkAndSaveHourly,
	getOperationsBuffer
}
