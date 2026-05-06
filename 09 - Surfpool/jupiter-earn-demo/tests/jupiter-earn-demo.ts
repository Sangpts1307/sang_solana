import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { JupiterEarnCpi } from "../target/types/jupiter_earn_cpi.js";
import { PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { createAssociatedTokenAccountInstruction, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import { getDepositContext, getUserLendingPositionByAsset } from "@jup-ag/lend/earn";

// const lend = require("@jup-ag/lend/earn");


describe("jupiter-earn-cpi", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.JupiterEarnCpi as Program<JupiterEarnCpi>;

    const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
    const depositAmount = new BN(1_000_000); // 1 USDC
    const tokenProgram = TOKEN_PROGRAM_ID;

    async function surfpoolSetTokenAccount(
        owner: PublicKey,
        mint: PublicKey,
        amount: number
    ): Promise<void> {
        const response = await fetch(provider.connection.rpcEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "surfnet_setTokenAccount",
                params: [
                    owner.toBase58(),
                    mint.toBase58(),
                    { amount, state: "initialized" },
                    tokenProgram.toBase58(),
                ],
            }),
        });
        const json = (await response.json()) as { error?: { message?: string } };
        if (json.error) {
            throw new Error(`surfnet_setTokenAccount failed: ${json.error.message ?? "unknown error"}`);
        }
    }

    async function ensureAta(payer: PublicKey, owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
        const ata = await getOrCreateAssociatedTokenAccount(provider.connection, provider.wallet.payer, mint, owner);
        // const ata = getAssociatedTokenAddressSync(mint, owner);
        // const accountInfo = await provider.connection.getAccountInfo(ata);
        // if (!accountInfo) {
        //     const ix = createAssociatedTokenAccountInstruction(payer, ata, owner, mint, tokenProgram);
        //     const tx = new anchor.web3.Transaction().add(ix);
        //     await provider.sendAndConfirm(tx, []);
        // }
        return ata.address;
    }

    before(async () => {
        const endpoint = provider.connection.rpcEndpoint;
        const isLocalRpc = endpoint.includes("127.0.0.1") || endpoint.includes("localhost");
        assert.isTrue(
            isLocalRpc,
            `Provider RPC must point to local Surfpool. Current endpoint: ${endpoint}`
        );
    });

    it("deposits USDC via CPI and increases user Jupiter Earn position", async () => {
        const signer = provider.wallet.publicKey;

        const depositContext = await getDepositContext({
            asset: usdcMint,
            signer,
            connection: provider.connection,
        });

        const userUsdcAta = await ensureAta(signer, signer, usdcMint);
        const userFTokenAta = await ensureAta(signer, signer, new PublicKey(depositContext.fTokenMint));

        // await surfpoolSetTokenAccount(signer, usdcMint, 100_000_000); // 100 USDC

        const beforePosition = await getUserLendingPositionByAsset({
            asset: usdcMint,
            user: signer,
            connection: provider.connection,
        });

        console.log(provider.connection.rpcEndpoint, depositContext.vault)
        console.log((await getAccount(provider.connection, userUsdcAta)).amount.toString())
        console.log("underlaying balance", beforePosition.underlyingBalance.toNumber())
        console.log("lending token shares", beforePosition.lendingTokenShares.toNumber())

        const latestBlockhash = await provider.connection.getLatestBlockhash("confirmed");

        const signature = await program.methods
            .depositToEarn(depositAmount)
            .accounts({
                signer,
                depositorTokenAccount: userUsdcAta,
                recipientFTokenAccount: userFTokenAta,
                mint: usdcMint,
                lendingAdmin: new PublicKey(depositContext.lendingAdmin),
                lending: new PublicKey(depositContext.lending),
                fTokenMint: new PublicKey(depositContext.fTokenMint),
                supplyTokenReservesLiquidity: new PublicKey(depositContext.supplyTokenReservesLiquidity),
                lendingSupplyPositionOnLiquidity: new PublicKey(depositContext.lendingSupplyPositionOnLiquidity),
                rateModel: new PublicKey(depositContext.rateModel),
                vault: new PublicKey(depositContext.vault),
                liquidity: new PublicKey(depositContext.liquidity),
                liquidityProgram: new PublicKey(depositContext.liquidityProgram),
                rewardsRateModel: new PublicKey(depositContext.rewardsRateModel),
            })
            .rpc();

        await provider.connection.confirmTransaction(
            {
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            },
            "confirmed"
        );

        const afterPosition = await getUserLendingPositionByAsset({
            asset: usdcMint,
            user: signer,
            connection: provider.connection,
        });

        assert(
            afterPosition.lendingTokenShares.gt(beforePosition.lendingTokenShares),
            `Expected lendingTokenShares to increase: before=${beforePosition.lendingTokenShares.toString()} after=${afterPosition.lendingTokenShares.toString()}`
        );
        assert(
            afterPosition.underlyingAssets.gt(beforePosition.underlyingAssets),
            `Expected underlyingAssets to increase: before=${beforePosition.underlyingAssets.toString()} after=${afterPosition.underlyingAssets.toString()}`
        );
    });

});