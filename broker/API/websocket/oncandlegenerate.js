module.exports = function(active, size, callback) {
	return new Promise((resolve, reject) => {
		
		// if (!(active.name in this.actives))
		// 	return reject("Activo inválido.")

		// const activeId = this.actives[active.name]
		console.log('INICIAMOS LA GENERACIÓN DE VELAS DEL ACTIVO ' + active.name)
		this.WebSocket.send("subscribeMessage", {
			name: "candle-generated",
			params: {
				routingFilters: {
					active_id: active.id,
					size
				}
			}
		})

		this.WebSocket.getMessage("candle-generated", async message => {
			if (message.msg.active_id == active.id) {
				await callback(message.msg)
			}
		})
	})
}