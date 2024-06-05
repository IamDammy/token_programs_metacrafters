use anchor_lang::{prelude::*, solana_program::pubkey::Pubkey};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{transfer, Mint, Token, TokenAccount, Transfer},
};

declare_id!("HCWnGf6fEuaaSrYFTJoydHoJ4JtDesqtR3tWV5hSsCc7");

#[program]
pub mod token_program {
    use super::*;

    
    pub fn initialize_program_signer(
        ctx: Context<InitializeProgramSigner>,
        bump: u8,
    ) -> Result<()> {
        ctx.accounts.new_program_signer.is_initialized = true;
        ctx.accounts.new_program_signer.is_signer = true;
        ctx.accounts.new_program_signer.bump = bump;

        msg!(
            "program signer is initialized new pubkey: {}",
            ctx.accounts.new_program_signer.key()
        );

        return Ok(());
    }

   
    pub fn initialize_program_associate_token_account(
        ctx: Context<InitializeProgramAssociatedTokenAccount>,
    ) -> Result<()> {
        msg!(
            "program associated token account intialzied new pubkey: {}",
            ctx.accounts.program_associated_token_account.key()
        );

        return Ok(());
    }

   
    pub fn initialize_locked_token_account(
        ctx: Context<InitializeLockedTokenAccount>,
    ) -> Result<()> {
        let a = ctx.accounts;

        a.program_locked_account.authority = a.program_signer.key();
        a.program_locked_account.token_mint = a.token_mint.key();
        a.program_locked_account.amount = 0;

        msg!(
            "program locked account intialzied new pubkey: {}",
            a.program_locked_account.key()
        );

        msg!("locked amount: {}", a.program_locked_account.amount);

        return Ok(());
    }

  
    pub fn stake_token(ctx: Context<StakeToken>, amount: u64) -> Result<()> {
        let a = ctx.accounts;

        let cpi_program = a.token_program.to_account_info();

        let cpi_accounts = Transfer {
            from: a.user_associated_token.to_account_info(),
            to: a.program_associated_token.to_account_info(),
            authority: a.user.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        transfer(cpi_ctx, amount)?;

        a.locked_token.amount += amount;

        msg!("locked amount: {}", a.locked_token.amount);

        return Ok(());
    }

    pub fn unstake_token(ctx: Context<UnstakeToken>, amount: u64) -> Result<()> {
        let a = ctx.accounts;

        let bump = a.program_signer.bump.to_le_bytes();
        let inner=vec!["signer".as_ref(),bump.as_ref()];
        let outer=vec![inner.as_slice()];
        let cpi_program = a.associated_token_program.to_account_info();

        let cpi_accounts = Transfer {
            from: a.program_associated_token.to_account_info(),
            to: a.user_associated_token.to_account_info(),
            authority: a.program_signer.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, &outer.as_ref());

        transfer(cpi_ctx, amount)?;

        a.locked_token.amount -= amount;

        msg!("locked amount: {}", a.locked_token.amount);

        return Ok(());
    }
}
#[error_code]
pub enum MyError {
    #[msg("User can't unstake amount more than locked balance.")]
    AmountTooLarge
}

#[derive(Accounts)]
pub struct InitializeProgramSigner<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + 1 + 1 + 1,
        seeds = [b"signer"],
        bump
    )]
    pub new_program_signer: Account<'info, SignerAccount>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeProgramAssociatedTokenAccount<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        constraint = program_signer.is_initialized == true,
        seeds = [b"signer"],
        bump = program_signer.bump
    )]
    pub program_signer: Account<'info, SignerAccount>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = token_mint,
        associated_token::authority = program_signer,
        associated_token::token_program = token_program,
        // associated_token::token_program = associated_token_program,

    )]
    pub program_associated_token_account: Account<'info, TokenAccount>,
    pub token_mint: Account<'info, Mint>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeLockedTokenAccount<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"signer"],
        bump = program_signer.bump
    )]
    pub program_signer: Account<'info, SignerAccount>,

    #[account(
        init,
        payer = user,
        space = 8 + 32 + 32 + 8,
        seeds = [user.key().as_ref(), program_signer.key().as_ref(), token_mint.key().as_ref()],
        bump,
    )]
    pub program_locked_account: Account<'info, LockedTokenAccount>,

    #[account(
        constraint = user_associated_token.mint == program_associated_token.mint,
        seeds = [user.key().as_ref(), token_program.key().as_ref(), token_mint.key().as_ref()],
        bump,
        seeds::program = associated_token_program,
    )]
    pub user_associated_token: Account<'info, TokenAccount>,

    #[account(
        seeds = [
            program_signer.key().as_ref(), 
            token_program.key().as_ref(), 
            token_mint.key().as_ref()
        ],
        bump,
        seeds::program = associated_token_program
    )]
    pub program_associated_token: Account<'info, TokenAccount>,

    #[account(
        constraint = token_mint.key() == user_associated_token.mint && token_mint.key() == program_associated_token.mint
    )]
    pub token_mint: Account<'info, Mint>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"signer"],
        bump = program_signer.bump
    )]
    pub program_signer: Account<'info, SignerAccount>,

    #[account(
        mut,
        constraint = user_associated_token.mint == program_associated_token.mint,
        seeds = [user.key().as_ref(), token_program.key().as_ref(), token_mint.key().as_ref()],
        bump,
        seeds::program = associated_token_program,
    )]
    pub user_associated_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [program_signer.key().as_ref(), token_program.key().as_ref(), token_mint.key().as_ref()],
        bump,
        seeds::program = associated_token_program,
    )]
    pub program_associated_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [user.key().as_ref(), program_signer.key().as_ref(), token_mint.key().as_ref()],
        bump,
    )]
    pub locked_token: Account<'info, LockedTokenAccount>,

    #[account(
        constraint = token_mint.key() == user_associated_token.mint && token_mint.key() == program_associated_token.mint
    )]
    pub token_mint: Account<'info, Mint>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct UnstakeToken<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"signer"],
        bump = program_signer.bump
    )]
    pub program_signer: Account<'info, SignerAccount>,

    #[account(
        mut,
        constraint = user_associated_token.mint == program_associated_token.mint,
        seeds = [user.key().as_ref(), token_program.key().as_ref(), token_mint.key().as_ref()],
        bump,
        seeds::program = associated_token_program,
    )]
    pub user_associated_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [program_signer.key().as_ref(), token_program.key().as_ref(), token_mint.key().as_ref()],
        bump,
        seeds::program = associated_token_program,
    )]
    pub program_associated_token: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = amount <= locked_token.amount @ MyError::AmountTooLarge,
        seeds = [user.key().as_ref(), program_signer.key().as_ref(), token_mint.key().as_ref()],
        bump,
    )]
    pub locked_token: Account<'info, LockedTokenAccount>,

    #[account(
        constraint = token_mint.key() == user_associated_token.mint && token_mint.key() == program_associated_token.mint
    )]
    pub token_mint: Account<'info, Mint>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct SignerAccount {
    pub is_initialized: bool,
    pub is_signer: bool,
    pub bump: u8,
}

#[account]
pub struct LockedTokenAccount {
    // pubkey of user
    pub authority: Pubkey,

    // token mint
    pub token_mint: Pubkey,

    // staked amount of user
    pub amount: u64,
}



























































// #[program]
// pub mod token_program {
//     use super::*;

//     pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
//         Ok(())
//     }
// }

// #[derive(Accounts)]
// pub struct Initialize {}
