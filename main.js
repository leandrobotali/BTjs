const IQOption = require("./broker")
const config = require('./config.js')
const inicializar = require('./bt')

IQOption({
	email: config.username,
	password: config.passwd,
	accType: config.accountType // REAL OR PRACTICE
}).then(async API => {
	console.log('=================')
	console.log('INICIALIZANDO BOT')
	console.log('=================')

	await inicializar(API)
}).catch(error => {
	console.log('ERROR ', error)
})