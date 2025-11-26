# Backend API & WebSocket Reference

## Quick Start

```bash
cd backend
npm install
npm run dev
```

Server runs on `http://localhost:3000`

## REST Endpoints

### Lobbies

**Create Lobby**
```
POST /lobbies
Headers: x-wallet-id: <wallet_address>
Body: {
  "betAmount": 1000,
  "isPublic": true,
  "password": "optional_password"
}
Response: { id, creator, betAmount, players, ... }
```

**Get Public Lobbies**
```
GET /lobbies
Response: LobbyData[]
```

**Get Lobby Details**
```
GET /lobbies/:lobbyId
Response: LobbyData
```

**Join Lobby**
```
POST /lobbies/:lobbyId/join
Headers: x-wallet-id: <wallet_address>
Body: { "password": "optional" }
Response: LobbyData (updated with new player)
```

**Start Game**
```
POST /lobbies/:lobbyId/start
Response: { gameId, gameState }
```

### Games

**Get Game State**
```
GET /games/:gameId
Response: GameState (current deck, players, hand, turn info, etc)
```

### Users

**Get User Profile**
```
GET /users/:walletId
Response: { id, username, totalWins, totalLosses, totalPoints, balance, ... }
```

### Leaderboard

**Get Top Players**
```
GET /leaderboard?limit=50
Response: [{ rank, username, wins, points, balance }, ...]
```

## WebSocket

**Connect to Game**
```
ws://localhost:3000?gameId=<gameId>&playerIndex=<0-9>
```

**Message Types**

```typescript
enum WSMessageType {
  PLAY_CARD = 'PLAY_CARD',
  DRAW_CARD = 'DRAW_CARD',
  CALL_UNO = 'CALL_UNO',
  CHALLENGE_UNO = 'CHALLENGE_UNO',
  CHALLENGE_WILD_DRAW_FOUR = 'CHALLENGE_WILD_DRAW_FOUR',
  GAME_STATE = 'GAME_STATE', // server -> client
  ERROR = 'ERROR', // server -> client
}
```

**Play Card**
```json
{
  "type": "PLAY_CARD",
  "payload": {
    "cardId": "card_123",
    "chosenColor": "RED" // optional, for WILD cards
  }
}
```

**Draw Card**
```json
{
  "type": "DRAW_CARD"
}
```

**Call UNO**
```json
{
  "type": "CALL_UNO"
}
```

**Challenge UNO**
```json
{
  "type": "CHALLENGE_UNO",
  "payload": {
    "targetIndex": 2
  }
}
```

**Challenge Wild Draw Four**
```json
{
  "type": "CHALLENGE_WILD_DRAW_FOUR",
  "payload": {
    "targetIndex": 2
  }
}
```

## Example Flow

1. **Create Lobby**: `POST /lobbies` → get `lobbyId`
2. **Other players join**: `POST /lobbies/:lobbyId/join`
3. **Start game**: `POST /lobbies/:lobbyId/start` → get `gameId`
4. **Connect WebSocket**: `ws://localhost:3000?gameId=:gameId&playerIndex=:playerIndex`
5. **Receive game state**: Server sends `GAME_STATE` message
6. **Play**: Send `PLAY_CARD` or `DRAW_CARD` messages
7. **Server broadcasts**: All clients receive updated `GAME_STATE`
8. **Game ends**: Server includes `winner` in final `GAME_STATE`

## Notes

- All monetary amounts are in **ARS (Argentine Pesos)**
- Min bet: 100 ARS, Max: 100,000 ARS
- Server validates all moves against UNO rules
- Fee: 5% of total pot, deducted automatically
- Payout: Winner receives (total_pot - fee), losers lose their bet
