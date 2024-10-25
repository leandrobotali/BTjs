require('dotenv').config();

module.exports = {
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