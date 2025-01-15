module.exports = function(active, size, callback) {
	return new Promise((resolve, reject) => {
		if (!(active in this.actives))
			return reject("Ativo inválido.")

		const activeId = this.actives[active]

		this.WebSocket.send("subscribeMessage", {
			name: "candle-generated",
			params: {
				routingFilters: {
					active_id: activeId,
					size
				}
			}
		})

		this.WebSocket.getMessage("candle-generated", async message => {
			if (message.msg.active_id == activeId) {
				await callback(message.msg)
			}
		})
	})
}