import { Factory, MAINNET_FACTORY_ADDR, Asset, PoolType, ReadinessStatus } from '@dedust/sdk';
import { Address, TonClient4, toNano, WalletContractV4 } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { configDotenv } from 'dotenv';
import { resolve } from 'path';

const envPath = process.argv[2] || './.env';
configDotenv({ path: resolve(envPath) });

const JETTON_ADDRESS = process.env.JETTON_ADDRESS;
const GAS_AMOUNT = process.env.GAS_AMOUNT;
const TON_VALUE = process.env.MIN_VALUE
    ? process.env.MAX_VALUE
      ? Math.random() * (parseInt(process.env.MAX_VALUE) - parseInt(process.env.MIN_VALUE)) + parseInt(process.env.MIN_VALUE)
      : parseInt(process.env.MIN_VALUE) + Math.random() * (parseInt(process.env.TON_VALUE) - parseInt(process.env.MIN_VALUE)) * 2
    : process.env.TON_VALUE;
const MNEMONIC = process.env.MNEMONIC;
const ADDRESS = process.env.ADDRESS;
const CHANCE = process.env.CHANCE || 1;
const MAX_PRICE_PER_M = process.env.MAX_PRICE_PER_M;

const tonClient = new TonClient4({
    endpoint: 'https://mainnet-v4.tonhubapi.com',
});
const factory = tonClient.open(Factory.createFromAddress(MAINNET_FACTORY_ADDR));

const TON = Asset.native();
const JETTON = Asset.jetton(Address.parse(JETTON_ADDRESS));
const pool = tonClient.open(await factory.getPool(PoolType.VOLATILE, [JETTON, TON]));

async function initializeVaultAndPool() {
    const tonVault = tonClient.open(await factory.getNativeVault());

    if ((await pool.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error('Pool (TON, JETTON) does not exist.');
    }

    if ((await tonVault.getReadinessStatus()) !== ReadinessStatus.READY) {
        throw new Error('Vault (TON) does not exist.');
    }

    return { tonVault, pool };
}

const processWallet = async (mnemonic, walletAddress, jetton) => {

    if (Math.random() > 1 / CHANCE) {
        console.log('Not this time');
        process.exit(0);
    }


    console.log('Fetching pools...');
    const { tonVault, pool } = await initializeVaultAndPool();

    if (MAX_PRICE_PER_M) {
        const pricePerM = await fetch('https://api.dedust.io/v2/pools')
            .then((response) => response.json())
            .then((pools) => pools.find(pool => (pool.assets[0]?.address === JETTON_ADDRESS || pool.assets[1]?.address === JETTON_ADDRESS)))
            .then((pool)  => 1000000 / pool.lastPrice);

        if (pricePerM > parseFloat(MAX_PRICE_PER_M)) {
            console.log(`Price per M: ${pricePerM} > ${MAX_PRICE_PER_M}`);
            process.exit(0);
        }
    }

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
