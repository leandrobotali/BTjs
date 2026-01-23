# 🚀 GUÍA RÁPIDA - BOT TRADING LMTA

## ✅ REESTRUCTURACIÓN COMPLETADA

El bot ha sido completamente reestructurado con arquitectura modular e integración de la estrategia LMTA.

## 📋 CAMBIOS REALIZADOS

### Nueva Estructura:
```
BTjs/
├── core/           ⭐ Núcleo (mutex, active, candles)
├── strategy/       ⭐ Estrategia LMTA
├── operations/     ⭐ Ejecución de operaciones
├── reports/        ⭐ Sistema de reportes
├── indicators/     ⭐ Indicadores técnicos
├── broker/         ✓ Sin cambios (lógica WS)
└── bt/             📦 Backup de archivos antiguos
```

### Archivos Principales:
- `main.js` - Entry point (actualizado)
- `index.js` - Orquestador principal (nuevo)
- `config.js` - Sin cambios
- `.env` - Sin cambios

## 🎯 CARACTERÍSTICAS IMPLEMENTADAS

✅ **Separación de lógica WS** - broker/ intacto
✅ **Mutex simple** - Evita procesamiento concurrente
✅ **Buffer de velas en memoria** - Últimas 120 velas
✅ **Estrategia LMTA integrada** - Análisis de micro-movimientos
✅ **Validación de activo abierto** - Verifica schedule antes de operar
✅ **Sistema de reportes detallados** - Guardado automático cada hora
✅ **Operaciones con mutex** - Solo 1 operación a la vez
✅ **Reportes en memoria** - Se limpian cada hora
✅ **Análisis detallado en consola** - Cada decisión explicada

## 🚀 CÓMO EJECUTAR

### 1. Verificar estructura:
```bash
cd BTjs
node verify.js
```

### 2. Ejecutar bot:
```bash
node main.js
```

## 📊 QUÉ ESPERAR

### Al iniciar:
```
=========================================
   BOT TRADING LMTA - INICIALIZANDO
=========================================
Activo: EURUSD
Cuenta: PRACTICE
Inversión: 1
=========================================

[INIT] Cargando información del activo...
[ACTIVE] Schedule cargado: 23 intervalos
[INIT] Cargando velas históricas...
[CANDLES] Cargadas 120 velas en memoria
[CANDLES] Últimas 3 velas: [...]
[INIT] Suscribiéndose a generación de velas...
[INIT] Bot inicializado correctamente
```

### Por cada vela:
```
[CANDLE] Nueva vela cerrada: 3059165 | 1.163465 -> 1.163615
[STRATEGY] Analizando...

============================================================
ANÁLISIS LMTA - 15/01/2025 14:30:45
============================================================

DECISIÓN: OPERAR / NO OPERAR
DIRECCIÓN: CALL (UP)
CONFIANZA: 85%
RAZÓN: Agotamiento bajista en soporte...

--- ANÁLISIS DE GRUPOS ---
Compradores:
  Fuerza: NATURAL
  CV: 0.150 (Simétrico)
  ...

[OPERATION] Ejecutando CALL en EURUSD
[OPERATION] Orden abierta, esperando cierre...
[OPERATION] Resultado: WIN | Ganancia: 1.75
```

### Cada hora:
```
[REPORTS] Reporte guardado: 5 operaciones
```

## 📁 ARCHIVO DE REPORTES

**Ubicación:** `BOT-2026-enero/reporte.txt`

Se actualiza automáticamente cada hora con:
- Resumen (operaciones, win rate, ganancia)
- Detalle de cada operación
- Análisis LMTA completo de cada decisión

## ⚙️ CONFIGURACIÓN

### Cambiar confianza mínima:
`strategy/lmta-strategy.js` línea 60:
```javascript
const MIN_CONFIDENCE = 70 // Ajustar aquí
```

### Ajustar parámetros LMTA:
`strategy/lmta-core.js` líneas 2-12:
```javascript
const CONFIG = {
  TICK_SIZE: 60,
  WHIPLASH_WINDOW: 15,
  STAGNATION_THRESHOLD: 0.000010,
  LEVEL_PROXIMITY: 0.000050,
  CV_THRESHOLD: 0.2,
  WHIPLASH_MULTIPLIER: 3,
  HISTORY_SIZE: 120
}
```

### Variables de entorno (.env):
```env
USERIQ=tu_email@gmail.com
PASSWD=tu_password
INVERSION=1
CANDSIZE=60
CANTCANDLES=120
OPTIONTYPE=DIGITAL
ACCOUNTTYPE=PRACTICE
ACTIVEPRINCIPAL=EURUSD
DURACION_OP=1
```

## 🔒 SISTEMA DE MUTEX

### Callback Mutex:
- Descarta nuevas velas si está procesando una actual
- Evita sobrecarga del sistema

### Operation Mutex:
- Solo permite 1 operación a la vez
- Descarta señales mientras hay operación abierta
- Análisis de estrategia continúa, pero no ejecuta

### Candle Mutex:
- Protege el buffer de velas
- Evita condiciones de carrera

## 🎓 ESTRATEGIA LMTA

### Análisis:
1. **Micro-movimientos** - Detecta naturalidad vs irregularidad
2. **Grupos** - Identifica compradores vs vendedores
3. **Aprovechamiento** - Evalúa respuesta entre grupos
4. **Latigazos** - Detecta desesperación vs fuerza
5. **Contexto** - Niveles, tendencia, números redondos

### Jerarquía de Decisión:
1. Agotamiento en nivel (85% confianza)
2. Aprovechamiento (80%)
3. Fuerza confirmada (70%)

### Confianza Mínima:
70% para ejecutar operación

## 📝 ARCHIVOS IMPORTANTES

### Para modificar estrategia:
- `strategy/lmta-core.js` - Algoritmo LMTA
- `strategy/lmta-strategy.js` - Lógica de decisión

### Para ajustar operaciones:
- `operations/trade.js` - Ejecución y validación

### Para cambiar reportes:
- `reports/manager.js` - Formato y guardado

### Para ajustar velas:
- `core/candles.js` - Buffer en memoria

## 🐛 DEBUGGING

### Ver estado del bot:
```javascript
// En cualquier módulo
const { getCandles } = require('./core/candles.js')
console.log('Velas en memoria:', getCandles().length)

const { getOperationsBuffer } = require('./reports/manager.js')
console.log('Operaciones pendientes:', getOperationsBuffer().length)

const { isOperating } = require('./operations/trade.js')
console.log('Operando:', isOperating())
```

### Forzar guardado de reporte:
```javascript
const { saveHourlyReport } = require('./reports/manager.js')
await saveHourlyReport()
```

## ⚠️ IMPORTANTE

1. ✅ **Broker intacto** - No se modificó nada en `broker/`
2. ✅ **Backup disponible** - Archivos antiguos en `bt/`
3. ✅ **Velas de 60 seg** - El broker envía velas de 1 minuto
4. ✅ **Ticks simulados** - Se interpolan 60 ticks por vela
5. ✅ **Reportes automáticos** - Se guardan cada hora
6. ✅ **Validación de activo** - Verifica schedule antes de operar

## 🎉 LISTO PARA USAR

El bot está completamente funcional y listo para ejecutar.

### Próximos pasos:
1. Ejecutar en modo PRACTICE
2. Revisar reportes después de algunas horas
3. Ajustar confianza mínima según resultados
4. Optimizar parámetros LMTA si es necesario

### Soporte:
- Ver `README.md` para documentación completa
- Revisar logs en consola para debugging
- Analizar `reporte.txt` para mejorar estrategia

---

**¡El bot está listo! 🚀**
