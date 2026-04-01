use anchor_lang::prelude::*;

declare_id!("EDfskqkUwNcbwCY83uhj3XKjnnr1QdwN8mjUkPgzUTjx");

#[program]
pub mod my_first_anchor_project {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let name = "Sang new age";
        let age = 25;

        msg!("My name is {}", name);
        msg!("I'm {} years old", age);
        msg!("This is my first anchor project!");

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
