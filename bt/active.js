const config = require('../config.js')
const utils = require('../utils.js')

module.exports = {
	checkActive: async (API) => {
		try {
			let active
			let count = 0
			while (!active && count <= 5) {
				const actives = await API.getActiveList(config.optionType.toLowerCase());
				
				let act = actives.find(a => a.name == config.activePrincipal + "-op" && a.open == true)
				
				if(act)
					active = {
						id: act.active_id,
						name: config.activePrincipal,
						// instrument_index: 101111
					}
				else{
					let act_sec = actives.find(a => a.name == config.activeSecondary && a.open == true)
					if(act_sec)
						active = {
							id: act_sec.active_id,
							name: act_sec.name,
							// instrument_index: 2880295
						}
					else{
						count ++
						utils.sleep(60000)
					}
				}
			}
			console.log('active: ', active);
			
			if(!active)
				throw ('No se encontro el Activo Principal: ' + config.activePrincipal + ', y tampoco el secundario: ' + config.activeSecondary)
			return active
		} catch (err) {
			throw err
		}
	}
}