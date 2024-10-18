const IQOption = require("ejtraderiq")
const {log, sleep} = require("ejtraderiq/utils")
const config = require('./config.js')

const inversionInicial = config.inversion
const candleSize = parseInt(config.candleSize) // MH1 = 60, MH5 = 300
const cantidadCandles = parseInt(config.cantCandles)
const type = config.optionType // BINARY OR DIGITAL
const accountType = config.accountType // REAL OR PRACTICE
const active = config.activePrincipal
const active_secondary = config.activeSecondary

let opering = false
let currentCandles = []
let sop_res = []
let lastCandle

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

async function pedirCandles(API,activ,canSize,cantCandles){
	let candles = await API.getCandles(activ, canSize, cantCandles, Date.now())
	lastCandle = candles.pop()

	return candles
}

async function actualizarCandles(API,activ,canSize){
	let new_candles = await pedirCandles(API,activ,canSize,3)
	new_candles.forEach( ncl =>{
		if(!currentCandles.find( cc => cc.id == ncl.id)){
			ncl.direction = ncl.open < ncl.close ? 'ALCISTA' : (ncl.open > ncl.close ? 'BAJISTA' : 'NONE')
			currentCandles.push(ncl)
			currentCandles.shift()
			establecerSopRes()

			console.log('SE INGRESO UNA NUEVA VELA Y SE ACTUALIZARON LOS SOP/RES');
			
		}
	})

	// console.log('SE ACTUALIZARON LAS VELAS: ', currentCandles.slice(-2));
}

async function initCandles(API,activ,canSize,cantCandles) {
	let candles = await pedirCandles(API,activ,canSize,cantCandles)
	// console.log('ULTIMAS VELAS INICIAL: ', candles.slice(0,3));

	candles.forEach( cl => {
		cl.direction = cl.open < cl.close ? 'ALCISTA' : (cl.open > cl.close ? 'BAJISTA' : 'NONE')
		currentCandles.push(cl)
	})

	// currentCandles = currentCandles.sort((a, b) => b.to - a.to)
	establecerSopRes()

	console.log('VELAS CARGADAS Y SOP/RES ESTABLECIDOS');
	

	// const sortedArray = sop_res.sort((a, b) => b.valid - a.valid);

	// console.log('SOP_RES: ', sortedArray.slice(0, 10));
	// console.log('ULTIMAS VELAS: ', currentCandles.slice(-3));
	
}

async function operar(API,candle){
	// console.log('Se ingresa a operar');
	// const segundosVela = 60 - (candle.to - (Date.now() / 1000));
	// console.log('Segundos de la vela: ', segundosVela);

	opering = true;

	// Si es un doji, no se opera
	if (candle.open === candle.close) {
		// console.log('No se opera ya que la vela actualmente es un doji');
		return;
	}

	// Identificar soporte o resistencia válido
	const sor = ((candle.open < candle.close && candle.max === candle.close) ||
				(candle.open > candle.close && candle.min === candle.close)) 
				? sop_res.find(sr => sr.value === candle.close && sr.valid >= 1) 
				: undefined;

	if (!sor) {
		// console.log('No se encontró soporte o resistencia válida, por lo que no se opera.');
		return;
	}

	console.log('Se encontró soporte o resistencia válida: ', sor, ' fecha: ', new Date);

	// Intento de operación
	try {
		const direction = candle.open < candle.close ? 'PUT' : 'CALL';
		const order = await API.trade({
			active,
			action: direction,
			amount: inversionInicial,
			type,
			duration: candleSize / 60
		});

		await order.close();
		const result = order.quote.win ? "WIN" : "LOSS";
		const balance = await API.getBalance(accountType);

		console.log("Resultado: ", result);
		console.log("Balance actual: ", balance.amount);

	} catch (err) {
		console.error('Error al intentar operar: ', err);
		throw err; // Relanzar el error para que se maneje externamente si es necesario
	}
}

IQOption({
	email: config.username,
	password: config.passwd,
}).then(async API => {

	async function callback (candle) {
		if(candle.id != lastCandle.id)
			await actualizarCandles(API,active,candleSize)
		if(!opering && (candle.to - (Date.now()/1000) > 33)){
			try {
				opering = true
				await operar(API,candle)
			} catch (err) {
				console.log('ERROR ', err);
			} finally {
				opering = false
			}
		}
	}

	API.accountType(accountType) // REAL OR PRACTICE

	console.log('=================');
	console.log('INICIALIZANDO BOT');
	console.log('=================');

	await initCandles(API,active,candleSize,cantidadCandles)

	API.onCandleGenerate(active, callback)

}).catch(error => {
	console.log('ERROR ', error)
})