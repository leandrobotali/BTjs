module.exports = function(type) {
	if (["PRACTICE", "REAL"].indexOf(type) == -1)
		throw new Error("Balance inválido.")
	
	this.balance = this.profile.balances.find(balance => type == "REAL" && balance.type == 1 || type == "PRACTICE" && balance.type == 4)
}