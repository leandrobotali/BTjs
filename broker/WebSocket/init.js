const WebSocket = require("ws")
const config = require("../../config")

module.exports = function() {
	const {
		protocol,
		host,
		port,
		path
	} = config.WEBSOCKET.GATEWAY

	this.socket = new WebSocket(protocol + "://" + host + ":" + port + "/" + path)

	this.socket.on("message", message => {
		message = JSON.parse(message)
		this.emitter.emit(message.name, message)
	})

	return new Promise((resolve, reject) => {
		this.socket.on("open", resolve)
		this.socket.on("error", reject)
	})
}