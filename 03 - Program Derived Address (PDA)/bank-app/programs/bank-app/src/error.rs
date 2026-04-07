use anchor_lang::prelude::*;

#[error_code]
pub enum BankAppError {
    #[msg("The bank app is currently paused.")]
    BankAppPaused,
    #[msg("Insufficient funds in user reserve.")]
    InsufficientFunds,
    #[msg("Unauthorized access.")]
    UnAuthorized,
    #[msg("Deposit amount is too small.")]
    DepositTooSmall,
    #[msg("Deposit amount is too large.")]
    DepositTooLarge,
}
