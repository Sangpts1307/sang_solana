use anchor_lang::{prelude::*, system_program};

use crate::{
    constant::{BANK_INFO_SEED, BANK_VAULT_SEED, USER_RESERVE_SEED},
    error::BankAppError,
    state::{BankInfo, UserReserve},
    transfer_helper::sol_transfer_from_user,
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        seeds = [BANK_INFO_SEED],
        bump
    )]
    pub bank_info: Box<Account<'info, BankInfo>>,

    ///CHECK:
    #[account(
        mut,
        seeds = [BANK_VAULT_SEED],
        bump,
        owner = system_program::ID
    )]
    pub bank_vault: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        seeds = [USER_RESERVE_SEED, user.key().as_ref()],
        bump,
        payer = user,
        space = 8 + std::mem::size_of::<UserReserve>(),
    )]
    pub user_reserve: Box<Account<'info, UserReserve>>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> Deposit<'info> {
    pub fn process(ctx: Context<Deposit>, deposit_amount: u64) -> Result<()> {
        let bank_info = &mut ctx.accounts.bank_info;

        if bank_info.is_paused {
            return Err(BankAppError::BankAppPaused.into());
        }

        // 1. Tính toán tổng tài sản (chỉ tính SOL trong vault vì staking-app chưa hỗ trợ SOL)
        let total_assets = ctx.accounts.bank_vault.lamports();

        // 2. Tính toán số lượng Shares
        let shares_to_mint = if bank_info.total_shares == 0 || total_assets == 0 {
            deposit_amount
        } else {
            (deposit_amount as u128 * bank_info.total_shares as u128 / total_assets as u128) as u64
        };

        // 3. Chuyển SOL từ người dùng vào Vault
        sol_transfer_from_user(
            &ctx.accounts.user,
            ctx.accounts.bank_vault.to_account_info(),
            &ctx.accounts.system_program,
            deposit_amount,
        )?;

        // 4. Cập nhật state
        let user_reserve = &mut ctx.accounts.user_reserve;
        user_reserve.shares += shares_to_mint;
        bank_info.total_shares += shares_to_mint;

        msg!("Deposited {} SOL. Minted {} shares.", deposit_amount, shares_to_mint);

        Ok(())
    }
}
