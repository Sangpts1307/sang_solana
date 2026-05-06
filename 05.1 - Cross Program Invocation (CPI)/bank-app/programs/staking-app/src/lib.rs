use anchor_lang::{prelude::*, system_program};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Ci8DKHWrT9uqhzoP3bnqTUwekU4MDPyufJzBUzSKJxaF");

pub mod transfer_helper;

#[program]
pub mod staking_app {
    use transfer_helper::{sol_transfer_from_pda, sol_transfer_from_user};
    use super::*;

    const STAKING_APR: u64 = 5000; 
    const SECOND_PER_YEAR: u64 = 31_536_000;

    // Khởi tạo Global State cho Staking App
    pub fn initialize_global(ctx: Context<InitializeGlobal>) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        global_state.total_assets = 0;
        global_state.total_shares = 0;
        global_state.last_update_time = Clock::get()?.unix_timestamp.try_into().unwrap();
        Ok(())
    }

    pub fn stake_token(ctx: Context<StakeToken>, amount: u64, is_stake: bool) -> Result<()> {
        let global_state = &mut ctx.accounts.global_state;
        let user_info = &mut ctx.accounts.user_info;
        let current_time: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();

        // 1. CẬP NHẬT LÃI SUẤT TOÀN HỆ THỐNG TRƯỚC
        if global_state.total_assets > 0 {
            let pass_time = current_time - global_state.last_update_time;
            let interest = (global_state.total_assets as u128) * (STAKING_APR as u128) * (pass_time as u128) / 100 / (SECOND_PER_YEAR as u128);
            global_state.total_assets += interest as u64;
            msg!("Global Interest earned: {} over {}s", interest, pass_time);
        }
        global_state.last_update_time = current_time;

        // Tỷ giá hiện tại = Total Assets / Total Shares
        // (Nếu chưa có ai gửi, tỷ giá mặc định là 1)

        if is_stake {
            // TÍNH TOÁN SHARES NHẬN ĐƯỢC
            let shares_to_mint = if global_state.total_shares == 0 {
                amount // Lần đầu tiên: 1 Token = 1 Share
            } else {
                (amount as u128 * global_state.total_shares as u128 / global_state.total_assets as u128) as u64
            };

            // Chuyển Token vào kho
            let cpi_accounts = Transfer {
                from: ctx.accounts.user_ata.to_account_info(),
                to: ctx.accounts.staking_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            };
            token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts), amount)?;

            user_info.shares += shares_to_mint;
            global_state.total_shares += shares_to_mint;
            global_state.total_assets += amount;

            msg!("Staked {} tokens. Minted {} shares.", amount, shares_to_mint);
        } else {
            // RÚT TIỀN: Tính giá trị Token dựa trên số Shares muốn rút
            // Ở đây để đơn giản, 'amount' truyền vào sẽ được hiểu là số SHARES muốn rút
            let shares_to_burn = amount;
            require!(user_info.shares >= shares_to_burn, StakingError::InsufficientShares);

            let tokens_to_withdraw = (shares_to_burn as u128 * global_state.total_assets as u128 / global_state.total_shares as u128) as u64;

            let pda_seeds: &[&[&[u8]]] = &[&[b"STAKING_VAULT", &[ctx.bumps.staking_vault]]];
            let cpi_accounts = Transfer {
                from: ctx.accounts.staking_ata.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.staking_vault.to_account_info(),
            };
            token::transfer(CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), cpi_accounts, pda_seeds), tokens_to_withdraw)?;

            user_info.shares -= shares_to_burn;
            global_state.total_shares -= shares_to_burn;
            global_state.total_assets -= tokens_to_withdraw;

            msg!("Unstaked {} shares. Received {} tokens.", shares_to_burn, tokens_to_withdraw);
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGlobal<'info> {
    #[account(init, payer = payer, seeds = [b"GLOBAL_STATE"], bump, space = 8 + 8 + 8 + 8)]
    pub global_state: Account<'info, GlobalState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeToken<'info> {
    #[account(mut, seeds = [b"GLOBAL_STATE"], bump)]
    pub global_state: Account<'info, GlobalState>,

    #[account(seeds = [b"STAKING_VAULT"], bump)]
    /// CHECK: PDA authority
    pub staking_vault: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        seeds = [b"USER_INFO_TOKEN", user.key().as_ref(), mint.key().as_ref()],
        bump,
        payer = payer,
        space = 8 + 8 + 8,
    )]
    pub user_info: Box<Account<'info, UserStakingInfo>>,

    pub mint: Box<Account<'info, Mint>>,
    #[account(mut)]
    pub user_ata: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = payer, associated_token::mint = mint, associated_token::authority = staking_vault)]
    pub staking_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct GlobalState {
    pub total_assets: u64,
    pub total_shares: u64,
    pub last_update_time: u64,
}

#[account]
pub struct UserStakingInfo {
    pub shares: u64,
    pub last_update_time: u64, // Không dùng nhiều nữa nhưng giữ lại để tương thích
}

#[error_code]
pub enum StakingError {
    #[msg("Không đủ cổ phần (shares) để rút.")]
    InsufficientShares,
}
