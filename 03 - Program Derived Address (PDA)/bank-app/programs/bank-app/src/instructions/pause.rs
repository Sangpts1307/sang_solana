use anchor_lang::prelude::*;

use crate::{
    constant::BANK_INFO_SEED,
    error::BankAppError,
    state::BankInfo,
};

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        mut,
        seeds = [BANK_INFO_SEED],
        bump,
        has_one = authority @ BankAppError::UnAuthorized
    )]
    pub bank_info: Box<Account<'info, BankInfo>>,

    pub authority: Signer<'info>,
}

impl<'info> Pause<'info> {
    pub fn process(ctx: Context<Pause>, set_paused: bool) -> Result<()> {
        let bank_info = &mut ctx.accounts.bank_info;
        
        bank_info.is_paused = set_paused;
        
        if set_paused {
            msg!("Bank has been paused by authority {}.", ctx.accounts.authority.key());
        } else {
            msg!("Bank has been unpaused by authority {}.", ctx.accounts.authority.key());
        }
        
        Ok(())
    }
}
