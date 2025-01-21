module.exports = function(option,active) {
	return new Promise((resolve, reject) => {
		// Enviar un mensaje para obtener los instrumentos
		const id = this.WebSocket.send("sendMessage", {
			name: "digital-option-instruments.get-instruments",
			version: "3.0",
			body: {
				instrument_type: option,
				asset_id: active.id
			}
		})
        // {"name":"sendMessage","request_id":"87","local_time":13914,
        //     "msg":{"name":"digital-option-instruments.get-instruments","version":"3.0","body":{"instrument_type":"digital-option","asset_id":76}}}

		// Callback que manejará la respuesta
		const callback = (message) => {
			// Comprobar si el request_id coincide con el que hemos enviado
			if (message.request_id == id) {
				// Remover el listener para evitar recibir respuestas múltiples para este request
				this.WebSocket.emitter.removeListener("instruments", callback);
				
				// Devolver la respuesta completa con todos los activos abiertos
				return resolve(message.msg);
			}
		}

		// Registrar el listener para el evento "top-assets"
		this.WebSocket.getMessage("instruments", callback);
	});
}