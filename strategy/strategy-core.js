
export const analyzeStrategy = async (candles, ticks) => {
	/*
	ejecutar cualquier indicador necesario para la estrategia
	evaluar velas y ticks
	obtener un reporte extremadamente detallado sobre el analisis y la decision que se toma
	retornar la desision tomada (ejemplo: 'COMPRAR', 'VENDER', 'ESPERAR') junto con el reporte detallado
	*/
	console.log('se ejecuta analisis');
	
	return {
		shouldOperate: true,
		direction: 'CALL', // 'CALL' o 'PUT'
		reason: 'No se cumplen las condiciones para operar',
		analysis: 'Análisis detallado de la estrategia aquí...'
	}
}