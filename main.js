const IQOption = require("./broker")
const config = require('./config.js')
const inicializar = require('./index.js')

IQOption({
	email: config.username,
	password: config.passwd,
	accType: config.accountType
}).then(async API => {
	console.log('=========================================')
	console.log('   BOT TRADING LMTA - INICIALIZANDO')
	console.log('=========================================')
	console.log(`Activo: ${config.activePrincipal}`)
	console.log(`Cuenta: ${config.accountType}`)
	console.log(`Inversión: ${config.inversion}`)
	console.log('=========================================')

	await inicializar(API)
}).catch(error => {
	console.error('ERROR CRÍTICO:', error)
	process.exit(1)
})