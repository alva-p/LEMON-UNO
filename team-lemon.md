# Consultas para el equipo de Lemon Cash

Preguntas y pendientes que requieren coordinación con el equipo de Lemon antes de ir a producción.

---

## 🏦 Flujo ARS (Pesos Argentinos)

### ¿Cómo implementar apuestas en ARS?

El SDK tiene `transferMoney` para transferencias fiat:

```ts
await transferMoney({
  amount: '1000',
  currency: Currency.ARS,
  name: 'Lemon UNO',
  paymentDestinationInformation: {
    paymentId: 'CBU_O_CVU_DE_LA_APP', // debe estar whitelisteado
  },
})
```

**Necesitamos:**
- [ ] Un CBU/CVU propio de la app para recibir las apuestas en ARS
- [ ] Que Lemon whitelist ese `paymentId` para que `transferMoney` funcione
- [ ] Definir cómo distribuir el premio al ganador (¿`transferMoney` de vuelta? ¿otro mecanismo?)
- [ ] Confirmar si hay fee por transferencia fiat o solo lo tomamos nosotros (5%)

> ⚠️ El `paymentId` debe ser whitelisteado por Lemon antes de poder usarlo. Sin esto, `transferMoney` falla.

---

## 🪪 Mini App ID

- [ ] Solicitar nuestro **Mini App ID** al equipo de Lemon (necesario para deeplinks y publicación)
- [ ] Confirmar la URL de producción del frontend para configurarla en el dashboard

> Según la doc: "You need to request your Mini App ID from the Lemon Cash team until the developer dashboard is ready."

---

## 🔐 Auth / ChainId

- [ ] Confirmar qué `ChainId` usar en producción para `authenticate`:
  - Actualmente usamos `ChainId.POLYGON_AMOY` (testnet)
  - El contrato está en **Base** — ¿debería ser `ChainId.BASE`?
- [ ] ¿El SIWE de producción va contra Base mainnet o Polygon?

---

## 📤 Publicación

- [ ] ¿Cuál es el proceso de revisión/aprobación para publicar en el marketplace de Mini Apps?
- [ ] ¿Hay restricciones sobre juegos de apuesta en la plataforma?
- [ ] ¿Se puede testear la Mini App dentro del entorno de staging de Lemon antes de publicar?

---

## 🔗 Deeplinks

- [ ] Confirmar Mini App ID para armar los deeplinks:
  - `https://www.lemon.me/app/mini-apps/webview/:mini-app-id`
  - `lemoncash://app/mini-apps/webview/:mini-app-id`

---

## 💬 Notas

- Actualmente ARS funciona como **sandbox** (faucet del backend). No hay dinero real involucrado.
- El flujo crypto (ETH en Base) está funcional end-to-end con el contrato `UnoLobbyV2` deployado en Base Sepolia.
- Pendiente pasar de Base Sepolia → Base mainnet una vez validado todo el flujo.
