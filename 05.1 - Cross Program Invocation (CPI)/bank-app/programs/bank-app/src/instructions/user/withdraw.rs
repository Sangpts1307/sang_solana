use anchor_lang::{prelude::*, system_program};

use crate::{
    constant::{BANK_INFO_SEED, BANK_VAULT_SEED, USER_RESERVE_SEED},
    error::BankAppError,
    state::{BankInfo, UserReserve},
    transfer_helper::sol_transfer_from_pda,
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
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
        mut,
        seeds = [USER_RESERVE_SEED, user.key().as_ref()],
        bump,
    )]
    pub user_reserve: Box<Account<'info, UserReserve>>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> Withdraw<'info> {
    pub fn process(ctx: Context<Withdraw>, shares_to_burn: u64) -> Result<()> {
        let bank_info = &mut ctx.accounts.bank_info;

        if bank_info.is_paused {
            return Err(BankAppError::BankAppPaused.into());
        }

        let user_reserve = &mut ctx.accounts.user_reserve;
        require!(user_reserve.shares >= shares_to_burn, BankAppError::InsufficientFunds);

        // 1. Tính toán tổng tài sản
        let total_assets = ctx.accounts.bank_vault.lamports();

        // 2. Tính toán số lượng SOL nhận về
        let sol_to_withdraw = if bank_info.total_shares == 0 {
            0
        } else {
            (shares_to_burn as u128 * total_assets as u128 / bank_info.total_shares as u128) as u64
        };

        require!(ctx.accounts.bank_vault.lamports() >= sol_to_withdraw, BankAppError::InsufficientFunds);

        // 3. Chuyển SOL từ Vault về người dùng
        let pda_seeds: &[&[&[u8]]] = &[&[BANK_VAULT_SEED, &[bank_info.bump]]];
        
        sol_transfer_from_pda(
            ctx.accounts.bank_vault.to_account_info(),
            ctx.accounts.user.to_account_info(),
            &ctx.accounts.system_program,
            pda_seeds,
            sol_to_withdraw,
        )?;

        // 4. Cập nhật state
        user_reserve.shares -= shares_to_burn;
        bank_info.total_shares -= shares_to_burn;

        msg!("Withdrew {} SOL by burning {} shares.", sol_to_withdraw, shares_to_burn);

        Ok(())
    }
}
