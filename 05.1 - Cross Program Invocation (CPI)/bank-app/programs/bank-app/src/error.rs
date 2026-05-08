use anchor_lang::prelude::*;

#[error_code]
pub enum BankAppError {
    #[msg("The bank app is currently paused.")]
    BankAppPaused,
    #[msg("Insufficient funds in the vault or user reserve.")]
    InsufficientFunds,
}
