module.exports = function(option,active,index) {
	return new Promise((resolve, reject) => {
        console.log('FINALIZAMOS LA GENERACION DE VELAS PARA EL ACTIVO ' + active)
		this.WebSocket.send("unsubscribeMessage", {
			name: "trading-settings.digital-option-client-price-generated",
			params: {
				routingFilters: {
					instrument_type: option,
					asset_id: active.id,
					instrument_index: index
				}
			}
		})
        // {"name":"unsubscribeMessage","request_id":"s_189","local_time":47009,"msg":{"name":"trading-settings.digital-option-client-price-generated",
		// "version":"1.0","params":{"routingFilters":{"instrument_type":"digital-option","asset_id":76,"instrument_index":2880383}}}}
	})
}