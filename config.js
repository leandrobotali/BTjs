require('dotenv').config();

module.exports = {
	// Configuración de Estrategia LMTA
	version: '1.0.0',
	strategy: {
		minTicks: 55, // Mínimo de ticks para analizar
		whiplashWindow: 15, // Últimos N ticks para detectar latigazo
		stagnation: {
			maxTicks: 10, // Ticks consecutivos para considerar estancamiento (Subido de 8 a 10 para filtrar ruido)
			priceThreshold: 0.000010 // Variación máxima de precio para estancamiento
		},
		levels: {
			proximity: 0.000050, // Umbral para considerar "toque" de nivel
			roundNumbers: [0, 500] // Terminaciones para números redondos (000, 500)
		},
		naturality: {
			ratioThreshold: 2.0 // Ratio para considerar movimiento irregular (> 2x)
		}
	},
	version: 'V2',
	username: process.env.USERIQ,
	passwd: process.env.PASSWD,

	inversion: process.env.INVERSION,
	candleSize: process.env.CANDSIZE,
	cantCandles: process.env.CANTCANDLES,
	optionType: process.env.OPTIONTYPE,
	accountType: process.env.ACCOUNTTYPE,
	activePrincipal: process.env.ACTIVEPRINCIPAL,
	activeSecondary: process.env.ACTIVESECONDARY,
	duracion_op: process.env.DURACION_OP,

	WEBSOCKET: {
		GATEWAY: {
			protocol: "wss",
			host: "iqoption.com",
			port: 443,
			path: "echo/websocket"
		}
	},
	API: {
		URL: {
			default: "iqoption.com",
			auth: "auth.iqoption.com",
			billing: "billing.iqoption.com"
		}
	}
}