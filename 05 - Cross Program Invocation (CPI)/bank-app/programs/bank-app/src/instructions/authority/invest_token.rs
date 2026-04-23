use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};
use crate::{
    constant::{BANK_INFO_SEED, BANK_VAULT_SEED},
    error::BankAppError,
    state::BankInfo,
};
// Lưu ý: Import từ staking_app đã được cấu hình trong Cargo.toml
use staking_app::{cpi, program::StakingApp};

#[derive(Accounts)]
pub struct InvestToken<'info> {
    #[account(seeds = [BANK_INFO_SEED], bump)]
    pub bank_info: Box<Account<'info, BankInfo>>,

    /// CHECK: PDA kho tiền của ngân hàng
    #[account(mut, seeds = [BANK_VAULT_SEED], bump, owner = system_program::ID)]
    pub bank_vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub token_mint: Box<Account<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = token_mint,
        associated_token::authority = bank_vault
    )]
    pub bank_ata: Box<Account<'info, TokenAccount>>,

    /// CHECK: Tài khoản đích tại Staking App (Vault của Staking)
    #[account(mut)]
    pub staking_vault: UncheckedAccount<'info>,

    /// CHECK: ATA chứa token của Staking App
    #[account(mut)]
    pub staking_ata: UncheckedAccount<'info>,

    /// CHECK: Tài khoản lưu thông tin stake của ngân hàng tại Staking App
    #[account(mut)]
    pub staking_info: UncheckedAccount<'info>,

    pub staking_program: Program<'info, StakingApp>,

    #[account(mut, address = bank_info.authority)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> InvestToken<'info> {
    pub fn process(ctx: Context<InvestToken>, amount: u64, is_stake: bool) -> Result<()> {
        if ctx.accounts.bank_info.is_paused {
            return Err(BankAppError::BankAppPaused.into());
        }

        // Lấy hạt giống của bank_vault để có thể ký lệnh CPI
        let invest_vault_seeds: &[&[&[u8]]] = &[&[BANK_VAULT_SEED, &[ctx.accounts.bank_info.bump]]];

        // --- THỰC HIỆN CPI ---
        cpi::stake_token(
            CpiContext::new_with_signer(
                ctx.accounts.staking_program.to_account_info(),
                cpi::accounts::StakeToken {
                    staking_vault: ctx.accounts.staking_vault.to_account_info(),
                    user_info: ctx.accounts.staking_info.to_account_info(),
                    mint: ctx.accounts.token_mint.to_account_info(),
                    user_ata: ctx.accounts.bank_ata.to_account_info(),
                    staking_ata: ctx.accounts.staking_ata.to_account_info(),
                    user: ctx.accounts.bank_vault.to_account_info(), // "Người dùng" gửi tiền là bank_vault
                    payer: ctx.accounts.authority.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                invest_vault_seeds, // Dùng hạt giống để ký thay cho bank_vault
            ),
            amount,
            is_stake,
        )?;

        msg!("InvestToken CPI successful. Action: {}", if is_stake { "Stake" } else { "Unstake" });
        Ok(())
    }
}
