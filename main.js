const IQOption = require("ejtraderiq")
const {log, sleep} = require("ejtraderiq/utils")
const config = require('./config.js')
const fs = require('fs').promises;
const path = require('path');

const inversionInicial = config.inversion
const candleSize = parseInt(config.candleSize) // MH1 = 60, MH5 = 300
const cantidadCandles = parseInt(config.cantCandles)
const type = config.optionType // BINARY OR DIGITAL
const accountType = config.accountType // REAL OR PRACTICE
let active = config.activePrincipal
let active_secondary = config.activeSecondary

let balance_total = {
	operaciones_totales: 0,
	operaciones_ganadas: 0,
	operaciones_perdidas: 0,
	win_rate: 0,
	dinero_inicial: 0,
	dinero_actual: 0,
}

let balance_diario
let balance_inicializado = false
let operaciones_hora
let operaciones_hora_inicializado = false

let opering = false
let currentCandles = []
let sop_res = []
let lastCandle

function fileName() {
	const today = new Date(); // Obtener la fecha actual
	const yesterday = new Date(today); // Crear un nuevo objeto de fecha
	yesterday.setDate(today.getDate() - 1); // Restar un día para obtener la fecha anterior

	// Formatear la fecha en DD-MM-AAAA
	const day = String(yesterday.getDate()).padStart(2, '0'); // Obtener el día y añadir un cero inicial si es necesario
	const month = String(yesterday.getMonth() + 1).padStart(2, '0'); // Obtener el mes (recuerda que los meses son 0-indexed) y añadir un cero inicial
	const year = yesterday.getFullYear(); // Obtener el año

	return `reportes/${day}-${month}-${year}.txt`; // Crear el nombre del archivo
}

async function crearArchivo(name,contenido) {
	try {
		await writeFile(path.join(__dirname, name), JSON.stringify(contenido, null, 2));
		console.log('Archivo creado exitosamente');
	} catch (err) {
		console.error('Error al crear el archivo:', err);
	}
}

function inicializarOPHr(guardar){
	if(!operaciones_hora_inicializado){
		const ahora = new Date();
		if(guardar){
			operaciones_hora.fin = ahora
			balance_diario.wr_por_hr.push(operaciones_hora)
		}

		console.log('BALANCE DIARIO: ', balance_diario);
		console.log('OPERACIONES ULTIMA HORA: ', operaciones_hora);
		
		operaciones_hora = {
			inicio: ahora,
			fin: '',
			operaciones_totales: 0,
			operaciones_ganadas: 0,
			operaciones_perdidas: 0,
			win_rate: 0
		}
		operaciones_hora_inicializado = true
	}
}

async function inicializarBalance(API,almacenar){
	if(!balance_inicializado){
		const balance = await API.getBalance(accountType);

		if(almacenar){
			balance_total.operaciones_totales += balance_diario.operaciones_totales
			balance_total.operaciones_ganadas += balance_diario.operaciones_ganadas
			balance_total.operaciones_perdidas += balance_diario.operaciones_perdidas
			balance_total.win_rate = ((balance_total.operaciones_ganadas * 100 ) / balance_total.operaciones_totales)
			balance_total.dinero_actual = balance.amount

			await crearArchivo(fileName(), balance_diario)
			await crearArchivo('reportes/balance_total.txt', balance_total)
		}

		balance_diario = {
			operaciones_totales: 0,
			operaciones_ganadas: 0,
			operaciones_perdidas: 0,
			win_rate: 0,
			dinero_inicial: balance.amount,
			dinero_actual: balance.amount,
			dinero_maximo: balance.amount,
			dinero_minimo: balance.amount,
			wr_por_hr: []
		}

		balance_inicializado = true
	}
}

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
	

	const sortedArray = sop_res.sort((a, b) => b.valid - a.valid);

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
	const sor = ((candle.open < candle.close && candle.max == candle.close) ||
				(candle.open > candle.close && candle.min == candle.close)) 
				? sop_res.find(sr => sr.value == candle.close && sr.valid >= 1) 
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
		console.log('========>>>ORDEN<<<=========');
		console.log(order.quote);
		console.log('========>>>ORDEN<<<=========');
		
		console.log("Resultado: ", result);
		console.log("Balance actual: ", balance.amount);

		balance_diario.dinero_actual = balance.amount
		if(balance_diario.dinero_maximo < balance.amount)
			balance_diario.dinero_maximo = balance.amount
		if(balance_diario.dinero_minimo > balance.amount)
			balance_diario.dinero_minimo = balance.amount
		
		balance_diario.operaciones_totales += 1
		operaciones_hora.operaciones_totales +=1

		if(result == "WIN"){
			balance_diario.operaciones_ganadas += 1
			operaciones_hora.operaciones_ganadas +=1
		}else{
			balance_diario.operaciones_perdidas += 1
			operaciones_hora.operaciones_perdidas +=1
		}

		operaciones_hora.win_rate = ((operaciones_hora.operaciones_ganadas * 100 ) / operaciones_hora.operaciones_totales)
		balance_diario.win_rate = ((balance_diario.operaciones_ganadas * 100 ) / balance_diario.operaciones_totales)

	} catch (err) {
		console.error('Error al intentar operar: ', err);
		throw err; // Relanzar el error para que se maneje externamente si es necesario
	}
}

IQOption({
	email: config.username,
	password: config.passwd,
}).then(async API => {
	let suscribe = true
	async function callback (candle) {
		if(suscribe){
			const ahora = new Date();
			const horas = ahora.getHours();  // Obtiene la hora actual (0-23)
			const minutos = ahora.getMinutes();  // Obtiene los minutos actuales (0-59)

			if(minutos == 0){
				operaciones_hora_inicializado = false
			}

			inicializarOPHr(true)

			if(horas == 0 && minutos == 0)
				balance_inicializado = false

			await inicializarBalance(API,true)

			if(candle.id != lastCandle.id)
				await actualizarCandles(API,active,candleSize)
			if(!opering && (candle.to - (Date.now()/1000) > 33)){
				try {
					opering = true
					await operar(API,candle)
				} catch (err) {
					suscribe = false
					console.log('ERROR ', err);
				} finally {
					opering = false
				}
			}
		}else{
			let aux = active
			active = active_secondary
			active_secondary = aux

			await initCandles(API,active,candleSize,cantidadCandles)
			suscribe = true
			API.onCandleGenerate(active, callback)
		}
	}

	API.accountType(accountType) // REAL OR PRACTICE

	console.log('=================');
	console.log('INICIALIZANDO BOT');
	console.log('=================');

	// const activos = await API.getAllActives();
	// console.log('ACTIVOS: ', activos);
	console.log('METODOS: ', Object.keys(API));
	
	
	const balance = await API.getBalance(accountType);
	balance_total.dinero_inicial = balance.amount
	await inicializarBalance(API)
	inicializarOPHr()

	await initCandles(API,active,candleSize,cantidadCandles)

	API.onCandleGenerate(active, callback)

}).catch(error => {
	console.log('ERROR ', error)
})