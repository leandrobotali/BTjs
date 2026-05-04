require('dotenv').config();

module.exports = {
	version: "V5",
	rep_directory: process.env.REP_DIRECTORY,
	// Configuración del Motor de Micro-Dinámica (Engine)
	engine: {
		windowSize: 100,       // ticks exactos a analizar constantemente
		entryWindowStart: 1,   // segundo de la vela para empezar a analizar
		entryWindowEnd: 25,    // segundo de la vela hasta donde puede operar
		CI_min: 0.25,          // Coherencia mínima para operar
		CET_min: 0.10,         // Actividad mínima para operar
		entry_threshold: 0.35, // Score mínimo para ejecutar
		learning_rate: 0.01,   // Tasa de aprendizaje del learner
	},

	username: process.env.USERIQ,
	passwd: process.env.PASSWD,

	inversion: parseFloat(process.env.INVERSION) || 1,
	profitEstimado: parseFloat(process.env.PROFIT_ESTIMADO) || 0.86,
	maxInversion: parseFloat(process.env.MAX_INVERSION) || 10,
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