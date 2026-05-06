use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};

declare_id!("HuTpXP8eQoofymenBBS1q7neUYLmXhs4k1VvfPmqqNB9");

/// Jupiter Earn (Lending) mainnet program
pub const JUPITER_EARN_PROGRAM: Pubkey =
    pubkey!("jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9");

fn deposit_discriminator() -> Vec<u8> {
    vec![242, 35, 198, 137, 82, 225, 242, 182]
}

fn withdraw_discriminator() -> Vec<u8> {
    vec![183, 18, 70, 156, 148, 109, 161, 34]
}

#[program]
pub mod jupiter_earn_cpi {
    use super::*;

    /// CPI to Jupiter Earn `deposit`: user deposits underlying tokens, receives fTokens.
    pub fn deposit_to_earn(ctx: Context<DepositToEarn>, amount: u64) -> Result<()> {
        let mut data = deposit_discriminator();
        data.extend_from_slice(&amount.to_le_bytes());

        let account_metas = vec![
            AccountMeta::new(ctx.accounts.signer.key(), true),
            AccountMeta::new(ctx.accounts.depositor_token_account.key(), false),
            AccountMeta::new(ctx.accounts.recipient_f_token_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
            AccountMeta::new_readonly(ctx.accounts.lending_admin.key(), false),
            AccountMeta::new(ctx.accounts.lending.key(), false),
            AccountMeta::new(ctx.accounts.f_token_mint.key(), false),
            AccountMeta::new(ctx.accounts.supply_token_reserves_liquidity.key(), false),
            AccountMeta::new(ctx.accounts.lending_supply_position_on_liquidity.key(), false),
            AccountMeta::new_readonly(ctx.accounts.rate_model.key(), false),
            AccountMeta::new(ctx.accounts.vault.key(), false),
            AccountMeta::new(ctx.accounts.liquidity.key(), false),
            AccountMeta::new(ctx.accounts.liquidity_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.rewards_rate_model.key(), false),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.associated_token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ];

        let ix = Instruction {
            program_id: ctx.accounts.lending_program.key(),
            accounts: account_metas,
            data,
        };

        invoke(
            &ix,
            &[
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.depositor_token_account.to_account_info(),
                ctx.accounts.recipient_f_token_account.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.lending_admin.to_account_info(),
                ctx.accounts.lending.to_account_info(),
                ctx.accounts.f_token_mint.to_account_info(),
                ctx.accounts.supply_token_reserves_liquidity.to_account_info(),
                ctx.accounts.lending_supply_position_on_liquidity.to_account_info(),
                ctx.accounts.rate_model.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.liquidity.to_account_info(),
                ctx.accounts.liquidity_program.to_account_info(),
                ctx.accounts.rewards_rate_model.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.associated_token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )
        .map_err(|_| ErrorCodes::CpiToLendingProgramFailed)?;

        msg!("Deposited {} to Jupiter Earn via CPI", amount);
        Ok(())
    }

    /// CPI to Jupiter Earn `withdraw`: user burns fTokens, receives underlying tokens.
    pub fn withdraw_from_earn(ctx: Context<WithdrawFromEarn>, amount: u64) -> Result<()> {
        let mut data = withdraw_discriminator();
        data.extend_from_slice(&amount.to_le_bytes());

        let account_metas = vec![
            AccountMeta::new(ctx.accounts.signer.key(), true),
            AccountMeta::new(ctx.accounts.owner_f_token_account.key(), false),
            AccountMeta::new(ctx.accounts.recipient_token_account.key(), false),
            AccountMeta::new_readonly(ctx.accounts.lending_admin.key(), false),
            AccountMeta::new(ctx.accounts.lending.key(), false),
            AccountMeta::new_readonly(ctx.accounts.mint.key(), false),
            AccountMeta::new(ctx.accounts.f_token_mint.key(), false),
            AccountMeta::new(ctx.accounts.supply_token_reserves_liquidity.key(), false),
            AccountMeta::new(ctx.accounts.lending_supply_position_on_liquidity.key(), false),
            AccountMeta::new_readonly(ctx.accounts.rate_model.key(), false),
            AccountMeta::new(ctx.accounts.vault.key(), false),
            AccountMeta::new(ctx.accounts.claim_account.key(), false),
            AccountMeta::new(ctx.accounts.liquidity.key(), false),
            AccountMeta::new(ctx.accounts.liquidity_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.rewards_rate_model.key(), false),
            AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.associated_token_program.key(), false),
            AccountMeta::new_readonly(ctx.accounts.system_program.key(), false),
        ];

        let ix = Instruction {
            program_id: ctx.accounts.lending_program.key(),
            accounts: account_metas,
            data,
        };

        invoke(
            &ix,
            &[
                ctx.accounts.signer.to_account_info(),
                ctx.accounts.owner_f_token_account.to_account_info(),
                ctx.accounts.recipient_token_account.to_account_info(),
                ctx.accounts.lending_admin.to_account_info(),
                ctx.accounts.lending.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.f_token_mint.to_account_info(),
                ctx.accounts.supply_token_reserves_liquidity.to_account_info(),
                ctx.accounts.lending_supply_position_on_liquidity.to_account_info(),
                ctx.accounts.rate_model.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.claim_account.to_account_info(),
                ctx.accounts.liquidity.to_account_info(),
                ctx.accounts.liquidity_program.to_account_info(),
                ctx.accounts.rewards_rate_model.to_account_info(),
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.associated_token_program.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )
        .map_err(|_| ErrorCodes::CpiToLendingProgramFailed)?;

        msg!("Withdrew {} from Jupiter Earn via CPI", amount);
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Deposit accounts — 17 accounts matching jupiter.md deposit table exactly
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct DepositToEarn<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// User's underlying token account (source of tokens to deposit)
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub depositor_token_account: UncheckedAccount<'info>,

    /// User's fToken account (destination for minted fTokens)
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub recipient_f_token_account: UncheckedAccount<'info>,

    /// Underlying token mint (e.g. USDC)
    /// CHECK: validated by Jupiter Earn program
    pub mint: UncheckedAccount<'info>,

    /// Protocol configuration PDA
    /// CHECK: validated by Jupiter Earn program
    pub lending_admin: UncheckedAccount<'info>,

    /// Pool-specific configuration (links mint to fToken mint)
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub lending: UncheckedAccount<'info>,

    /// fToken mint account
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub f_token_mint: UncheckedAccount<'info>,

    /// Liquidity protocol token reserves
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub supply_token_reserves_liquidity: UncheckedAccount<'info>,

    /// Protocol's position in liquidity pool
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub lending_supply_position_on_liquidity: UncheckedAccount<'info>,

    /// Interest rate calculation model
    /// CHECK: validated by Jupiter Earn program
    pub rate_model: UncheckedAccount<'info>,

    /// Protocol token vault (destination of deposited tokens)
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    /// Liquidity protocol PDA
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub liquidity: UncheckedAccount<'info>,

    /// External liquidity program
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub liquidity_program: UncheckedAccount<'info>,

    /// Rewards/exchange rate model
    /// CHECK: validated by Jupiter Earn program
    pub rewards_rate_model: UncheckedAccount<'info>,

    pub token_program: Program<'info, anchor_spl::token::Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,

    /// Jupiter Earn lending program
    /// CHECK: must equal JUPITER_EARN_PROGRAM
    #[account(address = JUPITER_EARN_PROGRAM)]
    pub lending_program: UncheckedAccount<'info>,
}

// ---------------------------------------------------------------------------
// Withdraw accounts — 18 accounts matching jupiter.md withdraw table exactly
// ---------------------------------------------------------------------------
#[derive(Accounts)]
pub struct WithdrawFromEarn<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// User's fToken account (source of fTokens to burn)
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub owner_f_token_account: UncheckedAccount<'info>,

    /// User's underlying token account (destination for withdrawn tokens)
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub recipient_token_account: UncheckedAccount<'info>,

    /// Protocol configuration PDA
    /// CHECK: validated by Jupiter Earn program
    pub lending_admin: UncheckedAccount<'info>,

    /// Pool-specific configuration
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub lending: UncheckedAccount<'info>,

    /// Underlying token mint
    /// CHECK: validated by Jupiter Earn program
    pub mint: UncheckedAccount<'info>,

    /// fToken mint account
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub f_token_mint: UncheckedAccount<'info>,

    /// Liquidity protocol token reserves
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub supply_token_reserves_liquidity: UncheckedAccount<'info>,

    /// Protocol's position in liquidity pool
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub lending_supply_position_on_liquidity: UncheckedAccount<'info>,

    /// Interest rate calculation model
    /// CHECK: validated by Jupiter Earn program
    pub rate_model: UncheckedAccount<'info>,

    /// Protocol token vault (source of withdrawn tokens)
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,

    /// Claim processing account (withdraw-only)
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub claim_account: UncheckedAccount<'info>,

    /// Liquidity protocol PDA
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub liquidity: UncheckedAccount<'info>,

    /// External liquidity program
    /// CHECK: validated by Jupiter Earn program
    #[account(mut)]
    pub liquidity_program: UncheckedAccount<'info>,

    /// Rewards/exchange rate model
    /// CHECK: validated by Jupiter Earn program
    pub rewards_rate_model: UncheckedAccount<'info>,

    pub token_program: Program<'info, anchor_spl::token::Token>,
    pub associated_token_program: Program<'info, anchor_spl::associated_token::AssociatedToken>,
    pub system_program: Program<'info, System>,

    /// Jupiter Earn lending program
    /// CHECK: must equal JUPITER_EARN_PROGRAM
    #[account(address = JUPITER_EARN_PROGRAM)]
    pub lending_program: UncheckedAccount<'info>,
}

#[error_code]
pub enum ErrorCodes {
    #[msg("CPI call to Jupiter Earn lending program failed")]
    CpiToLendingProgramFailed,
}
