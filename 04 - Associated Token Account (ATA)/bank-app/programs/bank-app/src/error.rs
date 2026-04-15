use anchor_lang::prelude::*;

// ============================================================
// TỪ ĐIỂN LỖI TÙY CHỈNH (Custom Error Codes)
// Anchor sẽ tự động gán mã lỗi số cho từng variant theo thứ tự.
// Khi một lệnh thất bại, Client (TypeScript) sẽ nhận được tên
// variant này trong message lỗi, giúp debug dễ dàng hơn.
// ============================================================
#[error_code]
pub enum BankAppError {
    // Lỗi khi người dùng cố nạp/rút trong khi ngân hàng đang bị tạm dừng
    #[msg("The bank app is currently paused.")]
    BankAppPaused,

    // Lỗi khi người dùng cố rút nhiều hơn số dư thực tế trong sổ cái của họ
    #[msg("Insufficient funds in user reserve.")]
    InsufficientFunds,

    // Lỗi khi ví đang ký lệnh không phải là authority (Admin) của ngân hàng
    #[msg("Unauthorized access.")]
    UnAuthorized,
}
