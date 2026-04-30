quiero que evalues como esta buscando el bot hot un mejor punto de entrada.
la logica seria la siguiente
Si la ultima vela (VELA1, en la que el bot determino que tenemos que operar), es alcista:
- si se tiene que operar una continuidad, CALL, el bot buscara un retroceso de al menos un 25% del cuerpo de la vela anteriror, VELA1. es decir, precio_cierre_VELA1 - ((precio_cierre_VELA1 - precio_apertura_VELA1) * 0.25)
-si se debe operar una reversion, PUT, el bot buscara que el precio llegue a un nivel de al menos el 50% de la mecha superior de la vela anteriror, VELA1. es decir, precio_maximo_VELA1 - ((precio_maximo_VELA1 - precio_cierre_VELA1) * 0.5)

Si la ultima vela (VELA1, en la que el bot determino que tenemos que operar), es bajista:
- si se tiene que operar una continuidad, PUT, el bot buscara un retroceso de al menos un 25% del cuerpo de la vela anteriror, VELA1. es decir, precio_cierre_VELA1 + ((precio_apertura_VELA1 - precio_cierre_VELA1) * 0.25)
-si se debe operar una reversion, CALL, el bot buscara que el precio llegue a un nivel de al menos el 50% de la mecha inferior de la vela anteriror, VELA1. es decir, precio_minimo_VELA1 + ((precio_minimo_VELA1 - precio_cierre_VELA1) * 0.5)