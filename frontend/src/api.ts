// Mock backend helpers for local testing.
// Replace these with your real endpoints when integrating a real backend.

export async function getNonceFromBackend(): Promise<string> {
  // In production you would POST to your backend endpoint that generates
  // a cryptographically secure nonce and stores it server-side.
  // For local testing we return a short pseudo-random nonce.
  const nonce = Math.random().toString(36).slice(2, 12)
  return nonce
}

export async function verifySignatureOnBackend({
  wallet,
  signature,
  message,
  nonce,
}: {
  wallet: string
  signature: string
  message: string
  nonce: string
}): Promise<{ verified: boolean }>{
  // In production call your backend /api/auth/verify to run a SIWE verification
  // using a public RPC provider. Here we simply accept any response for demo.
  console.log('Mock verify on backend', { wallet, signature, message, nonce })
  return { verified: true }
}
