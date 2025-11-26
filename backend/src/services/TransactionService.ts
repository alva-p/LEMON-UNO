import { GameService } from './GameService'
import { UserService } from './UserService'

/**
 * TransactionService - manage deposits, withdrawals, and game payouts
 */
export interface Transaction {
  id: string
  userId: string
  type: 'deposit' | 'withdraw' | 'game_payout' | 'game_debit' | 'fee'
  amount: number // ARS
  gameId?: string
  txHash?: string // blockchain tx
  status: 'pending' | 'completed' | 'failed'
  createdAt: Date
}

export class TransactionService {
  private transactions: Map<string, Transaction> = new Map()
  private userService: UserService

  constructor(userService: UserService) {
    this.userService = userService
  }

  /**
   * Record a transaction
   */
  recordTransaction(
    userId: string,
    type: Transaction['type'],
    amount: number,
    gameId?: string,
    txHash?: string
  ): Transaction {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

    const tx: Transaction = {
      id: txId,
      userId,
      type,
      amount,
      gameId,
      txHash,
      status: 'completed', // in production, would be pending until blockchain confirms
      createdAt: new Date(),
    }

    this.transactions.set(txId, tx)

    // Update user balance based on type
    if (type === 'deposit' || type === 'game_payout') {
      this.userService.updateBalance(userId, amount)
    } else if (type === 'withdraw' || type === 'game_debit' || type === 'fee') {
      this.userService.updateBalance(userId, -amount)
    }

    return tx
  }

  /**
   * Get transaction by ID
   */
  getTransaction(txId: string): Transaction | null {
    return this.transactions.get(txId) || null
  }

  /**
   * Get user's transaction history
   */
  getUserTransactions(userId: string, limit: number = 100): Transaction[] {
    return Array.from(this.transactions.values())
      .filter((tx) => tx.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
  }

  /**
   * Settle game: payout winner, charge losers
   */
  settleGame(gameId: string, winnerId: string, losersAndBets: { userId: string; bet: number }[], feeAmount: number): void {
    // Record payout to winner
    const totalPayout = losersAndBets.reduce((sum, lb) => sum + lb.bet, 0) - feeAmount
    this.recordTransaction(winnerId, 'game_payout', totalPayout, gameId)

    // Record debit from losers
    for (const loser of losersAndBets) {
      this.recordTransaction(loser.userId, 'game_debit', loser.bet, gameId)
    }

    // Record fee to house/admin (could be a special account)
    if (feeAmount > 0) {
      this.recordTransaction('admin', 'fee', feeAmount, gameId)
    }
  }
}
