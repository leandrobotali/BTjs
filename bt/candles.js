const config = require('../config.js')
const utils = require('../utils.js')
const ac = require('./active.js')
const rp = require('./reports.js')
const es = require('./estrategia.js')

let currentCandles = []
let lastCandle

let initOpHr = false
let initBlDiario = false
let opering = false

let check = false //para chequear el activo al inicio de la vela

async function pedirCandles(API,activ,cantidad){
	try{
		let candles = await API.getCandles(activ,parseInt(config.candleSize),parseInt(cantidad),Date.now())
		
		/* eliminamos la ultima vela porque ya es una vela empezada */
		lastCandle = candles.pop()

		return candles
	} catch (err) {
		throw err
	}
}

async function actualizarCandles(API,activ){
	let new_candles = await pedirCandles(API,activ,4)
	new_candles.forEach( ncl =>{
		if(!currentCandles.find(cc => cc.id == ncl.id)){
			/* si la vela no se encuentra en el array de velas, la agregamos al final, y eliminamos la primera */
			ncl.direction = ncl.open < ncl.close ? 'ALCISTA' : (ncl.open > ncl.close ? 'BAJISTA' : 'NONE')
			currentCandles.push(ncl)
			currentCandles.shift()

			// console.log('SE INGRESO UNA NUEVA VELA', ncl);
		}
	})
	/* actualizamos los indicadores con las velas actuales */
	es.actualizarIndicadores(currentCandles)
}

async function loadCandles(API,activ) {
	try {
		let candles = await pedirCandles(API,activ,config.cantCandles)
		// console.log('ULTIMAS VELAS INICIAL: ', candles.slice(0,3));

		candles.forEach( cl => {
			cl.direction = cl.open < cl.close ? 'ALCISTA' : (cl.open > cl.close ? 'BAJISTA' : 'NONE')
			currentCandles.push(cl)
		})
		/* actualizamos los indicadores con las velas actuales */
		es.actualizarIndicadores(currentCandles)
	} catch (err) {
		throw err
	}
}

async function callback (candle,API,active) {
	try {
		let checkAct = active
		const ahora = new Date();
		const seconds = ahora.getSeconds()
		/* checkeamos el activo solo al inicio de la vela */
		if (seconds <= 4 && !check) {
			check = true
			checkAct = await ac.checkActive(API)
		}else if(seconds > 4 && check)
			check = false
		/* el activo se chequea una vez al inicio de la vela. Si es igual
		al activo ingresado por parametro, sigue. Si no es, se inicializa el bot con el nuevo activo */
		if(active == checkAct){
			const horas = ahora.getHours();  // Obtiene la hora actual (0-23)
			const minutos = ahora.getMinutes();  // Obtiene los minutos actuales (0-59)

			if(minutos == 0){
				/* actualizamos el reporte de operaciones en una hr */
				if(!initOpHr){
					rp.cerrarBalanceHr()
					initOpHr = true
				}
			}else if(initOpHr)
				initOpHr = false
			
			if(horas == 0 && minutos == 0){
				if(!initBlDiario){
					/* actualizamos el reporte diario y total */
					await rp.cerrarBalances(API)
					initBlDiario = true
				}
			}else if(initBlDiario)
				initBlDiario = false

			if(candle.id != lastCandle.id)
				await actualizarCandles(API,active)

			if(!opering){
				opering = true
				await es.ejecutarEstrategia(API,active,candle)
				opering = false
			}
		}else
			await module.exports.initCandles(API,checkAct)
	} catch (err) {
		initOpHr = false
		initBlDiario = false
		opering = false
		throw err
	}
}

module.exports = {
	initCandles: async (API,active) => {
		try {
			/* Cargamos en memoria las velas ya formadas */
			await loadCandles(API,active)
			/* Nos suscribimos a la generacion en tiempo real de las velas */
			API.onCandleGenerate(active, async (candle) =>{
				await callback(candle,API,active)
			})
		} catch (err) {
			throw err
		}
	}
}