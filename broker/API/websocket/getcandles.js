module.exports = function(active, size, count, to) {
	return new Promise((resolve, reject) => {
		if (!(active in this.actives))
			return reject("Ativo inválido.")
// {"name":"sendMessage","request_id":"135","local_time":19853,"msg":{"name":"get-candles","version":"2.0","body":{"active_id":1861,"ssize":60,"from_id":748270,"to_id":748288,"split_normalization":true,"only_closed":true}}}
		const id = this.WebSocket.send("sendMessage", {
			name: "get-candles",
			version: "2.0",
			body: {
				active_id: this.actives[active],
				size,
				to,
				count,
				// split_normalization:true,
				only_closed:true
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