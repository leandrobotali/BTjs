const IQOption = require("ejtraderiq")
const {log, sleep} = require("ejtraderiq/utils")

const inversionInicial = "1"
const candleSize = 60 // MH1 = 60, MH5 = 300
const cantidadCandles = 300
const type = "DIGITAL" // BINARY OR DIGITAL
const accountType = "PRACTICE" // REAL OR PRACTICE
const active = "EURUSD"

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

	const sortedArray = sop_res.sort((a, b) => b.valid - a.valid);

	console.log('SOP_RES: ', sortedArray.slice(0, 10));
	console.log('ULTIMAS VELAS: ', currentCandles.slice(-3));
	
}

async function operar(API,candle){
	console.log('Se ingresa a operar');
	console.log('Segundos de la vela: ',(60 - (candle.to - (Date.now()/1000))));
	opering = true
	if(candle.open == candle.close){
		console.log('No se opera ya que la vela actualmente es un dogi');
		opering = false
		return
	} else {
		let sor = undefined
		if(((candle.open < candle.close) && (candle.max == candle.close)) || ((candle.open > candle.close) && (candle.min == candle.close)))
			sor = sop_res.find(sr => sr.value == candle.close && sr.valid >= 3)

		if(sor){
			console.log('Se encontro soporte o resistencia valido, se procede con la operación');
			try {
				const direction = candle.open < candle.close ? 'PUT' : 'CALL'
				const order = await API.trade({
					active,
					action: direction,
					amount: inversionInicial,
					type,
					duration: candleSize / 60
				})
				await order.close()
				const result = order.quote.win ? "WIN" : "LOSS"
				const balance = await API.getBalance(accountType)
				
				console.log("Result", result)
				console.log("Balance", balance.amount)
	
				opering = false
				return
			} catch (err) {
				console.log('ERROR', err);
				opering = false
			return
			}
		}else{
			console.log('no se encontro Soporte o Resistencia valido, por lo que no se opera aún');
			opering = false
			return
		}
	}
}

IQOption({
	email: "pauliviviani.pv@gmail.com",
	password: "34823646",
}).then(async API => {
	API.accountType(accountType) // REAL OR PRACTICE

	await initCandles(API,active,candleSize,cantidadCandles)

	API.onCandleGenerate(active, async (candle) => {
		if(candle.id != lastCandle.id)
			await actualizarCandles(API,active,candleSize)
		if(!opering && (candle.to - (Date.now()/1000) > 33))
			await operar(API,candle)
	})

}).catch(error => {
	log(error.message)
})