module.exports = function(active) {
	return new Promise((resolve, reject) => {
		this.WebSocket.emitter.removeListener("candle-generated", () => {
            console.log('FINALIZAMOS LA GENERACION DE VELAS PARA EL ACTIVO ' + active)
            resolve (true)
        });
	})
}