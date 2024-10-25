
module.exports = function(option) {
	return new Promise((resolve, reject) => {
		// Enviar un mensaje para obtener los activos abiertos
		const id = this.WebSocket.send("sendMessage", {
			name: "get-top-assets",
			version: "3.0",
			body: {
				instrument_type: option,  // Aquí podrías ajustar el tipo de activo que necesitas
				region_id: -1  // Esto depende de los parámetros que acepte tu API
			}
		})

		// Callback que manejará la respuesta
		const callback = (message) => {
			// Comprobar si el request_id coincide con el que hemos enviado
			if (message.request_id == id) {
				// Remover el listener para evitar recibir respuestas múltiples para este request
				this.WebSocket.emitter.removeListener("top-assets", callback);
				
				// Devolver la respuesta completa con todos los activos abiertos
				return resolve(message.msg);
			}
		}

		// Registrar el listener para el evento "top-assets"
		this.WebSocket.getMessage("top-assets", callback);
	});
}