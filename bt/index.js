const rp = require('./reports.js')
const ac = require('./active.js')
const can = require('./candles.js')

module.exports = function(API) {
	return new Promise(async (resolve, reject) => {
		try {
			/* inicializamos los balances para los reportes */
			await rp.initAllBalances(API)
			/* Obtenemos el activo a operar */
			let active = await ac.checkActive(API)
			/* cargamos las velas e iniciamos el stream */
			await can.initCandles(API,active)
		} catch (err) {
			reject(err)
		}
	});
}