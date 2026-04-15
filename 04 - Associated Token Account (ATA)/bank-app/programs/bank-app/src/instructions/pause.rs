use anchor_lang::prelude::*;

use crate::{
    constant::BANK_INFO_SEED,
    error::BankAppError,
    state::BankInfo,
};

// ============================================================
// INSTRUCTION: PAUSE / UNPAUSE (Quản trị viên tạm dừng ngân hàng)
// Chỉ có 1 người duy nhất được gọi lệnh này: `authority` đã được
// lưu trong BankInfo lúc Initialize. Anchor tự kiểm tra điều này
// thông qua ràng buộc `has_one = authority`.
// ============================================================

// --- Khai báo các tài khoản tham gia vào lệnh PAUSE ---
#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        mut,                                        // Cần mut vì sẽ ghi đè trường is_paused
        seeds = [BANK_INFO_SEED],                   // PDA được tạo từ seed cố định
        bump,
        // Ràng buộc quan trọng: Anchor so sánh bank_info.authority với khóa
        // của `authority` đang ký. Nếu không khớp → lỗi UnAuthorized ngay lập tức.
        has_one = authority @ BankAppError::UnAuthorized
    )]
    pub bank_info: Box<Account<'info, BankInfo>>,

    // Người ký phải là đúng là authority đã lưu trong BankInfo
    pub authority: Signer<'info>,
}

// --- Logic xử lý lệnh PAUSE ---
impl<'info> Pause<'info> {
    pub fn process(ctx: Context<Pause>, set_paused: bool) -> Result<()> {
        let bank_info = &mut ctx.accounts.bank_info;
        
        // Ghi đè trạng thái: true = tạm dừng, false = mở lại
        bank_info.is_paused = set_paused;
        
        // Log để dễ theo dõi trên Solana Explorer
        if set_paused {
            msg!("Bank has been paused by authority {}.", ctx.accounts.authority.key());
        } else {
            msg!("Bank has been unpaused by authority {}.", ctx.accounts.authority.key());
        }
        
        Ok(())
    }
}
