import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TokenProgram } from "../target/types/token_program";
import {
  createMint,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { assert } from "chai";

const {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram
} = anchor.web3

class Token {

  owner: anchor.web3.Keypair;
  mintAuthority: anchor.web3.Keypair;
  freezeAuthority: anchor.web3.Keypair;
  tokenMint: anchor.web3.PublicKey;

  constructor() {
  }

  generate = async (anchor: any, provider: any) => {
    const { Keypair } = anchor.web3
    const { connection } = provider
    this.owner = Keypair.generate();
    this.mintAuthority = Keypair.generate();
    this.freezeAuthority = Keypair.generate();

    const airdropSignature = await connection.requestAirdrop(this.owner.publicKey, 100 * LAMPORTS_PER_SOL)
    const latestBlockHash = await connection.getLatestBlockhash()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    })
  }

  mint = async (provider: any) => {
    const { connection } = provider
    this.tokenMint = await createMint(
      connection,
      this.owner,
      this.mintAuthority.publicKey,
      this.freezeAuthority.publicKey,
      9
    )
  }

  getTokenAccount = async (provider: any, owner: any) => {

    const { connection } = provider
    const { publicKey } = owner
    const payer = this.owner
    const mint = this.tokenMint

    return await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      publicKey
    )
  }

  airdrop = async (provider: any, owner: any, amount: any) => {

    const { connection } = provider
    const { publicKey } = owner
    const payer = this.owner
    const mint = this.tokenMint
    const mintAuthority = this.mintAuthority


    // // need airdrop sol first
    // await connection.requestAirdrop(publicKey, 100 * LAMPORTS_PER_SOL)

    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mint,
      publicKey
    )

    await mintTo(
      connection,
      payer,
      mint,
      tokenAccount.address,
      mintAuthority,
      amount
    )

  }

  getProgramTokenAccount = async (provider, seed, programId) => {

    const [authorhizeAccount, bump] = anchor.web3.PublicKey.findProgramAddressSync(
      seed,
      programId
    )

    return await this.getTokenAccount(provider, { owner: authorhizeAccount })
  }

}

class User {
  keypair: anchor.web3.Keypair;
  constructor() {

  }
}

const getPubkeys = (program, token, user) => {
  const [signer] = PublicKey.findProgramAddressSync(
    [Buffer.from("signer")],
    program.programId
  )

  const [programLockedAccount] = PublicKey.findProgramAddressSync(
    [user.keypair.publicKey.toBuffer(), signer.toBuffer(), token.tokenMint.toBuffer()],
    program.programId
  )

  const userAssociatedToken = getAssociatedTokenAddressSync(
    token.tokenMint,
    user.keypair.publicKey
  )

  const programAssociatedToken = getAssociatedTokenAddressSync(
    token.tokenMint,
    signer,
    true
  )

  return [
    signer,
    programLockedAccount,
    userAssociatedToken,
    programAssociatedToken
  ]
}

describe("token_program", () => {
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.TokenProgram as Program<TokenProgram>;
  const provider = anchor.getProvider()
  const { connection } = provider

  const token = new Token()

  before("create token mint", async () => {
    await token.generate(anchor, provider)
    await token.mint(provider)
  })

  it("initialize program signer", async () => {

    const { connection } = provider

    const payer = Keypair.generate()
    const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL)
    const latestBlockHash = await connection.getLatestBlockhash()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdropSignature,
    });

    const [signer, bump] = PublicKey.findProgramAddressSync(
      [Buffer.from("signer")],
      program.programId
    )

    const tx = await program.methods
      .initializeProgramSigner(bump)
      .accounts({
        payer: payer.publicKey,
        newProgramSigner: signer,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc()

    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: tx,
    });

    // console.log("\t\t --  TX: ", tx)

  })

  describe("user staking process:", () => {

    const user = new User()
    user.keypair = Keypair.generate()

    before("airdrop tokens", async () => {

      const airdropSignature = await connection.requestAirdrop(user.keypair.publicKey, 2 * LAMPORTS_PER_SOL)
      const latestBlockHash = await connection.getLatestBlockhash()

      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: airdropSignature,
      })

      await token.airdrop(provider, user.keypair, 100 * LAMPORTS_PER_SOL)
    })

    describe("transaction executed sequentually:", () => {

      it("initialize Program Associate Token Account", async () => {
        const { connection } = provider

        const payer = Keypair.generate()
        const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL)
        const latestBlockHash = await connection.getLatestBlockhash()

        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: airdropSignature,
        })

        const [signer] = PublicKey.findProgramAddressSync(
          [Buffer.from("signer")],
          program.programId
        )

        const programAssociatedToken = getAssociatedTokenAddressSync(
          token.tokenMint,
          signer,
          true
        )

        const tx = await program.methods
          .initializeProgramAssociateTokenAccount()
          .accounts({
            payer: payer.publicKey,
            programSigner: signer,
            programAssociatedTokenAccount: programAssociatedToken,
            tokenMint: token.tokenMint,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([payer])
          .rpc()

        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: tx,
        });

        // console.log("\t\t --  TX: ", tx)
      })

      it("initialize Locked Token Account", async () => {

        const [
          signer,
          programLockedAccount,
          userAssociatedToken,
          programAssociatedToken
        ] = getPubkeys(program, token, user)

        const tx = await program.methods
          .initializeLockedTokenAccount()
          .accounts({
            user: user.keypair.publicKey,
            programSigner: signer,
            programLockedAccount: programLockedAccount,
            userAssociatedToken: userAssociatedToken,
            programAssociatedToken: programAssociatedToken,
            tokenMint: token.tokenMint,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([user.keypair])
          .rpc()

        const latestBlockHash = await connection.getLatestBlockhash()

        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: tx,
        });

        // console.log("\t\t --  TX: ", tx)
      })

      it("Stake user token", async () => {

        const [
          signer,
          programLockedAccount,
          userAssociatedToken,
          programAssociatedToken
        ] = getPubkeys(program, token, user)

        const amount = new anchor.BN(20 * LAMPORTS_PER_SOL)

        const tx = await program.methods
          .stakeToken(amount)
          .accounts({
            user: user.keypair.publicKey,
            programSigner: signer,
            lockedToken: programLockedAccount,
            userAssociatedToken: userAssociatedToken,
            programAssociatedToken: programAssociatedToken,
            tokenMint: token.tokenMint,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user.keypair])
          .rpc()

        const latestBlockHash = await connection.getLatestBlockhash()

        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: tx,
        });

        // console.log("\t\t --  TX: ", tx)
      })

      it("unstake user token", async () => {

        const [
          signer,
          programLockedAccount,
          userAssociatedToken,
          programAssociatedToken
        ] = getPubkeys(program, token, user)

        const amount = new anchor.BN(10 * LAMPORTS_PER_SOL)

        const tx = await program.methods
          .unstakeToken(amount)
          .accounts({
            user: user.keypair.publicKey,
            programSigner: signer,
            lockedToken: programLockedAccount,
            userAssociatedToken: userAssociatedToken,
            programAssociatedToken: programAssociatedToken,
            tokenMint: token.tokenMint,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user.keypair])
          .rpc()

        const latestBlockHash = await connection.getLatestBlockhash()

        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: tx,
        });

        // console.log("\t\t --  TX: ", tx)
      })


    })

    describe("batch transation execution:", () => {

      const token = new Token()

      const user = new User()
      user.keypair = Keypair.generate()

      before("airdrop tokens", async () => {

        await token.generate(anchor, provider)
        await token.mint(provider)

        const airdropSignature = await connection.requestAirdrop(user.keypair.publicKey, 2 * LAMPORTS_PER_SOL)
        const latestBlockHash = await connection.getLatestBlockhash()

        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: airdropSignature,
        })

        await token.airdrop(provider, user.keypair, 100 * LAMPORTS_PER_SOL)
      })

      it("init ATA and Locked Account, and then stake.", async () => {

        const [
          signer,
          programLockedAccount,
          userAssociatedToken,
          programAssociatedToken
        ] = getPubkeys(program, token, user)

        const amount = new anchor.BN(20 * LAMPORTS_PER_SOL)

        const initializeProgramAssociateTokenAccount = await program.methods
          .initializeProgramAssociateTokenAccount()
          .accounts({
            payer: user.keypair.publicKey,
            programSigner: signer,
            programAssociatedTokenAccount: programAssociatedToken,
            tokenMint: token.tokenMint,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .prepare()

        const initializeLockedTokenAccount = await program.methods
          .initializeLockedTokenAccount()
          .accounts({
            user: user.keypair.publicKey,
            programSigner: signer,
            programLockedAccount: programLockedAccount,
            userAssociatedToken: userAssociatedToken,
            programAssociatedToken: programAssociatedToken,
            tokenMint: token.tokenMint,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .prepare()

        const tx = await program.methods
          .stakeToken(amount)
          .preInstructions([
            initializeProgramAssociateTokenAccount.instruction,
            initializeLockedTokenAccount.instruction,
          ])
          .accounts({
            user: user.keypair.publicKey,
            programSigner: signer,
            lockedToken: programLockedAccount,
            userAssociatedToken: userAssociatedToken,
            programAssociatedToken: programAssociatedToken,
            tokenMint: token.tokenMint,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([user.keypair])
          .rpc()

        const latestBlockHash = await connection.getLatestBlockhash()

        await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: tx,
        });

        // console.log("\t\t --  TX: ", tx)
      })
    })

    describe("process errors:", () => {

      it("fail transaction when user attempts to unstake more than stake balance.", async () => {

        const [
          signer,
          programLockedAccount,
          userAssociatedToken,
          programAssociatedToken
        ] = getPubkeys(program, token, user)

        const amount = new anchor.BN(1000 * LAMPORTS_PER_SOL)

        try {

          const tx = await program.methods
            .unstakeToken(amount)
            .accounts({
              user: user.keypair.publicKey,
              programSigner: signer,
              lockedToken: programLockedAccount,
              userAssociatedToken: userAssociatedToken,
              programAssociatedToken: programAssociatedToken,
              tokenMint: token.tokenMint,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([user.keypair])
            .rpc()

          // console.log("\t\t --  TX: ", tx)

        } catch (err) {
          // console.log("\t\t -- failed on unstake amount greater than what is locked")
          // console.log("\t\t -- ", err.error.errorCode.code)
          assert(err.error.errorCode.code == "AmountTooLarge", "User can't unstake amount more than locked balance.")
        }

      })
    })

  })

})

































// describe("token_program", () => {
//   // Configure the client to use the local cluster.
//   anchor.setProvider(anchor.AnchorProvider.env());

//   const program = anchor.workspace.TokenProgram as Program<TokenProgram>;

//   it("Is initialized!", async () => {
//     // Add your test here.
//     const tx = await program.methods.initialize().rpc();
//     console.log("Your transaction signature", tx);
//   });
// });
