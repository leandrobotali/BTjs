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
}