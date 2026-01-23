const getExpiration = require("../getexpiration")

module.exports = function() {
	return new Promise((resolve, reject) => {
		const {
			active,
			amount,
			action,
			duration
		} = this.options

		const expiration = getExpiration(this.API.serverTimestamp, duration, 10800000)

		const year = expiration.getFullYear().toString()
		const month = (expiration.getMonth() + 1).toString().padStart(2, "0")
		const day = expiration.getDate().toString().padStart(2, "0")
		const hours = expiration.getHours().toString().padStart(2, "0")
		const minutes = expiration.getMinutes().toString().padStart(2, "0")
		const seconds = expiration.getSeconds().toString().padStart(2, "0")

		const formatedDate = year + month + day + "D" + hours + minutes + seconds
		// console.log('fecha expiracion ', formatedDate);
		

		const instrumentId = "do" + this.API.actives[active] + "A" + formatedDate + "T" + duration + "M" + action[0] + "SPT"

		// console.log('instrumentID: ', instrumentId);
		// console.log('balance id: ', this.API.balance.id);
		

		const id = this.API.WebSocket.send("sendMessage", {
			name: "digital-options.place-digital-option",
			version: "3.0",
			body: {
				user_balance_id: this.API.balance.id, /* 1172704613 */
				instrument_id: instrumentId, /* do1861A20260123D044800T1MCSPT */
				instrument_index: 576311, /* 576311 */
				asset_id: this.API.actives[active], /* 1861 */
				amount
			}
		})

		const callback = message => {
			if (message.request_id == id) {
				this.API.WebSocket.emitter.removeListener("digital-option-placed", callback)
				if (message.status != 2000) return reject(message.msg)
				return resolve({
					status: "open",
					id: message.msg.id,
					win: null,
					created: this.API.serverTimestamp,
					expire: expiration.getTime()
				})
			}
		}

		this.API.WebSocket.getMessage("digital-option-placed", callback)
	})
}