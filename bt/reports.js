const config = require('../config.js')
const fs = require('fs').promises;
const path = require('path');

let balance_total
let balance_diario
let operaciones_hora

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
		await fs.writeFile(path.join(__dirname, name), JSON.stringify(contenido, null, 2));
		console.log('Archivo creado exitosamente');
	} catch (err) {
		throw ('Error al crear el archivo:', err);
	}
}

module.exports = {
	initBalanceTotal: async (API) => {
		try {
			const balance = await API.getBalance(config.accountType);
			balance_total = {
				operaciones_totales: 0,
				operaciones_ganadas: 0,
				operaciones_perdidas: 0,
				win_rate: 0,
				dinero_inicial: balance.amount,
				dinero_actual: balance.amount,
			}
		} catch (err) {
			throw err
		}
	},

	initBalanceDiario: async (API) => {
		try {
			const balance = await API.getBalance(config.accountType);
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
		} catch (err) {
			throw err
		}
	},
	
	sumarBalanceTotal: async (API) => {
		try {
			const balance = await API.getBalance(config.accountType);
			balance_total.operaciones_totales += balance_diario.operaciones_totales
			balance_total.operaciones_ganadas += balance_diario.operaciones_ganadas
			balance_total.operaciones_perdidas += balance_diario.operaciones_perdidas
			balance_total.win_rate = ((balance_total.operaciones_ganadas * 100 ) / balance_total.operaciones_totales)
			balance_total.dinero_actual = balance.amount
		} catch (err) {
			throw err
		}
	},
	
	almacenarReportes: async () => {
		try {
			await crearArchivo(fileName(), balance_diario)
			await crearArchivo('reportes/balance_total.txt', balance_total)
		} catch (err) {
			throw err
		}
	},

	initBalanceHr: () => {
		operaciones_hora = {
			inicio: new Date(),
			fin: '',
			operaciones_totales: 0,
			operaciones_ganadas: 0,
			operaciones_perdidas: 0,
			win_rate: 0,
			operaciones:[]
		}
	},

	cerrarBalanceHr: () => {
		operaciones_hora.fin = new Date()
		balance_diario.wr_por_hr.push({...operaciones_hora})

		console.log('OPERACIONES ULTIMA HORA: ', operaciones_hora);

		module.exports.initBalanceHr
	},

	initAllBalances: async (API) => {
		try {
			await module.exports.initBalanceDiario(API);
			await module.exports.initBalanceTotal(API);
			module.exports.initBalanceHr();

			console.log('BALANCES INICIALIZADOS CORRECTAMENTE.');
		} catch (err) {
			throw err
		}
	},

	cerrarBalances: async (API) => {
		try{
			await module.exports.sumarBalanceTotal(API)
			await module.exports.almacenarReportes()
			await module.exports.initBalanceDiario(API)
		} catch (err) {
			throw err
		}
	},

	finalizarOP: async (API, operacion) => {
		try{
			const balance = await API.getBalance(config.accountType);

			balance_diario.dinero_actual = balance.amount
			if(balance_diario.dinero_maximo < balance.amount)
				balance_diario.dinero_maximo = balance.amount
			if(balance_diario.dinero_minimo > balance.amount)
				balance_diario.dinero_minimo = balance.amount
				
			balance_diario.operaciones_totales += 1
			operaciones_hora.operaciones_totales +=1
		
			if(operacion.result == "WIN"){
				balance_diario.operaciones_ganadas += 1
				operaciones_hora.operaciones_ganadas +=1
			}else{
				balance_diario.operaciones_perdidas += 1
				operaciones_hora.operaciones_perdidas +=1
			}
		
			operaciones_hora.win_rate = ((operaciones_hora.operaciones_ganadas * 100 ) / operaciones_hora.operaciones_totales)
			balance_diario.win_rate = ((balance_diario.operaciones_ganadas * 100 ) / balance_diario.operaciones_totales)

			operaciones_hora.operaciones.push(operacion)
		} catch (err) {
			throw err
		}
	}
}