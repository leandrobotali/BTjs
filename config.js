require('dotenv').config();

module.exports = {
	version: "V3",
	// Configuración de Estrategia LMTA
	strategy: {
		minTicks: 55, // Mínimo de ticks para analizar
		whiplashWindow: 15, // Últimos N ticks para detectar latigazo
		stagnation: {
			maxTicks: 8, // Ticks consecutivos para considerar estancamiento
			priceThreshold: 0.000010 // Variación máxima de precio para estancamiento
		},
		levels: {
			// Detección de zonas (reversa confirmada)
			minSwingCandles: 2,       // Mínimo de velas en cada dirección para validar giro
			maxZoneWidth: 0.000100,   // Zona máxima de 10 pips de ancho (CONCEPTOS_BASICOS)

			// Fuerza de zona (basada en rechazos confirmados, no simples toques)
			mediumRejections: 2,      // Rechazos para calidad MEDIUM
			strongRejections: 4,      // Rechazos para calidad STRONG
			wornTouches: 5,           // Testeos para considerar zona "desgastada"

			// Ruptura válida (para cambio de polaridad / flip)
			minBreakRatio: 0.20,      // Cuerpo debe cerrar 20%+ fuera de la zona para confirmar ruptura

			// Proximidad al precio actual
			proximity: 0.000060,      // ±6 pips para considerar "precio en zona"

			// Zona objetivo (Target Zone)
			minTargetDistance: 0.000080  // Distancia mínima para que haya "espacio" hasta el objetivo
		},
		naturality: {
			ratioThreshold: 2.0 // Ratio para considerar movimiento irregular (> 2x)
		},
		dangerousMarkets: {
			// Mercado "Sucio": velas con mechas en AMBOS lados de forma consistente
			// (NO bloquea Pin Bars, solo bloquea cuando TODO el mercado es confuso)
			dirtyMarket: {
				enabled: true,
				lookback: 8,         // Cuántas velas recientes analizar
				maxBodyRatio: 0.30,  // Cuerpo < 30% del total = vela sucia
				minWickRatio: 0.15,  // Mecha en cada lado > 15% del total
				minDirtyRatio: 0.60  // Si 60%+ de las velas son sucias → bloquear
			},
			// Micro-Rangos: alternancia sin dirección
			microRange: {
				enabled: true,
				minOverlaps: 4
			},
			// Mercado Muerto: sin movimiento real (diferente a rango operable)
			deadMarket: {
				enabled: true,
				recentCandles: 10,
				historyCandles: 20,
				minSizeRatio: 0.35, // Velas recientes < 35% del tamaño histórico
				maxDojis: 4         // Máximo 4 dojis en las últimas N velas
			},
			// Volatilidad Extrema: SOLO gaps reales entre velas
			// Las mechas NO se filtran aquí (son información válida = Pin Bars, etc.)
			extremeVolatility: {
				enabled: true,
				lookback: 5,
				maxAbsoluteGap: 0.000150, // Gap absoluto máximo permitido
				maxRelativeGap: 1.50      // Gap > 150% del tamaño promedio de vela
			},
			// Ticks Caóticos: oscilación violenta durante la vela actual
			chaoticTicks: {
				enabled: true,
				maxReversals: 8,      // Máximo de reversiones violentas permitidas
				minReversalRatio: 0.15 // Reversal mínimo significativo = 15% del rango
			}
		},
		sequences: {
			enabled: true,
			minRepetitions: 2,
			maxLength: 6
		},
		// Parámetros para detectar fuerza de tendencia (~30°/45°/60°)
		trend: {
			minThreshold: 0.000100,       // Movimiento mínimo neto para considerar tendencia
			strongDominantRatio: 0.75,    // 75%+ de velas del mismo color = tendencia FUERTE
			strongEfficiency: 0.20,       // Net move = 20%+ del movimiento total acumulado
			moderateDominantRatio: 0.60,  // 60%+ de velas del mismo color = tendencia MODERADA
			moderateEfficiency: 0.10      // Net move = 10%+ del movimiento total acumulado
		},
		// Filtros de Contexto de Mercado (se aplican ANTES de ejecutar la operación)
		marketContext: {
			// Bloquea reversiones cuando la tendencia es FUERTE
			trendStrength: {
				enabled: true
			},
			// Bloquea operaciones sin espacio libre hasta el próximo nivel
			freeSpace: {
				enabled: true,
				candlesForSize: 10,    // Velas para calcular tamaño promedio
				minSpaceInCandles: 1.5 // Espacio mínimo = 1.5x tamaño promedio de vela
			},
			// Bloquea re-testeos inmediatos (precio insistiendo en nivel = va a romper)
			retest: {
				enabled: true,
				lookback: 6,               // Velas a revisar
				maxTouchesWithoutBreak: 2  // Si toca 2+ veces sin respiro → bloquear
			}
		}
	},

	username: process.env.USERIQ,
	passwd: process.env.PASSWD,

	inversion: process.env.INVERSION,
	candleSize: process.env.CANDSIZE,
	cantCandles: process.env.CANTCANDLES,
	optionType: process.env.OPTIONTYPE,
	accountType: process.env.ACCOUNTTYPE,
	activePrincipal: process.env.ACTIVEPRINCIPAL,
	activeSecondary: process.env.ACTIVESECONDARY,
	duracion_op: process.env.DURACION_OP,

	WEBSOCKET: {
		GATEWAY: {
			protocol: "wss",
			host: "iqoption.com",
			port: 443,
			path: "echo/websocket"
		}
	},
	API: {
		URL: {
			default: "iqoption.com",
			auth: "auth.iqoption.com",
			billing: "billing.iqoption.com"
		}
	}
}