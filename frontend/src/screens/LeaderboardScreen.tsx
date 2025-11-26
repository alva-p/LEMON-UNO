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
  earnings: number
  wins: number
  losses: number
}

type LeaderboardEntry = PointsLeaderboardEntry | MoneyLeaderboardEntry

export interface LeaderboardScreenProps {
  walletId?: string
}

function getApiUrl(): string {
  if (window.location.hostname === 'localhost') {
    return 'http://localhost:3000'
  }
  return `http://${window.location.hostname}:3000`
}

export const LeaderboardScreen: React.FC<LeaderboardScreenProps> = ({ walletId }) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'points' | 'money'>('points')

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
          ⭐ Puntos
        </button>
        <button
          className={`tab ${activeTab === 'money' ? 'active' : ''}`}
          onClick={() => setActiveTab('money')}
        >
          💰 Dinero
        </button>
      </div>

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

      {!loading && leaderboard.length > 0 && (
        <div className="leaderboard-list">
          {leaderboard.map((entry) => (
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
                  <div className="player-stats">
                    <span className="stat-item">
                      <span className="stat-label">Victorias</span>
                      <span className="stat-value">{entry.wins}</span>
                    </span>
                    <span className="stat-divider">•</span>
                    <span className="stat-item">
                      <span className="stat-label">Derrotas</span>
                      <span className="stat-value">{entry.losses}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="balance-section">
                <div className="balance-amount">
                  {isPointsLeaderboard
                    ? `${(entry as PointsLeaderboardEntry).points} pts`
                    : `$${(entry as MoneyLeaderboardEntry).earnings}`}
                </div>
              </div>

              {walletId === entry.userId && <div className="current-indicator">Tú</div>}
            </div>
          ))}
        </div>
      )}

      {!loading && leaderboard.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>Sin datos de ranking aún</p>
        </div>
      )}
    </div>
  )
}
