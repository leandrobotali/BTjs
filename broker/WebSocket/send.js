const md5 = require("md5")
const WebSocket = require("ws")

module.exports = function (name, msg) {
	if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
		console.error(`[WS] ❌ Error: Intentando enviar '${name}' pero el socket no está abierto (readyState: ${this.socket ? this.socket.readyState : 'null'})`)
		throw new Error("WebSocket no está abierto")
	}

	const id = md5(Math.random())

	const message = {
		name,
		msg,
		request_id: id
	}

	this.socket.send(JSON.stringify(message))

	return id
}