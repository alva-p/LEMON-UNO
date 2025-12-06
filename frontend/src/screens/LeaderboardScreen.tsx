/**
 * Leaderboard Screen - Rankings with enhanced UI
 */
import React, { useEffect, useState } from 'react'

export interface PointsLeaderboardEntry {
  rank: number
  username: string
  userId: string
  wins: number
  points: number
  losses: number
}

export interface MoneyLeaderboardEntry {
  rank: number
  username: string
  userId: string
  earningsARS: number
  earningsETH: number
  earningsUSDT: number
  earningsUSDC: number
}

type LeaderboardEntry = PointsLeaderboardEntry | MoneyLeaderboardEntry

export interface LeaderboardScreenProps {
  walletId?: string
}

function getApiUrl(): string {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3001'
  }
  return `http://${window.location.hostname}:3001`  
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ walletId }) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'points' | 'money'>('points')
  const [moneyFilter, setMoneyFilter] = useState<'ALL' | 'ARS' | 'ETH' | 'USDT' | 'USDC'>('ALL')

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true)
        const endpoint = activeTab === 'points' ? '/leaderboards/points' : '/leaderboards/money'
        const res = await fetch(`${getApiUrl()}${endpoint}?limit=100`)
        if (!res.ok) throw new Error('Error al cargar ranking')
        const data = await res.json()
        setLeaderboard(data)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    }

    fetchLeaderboard()
    const interval = setInterval(fetchLeaderboard, 30000)

    return () => clearInterval(interval)
  }, [activeTab])

  const isPointsLeaderboard = activeTab === 'points'
  const filteredLeaderboard = !isPointsLeaderboard
    ? (leaderboard as MoneyLeaderboardEntry[]).slice().sort((a, b) => {
        const getVal = (e: MoneyLeaderboardEntry) => {
          switch (moneyFilter) {
            case 'ARS': return e.earningsARS || 0
            case 'ETH': return e.earningsETH || 0
            case 'USDT': return e.earningsUSDT || 0
            case 'USDC': return e.earningsUSDC || 0
            case 'ALL': default:
              // Orden por ALL: suma visual, pero no se muestra combinada
              return (e.earningsARS || 0) + (e.earningsETH || 0) + (e.earningsUSDT || 0) + (e.earningsUSDC || 0)
          }
        }
        return getVal(b) - getVal(a)
      })
    : leaderboard

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h2>🏆 Ranking Global</h2>
        <p className="subtitle">Top Jugadores</p>
      </div>

      {/* Tabs */}
      <div className="leaderboard-tabs">
        <button
          className={`tab ${activeTab === 'points' ? 'active' : ''}`}
          onClick={() => setActiveTab('points')}
        >
          ⭐ Partidas ganadas
        </button>
        <button
          className={`tab ${activeTab === 'money' ? 'active' : ''}`}
          onClick={() => setActiveTab('money')}
        >
          💰 Dinero ganado
        </button>
      </div>

      {/* Money sub-filters: tops por moneda */}
      {activeTab === 'money' && (
        <div className="money-filters">
          <span>Top por:</span>
          {(['ALL', 'ARS', 'ETH', 'USDT', 'USDC'] as const).map((m) => (
            <button
              key={m}
              className={`chip ${moneyFilter === m ? 'active' : ''}`}
              onClick={() => setMoneyFilter(m)}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Cargando ranking...</p>
        </div>
      )}

      {error && (
        <div className="error-state">
          <p>⚠️ {error}</p>
        </div>
      )}

      {!loading && (isPointsLeaderboard ? leaderboard.length > 0 : filteredLeaderboard.length > 0) && (
        <div className="leaderboard-list">
          {(isPointsLeaderboard ? leaderboard : filteredLeaderboard).map((entry) => (
            <div
              key={entry.rank}
              className={`leaderboard-item ${walletId === entry.userId ? 'current-user' : ''}`}
            >
              <div className="rank-section">
                <div className="rank-badge">
                  {entry.rank === 1 && '🥇'}
                  {entry.rank === 2 && '🥈'}
                  {entry.rank === 3 && '🥉'}
                  {entry.rank > 3 && <span className="rank-number">#{entry.rank}</span>}
                </div>
              </div>

              <div className="player-section">
                <div className="player-avatar">{entry.username.charAt(0).toUpperCase()}</div>
                <div className="player-info">
                  <div className="player-name">{entry.username}</div>
                  {isPointsLeaderboard ? (
                    <div className="player-stats">
                      <span className="stat-item">
                        <span className="stat-label">Victorias</span>
                        <span className="stat-value">{(entry as PointsLeaderboardEntry).wins}</span>
                      </span>
                      <span className="stat-divider">•</span>
                      <span className="stat-item">
                        <span className="stat-label">Derrotas</span>
                        <span className="stat-value">{(entry as PointsLeaderboardEntry).losses}</span>
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="balance-section">
                {isPointsLeaderboard ? (
                  <div className="balance-amount">{(entry as PointsLeaderboardEntry).points} pts</div>
                ) : (
                  <div className="money-breakdown">
                    <div className="money-chip">ARS: {(entry as MoneyLeaderboardEntry).earningsARS ?? 0}</div>
                    <div className="money-chip">ETH: {(entry as MoneyLeaderboardEntry).earningsETH ?? 0}</div>
                    <div className="money-chip">USDT: {(entry as MoneyLeaderboardEntry).earningsUSDT ?? 0}</div>
                    <div className="money-chip">USDC: {(entry as MoneyLeaderboardEntry).earningsUSDC ?? 0}</div>
                  </div>
                )}
              </div>

              {walletId === entry.userId && <div className="current-indicator">Tú</div>}
            </div>
          ))}
        </div>
      )}

      {!loading && (isPointsLeaderboard ? leaderboard.length === 0 : filteredLeaderboard.length === 0) && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>Sin datos de ranking aún</p>
        </div>
      )}
    </div>
  )
}
