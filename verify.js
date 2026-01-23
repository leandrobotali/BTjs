// Script de verificación de la estructura del bot

console.log('Verificando estructura del bot...\n')

try {
	// Core
	console.log('✓ Core modules:')
	const SimpleMutex = require('./core/mutex.js')
	console.log('  - mutex.js')
	const active = require('./core/active.js')
	console.log('  - active.js')
	const candles = require('./core/candles.js')
	console.log('  - candles.js')
	
	// Strategy
	console.log('\n✓ Strategy modules:')
	const lmtaCore = require('./strategy/lmta-core.js')
	console.log('  - lmta-core.js')
	const lmtaStrategy = require('./strategy/lmta-strategy.js')
	console.log('  - lmta-strategy.js')
	
	// Operations
	console.log('\n✓ Operations modules:')
	const trade = require('./operations/trade.js')
	console.log('  - trade.js')
	
	// Reports
	console.log('\n✓ Reports modules:')
	const reports = require('./reports/manager.js')
	console.log('  - manager.js')
	
	// Indicators
	console.log('\n✓ Indicators modules:')
	const rsi = require('./indicators/rsi.js')
	console.log('  - rsi.js')
	const ma = require('./indicators/moving-averages.js')
	console.log('  - moving-averages.js')
	const trend = require('./indicators/trend.js')
	console.log('  - trend.js')
	
	// Main
	console.log('\n✓ Main modules:')
	const config = require('./config.js')
	console.log('  - config.js')
	const initialize = require('./index.js')
	console.log('  - index.js')
	
	console.log('\n✅ Todos los módulos cargados correctamente')
	console.log('\nPara ejecutar el bot:')
	console.log('  node main.js')
	
} catch (err) {
	console.error('\n❌ Error:', err.message)
	console.error('\nStack:', err.stack)
}
