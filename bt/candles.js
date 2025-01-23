const config = require('../config.js')
const utils = require('../utils.js')
const ac = require('./active.js')
const rp = require('./reports.js')
const es = require('./estrategia.js')

let currentCandles = []
let lastCandle
let lastCandleGenerated = {id:0}

let initOpHr = false
let initBlDiario = false
let op = undefined

let operating = false //variable para indicar que se está operando
let check = false //para chequear el activo al inicio de la vela
let updating = false //para actualizar velas, indicadores y reportes
let genereting = false //para la generacion de velas

async function pedirCandles(API,activ,cantidad){
	try{
		let candles = await API.getCandles(activ,parseInt(config.candleSize),parseInt(cantidad),Date.now())
		
		
		// console.log('candles total: ', candles.slice(-3));
		
		/* eliminamos la ultima vela porque ya es una vela empezada */
		lastCandle = candles.pop()
		// console.log('VELA EN CURSO: ', lastCandle);
		// console.log('ULTIMA VELA: ', candles[candles.length -1]);
		
		

		return candles
	} catch (err) {
		throw err
	}
}

// async function actualizarCandles(API,active){
// 	let new_candles = await pedirCandles(API,active,4)
// 	new_candles.forEach( ncl =>{
// 		if(!currentCandles.find(cc => cc.id == ncl.id)){
// 			/* si la vela no se encuentra en el array de velas, la agregamos al final, y eliminamos la primera */
// 			ncl.direction = ncl.open < ncl.close ? 'ALCISTA' : (ncl.open > ncl.close ? 'BAJISTA' : 'NONE')
// 			currentCandles.push(ncl)
// 			currentCandles.shift()

// 			// console.log('SE INGRESO UNA NUEVA VELA', ncl);
			
// 			/* actualizamos los indicadores con las velas actuales */
// 			es.actualizarIndicadores(currentCandles,API,active)
// 		}
// 	})
// }
async function actualizarCandles(candle,API,active){
	// console.log('se ejecuta la actualizacion de velas');
	
	if(!currentCandles.find(cc => cc.id == candle.id)){
		candle.direction = candle.open < candle.close ? 'ALCISTA' : (candle.open > candle.close ? 'BAJISTA' : 'NONE')
		currentCandles.push(candle)
		currentCandles.shift()
		/* actualizamos los indicadores con las velas actuales */
		es.actualizarIndicadores(currentCandles,API,active)

		// console.log('candles: ',currentCandles.slice(-3));
	}
}

async function loadCandles(API,active) {
	try {
		currentCandles = []
		
		let candles = await pedirCandles(API,active,config.cantCandles)
		// console.log('ULTIMAS VELAS INICIAL: ', candles.slice(-3));

		candles.forEach( cl => {
			cl.direction = cl.open < cl.close ? 'ALCISTA' : (cl.open > cl.close ? 'BAJISTA' : 'NONE')
			currentCandles.push(cl)
		})
		/* actualizamos los indicadores con las velas actuales */
		es.actualizarIndicadores(currentCandles,API,active)
	} catch (err) {
		throw err
	}
}

async function callback (candle,API,active) {
	try {
		/* validamos que no se esté operando */
		if(!operating){
			// console.log('entra en callback: ');
			
			operating = true
			// console.log('ULTIMA VELA ID ', lastCandleGenerated.id);
			// console.log('VELA EN CURSO ID ', candle.id);
			
			let checkAct = active
			const ahora = new Date();
			const seconds = ahora.getSeconds()
			/* checkeamos el activo solo al inicio de la vela */
			if (seconds <= 4 && !check && es.checkOpering()) {
				check = true
				checkAct = await ac.checkActive(API)
			}else if(seconds > 4 && check)
				check = false
			/* el activo se chequea una vez al inicio de la vela. Si es igual
			al activo ingresado por parametro, sigue. Si no es, se inicializa el bot con el nuevo activo */
			if(active.name == checkAct.name){
				/* actualizamos las velas, indicadores y reportes */
				const horas = ahora.getHours();  // Obtiene la hora actual (0-23)
				const minutos = ahora.getMinutes();  // Obtiene los minutos actuales (0-59)
				/* almacenamos el valor de la vela que se esta generando constantemente y al inicio del bot */
				if(lastCandleGenerated.id == 0 || lastCandleGenerated.id == candle.id)
					lastCandleGenerated = candle

				if(minutos == 0){
					/* actualizamos el reporte de operaciones en una hr una vez*/
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

				if(candle.id != lastCandleGenerated.id && lastCandleGenerated.id != 0){
					/* actualizamos las velas, solo si se trata de una nueva vela*/
					await actualizarCandles(lastCandleGenerated,API,active)
					es.ejecutarEstrategia(API,active,lastCandleGenerated)
					lastCandleGenerated = candle
					// op = true
				}

				operating = false
			}else{
				await API.endCandleGenerate(active,parseInt(config.candleSize))
				await utils.sleep(5000)
				lastCandleGenerated = {id:0}
				operating = false
				check = false
				genereting = false
				await module.exports.initCandles(API,checkAct)
			}
		}
	} catch (err) {
		initOpHr = false
		initBlDiario = false
		operating = false
		check = false
		throw err
	}
}

module.exports = {
	initCandles: async (API,active) => {
		try {
			if(!genereting){
				genereting = true
				/* Cargamos en memoria las velas ya formadas */
				console.log('Active ', active);
				
				await loadCandles(API,active)
				console.log('VELAS CARGADAS');
				/* Nos suscribimos a la generacion en tiempo real de las velas */
				await API.onCandleGenerate(active, parseInt(config.candleSize), async (candle) =>{
					// await utils.sleep(1000);
					await callback(candle,API,active)
				})
			}
		} catch (err) {
			throw err
		}
	}
}