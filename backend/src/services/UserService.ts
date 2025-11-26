/**
 * UserService - manage user accounts, wallets, and stats
 */
export interface UserAccount {
  id: string // wallet address
  username: string
  totalWins: number
  totalLosses: number
  totalPoints: number
  totalEarnings: number // money earned from games, in ARS
  balance: number // in ARS
  createdAt: Date
}

export class UserService {
  private users: Map<string, UserAccount> = new Map()

  /**
   * Get or create user from wallet address
   */
  getOrCreateUser(walletId: string, username?: string): UserAccount {
    let user = this.users.get(walletId)
    if (!user) {
      user = {
        id: walletId,
        username: username || walletId.slice(0, 8) + '...',
        totalWins: 0,
        totalLosses: 0,
        totalPoints: 0,
        totalEarnings: 0,
        balance: 0,
        createdAt: new Date(),
      }
      this.users.set(walletId, user)
    }
    return user
  }

  /**
   * Update user balance (deposit/withdraw)
   */
  updateBalance(walletId: string, amount: number): boolean {
    const user = this.users.get(walletId)
    if (!user) return false

    user.balance += amount
    return true
  }

  /**
   * Record a win
   */
  recordWin(walletId: string, pointsEarned: number, moneyEarned: number = 0): boolean {
    const user = this.users.get(walletId)
    if (!user) return false

    user.totalWins++
    user.totalPoints += pointsEarned
    user.totalEarnings += moneyEarned
    user.balance += moneyEarned
    return true
  }

  /**
   * Record a loss
   */
  recordLoss(walletId: string): boolean {
    const user = this.users.get(walletId)
    if (!user) return false

    user.totalLosses++
    return true
  }

  /**
   * Get user by wallet ID
   */
  getUser(walletId: string): UserAccount | null {
    return this.users.get(walletId) || null
  }

  /**
   * Get points leaderboard (top N by total wins + points)
   */
  getPointsLeaderboard(limit: number = 50): UserAccount[] {
    return Array.from(this.users.values())
      .sort((a, b) => {
        if (b.totalWins !== a.totalWins) return b.totalWins - a.totalWins
        return b.totalPoints - a.totalPoints
      })
      .slice(0, limit)
  }

  /**
   * Get money leaderboard (top N by total earnings)
   */
  getMoneyLeaderboard(limit: number = 50): UserAccount[] {
    return Array.from(this.users.values())
      .sort((a, b) => b.totalEarnings - a.totalEarnings)
      .slice(0, limit)
  }

  /**
   * Get leaderboard (top N by total wins + points) - DEPRECATED use getPointsLeaderboard
   */
  getLeaderboard(limit: number = 50): UserAccount[] {
    return this.getPointsLeaderboard(limit)
  }
}
