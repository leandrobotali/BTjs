Para que puedas desarrollar una función de identificación precisa para tu modelo de IA, a continuación detallo los tres contextos de mercado peligrosos explicados en las fuentes, con sus características técnicas y criterios de detección exactos.
1. Micro Rangos
Un micro rango es una versión extremadamente comprimida de un rango normal donde el precio se encuentra atrapado en una "caja" pequeña.
• Identificación Matemática/Visual:
    ◦ Criterio de los 4 Traslapes: Se identifica cuando aparecen al menos cuatro velas o impulsos (alcistas y bajistas) que se contradicen y traslapan consecutivamente. Por ejemplo: una vela baja, la siguiente sube (primera contradicción), la siguiente baja (segunda contradicción), y la siguiente vuelve a subir.
    ◦ Compresión de Tiempo/Espacio: A diferencia de un rango ancho, los movimientos de un extremo a otro del micro rango suelen estar formados por una sola vela, máximo dos, o incluso solo por la mecha de una vela.
    ◦ Velocidad de Oscilación: El zigzag interno es muy rápido; el precio no tarda casi nada en rebotar entre el soporte y la resistencia.
• Delimitación de Niveles:
    ◦ La "caja" se traza usando los máximos (picos) y mínimos que están al mismo nivel.
    ◦ Se pueden usar tanto las puntas de las mechas como los cierres y aperturas de las velas para definir el área.
    ◦ Niveles Limpios vs. Sucios: Un soporte o resistencia es "limpio" si las velas no cierran fuera de la línea y rebotan en un solo nivel claro. Es "sucio" si está formado por varios niveles o mechas de distintas alturas, lo que genera ambigüedad.
• Comportamiento Esperado: Suele ocurrir un rompimiento fuerte en cualquier momento, generalmente a favor de la tendencia previa al rango.
2. Mercados con Bajo Volumen
Este contexto se caracteriza por la falta de fuerza y movimientos muy cortos que dificultan la operativa.
• Identificación por Comparación:
    ◦ Tamaño Relativo de Velas: Las velas actuales deben ser considerablemente más pequeñas que las velas precedentes en el gráfico.
    ◦ Presencia de Dojis: Es común ver velas tipo Doji o con cuerpos casi inexistentes debido a la falta de negociación.
• Patrones Estructurales:
    ◦ Proliferación de Micro Rangos: El gráfico se llena de micro rangos por todas partes.
    ◦ Mezcla Heterogénea: Se observa un patrón de muchas velas diminutas interrumpidas ocasionalmente por velas que parecen "gigantes" o muy grandes, aunque estas últimas suelen ser de tamaño normal y solo resaltan por lo pequeño de las demás.
• Riesgos para la Función de la IA: El precio tiene dificultades para avanzar y puede generar falsos rompimientos; parece que rompe un nivel pero se devuelve inmediatamente por falta de volumen.
3. Mercados con Volatilidad Extrema
Es un mercado con movimientos bruscos, repentinos y desordenados que afectan principalmente el punto de entrada.
• Identificación de Movimientos:
    ◦ Oscilación Rápida: El precio se mueve de forma violenta de un extremo a otro, sin la suavidad de un mercado saludable.
    ◦ Gaps de Apertura: Las velas a veces no abren donde cerró la anterior, sino que "saltan" a un nivel diferente debido a la velocidad del movimiento.
• Características de las Velas:
    ◦ Mechas Grandes y Repentinas: Aparición de mechas largas que se forman de la nada en segundos.
    ◦ Inconsistencia: Mezcla desordenada de velas grandes y pequeñas con oscilaciones rápidas.
• Impacto Técnico: El mayor peligro es el deslizamiento (slippage); aunque el análisis sea correcto, el punto de entrada real suele ser mucho peor que el pretendido debido a la velocidad del mercado.
Nota para tu modelo de IA: Para identificar estos mercados de forma inequívoca, la función debería medir la relación de tamaño entre las últimas 10-20 velas (para bajo volumen), contar la cantidad de velas consecutivas con direcciones opuestas y cuerpos traslapados (para micro rangos), y detectar variaciones bruscas de precio en milisegundos o gaps entre cierre y apertura (para volatilidad extrema).