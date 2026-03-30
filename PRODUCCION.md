# Checklist para Producción — LEMON UNO

> Ir tachando a medida que se completan. Orden sugerido al final.

---

## Smart Contract

- [ ] Crear cast wallet para el **server/admin** (owner del contrato) con `cast wallet import`
- [ ] Crear cast wallet para el **deployer** (puede ser la misma que admin)
- [ ] **Deploy `UnoLobbyV2` en Base Sepolia** (testnet) y verificar en BaseScan
- [ ] Testear flujo completo on-chain en testnet: `createLobby → joinLobby → emergencyEndLobby`
- [ ] **Deploy `UnoLobbyV2` en Base mainnet** (solo cuando testnet esté validado)
- [ ] Verificar contrato en BaseScan (transparencia para usuarios)

## Backend

- [ ] **Persistencia de estado** — si el server se reinicia se pierden lobbies activos y balances ARS. Implementar store mínimo (Redis o archivo JSON) para recuperar estado en curso
- [ ] **Configurar `.env` de producción** con:
  - `KEYSTORE_PATH` + `KEYSTORE_PASSWORD` (cast wallet del admin)
  - `BASE_MAINNET_RPC` (Alchemy / Infura)
  - `UNO_LOBBY_V2_BASE_ADDRESS` (dirección del contrato deployado)
  - `FRONTEND_URL` (origen CORS)
- [ ] **Deshabilitar o proteger endpoints de sandbox en producción**:
  - `POST /sandbox/ars/faucet`
  - `GET /admin/house-fees`
  - cualquier `/debug/*`
  - (opción: proteger con `x-admin-key` header)
- [ ] Remover fallback `DEV_PRIVATE_KEY` en producción (solo keystore)
- [ ] Rate limiting en endpoints críticos (crear lobby, unirse, jugar carta)
- [ ] **Deploy backend** a VPS / Railway / Render con HTTPS + WSS habilitado

## Frontend

- [ ] **Remover bypass `?player=NAME`** para producción (o limitarlo a `NODE_ENV !== production`)
- [ ] Configurar `API_URL` de producción apuntando al backend real
- [ ] **Integrar Lemon Cash SDK real** — deposit/withdraw actualmente son mock
- [ ] **Deploy frontend** a Vercel (o el hosting elegido)

## Infraestructura

- [ ] Dominio + SSL para el backend (WebSocket requiere `wss://`)
- [ ] Variables de entorno configuradas en el hosting (nunca commitear `.env`)
- [ ] Completar `Dockerfile.backend` (actualmente vacío)
- [ ] Revisar `docker-compose.yml` para deploy

## QA / Testing

- [ ] Prueba end-to-end en testnet con 2-4 wallets reales en Base Sepolia
- [ ] Test de reconexión WebSocket (cortar red a mitad de partida)
- [ ] Test de lobby cancelado con jugadores ya unidos
- [ ] Test de timeout de turno (auto-draw al vencerse el tiempo)
- [ ] Test de fee: verificar que `devWallet` recibe 5% del pot en cada partida crypto

---

## Orden sugerido

1. Cast wallet (admin + deployer)
2. Deploy testnet → testear flujo on-chain completo
3. Persistencia de estado en backend
4. Deploy infra (VPS + dominio + SSL)
5. Integración SDK real de Lemon Cash
6. Deploy mainnet

---

## Notas técnicas

- `emergencyEndLobby()` es `onlyOwner` — el server wallet (owner) es quien la llama, no un player
- `FEE_PERCENTAGE = 5%` en el contrato → backend alineado en `HOUSE_FEE_PCT = 0.05`
- Gas estimado por partida en Base: ~180k gas ≈ $0.001–$0.005 (completamente sostenible)
- El contrato acepta ETH nativo (`address(0)`) y cualquier ERC20 (USDT/USDC)
