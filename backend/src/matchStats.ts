// src/matchStats.ts
import { pool } from './db'

type Currency = 'ARS' | 'ETH' | 'USDT' | 'USDC'
type Network = 'ETH' | 'BASE' | undefined

export interface MatchResultInput {
  gameId: string
  winnerWallet: string | { id?: string; address?: string }
  pot: number
  betAmount: number
  currency: Currency
  network?: Network
  players: Array<string | { id?: string; address?: string }>
  createdAt?: Date
  startedAt?: Date
  finishedAt?: Date
}

/**
 * Normaliza cualquier representación de wallet a un string lowercased.
 * Acepta:
 *  - "0xabc..."
 *  - { id: "0xabc..." }
 *  - { address: "0xabc..." }
 */
function normalizeWallet(wallet: unknown): string {
  if (typeof wallet === 'string') {
    return wallet.toLowerCase()
  }

  if (wallet && typeof wallet === 'object') {
    const w = (wallet as any).id || (wallet as any).address
    if (typeof w === 'string') {
      return w.toLowerCase()
    }
  }

  // Si no podemos normalizar, devolvemos string vacío para evitar crashear
  return ''
}

/**
 * Guarda el resultado de una partida en:
 *  - matches
 *  - match_players
 *
 * No toca las tablas games / game_players / player_stats para evitar problemas con UUID.
 */
export async function saveMatchResult(input: MatchResultInput): Promise<void> {
  const client = await pool.connect()

  const {
    gameId,
    winnerWallet,
    pot,
    currency,
    network,
    players,
    createdAt,
  } = input

  const normalizedWinner = normalizeWallet(winnerWallet)
  const created = createdAt ?? new Date()

  if (!normalizedWinner) {
    console.error('[DB] saveMatchResult: winnerWallet vacío o inválido:', winnerWallet)
    client.release()
    return
  }

  try {
    console.log('[DB] Saving match result...', {
      gameId,
      winnerWallet: normalizedWinner,
      pot,
      currency,
      network,
      playerCount: players.length,
    })

    await client.query('BEGIN')

    // 1) Insertar / actualizar en matches
    const matchRes = await client.query(
      `
      INSERT INTO matches (game_id, winner_wallet, pot, currency, network, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (game_id) DO UPDATE SET
        winner_wallet = EXCLUDED.winner_wallet,
        pot = EXCLUDED.pot,
        currency = EXCLUDED.currency,
        network = EXCLUDED.network,
        created_at = EXCLUDED.created_at
      RETURNING id
      `,
      [gameId, normalizedWinner, pot, currency, network ?? null, created],
    )

    const matchId: number = matchRes.rows[0].id

    // 2) Limpiar jugadores anteriores (si los hubiera)
    await client.query(
      `DELETE FROM match_players WHERE match_id = $1`,
      [matchId],
    )

    // Por ahora asumimos un solo ganador → todo el pot para él
    const winnerPrize = pot
    const winnerAddr = normalizedWinner

    // 3) Insertar jugadores de la partida
    for (const p of players) {
      const addr = normalizeWallet(p)
      if (!addr) {
        console.warn('[DB] saveMatchResult: player wallet inválido, se salta:', p)
        continue
      }

      const isWinner = addr === winnerAddr
      const prize = isWinner ? winnerPrize : 0

      await client.query(
        `
        INSERT INTO match_players (match_id, wallet_address, is_winner, prize)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (match_id, wallet_address) DO UPDATE SET
          is_winner = EXCLUDED.is_winner,
          prize = EXCLUDED.prize
        `,
        [matchId, addr, isWinner, prize],
      )
    }

    // 4) Asegurar existencia de registros en players y actualizar player_stats
    // Crear/obtener player_id para cada wallet
    const playerIds: Record<string, number> = {}
    for (const p of players) {
      const addr = normalizeWallet(p)
      if (!addr) continue
      const upPlayer = await client.query(
        `
        INSERT INTO players (wallet_address, username)
        VALUES ($1, $2)
        ON CONFLICT (wallet_address) DO UPDATE SET username = COALESCE(players.username, EXCLUDED.username)
        RETURNING id
        `,
        [addr, `Player_${addr.slice(2, 8)}`],
      )
      playerIds[addr] = upPlayer.rows[0].id
    }

    // Incrementar games_played para todos y games_won + totales por moneda para el ganador
    for (const p of players) {
      const addr = normalizeWallet(p)
      if (!addr) continue
      const pid = playerIds[addr]
      const isWinner = addr === winnerAddr

      // Upsert base de stats si no existe
      await client.query(
        `
        INSERT INTO player_stats (player_id, games_played, games_won, total_won_ars, total_won_eth, total_won_usdt, total_won_usdc)
        VALUES ($1, 0, 0, 0, 0, 0, 0)
        ON CONFLICT (player_id) DO NOTHING
        `,
        [pid],
      )

      // Siempre sumar partida jugada
      await client.query(
        `UPDATE player_stats SET games_played = games_played + 1 WHERE player_id = $1`,
        [pid],
      )

      if (isWinner) {
        await client.query(
          `UPDATE player_stats SET games_won = games_won + 1 WHERE player_id = $1`,
          [pid],
        )

        // Sumar premio por moneda
        if (currency === 'ARS') {
          await client.query(
            `UPDATE player_stats SET total_won_ars = COALESCE(total_won_ars,0) + $2 WHERE player_id = $1`,
            [pid, winnerPrize],
          )
        } else if (currency === 'ETH') {
          await client.query(
            `UPDATE player_stats SET total_won_eth = COALESCE(total_won_eth,0) + $2 WHERE player_id = $1`,
            [pid, winnerPrize],
          )
        } else if (currency === 'USDT') {
          await client.query(
            `UPDATE player_stats SET total_won_usdt = COALESCE(total_won_usdt,0) + $2 WHERE player_id = $1`,
            [pid, winnerPrize],
          )
        } else if (currency === 'USDC') {
          await client.query(
            `UPDATE player_stats SET total_won_usdc = COALESCE(total_won_usdc,0) + $2 WHERE player_id = $1`,
            [pid, winnerPrize],
          )
        }
      }
    }

    await client.query('COMMIT')

    console.log('[DB] Match result saved OK', {
      gameId,
      matchId,
      winner: winnerAddr,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('[DB] Error saving game result:', err)
    throw err
  } finally {
    client.release()
  }
}

export interface WalletStats {
  wallet: string
  gamesPlayed: number
  gamesWon: number
  totalWonARS: number
  totalWonETH: number
  totalWonUSDT: number
  totalWonUSDC: number
  lastMatches: Array<{
    gameId: string
    winnerWallet: string
    pot: number
    currency: string
    network: string | null
    createdAt: string
    isWinner: boolean
    prize: number
  }>
}

/**
 * Devuelve stats agregadas para una wallet en base a:
 *  - matches
 *  - match_players
 */
export async function getMatchStatsForWallet(
  wallet: string,
): Promise<WalletStats | null> {
  const client = await pool.connect()
  const addr = normalizeWallet(wallet)

  try {
    // Agregados
    const aggRes = await client.query(
      `
      SELECT
        COUNT(*) AS games_played,
        SUM(CASE WHEN mp.is_winner THEN 1 ELSE 0 END) AS games_won,
        COALESCE(SUM(CASE WHEN mp.is_winner AND m.currency = 'ARS'  THEN mp.prize END), 0) AS total_won_ars,
        COALESCE(SUM(CASE WHEN mp.is_winner AND m.currency = 'ETH'  THEN mp.prize END), 0) AS total_won_eth,
        COALESCE(SUM(CASE WHEN mp.is_winner AND m.currency = 'USDT' THEN mp.prize END), 0) AS total_won_usdt,
        COALESCE(SUM(CASE WHEN mp.is_winner AND m.currency = 'USDC' THEN mp.prize END), 0) AS total_won_usdc
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.wallet_address = $1
      `,
      [addr],
    )

    const agg = aggRes.rows[0]

    if (!agg || Number(agg.games_played) === 0) {
      return null
    }

    // Últimas 10 partidas
    const lastRes = await client.query(
      `
      SELECT
        m.game_id,
        m.winner_wallet,
        m.pot,
        m.currency,
        m.network,
        m.created_at,
        mp.is_winner,
        mp.prize
      FROM match_players mp
      JOIN matches m ON mp.match_id = m.id
      WHERE mp.wallet_address = $1
      ORDER BY m.created_at DESC
      LIMIT 10
      `,
      [addr],
    )

    return {
      wallet: addr,
      gamesPlayed: Number(agg.games_played),
      gamesWon: Number(agg.games_won) || 0,
      totalWonARS: Number(agg.total_won_ars) || 0,
      totalWonETH: Number(agg.total_won_eth) || 0,
      totalWonUSDT: Number(agg.total_won_usdt) || 0,
      totalWonUSDC: Number(agg.total_won_usdc) || 0,
      lastMatches: lastRes.rows.map((r) => ({
        gameId: r.game_id,
        winnerWallet: r.winner_wallet,
        pot: Number(r.pot),
        currency: r.currency,
        network: r.network,
        createdAt: r.created_at,
        isWinner: r.is_winner,
        prize: Number(r.prize),
      })),
    }
  } catch (err) {
    console.error('[DB] Error fetching match stats:', err)
    throw err
  } finally {
    client.release()
  }
}
