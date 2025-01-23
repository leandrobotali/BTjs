module.exports = function(active, size, count, to) {
	return new Promise((resolve, reject) => {
		if ((!active.name in this.actives))
			return reject("getCandles Activo inválido.")

		const id = this.WebSocket.send("sendMessage", {
			name: "get-candles",
			version: "2.0",
			body: {
				active_id: active.id,
				size,
				to,
				count
			}
		})

		const callback = message => {
			if (message.request_id == id) {
				this.WebSocket.emitter.removeListener("candles", callback)
				if (message.status != 2000) return reject(message.msg)
				return resolve(message.msg.candles)
			}
		}

		this.WebSocket.getMessage("candles", callback)
	})
}