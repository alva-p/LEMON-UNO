import crypto from 'crypto'

export interface Nonce {
  nonce: string
  createdAt: Date
  expiresAt: Date
  used: boolean
}

/**
 * NonceService - manage SIWE nonces for anti-replay protection
 */
export class NonceService {
  private nonces: Map<string, Nonce> = new Map()
  private readonly NONCE_EXPIRY_MS = 15 * 60 * 1000 // 15 minutes

  /**
   * Generate a cryptographically secure nonce (32 bytes = 64 hex chars)
   */
  generateNonce(): string {
    const nonce = crypto.randomBytes(32).toString('hex')
    const now = new Date()

    this.nonces.set(nonce, {
      nonce,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.NONCE_EXPIRY_MS),
      used: false,
    })

    // Clean up expired nonces
    this.cleanupExpiredNonces()

    return nonce
  }

  /**
   * Validate nonce - check if it exists, hasn't expired, and hasn't been used
   */
  validateNonce(nonce: string): { valid: boolean; error?: string } {
    const nonceRecord = this.nonces.get(nonce)

    if (!nonceRecord) {
      return { valid: false, error: 'Nonce no encontrado' }
    }

    if (nonceRecord.used) {
      return { valid: false, error: 'Nonce ya ha sido utilizado' }
    }

    const now = new Date()
    if (now > nonceRecord.expiresAt) {
      this.nonces.delete(nonce)
      return { valid: false, error: 'Nonce expirado' }
    }

    return { valid: true }
  }

  /**
   * Mark nonce as used (prevents replay attacks)
   */
  markNonceAsUsed(nonce: string): boolean {
    const nonceRecord = this.nonces.get(nonce)
    if (nonceRecord) {
      nonceRecord.used = true
      return true
    }
    return false
  }

  /**
   * Clean up expired nonces from memory
   */
  private cleanupExpiredNonces(): void {
    const now = new Date()
    const expiredNonces: string[] = []

    for (const [nonce, record] of this.nonces.entries()) {
      if (now > record.expiresAt) {
        expiredNonces.push(nonce)
      }
    }

    expiredNonces.forEach((nonce) => this.nonces.delete(nonce))
  }

  /**
   * Get all active nonces (for debugging)
   */
  getActiveNonces(): Nonce[] {
    this.cleanupExpiredNonces()
    return Array.from(this.nonces.values()).filter((n) => !n.used)
  }
}
