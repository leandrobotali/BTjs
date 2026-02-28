/**
 * Script de prueba para verificar el comportamiento del scheduler
 * según el día y hora actual
 */

const { isMarketOpen } = require('./core/scheduler.js')

console.log('========================================')
console.log('   TEST DE SCHEDULER - HORARIO MERCADO')
console.log('========================================')

const now = new Date()
const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

console.log(`\nFecha/Hora actual: ${now.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`)
console.log(`Día: ${days[now.getDay()]}`)
console.log(`Hora: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`)

const marketOpen = isMarketOpen()

console.log(`\n${marketOpen ? '✅' : '❌'} Mercado: ${marketOpen ? 'ABIERTO' : 'CERRADO'}`)

if (marketOpen) {
	console.log('\n🟢 El bot se inicializará normalmente')
	console.log('   - Cargará velas históricas')
	console.log('   - Se suscribirá a nuevas velas')
	console.log('   - Comenzará a operar')
} else {
	console.log('\n🔴 El bot entrará en modo DORMIDO')
	console.log('   - NO cargará velas')
	console.log('   - NO se suscribirá a velas')
	console.log('   - Esperará hasta el lunes 00:00')
}

console.log('\n========================================')
console.log('   HORARIOS DE OPERACIÓN')
console.log('========================================')
console.log('Lunes 00:00 → Viernes 16:00')
console.log('Sábado y Domingo: CERRADO')
console.log('========================================\n')
