# Holy Profit

Calculadora de ganancias para Albion Online con precios reales del [Albion Online Data Project](https://www.albion-online-data.com/).

- **Actividades:** crafteo (armas, armaduras, bolsas, capas, monturas, herramientas), refinado, cocina, alquimia y flipping entre ciudades y Black Market.
- **Por cada objeto:** la ciudad más barata para cada material, la mejor ciudad para producir (bono de ciudad, foco, bono diario y tarifa de estación) y el mejor mercado de venta con volumen suficiente.
- **Protección contra outliers:** promedio ponderado por volumen que descarta los días anómalos frente a la mediana; precio actual validado contra el histórico, y volumen mínimo diario.
- **Servidores:** West, Europe y East. Idiomas: español e inglés.

## Uso

```bash
npm install
npm run dev
```

## Datos del juego

`public/data/items.json` se genera a partir de [ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps) (recetas, foco, valor de items, nombres ES/EN). Para actualizarlo tras un parche del juego:

```bash
npm run data
```

## Límites del API

100 peticiones por minuto y 300 cada 5 minutos, por IP. La web agrupa muchos items por petición, cachea las respuestas (5 min los precios, 30 min el historial) y espera automáticamente si se acerca al límite.

## Publicar

`npm run build` genera una web estática en `dist/` que se puede subir a GitHub Pages, Netlify o similares.
