// Database models for PostgreSQL

export interface User {
  id: string // wallet address
  username: string
  created_at: Date
  updated_at: Date
  total_wins: number
  total_losses: number
  total_points: number
  balance: number // in ARS (wallet)
}

export interface GameRecord {
  id: string // game room ID
  creator_id: string
  status: 'waiting' | 'in_progress' | 'finished'
  players: string[] // wallet IDs
  winner_id?: string
  bet_amount: number // per player
  total_pot: number
  fee_amount: number // 5% of pot
  created_at: Date
  started_at?: Date
  finished_at?: Date
}

export interface Transaction {
  id: string
  user_id: string
  type: 'deposit' | 'withdraw' | 'game_payout' | 'game_debit' | 'fee'
  amount: number // in ARS
  game_id?: string
  tx_hash?: string // blockchain tx
  status: 'pending' | 'completed' | 'failed'
  created_at: Date
}

export interface LeaderboardEntry {
  user_id: string
  username: string
  wins: number
  points: number
  rank: number
}
