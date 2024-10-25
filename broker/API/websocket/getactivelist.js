module.exports = function(option) {
	return new Promise((resolve, reject) => {
		const id = this.WebSocket.send("sendMessage", {
			name: "get-underlying-list",
			version: "2.0",
			body: {
				type: option + "-option"
			}
		})
			
		// Callback que manejará la respuesta
		const callback = (message) => {
			// Comprobar si el request_id coincide con el que hemos enviado
			if (message.request_id == id) {
				// Remover el listener para evitar recibir respuestas múltiples para este request
				this.WebSocket.emitter.removeListener("underlying-list", callback);
				
				let actives = message.msg.underlying
				
				actives.map(a => {
					let fecha = Date.now()
					let act = a
					act.open = false
					act.schedule.forEach(s => {
						if((s.open * 1000) < fecha && fecha < (s.close * 1000)){
							act.open = true
						}
					});
					return act
				});
				// Devolver la respuesta completa
				return resolve(actives);
			}
		}

		// Registrar el listener para el evento "underlying-list"
		this.WebSocket.getMessage("underlying-list", callback);
	});
}