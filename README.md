# Lemon UNO - Full Stack

Juego de UNO con apuestas en Lemon Cash Mini App.

## Estructura

- `frontend/` — Mini App React+TS (Vite)
- `backend/` — Game engine + API (Express + WebSocket)
- `contracts/` — Smart contracts (Solidity, Polygon)

## Stack

- **Frontend**: React 18 + TypeScript + Vite (WebView-friendly)
- **Backend**: Node.js + Express + WebSocket (ws)
- **Database**: PostgreSQL (users, games, transactions)
- **Cache**: Redis (active games)
- **Blockchain**: Polygon Amoy, Solidity smart contract for escrow
- **Wallet**: Lemon Cash SDK (deposits/withdrawals)

## Inicio rápido

### Backend

```bash
cd backend
npm install
npm run dev
```

Server en http://localhost:3000

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite en http://localhost:5173

## Reglas UNO

Ver [RULES.md](./RULES.md) para la especificación completa de reglas de juego.

## Requisitos de Juego

- **Jugadores**: 2-10 por partida
- **Apuesta mín**: 100 ARS
- **Apuesta máx**: 100,000 ARS
- **Fee**: 5% del pozo total
- **Payout**: Automático tras verificación de resultado

## Features MVP

- [x] Crear/unirse a lobbies públicos y privados
- [ ] UI móvil (Lobby, Mano, Leaderboard)
- [ ] Game engine (reglas UNO completas)
- [ ] WebSocket multiplayer
- [ ] Apuestas y escrow con smart contract
- [ ] Integración Lemon SDK
- [ ] Leaderboard global + semanal
- [ ] Anti-cheat y validación server-side

## Configuración

Ver `.env.example` en `backend/` y `frontend/`.

## Team & Timeline

- Solo Álvaro, MVP en iteraciones rápidas
