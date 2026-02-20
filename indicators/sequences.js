const config = require('../config')

/**
 * Detecta secuencias repetitivas en las velas recientes
 * @param {Array} candles - Array de velas históricas
 * @returns {Object} { found: boolean, pattern: string, nextPrediction: string, confidence: number }
 */
const detectCandleSequence = (candles) => {
    // Convertimos velas a string de colores simplificado: 'G' (Green), 'R' (Red), 'D' (Doji)
    const colors = candles.slice(-20).map(c => { // Analizamos ultimas 20 velas
        if (Math.abs(c.close - c.open) < 0.000001) return 'D'
        return c.close > c.open ? 'G' : 'R'
    })

    // Buscamos patrones de longitud 2 a N
    // Queremos encontrar algo que se repita al menos 2 veces justo al final
    // Ejem: ... R G R G [R] -> Predice G
    // Ejem: ... R R G R R G [R] [R] -> Predice G

    const maxLen = config.strategy.sequences.maxLength
    const minReps = config.strategy.sequences.minRepetitions

    // Iteramos longitudes de patrón
    for (let len = 2; len <= maxLen; len++) {
        // La "hipótesis" es el patrón que termina JUSTO AHORA.
        // Pero en realidad, estamos buscando predecir la SIGUIENTE vela.
        // Por lo tanto, buscamos una secuencia que se haya completado varias veces.

        // Supongamos que la ultima vela es la que acaba de cerrar (Index N).
        // Buscamos un patrón P de longitud L que se repite.

        // Estrategia: "Matching recursivo inverso"
        // Miramos hacia atras trozos de longitud L.

        const currentChunk = colors.slice(-len) // Ultimo trozo
        if (currentChunk.length < len) continue

        // Verificamos si este trozo se repitió antes inmediatamente
        let repetitions = 1
        let offset = len

        while (true) {
            const prevChunk = colors.slice(-(offset + len), -offset)
            if (prevChunk.length < len) break

            // Comparar arrays
            if (compareArrays(currentChunk, prevChunk)) {
                repetitions++
                offset += len
            } else {
                break
            }
        }

        // Si encontramos repeticiones, esto NO predice nada por sí mismo, solo dice que el mercado está repitiendo un bloque.
        // Pará predecir, necesitamos que la secuencia sea "R G R G" y estemos en "R", para predecir "G".
        // PERO, la función analyzeStrategy corre AL CIERRE de una vela.
        // Osea, tenemos la vela cerrada.
        // Si el patrón es R-G, y acabamos de cerrar R, podemos predecir G?
        // NO, el patrón detectado es lo que YA PASO.

        // CORRECCION LÓGICA:
        // Buscamos una secuencia que se está formando.
        // Ejemplo Patrón "Dos rojas, una verde" (R R G).
        // Si la historia reciente es: ... R R G | R R G | R R ...
        // Entonces la predicción es G.

        // Implementacion de búsqueda de patrones rotos/incompletos:

        // 1. Definir patrón candidato completo:
        // Busquemos en la historia reciente (sin incluir las ultimas velas actuales) secuencias que se repitan.

        // SIMPLIFICACION:
        // Vamos a buscar patrones de "Ciclo"
        // R-G-R-G (Ciclo longitud 2)
        // R-R-G-R-R-G (Ciclo longitud 3)

        // Revisamos si las ultimas X velas encajan en un ciclo repetitivo
        if (repetitions >= minReps) {
            // Si hemos detectado que [R G] se repitió 3 veces: [R G] [R G] [R G]
            // La ultima vela fue G.
            // La prediccion seria el inicio del patrón: R.

            // Si el patrón es [R R G] y tenemos [R R G] [R R G]
            // La ultima fue G. Prediccion: R.

            // Esto predice CONTINUIDAD DEL CICLO.
            const nextvIndex = 0 // El siguiente elemento del ciclo es el primero
            const nextColor = currentChunk[nextvIndex]

            return {
                found: true,
                pattern: currentChunk.join('-'),
                nextPrediction: nextColor === 'G' ? 'CALL' : (nextColor === 'R' ? 'PUT' : 'NEUTRAL'),
                confidence: repetitions * 10 // Mas repeticiones, mas confianza
            }
        }
    }

    // Búsqueda de patrón incompleto
    // Ejemplo: ... [R R G] [R R G] [R R] -> Falta la G
    for (let len = 3; len <= maxLen + 1; len++) {
        // Asumimos un patrón de longitud 'len'
        // Las ultimas velas (menos de len) deben coincidir con el inicio del patrón

        // Miramos el bloque ANTERIOR completo
        // [ ... ] [Patrón Completo] [Patrón Incompleto]
        //         start: -len-(current)   end: -len

        // Probamos diferentes longitudes de "incompleto" (k)
        for (let k = 1; k < len; k++) {
            const incompleteChunk = colors.slice(-k) // Ultimas k velas
            const prevFullChunk = colors.slice(-(len + k), -k) // El bloque anterior de longitud len

            if (prevFullChunk.length < len) continue

            // Verificamos si incompleteChunk coincide con el INICIO de prevFullChunk
            const startOfPrev = prevFullChunk.slice(0, k)

            if (compareArrays(incompleteChunk, startOfPrev)) {
                // Coincide! ... [A B C] [A B] -> Predecimos C
                // Verificamos si ANTES tambien pasó (para confirmar patrón)
                const prevPrevFullChunk = colors.slice(-(len + len + k), -(len + k))
                if (prevPrevFullChunk.length === len && compareArrays(prevPrevFullChunk, prevFullChunk)) {
                    // Confirmado al menos 2 repeticiones completas antes
                    const nextVal = prevFullChunk[k] // El elemento que sigue tras k
                    return {
                        found: true,
                        pattern: prevFullChunk.join('-') + ' (Incompleto)',
                        nextPrediction: nextVal === 'G' ? 'CALL' : (nextVal === 'R' ? 'PUT' : 'NEUTRAL'),
                        confidence: 60 // Confianza base por ciclo incompleto
                    }
                }
            }
        }
    }

    return { found: false, pattern: '', nextPrediction: '', confidence: 0 }
}

const compareArrays = (a, b) => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

module.exports = { detectCandleSequence }
