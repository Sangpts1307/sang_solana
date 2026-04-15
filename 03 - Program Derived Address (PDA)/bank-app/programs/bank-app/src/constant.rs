use anchor_lang::prelude::*;

#[constant]
pub const BANK_INFO_SEED: &[u8] = b"BANK_INFO_SEED";
pub const BANK_VAULT_SEED: &[u8] = b"BANK_VAULT_SEED";
pub const USER_RESERVE_SEED: &[u8] = b"USER_RESERVE_SEED";

// Giới hạn soo
pub const MIN_DEPOSIT: u64 = 10_000_000; // 0.01 SOL
pub const MAX_DEPOSIT: u64 = 100_000_000_000; // 100 SOL
