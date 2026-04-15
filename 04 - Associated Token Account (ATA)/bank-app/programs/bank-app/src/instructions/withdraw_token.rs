use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    token::Token,
    token_interface::{Mint, TokenAccount},
};

use crate::{
    constant::{BANK_INFO_SEED, BANK_VAULT_SEED, USER_RESERVE_SEED},
    error::BankAppError,
    state::{BankInfo, UserReserve},
    transfer_helper::token_transfer_from_pda,
};

// ============================================================
// INSTRUCTION: WITHDRAW TOKEN (Rút SPL Token về ví người dùng)
// Tương tự như Withdraw SOL, nhưng thay vì chuyển native SOL,
// lệnh này yêu cầu Token Program chuyển token từ bankAta → userAta.
// BankVault (PDA) là chủ của bankAta, nên cần PDA Signing.
// ============================================================

// --- Khai báo các tài khoản tham gia vào lệnh WITHDRAW TOKEN ---
#[derive(Accounts)]
pub struct WithdrawToken<'info> {
    // BankInfo: để kiểm tra is_paused và lấy bump của Vault
    #[account(
        seeds = [BANK_INFO_SEED],
        bump
    )]
    pub bank_info: Box<Account<'info, BankInfo>>,

    // BankVault (PDA): chủ sở hữu của bankAta. Không chứa token trực tiếp,
    // nhưng được dùng làm "authority" của bankAta trong Token Program.
    ///CHECK:
    #[account(
        mut,
        seeds = [BANK_VAULT_SEED],
        bump,
        owner = system_program::ID
    )]
    pub bank_vault: UncheckedAccount<'info>,

    // Địa chỉ loại token đang giao dịch (ví dụ: địa chỉ mint của USDC)
    #[account(mut)]
    pub token_mint: Box<InterfaceAccount<'info, Mint>>,

    // ATA của User: hòm chứa Token bên phía người dùng. Sẽ nhận token về.
    #[account(
        mut,
        associated_token::mint = token_mint,       // Hòm này phải chứa đúng loại token
        associated_token::authority = user         // Chủ của hòm này là user
    )]
    pub user_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    // ATA của Bank: hòm chứa Token bên phía ngân hàng. Token sẽ bị rút ra từ đây.
    #[account(
        mut,
        associated_token::mint = token_mint,       // Hòm này phải chứa đúng loại token
        associated_token::authority = bank_vault   // Chủ của hòm này là BankVault (PDA)
    )]
    pub bank_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    // UserReserve cho Token: sổ cái riêng cho loại token này của người dùng.
    // Seed có thêm token_mint để phân biệt với sổ cái SOL của cùng người dùng.
    #[account(
        mut,
        seeds = [
            USER_RESERVE_SEED,
            user.key().as_ref(),
            token_mint.key().as_ref()    // Seed thêm mint address để phân biệt loại token
        ],
        bump,
    )]
    pub user_reserve: Box<Account<'info, UserReserve>>,

    // Người ký lệnh - phải là chủ của user_ata
    #[account(mut)]
    pub user: Signer<'info>,
    // Token Program: chương trình SPL quản lý việc chuyển token
    pub token_program: Program<'info, Token>,
}

// --- Logic xử lý lệnh WITHDRAW TOKEN ---
impl<'info> WithdrawToken<'info> {
    pub fn process(ctx: Context<WithdrawToken>, withdraw_amount: u64) -> Result<()> {
        let bank_info = &ctx.accounts.bank_info;

        // GUARD 1: Ngân hàng có đang bị tạm dừng không?
        if bank_info.is_paused {
            return Err(BankAppError::BankAppPaused.into());
        }

        let user_reserve = &mut ctx.accounts.user_reserve;

        // GUARD 2: Sổ cái token của người dùng có đủ số dư để rút không?
        if user_reserve.deposited_amount < withdraw_amount {
            return Err(BankAppError::InsufficientFunds.into());
        }

        // BƯỚC QUAN TRỌNG - PDA SIGNING CHO TOKEN TRANSFER:
        // bankAta được sở hữu bởi BankVault (PDA). Để Token Program
        // chấp nhận lệnh chuyển tiền từ bankAta, ta cần cung cấp
        // seed + bump của BankVault để chứng minh quyền authority.
        let pda_seeds: &[&[&[u8]]] = &[&[BANK_VAULT_SEED, &[bank_info.bump]]];

        msg!("Withdrawing {} tokens from bank ATA to user {}.", withdraw_amount, ctx.accounts.user.key());

        // Gọi helper token_transfer_from_pda (dùng invoke_signed với Token Program)
        token_transfer_from_pda(
            ctx.accounts.bank_ata.to_account_info(),    // Nguồn: hòm token của Bank
            ctx.accounts.bank_vault.to_account_info(),  // Authority ký: BankVault PDA
            ctx.accounts.user_ata.to_account_info(),    // Đích: hòm token của User
            &ctx.accounts.token_program,
            pda_seeds,
            withdraw_amount,
        )?;

        // Trừ số dư trong sổ cái token sau khi rút thành công
        user_reserve.deposited_amount -= withdraw_amount;

        msg!("Token withdrawal successful. Remaining reserve: {} tokens.", user_reserve.deposited_amount);

        Ok(())
    }
}
