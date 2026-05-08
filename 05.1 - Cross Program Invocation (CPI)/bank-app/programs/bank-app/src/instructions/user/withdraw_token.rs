use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    token::Token,
    token_interface::{Mint, TokenAccount},
};
use staking_app;

use crate::{
    constant::{BANK_INFO_SEED, BANK_VAULT_SEED, USER_RESERVE_SEED},
    error::BankAppError,
    state::{BankInfo, UserReserve},
    transfer_helper::token_transfer_from_pda,
};

#[derive(Accounts)]
pub struct WithdrawToken<'info> {
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

    #[account(mut)]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = user
    )]
    pub user_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = bank_vault
    )]
    pub bank_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: Tài khoản Global State của Staking App
    pub staking_global_state: Option<Account<'info, staking_app::GlobalState>>,

    /// CHECK: Tài khoản thông tin stake của ngân hàng tại Staking App
    pub staking_info: Option<Account<'info, staking_app::UserStakingInfo>>,

    #[account(
        mut,
        seeds = [
            USER_RESERVE_SEED,
            user.key().as_ref(),
            token_mint.key().as_ref()
        ],
        bump,
    )]
    pub user_reserve: Box<Account<'info, UserReserve>>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> WithdrawToken<'info> {
    pub fn process(ctx: Context<WithdrawToken>, shares_to_burn: u64) -> Result<()> {
        let bank_info = &mut ctx.accounts.bank_info;

        if bank_info.is_paused {
            return Err(BankAppError::BankAppPaused.into());
        }

        let user_reserve = &mut ctx.accounts.user_reserve;
        require!(user_reserve.shares >= shares_to_burn, BankAppError::InsufficientFunds);

        // 1. Tính toán tổng tài sản (Total Assets) để xác định tỷ giá
        let mut total_assets = ctx.accounts.bank_ata.amount;

        if let (Some(global_state), Some(staking_info)) = (&ctx.accounts.staking_global_state, &ctx.accounts.staking_info) {
            if global_state.total_shares > 0 {
                let invested_amount = (staking_info.shares as u128 * global_state.total_assets as u128 / global_state.total_shares as u128) as u64;
                total_assets += invested_amount;
            }
        }

        // 2. Tính toán số lượng Token nhận về
        // Công thức: tokens_to_withdraw = shares_to_burn * total_assets / total_shares
        let tokens_to_withdraw = if bank_info.total_shares == 0 {
            0
        } else {
            (shares_to_burn as u128 * total_assets as u128 / bank_info.total_shares as u128) as u64
        };

        require!(ctx.accounts.bank_ata.amount >= tokens_to_withdraw, BankAppError::InsufficientFunds);

        // 3. Chuyển token từ Vault về người dùng
        let pda_seeds: &[&[&[u8]]] = &[&[BANK_VAULT_SEED, &[bank_info.bump]]];
        
        token_transfer_from_pda(
            ctx.accounts.bank_ata.to_account_info(),
            ctx.accounts.bank_vault.to_account_info(),
            ctx.accounts.user_ata.to_account_info(),
            &ctx.accounts.token_program,
            pda_seeds,
            tokens_to_withdraw,
        )?;

        // 4. Cập nhật state
        user_reserve.shares = user_reserve.shares.saturating_sub(shares_to_burn);
        
        msg!("Before subtract: total_shares = {}, burn = {}", bank_info.total_shares, shares_to_burn);
        bank_info.total_shares = bank_info.total_shares.saturating_sub(shares_to_burn);

        msg!("Withdrew {} tokens by burning {} shares.", tokens_to_withdraw, shares_to_burn);

        Ok(())
    }
}
