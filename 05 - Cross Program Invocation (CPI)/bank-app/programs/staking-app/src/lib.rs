use anchor_lang::{prelude::*, system_program};
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("Ci8DKHWrT9uqhzoP3bnqTUwekU4MDPyufJzBUzSKJxaF");

pub mod transfer_helper;

#[program]
pub mod staking_app {
    use transfer_helper::{sol_transfer_from_pda, sol_transfer_from_user};
    use super::*;

    // --- CẤU HÌNH LÃI SUẤT ---
    const STAKING_APR: u64 = 5000; // 5000% APR để thấy lãi nhảy số trong 30 giây
    const SECOND_PER_YEAR: u64 = 31_536_000;

    // Lệnh Stake SOL
    pub fn stake(ctx: Context<Stake>, amount: u64, is_stake: bool) -> Result<()> {
        let user_info = &mut ctx.accounts.user_info;
        let current_time: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();

        // 1. TÍNH LÃI TRƯỚC (Nếu đây không phải lần đầu gửi)
        if user_info.last_update_time > 0 {
            let pass_time = current_time - user_info.last_update_time;
            let interest = (user_info.amount as u128) * (STAKING_APR as u128) * (pass_time as u128) / 100 / (SECOND_PER_YEAR as u128);
            
            if interest > 0 {
                user_info.amount += interest as u64;
                msg!("SOL Staking - Pass time: {}s, Interest earned: {} lamports", pass_time, interest);
            }
        }
        user_info.last_update_time = current_time;

        // 2. THỰC HIỆN NẠP/RÚT
        if amount != 0 {
            if is_stake {
                sol_transfer_from_user(
                    &ctx.accounts.user,
                    ctx.accounts.staking_vault.to_account_info(),
                    &ctx.accounts.system_program,
                    amount,
                )?;
                user_info.amount += amount;
                msg!("Staked {} SOL. Total: {}", amount, user_info.amount);
            } else {
                let pda_seeds: &[&[&[u8]]] = &[&[b"STAKING_VAULT", &[ctx.bumps.staking_vault]]];
                sol_transfer_from_pda(
                    ctx.accounts.staking_vault.to_account_info(),
                    ctx.accounts.user.to_account_info(),
                    &ctx.accounts.system_program,
                    pda_seeds,
                    amount,
                )?;
                user_info.amount -= amount;
                msg!("Unstaked {} SOL. Remaining: {}", amount, user_info.amount);
            }
        }
        Ok(())
    }

    // Lệnh Stake Token (Bài 1) + Tích hợp tính lãi (Bài 2)
    pub fn stake_token(ctx: Context<StakeToken>, amount: u64, is_stake: bool) -> Result<()> {
        let user_info = &mut ctx.accounts.user_info;
        let current_time: u64 = Clock::get()?.unix_timestamp.try_into().unwrap();

        // 1. TÍNH LÃI TRƯỚC
        if user_info.last_update_time > 0 {
            let pass_time = current_time - user_info.last_update_time;
            let interest = (user_info.amount as u128) * (STAKING_APR as u128) * (pass_time as u128) / 100 / (SECOND_PER_YEAR as u128);
            
            if interest > 0 {
                user_info.amount += interest as u64;
                msg!("Token Staking - Pass time: {}s, Interest earned: {}", pass_time, interest);
            }
        }
        user_info.last_update_time = current_time;

        // 2. THỰC HIỆN NẠP/RÚT
        if amount != 0 {
            if is_stake {
                let cpi_accounts = Transfer {
                    from: ctx.accounts.user_ata.to_account_info(),
                    to: ctx.accounts.staking_ata.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                };
                let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
                token::transfer(cpi_ctx, amount)?;

                user_info.amount += amount;
                msg!("Staked {} tokens. Total: {}", amount, user_info.amount);
            } else {
                let pda_seeds: &[&[&[u8]]] = &[&[b"STAKING_VAULT", &[ctx.bumps.staking_vault]]];
                let cpi_accounts = Transfer {
                    from: ctx.accounts.staking_ata.to_account_info(),
                    to: ctx.accounts.user_ata.to_account_info(),
                    authority: ctx.accounts.staking_vault.to_account_info(),
                };
                let cpi_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(), 
                    cpi_accounts, 
                    pda_seeds
                );
                token::transfer(cpi_ctx, amount)?;

                user_info.amount -= amount;
                msg!("Unstaked {} tokens. Remaining: {}", amount, user_info.amount);
            }
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(init_if_needed, payer = payer, seeds = [b"STAKING_VAULT"], bump, space = 0, owner = system_program::ID)]
    /// CHECK: PDA vault SOL
    pub staking_vault: UncheckedAccount<'info>,
    #[account(init_if_needed, seeds = [b"USER_INFO", user.key().as_ref()], bump, payer = payer, space = 8 + 8 + 8)]
    pub user_info: Box<Account<'info, UserInfo>>,
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeToken<'info> {
    #[account(seeds = [b"STAKING_VAULT"], bump)]
    /// CHECK: PDA authority cho token vault
    pub staking_vault: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        seeds = [b"USER_INFO_TOKEN", user.key().as_ref(), mint.key().as_ref()],
        bump,
        payer = payer,
        space = 8 + 8 + 8,
    )]
    pub user_info: Box<Account<'info, UserInfo>>,

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
#[derive(Default)]
pub struct UserInfo {
    pub amount: u64,
    pub last_update_time: u64,
}
