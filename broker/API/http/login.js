const config = require("../../../config")

module.exports = async function(email, password) {
	const {
		code,
		message,
		ssid
	} = await this.Http(config.API.URL.auth, "api/v2/login", "POST", {
		identifier: email,
		password
	}, {
		Cookie: "lang=pt_PT"
	})

	if (code != "success")
		throw new Error(message)

	this.ssid = ssid
}