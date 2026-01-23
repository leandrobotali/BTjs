module.exports = function(active) {
	return new Promise((resolve, reject) => {
		const id = this.WebSocket.send("sendMessage", {
			name: "get-initialization-data",
			version: "4.0",
			body: {}
		})
			
		// Callback que manejará la respuesta
		const callback = (message) => {
			// Comprobar si el request_id coincide con el que hemos enviado
			if (message.request_id == id) {
				// Remover el listener para evitar recibir respuestas múltiples para este request
				this.WebSocket.emitter.removeListener("initialization-data", callback);
				let resultado = Object.values(message.msg.turbo.actives).find(obj => obj.name === active);

				console.log('mensage: ', resultado);

				// Devolver la respuesta completa
				return resolve(resultado);
			}
		}

		// Registrar el listener para el evento "initialization-data"
		this.WebSocket.getMessage("initialization-data", callback);
	});
}

// {"name":"sendMessage","request_id":"38","local_time":11034,"msg":{"name":"get-initialization-data","version":"4.0","body":{}}}