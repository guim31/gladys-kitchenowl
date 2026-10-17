# KitchenOwl

Lleve a Gladys las listas de la compra y el menú de su
[KitchenOwl](https://kitchenowl.org): cuántos artículos quedan por comprar,
qué se cocina hoy y mañana. Añada un artículo desde el panel o desde una
escena («se ha acabado la leche»), marque uno con un toque y deje que una
escena reaccione cuando alguien ponga algo en la lista.

> **Sus comentarios son bienvenidos.** Esta integración se ha probado con un
> servidor KitchenOwl real (imagen Docker `tombursch/kitchenowl`, octubre de
> 2026), todavía no en el uso diario con un Gladys real. Si algo no funciona
> como se describe, díganoslo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-kitchenowl/issues).

## Lo que necesita

- Gladys Assistant 5.2.0 o posterior (los formularios de los botones del
  widget).
- Un **KitchenOwl autoalojado**, accesible desde Gladys (la imagen Docker
  escucha en el puerto 8080).
- Un **token de larga duración** de un usuario de KitchenOwl. En KitchenOwl:
  su **perfil** → **Sesiones** → **Tokens de larga duración** → añada uno,
  llámelo `Gladys` y copie el token: KitchenOwl solo lo muestra una vez.

La integración ve los hogares de este usuario, y añade o marca artículos **en
su nombre**. El servicio alojado `app.kitchenowl.org` ofrece la misma API,
pero no se ha probado.

## Configuración

1. En Gladys, **Integraciones** → instale **KitchenOwl**.
2. En **Configuración**, introduzca la **dirección** de KitchenOwl
   (`http://192.168.1.20:8080`, `https://owl.example.org`…; la dirección
   copiada del navegador también sirve) y el **token de larga duración**.
3. Opciones:
   - **Aceptar certificados autofirmados**: solo para una dirección
     `https://` con certificado autofirmado, en su propio servidor.
   - **Intervalo de actualización**: con qué frecuencia se lee KitchenOwl, de
     30 segundos a 5 minutos (1 minuto por defecto). La medianoche se sigue
     siempre a tiempo.
   - **Idioma de los nombres de funciones**: los nombres de las funciones al
     añadir un dispositivo y los textos enviados a las escenas (francés por
     defecto).
4. Guarde y haga clic en **Probar la conexión**: indica los hogares, las
   listas y el número de artículos por comprar.
5. Abra la pestaña **Descubrir** y añada los dispositivos que quiera.

## Dispositivos

**Un dispositivo por lista de la compra** (`KitchenOwl Default`, `KitchenOwl
Bricolage`…), con una función:

| Función               | Valor                               |
| --------------------- | ----------------------------------- |
| Artículos por comprar | el número de artículos de la lista. |

**Un dispositivo por hogar** (`KitchenOwl <hogar>`), para el menú:

| Función           | Valor                                                           |
| ----------------- | --------------------------------------------------------------- |
| Comidas de hoy    | las recetas previstas hoy, separadas por comas, o Nada previsto |
| Comidas de mañana | lo mismo para mañana                                            |

«Hoy» es el día en la zona horaria de Gladys. Las recetas previstas sin día
(«algún día») no se muestran. Con varios hogares, los dispositivos de lista
llevan también el nombre del hogar.

Los valores solo se envían cuando cambian (y cada 12 horas en caso
contrario). La insignia del dispositivo indica **Inaccesible** cuando
KitchenOwl no responde.

## Panel

El widget **Lista de la compra** muestra una lista: el número de artículos,
los artículos con su descripción (nueve, y luego una fila «Más artículos») y
cuatro botones:

- **Añadir** abre un formulario (artículo, descripción): el artículo se pone
  en la lista, nunca dos veces.
- **Marcar** abre un formulario con los artículos: el elegido se marca.
- Los dos primeros artículos tienen su propio botón, para marcarlos con un
  toque.

En la configuración del widget, elija un dispositivo de lista, o un
dispositivo de hogar para su lista predeterminada. Vacío: la lista
predeterminada del primer hogar. El widget funciona incluso antes de añadir
un dispositivo a Gladys.

## Escenas

### Desencadenantes

**Artículo añadido a una lista de KitchenOwl**: se ha puesto un artículo en
una lista de la compra, en KitchenOwl o desde Gladys. Los artículos que ya
están en las listas cuando arranca la integración no cuentan, y la
integración recuerda lo que ha visto entre reinicios (un artículo añadido
mientras estaba detenida se dispara en el siguiente arranque). Un artículo
marcado y vuelto a poner cuenta de nuevo. Veinte eventos como máximo por
lista y por lectura (una receta que añade treinta ingredientes).

- Filtros: **Lista de la compra** (vacía: cualquiera), **Nombre del
  artículo** (nombre exacto, vacío: cualquiera).
- Variables: `item` (artículo), `description`, `list_name` (lista),
  `added_by` (el nombre en KitchenOwl del miembro) y `from_gladys`
  (verdadero cuando el artículo lo ha añadido una escena o el widget: permite
  a una escena ignorar sus propios añadidos).

### Acciones

**Añadir a una lista de KitchenOwl**: pone un artículo en una lista. Campos:
**Artículo** (obligatorio), **Descripción** (una cantidad, opcional), **Lista
de la compra** (un dispositivo de lista, o un dispositivo de hogar para su
lista predeterminada; vacía: la lista predeterminada del primer hogar). Un
artículo que ya está en la lista (sin distinguir mayúsculas ni acentos) no se
añade dos veces: su descripción se sustituye por la nueva, si se indica.
Salidas: `item`, `list_name`, `already_on_list`.

**Marcar un artículo de KitchenOwl**: marca un artículo de una lista, por su
nombre (sin distinguir mayúsculas ni acentos). Si no está en la lista, no
pasa nada y la salida `removed` es falsa. Salidas: `item`, `list_name`,
`removed`.

Los campos aceptan variables de escena (`{{triggerEvent.data.item}}`…).

### Ideas de escenas

- Un botón junto a la cafetera → **Añadir a una lista de KitchenOwl**,
  artículo `Café`: la última cápsula ya no se olvida nunca.
- **Artículo añadido a una lista de KitchenOwl**, lista `Bricolaje` → un
  mensaje a quien va a la tienda de bricolaje: «{{triggerEvent.data.item}}
  añadido por {{triggerEvent.data.added_by}}».
- Todos los días a las 17:00 → leer **Comidas de hoy** del dispositivo del
  hogar y enviarlo: la cena se conoce antes de salir del trabajo.
- **Artículos por comprar** por encima de 15 → un recordatorio de que es hora
  de ir a la compra.

## Solución de problemas

- **«token rechazado»**: el token de larga duración se ha revocado o se ha
  copiado mal. Cree uno nuevo en KitchenOwl y péguelo de nuevo (se quita un
  prefijo «Bearer » pegado con él).
- **«no hay ninguna API de KitchenOwl en esta dirección»**: algo responde,
  pero no KitchenOwl. Compruebe el puerto (8080 para la imagen Docker) y,
  detrás de un proxy inverso, el prefijo de ruta.
- **«KitchenOwl no responde»**: dirección incorrecta, KitchenOwl detenido o
  un cortafuegos entre Gladys y KitchenOwl.
- **«certificado rechazado»**: marque **Aceptar certificados autofirmados**.
- **«El usuario del token no pertenece a ningún hogar de KitchenOwl»**: cree
  un hogar en KitchenOwl o use el token de un miembro.
- **Una lista nueva no aparece**: haga clic en **Buscar** en la pestaña
  Descubrir, o espere a la siguiente lectura.
- Los detalles están en los registros de la integración (`LOG_LEVEL=debug`
  para cada lectura).

## Límites

- La integración lee KitchenOwl a intervalos regulares (30 s a 5 min): un
  artículo añadido en KitchenOwl llega a Gladys en ese plazo. No usa el canal
  en tiempo real de KitchenOwl.
- El menú se lee, no se modifica; los gastos y las recetas no se usan.
- La lista de un formulario del widget ofrece los 50 primeros artículos.
- Los nombres de las funciones se asignan al añadir un dispositivo: cambiar
  el idioma después no los renombra.
- Probada con un servidor KitchenOwl real en Docker, todavía no con un Gladys
  real: sus comentarios son bienvenidos.
