# ✅ CHECKLIST DE VERIFICACIÓN - BOT LMTA

## 📋 Antes de Ejecutar

### 1. Verificar Estructura
```bash
cd BTjs
node verify.js
```
- [ ] Todos los módulos cargan correctamente
- [ ] No hay errores de sintaxis

### 2. Verificar Configuración (.env)
- [ ] `USERIQ` configurado
- [ ] `PASSWD` configurado
- [ ] `ACCOUNTTYPE=PRACTICE` (para pruebas)
- [ ] `INVERSION` configurado
- [ ] `CANDSIZE=60`
- [ ] `CANTCANDLES=120`
- [ ] `OPTIONTYPE=DIGITAL`
- [ ] `ACTIVEPRINCIPAL=EURUSD`
- [ ] `DURACION_OP=1`

### 3. Verificar Archivos Creados
- [ ] `core/mutex.js` existe
- [ ] `core/active.js` existe
- [ ] `core/candles.js` existe
- [ ] `strategy/lmta-core.js` existe
- [ ] `strategy/lmta-strategy.js` existe
- [ ] `operations/trade.js` existe
- [ ] `reports/manager.js` existe
- [ ] `indicators/` tiene 3 archivos
- [ ] `index.js` existe
- [ ] `main.js` actualizado

### 4. Verificar Dependencias
```bash
npm install
```
- [ ] `dotenv` instalado
- [ ] `ws` instalado
- [ ] `md5` instalado
- [ ] `request` instalado

---

## 🚀 Durante la Ejecución

### 1. Inicio Correcto
```bash
node main.js
```
Debe mostrar:
- [ ] Banner de inicialización
- [ ] Configuración del bot
- [ ] "[INIT] Cargando información del activo..."
- [ ] "[ACTIVE] Schedule cargado: X intervalos"
- [ ] "[CANDLES] Cargadas 120 velas en memoria"
- [ ] "[INIT] Bot inicializado correctamente"

### 2. Por Cada Vela
Debe mostrar:
- [ ] "[CANDLE] Nueva vela cerrada: ID | precio"
- [ ] "[STRATEGY] Analizando..."
- [ ] Análisis LMTA completo
- [ ] Decisión (OPERAR / NO OPERAR)

### 3. Si Opera
Debe mostrar:
- [ ] "[OPERATION] Ejecutando CALL/PUT en EURUSD"
- [ ] "[OPERATION] Orden abierta, esperando cierre..."
- [ ] "[OPERATION] Resultado: WIN/LOSS | Ganancia: X"

### 4. Cada Hora
Debe mostrar:
- [ ] "[REPORTS] Reporte guardado: X operaciones"

---

## 📊 Después de 1 Hora

### 1. Verificar Reporte
```bash
# Windows
type ..\reporte.txt

# Unix/Mac
cat ../reporte.txt
```
Debe contener:
- [ ] Encabezado "REPORTE HORARIO"
- [ ] Resumen (operaciones, win rate, ganancia)
- [ ] Detalle de cada operación
- [ ] Análisis LMTA completo

### 2. Verificar Formato
- [ ] Fechas en formato DD/MM/AAAA HH:MM:SS
- [ ] Operaciones bien diferenciadas
- [ ] Análisis legible y detallado

---

## 🔍 Verificaciones Técnicas

### 1. Mutex Funcionando
- [ ] No hay operaciones concurrentes
- [ ] Velas se descartan si está procesando
- [ ] Solo 1 operación a la vez

### 2. Buffer de Velas
- [ ] Mantiene 120 velas en memoria
- [ ] Elimina las más viejas
- [ ] No crece indefinidamente

### 3. Validación de Activo
- [ ] Verifica schedule antes de operar
- [ ] No opera si activo cerrado
- [ ] Recarga schedule si es necesario

### 4. Estrategia LMTA
- [ ] Analiza micro-movimientos
- [ ] Detecta grupos (compradores/vendedores)
- [ ] Identifica latigazos
- [ ] Evalúa contexto (niveles, tendencia)
- [ ] Calcula confianza correctamente

### 5. Reportes
- [ ] Se guardan cada hora
- [ ] Memoria se limpia después de guardar
- [ ] Formato es legible
- [ ] Incluye análisis completo

---

## 🐛 Troubleshooting

### Error: "Cannot find module"
```bash
cd BTjs
npm install
```

### Error: "ENOENT: no such file or directory"
- Verificar que estás en la carpeta `BTjs`
- Verificar que todas las carpetas existen

### Error: "API.getCandles is not a function"
- Verificar que el broker está conectado
- Verificar credenciales en `.env`

### No se generan reportes
- Esperar al menos 1 hora
- Verificar que hubo operaciones
- Verificar permisos de escritura

### Bot no opera
- Verificar que `MIN_CONFIDENCE` no es muy alto
- Verificar que el activo está abierto
- Verificar análisis en consola

### Operaciones concurrentes
- Verificar que mutex está funcionando
- Revisar logs de "[OPERATION]"

---

## 📈 Métricas de Éxito

### Después de 24 horas:
- [ ] Win rate > 60%
- [ ] Ganancia total positiva
- [ ] Sin errores críticos
- [ ] Reportes generados correctamente

### Después de 1 semana:
- [ ] Win rate estable
- [ ] Patrón de operaciones identificado
- [ ] Estrategia optimizada según reportes

---

## 🎯 Optimización

### Si Win Rate < 60%:
1. Aumentar `MIN_CONFIDENCE` a 75-80
2. Ajustar `CV_THRESHOLD` a 0.15
3. Revisar reportes para identificar patrones de fallo

### Si Pocas Operaciones:
1. Reducir `MIN_CONFIDENCE` a 65-70
2. Ajustar `WHIPLASH_MULTIPLIER` a 2.5
3. Revisar análisis de "NO OPERAR"

### Si Muchas Operaciones:
1. Aumentar `MIN_CONFIDENCE` a 75-80
2. Agregar filtros adicionales (RSI, horario)
3. Ser más estricto con niveles

---

## 📝 Registro de Cambios

Documentar aquí los cambios realizados:

```
Fecha: ___/___/___
Cambio: _______________________
Resultado: _____________________

Fecha: ___/___/___
Cambio: _______________________
Resultado: _____________________
```

---

## ✅ CHECKLIST FINAL

Antes de dejar el bot operando:

- [ ] Verificación completa realizada
- [ ] Pruebas en PRACTICE exitosas
- [ ] Reportes funcionando correctamente
- [ ] Win rate aceptable (>60%)
- [ ] Mutex funcionando
- [ ] Validación de activo funcionando
- [ ] Estrategia LMTA operativa
- [ ] Documentación leída
- [ ] Backup de archivos realizado

---

**¡Bot listo para operar! 🚀**

Fecha de verificación: ___/___/___
Verificado por: _______________
