/**
 * scheduler.js - Gestión de tareas programadas (crons)
 * 
 * Mejoras 1-2:
 * - Cron 1: Todos los días a las 22:00 (Argentina) → actualiza date al día siguiente y sesion a "S1"
 * - Cron 2: Todos los días a las 09:00 (Argentina) → actualiza sesion a "S2"
 * 
 * Mejora 3:
 * - Cron 3: Viernes a las 16:00 (Argentina) → desconecta bot y limpia estado
 * - Cron 4: Lunes a las 00:00 (Argentina) → reconecta bot y reinicia
 */

const cron = require('node-cron')
const { setDate, setSesion } = require('../reports/manager.js')

// Variable global para almacenar referencia al API y función de inicialización
let globalAPI = null
let globalInitFunction = null
let isConnected = false

// Función para obtener la fecha del día siguiente en formato DDMMYYYY
function getNextDayDate() {
	const tomorrow = new Date()
	tomorrow.setDate(tomorrow.getDate() + 1)

	const day = String(tomorrow.getDate()).padStart(2, '0')
	const month = String(tomorrow.getMonth() + 1).padStart(2, '0')
	const year = tomorrow.getFullYear()

	return `${day}${month}${year}`
}

// Función para actualizar las variables en manager.js
function updateManagerDate() {
	try {
		setDate()
		console.log(`[SCHEDULER] ✓ Variable 'date' actualizada`)
	} catch (err) {
		console.error('[SCHEDULER] ❌ Error actualizando manager.js:', err.message)
	}
}
function updateManagerSesion(newSesion) {
	try {
		setSesion(newSesion)
		console.log(`[SCHEDULER] ✓ Variable 'sesion' actualizada a: ${newSesion}`)
	} catch (err) {
		console.error('[SCHEDULER] ❌ Error actualizando manager.js:', err.message)
	}
}
// function updateManagerVariables(newDate, newSesion) {
// 	const fs = require('fs')
// 	const path = require('path')
// 	const managerPath = path.join(__dirname, '../reports/manager.js')

// 	try {
// 		let content = fs.readFileSync(managerPath, 'utf8')

// 		// Actualizar date si se proporciona
// 		if (newDate) {
// 			content = content.replace(/let date = '\d{8}'/, `let date = '${newDate}'`)
// 			console.log(`[SCHEDULER] ✓ Variable 'date' actualizada a: ${newDate}`)
// 		}

// 		// Actualizar sesion si se proporciona
// 		if (newSesion) {
// 			content = content.replace(/let sesion = 'S\d+'/, `let sesion = '${newSesion}'`)
// 			console.log(`[SCHEDULER] ✓ Variable 'sesion' actualizada a: ${newSesion}`)
// 		}

// 		fs.writeFileSync(managerPath, content, 'utf8')
// 	} catch (err) {
// 		console.error('[SCHEDULER] ❌ Error actualizando manager.js:', err.message)
// 	}
// }

// Función para desconectar el bot (Viernes 16:00)
async function disconnectBot() {
	if (!isConnected) {
		console.log('[SCHEDULER] Bot ya está desconectado')
		return
	}

	try {
		console.log('[SCHEDULER] 🔴 Iniciando desconexión...')

		// 1. Desuscribirse de velas
		if (globalAPI && globalAPI.unsubscribeFromCandles) {
			const config = require('../config.js')
			await globalAPI.unsubscribeFromCandles(config.activePrincipal)
			console.log('[SCHEDULER] ✓ Desuscrito de generación de velas')
		}

		// 2. Limpiar buffer de velas
		const { clearCandles, clearTicks } = require('./candles.js')
		clearCandles()
		clearTicks()
		console.log('[SCHEDULER] ✓ Buffer de velas limpiado')

		// 2.5. Limpiar Zonas Z
		const { clearZonesZ } = require('../indicators/zone-z.js')
		clearZonesZ()
		console.log('[SCHEDULER] ✓ Zonas Z limpiadas')

		// 2.6. Limpiar global state (resultados reales para gestión dinámica)
		if (typeof global !== 'undefined' && global._botRealResults) {
			global._botRealResults = []
			console.log('[SCHEDULER] ✓ Global state limpiado')
		}

		// 3. Limpiar operaciones en memoria
		const { clearOperationsBuffer } = require('../reports/manager.js')
		clearOperationsBuffer()
		console.log('[SCHEDULER] ✓ Operaciones en memoria limpiadas')

		// 4. Cerrar conexión WebSocket
		if (globalAPI && globalAPI.disconnect) {
			await globalAPI.disconnect()
			console.log('[SCHEDULER] ✓ WebSocket desconectado')
		}

		isConnected = false
		console.log('[SCHEDULER] 🔴 Bot desconectado exitosamente - Modo dormido hasta el lunes')
	} catch (err) {
		console.error('[SCHEDULER] ❌ Error en desconexión:', err.message)
	}
}

// Función para reconectar el bot (Lunes 00:00)
async function reconnectBot() {
	if (isConnected) {
		console.log('[SCHEDULER] Bot ya está conectado - Ignorando reconexión')
		return
	}

	// Verificar que realmente sea lunes y el mercado esté abierto
	if (!isMarketOpen()) {
		console.log('[SCHEDULER] Mercado aún cerrado - Esperando...')
		return
	}

	try {
		console.log('[SCHEDULER] 🟢 Iniciando reconexión...')

		// Ejecutar el código de main.js (reconectar desde cero)
		if (globalInitFunction && globalAPI) {
			await globalInitFunction(globalAPI)
			isConnected = true
			console.log('[SCHEDULER] 🟢 Bot reconectado exitosamente')
		} else {
			console.error('[SCHEDULER] ❌ No se puede reconectar: función de inicialización no disponible')
		}
	} catch (err) {
		console.error('[SCHEDULER] ❌ Error en reconexión:', err.message)
	}
}

// Verificar si estamos en horario de mercado (Lunes 00:00 - Viernes 16:00)
function isMarketOpen() {
	const now = new Date()
	const day = now.getDay() // 0=Domingo, 1=Lunes, ..., 5=Viernes, 6=Sábado
	const hour = now.getHours()

	// Sábado o Domingo → Mercado cerrado
	if (day === 0 || day === 6) return false

	// Viernes después de las 16:00 → Mercado cerrado
	if (day === 5 && hour >= 16) return false

	// Resto de días → Mercado abierto
	return true
}

// Inicializar crons
function initScheduler(API, initFunction) {
	console.log('[SCHEDULER] Inicializando tareas programadas...')

	// Guardar referencias globales para reconexión
	globalAPI = API
	globalInitFunction = initFunction

	// Verificar si el mercado está abierto al iniciar
	if (!isMarketOpen()) {
		console.log('[SCHEDULER] ⚠️ Mercado CERRADO - Bot en modo dormido')
		console.log('[SCHEDULER] Esperando reconexión automática el lunes 00:00...')
		isConnected = false
		// No ejecutar initialize, solo configurar crons
	} else {
		console.log('[SCHEDULER] ✓ Mercado ABIERTO - Bot operativo')
		isConnected = true
	}

	// CRON 1: Todos los días a las 22:00 (horario Argentina)
	// Actualiza date al día siguiente y sesion a "S1"
	cron.schedule('0 22 * * *', () => {
		const nextDate = getNextDayDate()
		console.log(`[SCHEDULER] 🕒 22:00 - Actualizando fecha y sesión...`)
		updateManagerDate()
		updateManagerSesion('S1')
	}, {
		timezone: "America/Argentina/Buenos_Aires"
	})

	console.log('[SCHEDULER] ✓ Cron 1 configurado: 22:00 diario (actualiza date y sesion=S1)')

	// CRON 2: Todos los días a las 09:00 (horario Argentina)
	// Actualiza sesion a "S2"
	cron.schedule('0 9 * * *', () => {
		console.log(`[SCHEDULER] 🕒 09:00 - Cambiando a sesión S2...`)
		updateManagerSesion('S2')
	}, {
		timezone: "America/Argentina/Buenos_Aires"
	})

	console.log('[SCHEDULER] ✓ Cron 2 configurado: 09:00 diario (actualiza sesion=S2)')

	// MEJORA 3: CRON 3 - Viernes 16:00 (Desconexión)
	cron.schedule('0 16 * * 5', async () => {
		console.log(`[SCHEDULER] 🔴 Viernes 16:00 - Desconectando bot...`)
		await disconnectBot()
	}, {
		timezone: "America/Argentina/Buenos_Aires"
	})

	console.log('[SCHEDULER] ✓ Cron 3 configurado: Viernes 16:00 (desconexión)')

	// MEJORA 3: CRON 4 - Lunes 00:00 (Reconexión)
	cron.schedule('0 0 * * 1', async () => {
		console.log(`[SCHEDULER] 🟢 Lunes 00:00 - Reconectando bot...`)
		await reconnectBot()
	}, {
		timezone: "America/Argentina/Buenos_Aires"
	})

	console.log('[SCHEDULER] ✓ Cron 4 configurado: Lunes 00:00 (reconexión)')
	console.log('[SCHEDULER] ✅ Scheduler inicializado correctamente')

	// Retornar estado inicial para que index.js sepa si debe continuar
	return isConnected
}

module.exports = {
	initScheduler,
	getNextDayDate,
	disconnectBot,
	reconnectBot,
	isMarketOpen
}
