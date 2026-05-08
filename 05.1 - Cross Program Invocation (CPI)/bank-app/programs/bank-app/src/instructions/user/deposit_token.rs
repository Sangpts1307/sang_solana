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
    transfer_helper::token_transfer_from_user,
};

#[derive(Accounts)]
pub struct DepositToken<'info> {
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

    /// CHECK: Tài khoản Global State của Staking App để lấy tổng tài sản đang đầu tư
    pub staking_global_state: Option<Account<'info, staking_app::GlobalState>>,

    /// CHECK: Tài khoản thông tin stake của ngân hàng tại Staking App
    pub staking_info: Option<Account<'info, staking_app::UserStakingInfo>>,

    #[account(
        init_if_needed,
        seeds = [
            USER_RESERVE_SEED,
            user.key().as_ref(),
            token_mint.key().as_ref()
        ],
        bump,
        payer = user,
        space = 8 + std::mem::size_of::<UserReserve>(),
    )]
    pub user_reserve: Box<Account<'info, UserReserve>>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

impl<'info> DepositToken<'info> {
    pub fn process(ctx: Context<DepositToken>, deposit_amount: u64) -> Result<()> {
        let bank_info = &mut ctx.accounts.bank_info;

        if bank_info.is_paused {
            return Err(BankAppError::BankAppPaused.into());
        }

        // 1. Tính toán tổng tài sản (Total Assets) = Tiền trong Vault + Tiền đang đi đầu tư
        let mut total_assets = ctx.accounts.bank_ata.amount;

        if let (Some(global_state), Some(staking_info)) = (&ctx.accounts.staking_global_state, &ctx.accounts.staking_info) {
            if global_state.total_shares > 0 {
                let invested_amount = (staking_info.shares as u128 * global_state.total_assets as u128 / global_state.total_shares as u128) as u64;
                total_assets += invested_amount;
                msg!("Invested amount: {}", invested_amount);
            }
        }
        
        msg!("Total assets in bank for this token: {}", total_assets);

        // 2. Tính toán số lượng Shares để phát hành
        // Công thức: shares_to_mint = deposit_amount * total_shares / total_assets
        let shares_to_mint = if bank_info.total_shares == 0 || total_assets == 0 {
            deposit_amount // Tỷ lệ 1:1 cho lần đầu
        } else {
            (deposit_amount as u128 * bank_info.total_shares as u128 / total_assets as u128) as u64
        };

        // 3. Chuyển token từ người dùng vào Vault
        token_transfer_from_user(
            ctx.accounts.user_ata.to_account_info(),
            &ctx.accounts.user,
            ctx.accounts.bank_ata.to_account_info(),
            &ctx.accounts.token_program,
            deposit_amount,
        )?;

        // 4. Cập nhật state
        let user_reserve = &mut ctx.accounts.user_reserve;
        user_reserve.shares += shares_to_mint;
        bank_info.total_shares += shares_to_mint;

        msg!("Deposited {} tokens. Minted {} shares.", deposit_amount, shares_to_mint);

        Ok(())
    }
}
