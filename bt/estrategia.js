const config = require('../config.js')
const rp = require('./reports.js')

// let operaciones = [
// 	{
// 		result: 'WIN',
// 		hr_fin: new Date('2025-01-22T14:18:00.685Z'),
// 		direction: 'PUT',
// 		monto: '1'
// 	},
// 	{
// 		result: 'LOSS',
// 		hr_fin: new Date('2025-01-22T16:48:04.171Z'),
// 		direction: 'PUT',
// 		monto: '1'
// 	}
// ]
let operaciones = []
let velasUnMin = []
let tendencia1min
let tendencia5seg
let mediaMovil1Min80 = 0
let mediaMovil1Min40 = 0
let mediaMovil5seg80 = 0
let mediaMovil5seg40 = 0
let rsi = 0
let volatility = ''

let opering = false
let last_instrument_used = 0

function checkLastOP() {
	if (operaciones.length == 0) {
		return true; // Si el array está vacío, retorna true
	}

	// Obtén la última operación
	const lastOperation = operaciones[operaciones.length - 1];
	
	// Calcula el tiempo actual y la diferencia en milisegundos
	const now = new Date();
	const timeDifference = now - lastOperation.hr_fin;

	// Convierte la diferencia a minutos
	const minutesDifference = timeDifference / (1000 * 60);
	// console.log('minutos de diferencia con la ultima operacion: ', minutesDifference);
	

	// Verifica si el resultado es "WIN" y si el tiempo transcurrido es mayor a 3 minutos
	return (lastOperation.result === "WIN" || (lastOperation.result === "LOSS" && minutesDifference > 3));
}

function agregarOP(op) {
	operaciones.push({...op})
	if(operaciones.length > 8)
		operaciones.shift()
}

function calcularMonto() {
	let sumaMontos = 0;
	let seEncontroWin = false;
	console.log('OPERACIONES: ', operaciones);
	

	// Recorremos el array de operaciones de forma inversa
	for (let i = operaciones.length - 1; i >= 0; i--) {
		const operacion = operaciones[i];

		if (operacion.result === "WIN") {
			seEncontroWin = true;
			break; // Dejamos de sumar montos al encontrar un "win"
		}

		if (operacion.result === "LOSS") {
			sumaMontos += parseFloat(operacion.monto);
		}
	}

	// Si no se encontró un "win" en todo el array o la última operación fue un "win"
	if (!seEncontroWin || sumaMontos === 0) {
		return config.inversion;
	}

	// Si se encontraron operaciones consecutivas "loss" después de un "win"
	const resultado = (parseFloat(config.inversion) + (sumaMontos / 0.92)).toFixed(2);
	return resultado.toString();
}

function esFinMin(timestamp) {
	const date = new Date(timestamp * 1000);
	return date.getSeconds() === 0; // El segundo debe ser 0 para estar en un minuto exacto
}

function calcularRsi(candles, periodos) {
	let ganancias = 0;
	let perdidas = 0;

	// Calculamos las ganancias y pérdidas de los primeros 'periodos'
	for (let i = 1; i <= periodos; i++) {
		const cambio = candles[i].close - candles[i - 1].close;

		if (cambio > 0) {
			ganancias += cambio;
		} else {
			perdidas += Math.abs(cambio);
		}
	}

	// Redondeamos las ganancias y pérdidas a 6 decimales para evitar problemas de precisión
	const mediaGanancias = parseFloat((ganancias / periodos).toFixed(8));
	const mediaPerdidas = parseFloat((perdidas / periodos).toFixed(8));

	// Cálculo del RS (Relative Strength) y del RSI con verificación de división por cero
	let RSI
	if (mediaPerdidas === 0) {
		RSI = 100; // Si no hay pérdidas, el RSI es máximo
	} else {
		const RS = mediaGanancias / mediaPerdidas;
		RSI = 100 - (100 / (1 + RS));
	}

	return RSI;
}


function definirTendencia1Min() {
	if(parseFloat((mediaMovil1Min40 + 0.0001).toFixed(6)) <= mediaMovil1Min80)
		tendencia1min = 'BAJISTA'
	else if(parseFloat((mediaMovil1Min80 + 0.0001).toFixed(6)) <= mediaMovil1Min40)
		tendencia1min = 'ALCISTA'
	else
		tendencia1min = 'NONE'
}

function definirTendencia5Seg() {
	if(parseFloat((mediaMovil5seg40 + 0.000025).toFixed(6)) <= mediaMovil5seg80)
		tendencia5seg = 'BAJISTA'
	else if(parseFloat((mediaMovil5seg80 + 0.000025).toFixed(6)) <= mediaMovil5seg40)
		tendencia5seg = 'ALCISTA'
	else
		tendencia5seg = 'NONE'
}

function calcularMedia(candles) {
	// Sumar todos los valores de cierre de las velas
	const suma = candles.reduce((acumulador, vela) => acumulador + vela.close, 0);

	return parseFloat((suma / candles.length).toFixed(6))
}

function definirVelasUnMin(candles) {
	/* Nos quedamos con las velas que cierran el minuto para promediar su valor de cierre */
	velasUnMin = []

	candles.forEach(c => {
		if(esFinMin(c.to))
			velasUnMin.push(c)
	});
}

module.exports = {
	checkOpering: () => !opering,

	actualizarIndicadores: async (candles,API,active) => {
		try {
			definirVelasUnMin(candles)
			
			mediaMovil1Min80 = calcularMedia(velasUnMin)//calculamos una media de 100 aprox
			const mitad = Math.floor(velasUnMin.length / 2); // Calcular la mitad del array
			mediaMovil1Min40 = calcularMedia(velasUnMin.slice(-mitad))//calculamos una media de 50 aprox
			mediaMovil5seg80 = calcularMedia(candles.slice(-80))
			mediaMovil5seg40 = calcularMedia(candles.slice(-40))

			definirTendencia1Min()
			definirTendencia5Seg()

			rsi = calcularRsi(candles.slice(-11),10)

			const assets = await API.getAssets("digital-option")

			let act = assets.data.find(a => a.active_id == active.id)

			volatility = act.volatility_tier
			
		} catch (err) {
			throw err
		}
	},

	ejecutarEstrategia: async (API, active,candle) => {
		try {
			// console.log('entra a operar ', opering);
			
			if(!opering){
				opering = true
				let direction
				// console.log('check ', checkLastOP());
				// console.log('volatility ', volatility);
				// console.log('rsi: ', rsi);
				if((volatility == 'low' || volatility == 'medium') && checkLastOP()){
					if(rsi >= 75 && tendencia1min == 'BAJISTA' && tendencia5seg == 'BAJISTA' && candle.close >= mediaMovil5seg40)
						direction = 'PUT'
					else if(rsi <= 25 && tendencia1min == 'ALCISTA' && tendencia5seg == 'ALCISTA' && candle.close <= mediaMovil5seg40)
						direction = 'CALL'
				}
				// }else
				// 	console.log('NO OPERAMOS PORQUE LA VOLATILIDAD ES: ' + volatility + ' O PORQUE LA ULTIMA OPERACION FALLO HACE MENOS DE 3 MINUTOS ' + operaciones[operaciones.length - 1].hr_fin);
				
				
				if(direction != undefined){
					console.log('se opera: ', new Date());
					console.log('SE EFECTUA LA OPERACION CON LOS SIGUIENTES VALOR DE LOS INDICADORES:')
					console.log('MM 1 min 80: ', mediaMovil1Min80);
					console.log('MM 1 min 40: ', mediaMovil1Min40);
					console.log('MM 5 seg 80: ', mediaMovil5seg80);
					console.log('MM 5 seg 40: ', mediaMovil5seg40);
					console.log('tendencia 1 min: ', tendencia1min);
					console.log('tendencia 5 seg: ', tendencia5seg);
					console.log('rsi: ', rsi);
					console.log('precio de vela: ', candle.close);
					console.log('volatilidad: ', volatility);

					const monto = calcularMonto()

					const instruments = await API.getInstruments("digital-option",active)
					// console.log(instruments);
					
					let instruments_free = instruments.instruments.filter(i => i.index != last_instrument_used)
					last_instrument_used = instruments_free[instruments_free.length - 1].index
					// API.suscribeOption("digital-option",active,instruments.instruments[0].index)
					
					const operacion = {
						active: active.name,
						active_id: active.id,
						instrument_index: last_instrument_used,
						action: direction,
						amount: monto,
						type: config.optionType,
						duration: config.duracion_op
					}
					// console.log('OPERACION ', operacion);
					
					const order = await API.trade(operacion);
					
					await order.close();
					const result = order.quote.win ? "WIN" : "LOSS";
					const op = {
						result,
						hr_fin: new Date(),
						direction, 
						monto
					}

					agregarOP(op)

					console.log('orden cerrada: ', op);

					await rp.finalizarOP(API,op)
					
					// await API.unSuscribeOption("digital-option",active,instruments.instruments[0].index)
				}
					
				opering = false

				return true
			}else{
				return true
			}
		} catch (err) {
			opering = false
			throw err
		}
	}
}

/*
function ingresarSopRes(value){
	let index = sop_res.findIndex(spr => spr.value == value)
	if(index < 0)
		sop_res.push({
			value,
			valid: 1
		})
	else
		sop_res[index].valid += 1
}

function establecerSopRes(){
	sop_res = []
	currentCandles.forEach( cl => {
		if(cl.direction == 'ALCISTA'){
			if(cl.max > cl.close)
				ingresarSopRes(cl.max)
			if(cl.min < cl.open)
				ingresarSopRes(cl.min)
		} else{
			if(cl.min > cl.close)
				ingresarSopRes(cl.min)
			if(cl.max < cl.open)
				ingresarSopRes(cl.max)
		}
	});
}
 */