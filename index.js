require('dotenv').config();
const express = require('express');
const path = require('path');
const { Connection, Keypair, VersionedTransaction } = require('@solana/web3.js');
const axios = require('axios');
const { Wallet } = require('@project-serum/anchor');
const bs58 = require('bs58');

const app = express();
const port = 3000;

if (!process.env.PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY environment variable not set. Please create a .env file.");
    process.exit(1);
}

const connection = new Connection('https://api.mainnet-beta.solana.com');
const wallet = new Wallet(Keypair.fromSecretKey(bs58.default.decode(process.env.PRIVATE_KEY)));

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/swap', async (req, res) => {
    console.log('Received request for /api/swap');
    try {
        console.log('Getting quote...');
        const quoteResponse = await axios.get('https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&slippageBps=50');
        console.log('Quote received:', quoteResponse.data);
        
        console.log('Getting swap transaction...');
        const { data } = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quoteResponse.data,
            userPublicKey: wallet.publicKey.toString(),
        });
        console.log('Swap transaction received');
        
        const swapTransactionBuf = Buffer.from(data.swapTransaction, 'base64');
        var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
        console.log('Transaction deserialized');
        
        transaction.sign([wallet.payer]);
        console.log('Transaction signed');
        
        const rawTransaction = transaction.serialize();
        console.log('Sending transaction...');
        const txid = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: true,
            maxRetries: 2
        });
        console.log('Transaction sent, confirming...');
        
        const latestBlockHash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: txid
        }, 'confirmed');

        const confirmationStatus = await connection.getSignatureStatus(txid, {searchTransactionHistory: true});
        if (!confirmationStatus.value || confirmationStatus.value.err) {
            console.error('Transaction confirmation failed:', confirmationStatus.value?.err);
            throw new Error(`Transaction confirmation failed: ${confirmationStatus.value?.err || 'Unknown error'}`);
        }
        
        console.log(`Swap successful! Transaction ID: ${txid}`);
        console.log(`https://solscan.io/tx/${txid}`);
        
        res.json({ success: true, txid: txid, explorerUrl: `https://solscan.io/tx/${txid}` });

    } catch (error) {
        console.error("Swap failed:", error.response ? error.response.data : error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Swap failed', 
            details: error.response ? error.response.data : error.message 
        });
    }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});