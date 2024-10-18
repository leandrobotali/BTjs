require('dotenv').config();

console.log('ENV: ', process.env)
module.exports = {
	username: process.env.USERNAME,
	passwd: process.env.PASSWD,

	inversion: process.env.INVERSION
}