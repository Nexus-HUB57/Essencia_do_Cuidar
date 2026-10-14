# scripts/

Scripts auxiliares do build do front.

- `build-icons.py` — regenera `public/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, `apple-touch-icon.png` e `favicon-32.png` a partir
  de um único SVG conceitual (retângulo azul + silhueta verde).

Como rodar (precisa de Pillow):

```bash
cd frontend
python3 scripts/build-icons.py
```

Os ícones são gerados em `public/` e copiados para `dist/` no `npm run build`.
Não commite alterações dos PNGs sem motivo — eles são derivados do script.
