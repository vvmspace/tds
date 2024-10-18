import fs from 'fs';
import readline from 'readline';
import { Factory, MAINNET_FACTORY_ADDR, Asset, PoolType, ReadinessStatus } from '@dedust/sdk';
import {Address, TonClient4, toNano, WalletContractV4, address} from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { configDotenv } from 'dotenv';

configDotenv();
const JETTON_ADDRESS = process.env.JETTON_ADDRESS;
const GAS_AMOUNT = process.env.GAS_AMOUNT;
const TON_VALUE = process.env.TON_VALUE;
const MNEMONIC = process.env.MNEMONIC;
const ADDRESS = process.env.ADDRESS;


const tonClient = new TonClient4({
    endpoint: 'https://mainnet-v4.tonhubapi.com',
});
const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

async function initializeVaultAndPool() {
    const tonVault = tonClient.open(await factory.getNativeVault());

    const TON = Asset.native();
    const JETTON = Asset.jetton(Address.parse(JETTON_ADDRESS));

    const pool = tonClient.open(await factory.getPool(PoolType.VOLATILE, [TON, JETTON]));

    if ((await pool.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error('Pool (TON, JETTON) does not exist.');
    }

    if ((await tonVault.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error('Vault (TON) does not exist.');
    }

    return { tonVault, pool };
}

const processWallet = async (mnemonic, walletAddress) => {
    const { tonVault, pool } = await initializeVaultAndPool();
    const keys = await mnemonicToPrivateKey(mnemonic.trim().split(' '));
    const wallet = tonClient.open(
        WalletContractV4.create({
            workchain: 0,
            publicKey: keys.publicKey,
        })
    );


    const sender = wallet.sender(keys.secretKey);
    const amountIn = toNano(TON_VALUE); //TON value

    await tonVault.sendSwap(sender, {
        poolAddress: pool.address,
        amount: amountIn,
        gasAmount: toNano(GAS_AMOUNT),
    });

    console.log(`Swap successful for wallet: ${walletAddress}`);
}

processWallet(MNEMONIC, ADDRESS);