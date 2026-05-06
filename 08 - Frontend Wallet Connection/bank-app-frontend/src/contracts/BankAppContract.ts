import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import type { Connection } from '@solana/web3.js';
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Buffer } from 'buffer';
import idl from '../idl/bank_app.json';

export function parseSolInputToLamports(value: string): BN {
  const normalizedValue = value.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(normalizedValue)) {
    throw new Error('Số lượng SOL không hợp lệ. Dùng tối đa 9 chữ số thập phân.');
  }

  const [wholePart, fractionalPart = ''] = normalizedValue.split('.');
  const lamports =
    BigInt(wholePart) * BigInt(LAMPORTS_PER_SOL) + BigInt(fractionalPart.padEnd(9, '0'));

  if (lamports <= 0) {
    throw new Error('Số lượng SOL phải lớn hơn 0.');
  }

  return new BN(lamports.toString());
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Giao dịch thất bại.';
}

export type BankPdas = {
  bankInfo: PublicKey;
  bankVault: PublicKey;
  userReserve: PublicKey;
};

export function getBankPdas(program: Program<Idl>, userPublicKey: PublicKey): BankPdas {
  const [bankInfo] = PublicKey.findProgramAddressSync(
    [Buffer.from('BANK_INFO_SEED')],
    program.programId
  );
  const [bankVault] = PublicKey.findProgramAddressSync(
    [Buffer.from('BANK_VAULT_SEED')],
    program.programId
  );
  const [userReserve] = PublicKey.findProgramAddressSync(
    [Buffer.from('USER_RESERVE_SEED'), userPublicKey.toBuffer()],
    program.programId
  );

  return { bankInfo, bankVault, userReserve };
}

export class BankAppContract {
  readonly program: Program<Idl>;
  private readonly wallet: AnchorWallet;

  constructor(connection: Connection, wallet: AnchorWallet) {
    this.wallet = wallet;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: 'confirmed',
    });
    this.program = new Program(idl as Idl, provider);
  }

  async fetchUserReserveSol(): Promise<number> {
    const pdas = getBankPdas(this.program, this.wallet.publicKey);
    try {
      const data = await (this.program.account as any).userReserve.fetch(pdas.userReserve);
      if (!data) {
        return 0;
      }
      return data.depositedAmount.toNumber() / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }

  async deposit(amountInSol: string): Promise<string> {
    const amountInLamports = parseSolInputToLamports(amountInSol);
    const pdas = getBankPdas(this.program, this.wallet.publicKey);

    return this.program.methods
      .deposit(amountInLamports)
      .accounts({
        bankInfo: pdas.bankInfo,
        bankVault: pdas.bankVault,
        userReserve: pdas.userReserve,
        user: this.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  }
}
