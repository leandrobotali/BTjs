module.exports = function(active,size) {
	return new Promise((resolve, reject) => {
        this.WebSocket.emitter.removeAllListeners()
        // this.WebSocket.emitter.removeListener("candles-generated", () => {return true})
        console.log('FINALIZAMOS LA GENERACION DE VELAS PARA EL ACTIVO ' + active.name)

		this.WebSocket.send("unsubscribeMessage", {
			name: "candles-generated",
			params: {
				routingFilters: {
					active_id: active.id,
                    size
				}
			}
		})
        return resolve(true)
        // {"name":"unsubscribeMessage","request_id":"s_183","local_time":782305,"msg":{"name":"candles-generated","params":{"routingFilters":{"active_id":1861}}}}
        // {"name":"unsubscribeMessage","request_id":"s_250","local_time":168614,"msg":{"name":"candle-generated","params":{"routingFilters":{"active_id":2051,"size":5}}}}	
	})
}