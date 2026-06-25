/**
 * scheduler.js - Gestión de tareas programadas (crons) y monitoreo de mercado
 */

const cron = require('node-cron')
const fs = require('fs')
const path = require('path')
const { setDate, setSesion } = require('../reports/manager.js')
const { isActiveOpen, getNextMarketEvent } = require('./active.js')

const WATCHDOG_LOG_FILE = path.join(__dirname, '../watchdog.log')

// Variable global para almacenar referencia al API y función de inicialización
let globalAPI = null
let globalConnectFunction = null
let isConnected = false
let isConnecting = false
let schedulerInitialized = false
let marketMonitorActive = false

// ── WATCHDOG ──────────────────────────────────────────────────────────────────
const WATCHDOG_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutos
let watchdogTimer = null

function resetWatchdog() {
	if (!isConnected) return

	if (watchdogTimer) clearTimeout(watchdogTimer)
	watchdogTimer = setTimeout(async () => {
		const nowArg = new Date()
		const timestamp = nowArg.toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
		const logLine = `[WATCHDOG] Se ejecutó watchdog el ${timestamp} - bot sin velas por ${WATCHDOG_TIMEOUT_MS / 60000} min\n`
		fs.appendFile(WATCHDOG_LOG_FILE, logLine, (err) => {
			if (err) console.error('[WATCHDOG] ❌ Error escribiendo log:', err.message)
		})

		console.log(`[WATCHDOG] ⚠️ No se recibieron velas en ${WATCHDOG_TIMEOUT_MS / 60000} minutos.`)
		console.log('[WATCHDOG] 🔄 Forzando reconexión completa...')
		isConnected = false
		try {
			await reconnectBot()
		} catch (err) {
			console.error('[WATCHDOG] ❌ Error durante reconexión:', err.message)
		}
	}, WATCHDOG_TIMEOUT_MS)
}

function cancelWatchdog() {
	if (watchdogTimer) {
		clearTimeout(watchdogTimer)
		watchdogTimer = null
		console.log('[WATCHDOG] ⏹️ Timer cancelado (mercado cerrado)')
	}
}

// ── MANAGER DATE/SESSION ──────────────────────────────────────────────────────
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

// ── MARKET STATUS & CONNECTIONS ─────────────────────────────────────────────

async function disconnectBot() {
	if (!isConnected) return

	cancelWatchdog()
	try {
		console.log('\n[SCHEDULER] 🔴 Mercado cerrado según intervalos. Desconectando...')

		if (globalAPI && globalAPI.unsubscribeFromCandles) {
			const config = require('../config.js')
			await globalAPI.unsubscribeFromCandles(config.activePrincipal)
			console.log('[SCHEDULER] ✓ Desuscrito de velas')
		}

		const { clearCandles, clearTicks } = require('./candles.js')
		clearCandles()
		clearTicks()

		if (typeof global !== 'undefined' && global._botRealResults) {
			global._botRealResults = []
		}

		const { clearOperationsBuffer } = require('../reports/manager.js')
		clearOperationsBuffer()

		if (globalAPI && globalAPI.disconnect) {
			await globalAPI.disconnect()
			console.log('[SCHEDULER] ✓ WebSocket desconectado')
		}

		isConnected = false
		console.log('[SCHEDULER] 🔴 Bot en modo espera (Dormido)')
	} catch (err) {
		console.error('[SCHEDULER] ❌ Error en desconexión:', err.message)
	}
}

let reconnectFailCount = 0
async function reconnectBot() {
	if (isConnected || isConnecting) return

	const isOpen = await isMarketOpen()
	if (!isOpen) {
		reconnectFailCount = 0
		return
	}

	// Si hubo fallos previos, esperar un tiempo proporcional
	if (reconnectFailCount > 0) {
		const waitTime = Math.min(60000, reconnectFailCount * 10000) // 10s, 20s... hasta 60s
		console.log(`[SCHEDULER] ⏳ Reintento de conexión en ${waitTime / 1000}s (Fallo #${reconnectFailCount})`)
		await new Promise(resolve => setTimeout(resolve, waitTime))
	}

	try {
		isConnecting = true

		if (reconnectFailCount >= 5) {
			console.log('\n[SCHEDULER] 🚨 Fallos persistentes detectados (5+). Forzando reinicio fatal para limpieza de sesión...')
			process.exit(1) // PM2 reiniciará el bot desde cero
		}

		console.log('\n[SCHEDULER] 🟢 Mercado abierto según intervalos. Conectando...')
		if (globalConnectFunction && globalAPI) {
			await globalConnectFunction(globalAPI)
			isConnected = true
			reconnectFailCount = 0
			console.log('[SCHEDULER] 🟢 Bot conectado y operativo')
		}
	} catch (err) {
		reconnectFailCount++
		console.error('[SCHEDULER] ❌ Error en reconexión:', err.message)
	} finally {
		isConnecting = false
	}
}

async function isMarketOpen() {
	if (!globalAPI) return false
	return await isActiveOpen(globalAPI)
}

// ── DYNAMIC MONITOR ─────────────────────────────────────────────────────────

async function startMarketMonitor() {
	if (marketMonitorActive) return
	marketMonitorActive = true

	console.log('[SCHEDULER] Iniciando monitor dinámico de intervalos...')

	const runCheck = async () => {
		try {
			const event = await getNextMarketEvent(globalAPI)
			if (!event) {
				console.log('[SCHEDULER] ⚠️ No se pudo obtener información del próximo evento.')
				setTimeout(runCheck, 60000) // Reintentar en 1 min
				return
			}

			const isOpen = await isMarketOpen()

			if (isOpen && !isConnected) {
				reconnectBot().catch(err => console.error('[SCHEDULER] Error en monitor (reconnect):', err.message))
			} else if (!isOpen && isConnected) {
				disconnectBot().catch(err => console.error('[SCHEDULER] Error en monitor (disconnect):', err.message))
			}

			// Informar estado actual
			if (isOpen) {
				const minLeft = Math.floor(event.delay / 60)
				console.log(`[SCHEDULER] Monitor: Mercado ABIERTO. Cierre en ${minLeft} min (aprox).`)
			} else {
				const minLeft = Math.floor(event.delay / 60)
				console.log(`[SCHEDULER] Monitor: Mercado CERRADO. Próxima apertura en ${minLeft} min.`)
			}

			// El delay máximo para el próximo check es de 1 minuto,
			// pero si ocurre un evento antes (apertura/cierre), despertamos justo ahí (-2 segundos para seguridad)
			const nextCheckDelay = Math.max(5000, Math.min(60000, (event.delay * 1000) - 2000))
			setTimeout(runCheck, nextCheckDelay)

		} catch (err) {
			console.error('[SCHEDULER] ❌ Error en monitor de mercado:', err.message)
			setTimeout(runCheck, 30000)
		}
	}

	runCheck()
}

// ── INITIALIZATION ────────────────────────────────────────────────────────────

async function initScheduler(API, connectFunction) {
	console.log('[SCHEDULER] Configurando scheduler dinámico...')

	globalAPI = API
	globalConnectFunction = connectFunction

	// Crons fijos para date/sesion (Independientes del mercado)
	if (!schedulerInitialized) {
		// CRON 1: 22:00
		cron.schedule('0 22 * * *', () => {
			console.log(`[SCHEDULER] 🕒 22:00 - Actualizando fecha y sesión...`)
			updateManagerDate()
			updateManagerSesion('S1')
		}, { timezone: "America/Argentina/Buenos_Aires" })

		// CRON 2: 09:00
		cron.schedule('0 9 * * *', () => {
			console.log(`[SCHEDULER] 🕒 09:00 - Cambiando a sesión S2...`)
			updateManagerSesion('S2')
		}, { timezone: "America/Argentina/Buenos_Aires" })

		schedulerInitialized = true
	}

	// Verificar estado inicial
	const isOpenAtStart = await isMarketOpen()
	isConnected = isOpenAtStart

	// Iniciar monitor dinámico de fondo
	startMarketMonitor()

	return isConnected
}

module.exports = {
	initScheduler,
	disconnectBot,
	reconnectBot,
	isMarketOpen,
	resetWatchdog,
	cancelWatchdog
}
