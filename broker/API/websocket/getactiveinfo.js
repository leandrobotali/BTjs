module.exports = function(active_id) {
	return new Promise((resolve, reject) => {
		const id = this.WebSocket.send("sendMessage", {
			name: "get-short-active-info",
			version: "1.0",
			body: {
				active_id: active_id,
				lang: "es_ES"
			}
		})

		// Callback que manejará la respuesta
		const callback = (message) => {
			// Comprobar si el request_id coincide con el que hemos enviado
			if (message.request_id == id) {
				// Remover el listener para evitar recibir respuestas múltiples para este request
				this.WebSocket.emitter.removeListener("short-active-info", callback);
				
				// Devolver la respuesta completa
				return resolve(message.msg);
			}
		}

		// Registrar el listener para el evento "short-active-info"
		this.WebSocket.getMessage("short-active-info", callback);
	});
}