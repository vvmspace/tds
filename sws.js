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
const CHANCE = process.env.CHANCE ? parseInt(process.env.CHANCE) : 1;
const MAX_PRICE_PER_M = process.env.MAX_PRICE_PER_M;
const TELEGRAM_BOT_TOKEN= process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

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

    const keys = await mnemonicToPrivateKey(mnemonic.trim().split(' '));
    const wallet = tonClient.open(
        WalletContractV4.create({
            workchain: 0,
            publicKey: keys.publicKey,
        })
    );

    let contract = tonClient.open(wallet);

    // Get balance
    let balance = parseInt(`${await contract.getBalance()}`);
    const minBalance = 7 * 1000000000 * (new Date().getTime() - 1731258236489) / 1000 / 60 / 60 / 24;
    if (balance < minBalance) {
        console.log(`Not enough balance: ${balance} of ${minBalance}`);
        process.exit(0);
    }
    console.log(`Wallet balance: ${balance}, min balance: ${minBalance}`);
    if (Math.random() > 1 / CHANCE) {
        console.log('Not this time');
        process.exit(0);
    }
    console.log('Fetching pools...');
    const { tonVault, pool } = await initializeVaultAndPool();

    if (MAX_PRICE_PER_M) {
        const pricePerM = await fetch('https://api.dedust.io/v2/pools')
            .then((response) => response.json())
            .then((pools) => pools.find(pool => ((pool.assets[0]?.address === JETTON_ADDRESS || pool.assets[1]?.address === JETTON_ADDRESS) && (pool.assets[0]?.address === TON.address || pool.assets[1]?.address === TON.address))))
            .then((pool)  => {
                if (pool.lastPrice < 1) {
                    console.log(`Price per M: ${pool.lastPrice} < 1`);
                    return 1000000 * parseFloat(pool.lastPrice);
                }
                console.log(`Price per M: ${pool.lastPrice}`);
                return 1000000 / parseFloat(pool.lastPrice);
            });

        if (pricePerM > parseFloat(MAX_PRICE_PER_M)) {
            console.log(`Price per M: ${pricePerM} > ${MAX_PRICE_PER_M}`);
            if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID && (pricePerM > parseFloat(MAX_PRICE_PER_M) * 1.1)) {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=Price per M: ${pricePerM} > ${MAX_PRICE_PER_M}`);
            }
            process.exit(0);
        }
    }

    const sender = wallet.sender(keys.secretKey);
    const amountIn = toNano(TON_VALUE); //TON value


    if (balance - minBalance < amountIn) {
        console.log(`Not enough balance: ${balance - minBalance} of ${amountIn}`);
        process.exit(0);
    }
    await tonVault.sendSwap(sender, {
        poolAddress: pool.address,
        amount: amountIn,
        gasAmount: toNano(GAS_AMOUNT),
        
    }).then((result) => {
        console.log(`Swap successful for wallet: ${walletAddress}`);
        console.log(`Swap result: ${JSON.stringify(result, null, 2)}`);
        return fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${JETTON_ADDRESS} Swap successful for wallet: ${walletAddress}`);
    }).catch((e) => {
        console.log(`Swap failed for wallet: ${walletAddress}`);
    });

    console.log(`Swap successful for wallet: ${walletAddress}`);
}

processWallet(MNEMONIC, ADDRESS);
