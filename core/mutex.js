// Mutex simple para evitar procesamiento concurrente
class SimpleMutex {
	constructor() {
		this.locked = false
	}

	isLocked() {
		return this.locked
	}

	lock() {
		if (this.locked) return false
		this.locked = true
		return true
	}

	unlock() {
		this.locked = false
	}
}

module.exports = SimpleMutex
