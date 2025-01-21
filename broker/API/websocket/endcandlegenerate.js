module.exports = function(active) {
	return new Promise((resolve, reject) => {
        console.log('FINALIZAMOS LA GENERACION DE VELAS PARA EL ACTIVO ' + active)
		this.WebSocket.send("unsubscribeMessage", {
			name: "candles-generated",
			params: {
				routingFilters: {
					active_id: active.id
				}
			}
		})
        // {"name":"unsubscribeMessage","request_id":"s_183","local_time":782305,"msg":{"name":"candles-generated","params":{"routingFilters":{"active_id":1861}}}}
	})
}