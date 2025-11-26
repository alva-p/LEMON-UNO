/**
 * GameEscrowService - Maneja el sistema de escrow para apuestas
 * Gestiona depósitos de garantía cuando se crea un juego
 * y distribuye fondos cuando el juego termina
 */

interface EscrowEntry {
  id: string;
  gameId: string;
  userId: string;
  amount: number;
  createdAt: Date;
  releasedAt?: Date;
  status: 'LOCKED' | 'RELEASED' | 'RETURNED';
}

interface GamePot {
  gameId: string;
  totalAmount: number;
  players: Map<string, number>; // userId -> amount
  createdAt: Date;
}

export class GameEscrowService {
  private escrows = new Map<string, EscrowEntry>();
  private pots = new Map<string, GamePot>();
  private escrowIdCounter = 0;

  /**
   * Crea una entrada de escrow para una apuesta
   * Deducirá el monto de la billetera del usuario
   */
  createEscrow(gameId: string, userId: string, betAmount: number): EscrowEntry {
    if (betAmount <= 0) {
      throw new Error('Monto de apuesta debe ser mayor a 0');
    }

    const escrowId = `escrow_${this.escrowIdCounter++}_${Date.now()}`;
    const entry: EscrowEntry = {
      id: escrowId,
      gameId,
      userId,
      amount: betAmount,
      createdAt: new Date(),
      status: 'LOCKED',
    };

    this.escrows.set(escrowId, entry);

    // Crear o actualizar el pot del juego
    if (!this.pots.has(gameId)) {
      this.pots.set(gameId, {
        gameId,
        totalAmount: 0,
        players: new Map(),
        createdAt: new Date(),
      });
    }

    const pot = this.pots.get(gameId)!;
    pot.totalAmount += betAmount;
    pot.players.set(userId, (pot.players.get(userId) || 0) + betAmount);

    console.log(`💰 Escrow creado: ${escrowId}`);
    console.log(`   Game: ${gameId}`);
    console.log(`   Usuario: ${userId}`);
    console.log(`   Monto: $${betAmount} ARS`);
    console.log(`   Pot total: $${pot.totalAmount} ARS`);

    return entry;
  }

  /**
   * Obtiene un escrow por ID
   */
  getEscrow(escrowId: string): EscrowEntry | undefined {
    return this.escrows.get(escrowId);
  }

  /**
   * Obtiene todos los escrows de un juego
   */
  getGameEscrows(gameId: string): EscrowEntry[] {
    return Array.from(this.escrows.values()).filter((e) => e.gameId === gameId);
  }

  /**
   * Obtiene el pot de un juego
   */
  getGamePot(gameId: string): GamePot | undefined {
    return this.pots.get(gameId);
  }

  /**
   * Valida que un usuario tenga suficiente balance para una apuesta
   * (En producción, esto verificaría contra la billetera real)
   */
  validateBalance(userId: string, requiredAmount: number, userBalance: number): boolean {
    return userBalance >= requiredAmount;
  }

  /**
   * Libera escrow al ganador
   * Marca como RELEASED y agrega a balance del usuario
   */
  releaseToWinner(
    escrowId: string,
    winnerUserId: string,
    amountToRelease: number
  ): EscrowEntry {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new Error(`Escrow no encontrado: ${escrowId}`);
    }

    if (escrow.status !== 'LOCKED') {
      throw new Error(`Escrow no está bloqueado: ${escrow.status}`);
    }

    escrow.status = 'RELEASED';
    escrow.releasedAt = new Date();

    console.log(`🎉 Escrow liberado al ganador:`);
    console.log(`   Escrow: ${escrowId}`);
    console.log(`   Ganador: ${winnerUserId}`);
    console.log(`   Monto: $${amountToRelease} ARS`);

    return escrow;
  }

  /**
   * Devuelve escrow (devuelve dinero si juego se cancela)
   */
  returnEscrow(escrowId: string): EscrowEntry {
    const escrow = this.escrows.get(escrowId);
    if (!escrow) {
      throw new Error(`Escrow no encontrado: ${escrowId}`);
    }

    if (escrow.status !== 'LOCKED') {
      throw new Error(`Escrow no está bloqueado: ${escrow.status}`);
    }

    escrow.status = 'RETURNED';
    escrow.releasedAt = new Date();

    console.log(`↩️  Escrow devuelto:`);
    console.log(`   Escrow: ${escrowId}`);
    console.log(`   Usuario: ${escrow.userId}`);
    console.log(`   Monto: $${escrow.amount} ARS`);

    return escrow;
  }

  /**
   * Distribuye el pot entre los ganadores
   * Llamado cuando el juego termina
   */
  distributePot(
    gameId: string,
    winners: { userId: string; prizeAmount: number }[]
  ): {
    gameId: string;
    distributions: Array<{ userId: string; amount: number }>;
    totalDistributed: number;
  } {
    const pot = this.pots.get(gameId);
    if (!pot) {
      throw new Error(`Pot no encontrado para juego: ${gameId}`);
    }

    const escrows = this.getGameEscrows(gameId);
    if (escrows.some((e) => e.status !== 'LOCKED')) {
      throw new Error('No todos los escrows están bloqueados');
    }

    let totalDistributed = 0;
    const distributions = winners.map((winner) => {
      // Liberar escrows del ganador
      const winnerEscrows = escrows.filter((e) => e.userId === winner.userId);
      winnerEscrows.forEach((e) => this.releaseToWinner(e.id, winner.userId, e.amount));

      totalDistributed += winner.prizeAmount;
      return {
        userId: winner.userId,
        amount: winner.prizeAmount,
      };
    });

    // Devolver escrows de perdedores
    const loserIds = new Set(
      escrows.map((e) => e.userId).filter((id) => !winners.find((w) => w.userId === id))
    );
    loserIds.forEach((userId) => {
      const loserEscrows = escrows.filter((e) => e.userId === userId);
      loserEscrows.forEach((e) => this.returnEscrow(e.id));
    });

    console.log(`🏆 Distribución de pot completada:`);
    console.log(`   Juego: ${gameId}`);
    console.log(`   Total distribuido: $${totalDistributed} ARS`);
    console.log(`   Ganadores: ${winners.length}`);
    console.log(`   Perdedores devueltos: ${loserIds.size}`);

    // Remover pot completado
    this.pots.delete(gameId);

    return {
      gameId,
      distributions,
      totalDistributed,
    };
  }

  /**
   * Cancela todos los escrows de un juego y devuelve fondos
   */
  cancelGame(gameId: string): { cancelledCount: number; totalReturned: number } {
    const escrows = this.getGameEscrows(gameId);
    let cancelledCount = 0;
    let totalReturned = 0;

    escrows.forEach((escrow) => {
      if (escrow.status === 'LOCKED') {
        this.returnEscrow(escrow.id);
        cancelledCount++;
        totalReturned += escrow.amount;
      }
    });

    // Remover pot
    this.pots.delete(gameId);

    console.log(`❌ Juego cancelado:`);
    console.log(`   Juego: ${gameId}`);
    console.log(`   Escrows devueltos: ${cancelledCount}`);
    console.log(`   Total devuelto: $${totalReturned} ARS`);

    return { cancelledCount, totalReturned };
  }

  /**
   * Obtiene estadísticas de escrow de un usuario
   */
  getUserEscrowStats(userId: string) {
    const userEscrows = Array.from(this.escrows.values()).filter((e) => e.userId === userId);

    return {
      userId,
      totalLocked: userEscrows
        .filter((e) => e.status === 'LOCKED')
        .reduce((sum, e) => sum + e.amount, 0),
      totalReleased: userEscrows
        .filter((e) => e.status === 'RELEASED')
        .reduce((sum, e) => sum + e.amount, 0),
      totalReturned: userEscrows
        .filter((e) => e.status === 'RETURNED')
        .reduce((sum, e) => sum + e.amount, 0),
      escrowCount: userEscrows.length,
      recentEscrows: userEscrows.slice(-5),
    };
  }

  /**
   * Reseta el servicio (útil para testing)
   */
  reset(): void {
    this.escrows.clear();
    this.pots.clear();
    this.escrowIdCounter = 0;
    console.log('🔄 GameEscrowService reseteado');
  }
}

// Instancia singleton
export const gameEscrowService = new GameEscrowService();
