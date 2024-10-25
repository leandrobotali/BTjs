const config = require('../config.js')
const utils = require('../utils.js')

module.exports = {
	checkActive: async (API) => {
		try {
			let active
			let count = 0
			while (!active && count <= 5) {
				const actives = await API.getActiveList(config.optionType.toLowerCase());
				let act = actives.find(a => a.name == config.activePrincipal && a.open == true)
				if(act)
					active = act.name
				else{
					let act_sec = actives.find(a => a.name == config.activeSecondary && a.open == true)
					if(act_sec)
						active = act_sec.name
					else{
						count ++
						utils.sleep(60000)
					}
				}
			}
			
			if(!active)
				throw ('No se encontro el Activo Principal: ' + config.activePrincipal + ', y tampoco el secundario: ' + config.activeSecondary)
			return active
		} catch (err) {
			throw err
		}
	}
}