use anchor_lang::{prelude::*, system_program};

use crate::{
    constant::{BANK_INFO_SEED, BANK_VAULT_SEED, USER_RESERVE_SEED},
    error::BankAppError,
    state::{BankInfo, UserReserve},
};

// ============================================================
// INSTRUCTION: WITHDRAW SOL (Rút SOL về ví người dùng)
// Đây là instruction phức tạp nhất: muốn chuyển tiền ra khỏi
// BankVault (một PDA), chương trình phải dùng kỹ thuật
// PDA Signing (invoke_signed) vì Vault không có private key.
// ============================================================

// --- Khai báo các tài khoản tham gia vào lệnh WITHDRAW ---
#[derive(Accounts)]
pub struct Withdraw<'info> {
    // BankInfo: đọc trạng thái is_paused và lấy bump của vault để ký
    // Cần mut vì... thực ra không cần mut ở đây, nhưng để nhất quán
    #[account(
        mut,
        seeds = [BANK_INFO_SEED],
        bump
    )]
    pub bank_info: Box<Account<'info, BankInfo>>,

    // BankVault: két sắt thật sự chứa SOL. Cần mut vì sẽ bị trừ tiền.
    // UncheckedAccount vì nó chỉ là một SystemProgram account (ví thường),
    // không có cấu trúc dữ liệu Anchor gắn kèm.
    ///CHECK:
    #[account(
        mut,
        seeds = [BANK_VAULT_SEED],
        bump,
        owner = system_program::ID   // Xác nhận đây là account do System Program sở hữu
    )]
    pub bank_vault: UncheckedAccount<'info>,

    // UserReserve: sổ cái của người dùng. Cần mut vì sẽ bị trừ số dư.
    // Seed gồm USER_RESERVE_SEED + địa chỉ ví người dùng → mỗi ví có sổ cái riêng.
    #[account(
        mut,
        seeds = [USER_RESERVE_SEED, user.key().as_ref()],
        bump,
    )]
    pub user_reserve: Box<Account<'info, UserReserve>>,

    // User: người ký lệnh và cũng là nơi sẽ nhận tiền về
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// --- Logic xử lý lệnh WITHDRAW ---
impl<'info> Withdraw<'info> {
    pub fn process(ctx: Context<Withdraw>, withdraw_amount: u64) -> Result<()> {
        // GUARD 1: Ngân hàng có đang bị tạm dừng không?
        if ctx.accounts.bank_info.is_paused {
            return Err(BankAppError::BankAppPaused.into());
        }

        let user_reserve = &mut ctx.accounts.user_reserve;

        // GUARD 2: Sổ cái của người dùng có đủ tiền để rút không?
        if user_reserve.deposited_amount < withdraw_amount {
            return Err(BankAppError::InsufficientFunds.into());
        }

        // BƯỚC QUAN TRỌNG - PDA SIGNING:
        // Vault không có private key nên không thể ký bình thường.
        // Thay vào đó, chúng ta cung cấp SEED + BUMP → Solana runtime
        // sẽ tự xác minh và cho phép chuyển tiền ra khỏi Vault.
        let pda_seeds: &[&[&[u8]]] = &[&[BANK_VAULT_SEED, &[ctx.accounts.bank_info.bump]]];

        msg!("Withdrawing {} lamports from bank vault to user {}.", withdraw_amount, ctx.accounts.user.key());

        // Gọi helper dùng invoke_signed để chuyển SOL từ Vault về ví user
        crate::transfer_helper::sol_transfer_from_pda(
            ctx.accounts.bank_vault.to_account_info(),
            ctx.accounts.user.to_account_info(),
            &ctx.accounts.system_program,
            pda_seeds,
            withdraw_amount,
        )?;

        // Trừ số dư trong sổ cái sau khi rút thành công
        user_reserve.deposited_amount -= withdraw_amount;

        msg!("Withdrawal successful. Remaining reserve balance: {} lamports.", user_reserve.deposited_amount);

        Ok(())
    }
}
