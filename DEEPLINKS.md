# Deeplinks - Lemon UNO Mini App

## Overview

Deeplinks allow users to access Lemon UNO directly from external sources like websites, QR codes, social media, or other apps. The mini app is registered with the Lemon Cash app using a specific Mini App ID.

## Mini App ID Configuration

**Current Mini App ID:** `lemon-uno`

> **Note**: To change the Mini App ID or register a new one, contact the Lemon Cash team. The ID must be unique and registered in the Lemon Cash system.

To update the Mini App ID in the codebase:

```typescript
// src/utils/deeplinkGenerator.ts
private static readonly MINI_APP_ID = 'lemon-uno' // Change this value
```

## Deeplink URL Formats

### 1. Show Detail Page

Opens the mini app detail page in Lemon Cash:

```
lemoncash://app/mini-apps/detail/lemon-uno
```

**Use cases:**
- App listing pages
- Social media posts
- Website promotions

**With parameters:**
```
lemoncash://app/mini-apps/detail/lemon-uno?userId=0x123...&page=profile
```

### 2. Launch WebView

Directly launches the mini app in WebView:

```
lemoncash://app/mini-apps/webview/lemon-uno
```

**Use cases:**
- Game invitations
- Tournament links
- Direct game launches

**With parameters:**
```
lemoncash://app/mini-apps/webview/lemon-uno?gameId=game_123&bet=500
lemoncash://app/mini-apps/webview/lemon-uno?lobbyId=lobby_456
lemoncash://app/mini-apps/webview/lemon-uno?tournamentId=tournament_789
```

## Usage Examples

### From TypeScript/React

```typescript
import { DeeplinkGenerator } from '@/utils/deeplinkGenerator'

// Generate a game invite link
const gameLink = DeeplinkGenerator.generateGameInviteLink('game_123', 500)
// → lemoncash://app/mini-apps/webview/lemon-uno?gameId=game_123&bet=500

// Generate a lobby link
const lobbyLink = DeeplinkGenerator.generateLobbyLink('lobby_456')
// → lemoncash://app/mini-apps/webview/lemon-uno?lobbyId=lobby_456

// Generate a profile link
const profileLink = DeeplinkGenerator.generateProfileLink('0x123...')
// → lemoncash://app/mini-apps/detail/lemon-uno?userId=0x123...&page=profile

// Generate a tournament link
const tournamentLink = DeeplinkGenerator.generateTournamentLink('tournament_789')
// → lemoncash://app/mini-apps/webview/lemon-uno?tournamentId=tournament_789

// Open in Lemon Cash app
DeeplinkGenerator.openInLemonCash(gameLink)
```

### From HTML/Website

```html
<!-- Direct link -->
<a href="lemoncash://app/mini-apps/detail/lemon-uno">
  Play Lemon UNO
</a>

<!-- Game invitation -->
<a href="lemoncash://app/mini-apps/webview/lemon-uno?gameId=game_123&bet=500">
  Join my game!
</a>

<!-- With fallback for non-Lemon Cash users -->
<a href="lemoncash://app/mini-apps/detail/lemon-uno" 
   onclick="if (!isLemonCashApp()) window.location = 'https://lemon-uno.com'">
  Play in Lemon UNO
</a>
```

### From QR Code

Generate a QR code pointing to a deeplink:

```typescript
const qrImageUrl = DeeplinkGenerator.generateQRCodeData(deeplink)
// Returns: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=...

// Display QR code
const img = new Image()
img.src = qrImageUrl
document.body.appendChild(img)
```

### From React Component

```tsx
import { ShareDeeplink } from '@/components/ShareDeeplink'

export function GameInvite({ gameId, betAmount }) {
  return (
    <ShareDeeplink 
      type="game"
      id={gameId}
      title="Comparte tu juego"
      description={`¡Únete a mi juego de $${betAmount} ARS!`}
      buttonText="🔗 Compartir juego"
    />
  )
}
```

## Deeplink Parameters

### Common Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `gameId` | string | ID of the game | `game_123` |
| `lobbyId` | string | ID of the lobby | `lobby_456` |
| `userId` | string | Wallet address or user ID | `0x123...` |
| `tournamentId` | string | Tournament ID | `tournament_789` |
| `bet` | number | Bet amount in ARS | `500` |
| `password` | string | Lobby password (if private) | `secret123` |
| `page` | string | Page to display | `profile`, `leaderboard` |

## Handling Deeplinks in the App

The app automatically handles incoming deeplinks through `DeeplinkListener`:

```typescript
import { DeeplinkListener, DeeplinkAction } from '@/utils/deeplinks'

// Listen for WebView launches
DeeplinkListener.on(DeeplinkAction.LAUNCH_WEBVIEW, (data) => {
  console.log('Game ID:', data.params?.gameId)
  console.log('Lobby ID:', data.params?.lobbyId)
  // Handle navigation
})

// Listen for detail page requests
DeeplinkListener.on(DeeplinkAction.SHOW_DETAIL, (data) => {
  console.log('User ID:', data.params?.userId)
  // Show profile or detail page
})
```

Current handlers in `MiniApp.tsx`:
- **LAUNCH_WEBVIEW**: Join game/lobby or open app
- **SHOW_DETAIL**: Show user profile or app detail

## Sharing Features

### Native Share API

```typescript
const success = await DeeplinkGenerator.shareDeeplink(
  deeplink,
  'Check out my game!',
  'Join me in Lemon UNO'
)
```

### Copy to Clipboard

```typescript
const success = await DeeplinkGenerator.copyToClipboard(deeplink)
```

### ShareDeeplink Component

React component with UI for sharing:

```tsx
<ShareDeeplink 
  type="game"
  id="game_123"
  title="Share Game"
  description="Join my game!"
  buttonText="Share"
  onSuccess={() => console.log('Shared!')}
  onError={(err) => console.error(err)}
/>
```

## Testing Deeplinks

### Local Development

Since deeplinks use `lemoncash://` scheme, they won't work in regular browsers. To test:

1. **In Lemon Cash app**: Paste deeplink directly if WebView supports it
2. **In development**: Use the browser console to test URL parsing

```javascript
// Test URL parsing
import { DeeplinkParser } from '@/utils/deeplinks'

const data = DeeplinkParser.parse('lemoncash://app/mini-apps/webview/lemon-uno?gameId=game_123')
console.log(data)
```

3. **QR Code testing**: Generate QR codes and scan with Lemon Cash app

### Production Testing

1. Build QR code with your deeplink
2. Open QR code scanner in Lemon Cash
3. Verify navigation works correctly

## Best Practices

✅ **DO:**
- Use specific, meaningful game/lobby IDs
- Include bet amount in invite links
- Add fallback URLs for non-Lemon Cash users
- Test deeplinks before sharing
- Log deeplink activity for analytics
- Support query parameters for flexibility

❌ **DON'T:**
- Share invalid or expired game IDs
- Create deeplinks with hardcoded user IDs
- Forget URL encoding for special characters
- Assume all users have Lemon Cash installed
- Change Mini App ID without notifying Lemon Cash team

## Security Considerations

- **No sensitive data**: Don't include wallet private keys or tokens
- **ID validation**: Always validate IDs before processing
- **Rate limiting**: Implement rate limiting on deeplink handlers
- **User consent**: Verify user identity before joining games
- **Replay attacks**: Use nonces for sensitive operations

## Troubleshooting

### Deeplink not opening

1. Verify Mini App ID is correct and registered
2. Check URL format matches the pattern exactly
3. Ensure special characters are URL-encoded
4. Test with official Lemon Cash app (not simulator)

### Parameters not being passed

1. Verify query string format: `?key=value&key2=value2`
2. Check parameter names match handler expectations
3. URL-encode special characters
4. Test URL parsing with `DeeplinkParser.parse()`

### QR code not scanning

1. Verify QR code is generated correctly
2. Test with different QR scanners
3. Ensure deeplink URL is not too long
4. Use shorter parameter names if needed

## API Reference

### DeeplinkParser

```typescript
// Parse URL
DeeplinkParser.parse(url: string): DeeplinkData | null

// Check if URL is deeplink
DeeplinkParser.isDeeplink(url: string): boolean

// Generate links
DeeplinkParser.generateDetailLink(miniAppId: string, params?: Record<string, string>): string
DeeplinkParser.generateWebviewLink(miniAppId: string, params?: Record<string, string>): string

// Validate mini-app-id
DeeplinkParser.isValidMiniAppId(id: string): boolean
```

### DeeplinkGenerator

```typescript
// Generate specific link types
generateGameInviteLink(gameId: string, betAmount?: number): string
generateLobbyLink(lobbyId: string): string
generateProfileLink(userId: string): string
generateTournamentLink(tournamentId: string): string

// Generate shareable bundle
generateShareableLink(type, id?, additionalParams?): ShareableLink

// Sharing
shareDeeplink(deeplink, title, text): Promise<boolean>
copyToClipboard(deeplink): Promise<boolean>
openInLemonCash(deeplink): void

// QR code
generateQRCodeData(deeplink): string
```

### DeeplinkListener

```typescript
// Register handler
on(action: DeeplinkAction, callback: (data: DeeplinkData) => void): () => void

// Process deeplink
processDeeplink(url: string): boolean

// Management
initialize(): void
reset(): void
getIsInitialized(): boolean
```

## Integration Checklist

- [ ] Mini App ID is registered with Lemon Cash
- [ ] DeeplinkGenerator MINI_APP_ID is set correctly
- [ ] DeeplinkListener is initialized in main app
- [ ] Game/Lobby handlers are implemented
- [ ] ShareDeeplink component is integrated
- [ ] QR code generation is tested
- [ ] Fallback URLs are configured
- [ ] Security validation is implemented
- [ ] Error handling is in place
- [ ] Analytics tracking is added

## Support

For issues or questions:
1. Check the [Lemon Cash Developer Docs](https://docs.lemon.cash)
2. Review deeplink implementation in `src/utils/deeplinks.ts`
3. Check MiniApp deeplink handlers in `src/MiniApp.tsx`
4. Contact Lemon Cash support team
