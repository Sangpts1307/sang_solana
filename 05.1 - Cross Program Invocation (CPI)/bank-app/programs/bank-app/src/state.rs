use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct BankInfo {
    pub authority: Pubkey,
    pub is_paused: bool,
    pub total_shares: u64, // Thêm total_shares
    pub bump: u8,
}

#[account]
#[derive(Default)]
pub struct UserReserve {
    pub shares: u64, // Đổi từ deposited_amount sang shares
}
