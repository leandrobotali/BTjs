module.exports = function(option,active,index) {
	return new Promise((resolve, reject) => {
		// Enviar un mensaje para obtener los instrumentos
        console.log('entra ',option," " ,active, " ",index);
        
		const id = this.WebSocket.send("sendMessage", {
			name: "trading-settings.digital-option-client-price-generated",
			version: "1.0",
			body: {
				instrument_type: option,
				asset_id: active.id,
                instrument_index: index
			}
		})
        console.log('se envia');
        
        // {"name":"subscribeMessage","request_id":"s_218","local_time":530604,"msg":{"name":"trading-settings.digital-option-client-price-generated",
        // "version":"1.0","params":{"routingFilters":{"instrument_type":"digital-option","asset_id":76,"instrument_index":2880436}}}}

		// Callback que manejará la respuesta
		const callback = (message) => {
			console.log('SUBSCRIPTO A AL INSTRUMENTO ' + index); 
            return resolve(true)          
		}

		// Registrar el listener para el evento "top-assets"
		this.WebSocket.getMessage("digital-option-client-price-generated", callback);
	});
}