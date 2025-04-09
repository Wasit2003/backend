const { Web3 } = require('web3');
const { USDT_ABI } = require('../constants/contracts');
require('dotenv').config();

class BlockchainService {
  constructor() {
    this.web3 = new Web3(process.env.BSC_ENDPOINT);
    this.adminWallet = {
      address: process.env.ADMIN_WALLET_ADDRESS,
      privateKey: process.env.ADMIN_WALLET_PRIVATE_KEY
    };
    this.usdtContract = new this.web3.eth.Contract(
      USDT_ABI,
      process.env.USDT_CONTRACT_ADDRESS
    );
  }

  // Transfer USDT to user
  async transferUSDT(toAddress, amount) {
    try {
      // Create transaction data
      const data = this.usdtContract.methods.transfer(
        toAddress,
        amount
      ).encodeABI();

      // Get nonce
      const nonce = await this.web3.eth.getTransactionCount(this.adminWallet.address);

      // Get gas price
      const gasPrice = await this.web3.eth.getGasPrice();

      // Estimate gas
      const gasLimit = await this.usdtContract.methods.transfer(toAddress, amount)
        .estimateGas({ from: this.adminWallet.address });

      // Create transaction object
      const txObject = {
        nonce: this.web3.utils.toHex(nonce),
        gasLimit: this.web3.utils.toHex(gasLimit),
        gasPrice: this.web3.utils.toHex(gasPrice),
        to: process.env.USDT_CONTRACT_ADDRESS,
        data: data,
        chainId: process.env.CHAIN_ID
      };

      // Sign transaction
      const signedTx = await this.web3.eth.accounts.signTransaction(
        txObject,
        this.adminWallet.privateKey
      );

      // Send transaction
      const receipt = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      return receipt.transactionHash;
    } catch (error) {
      console.error('USDT transfer error:', error);
      throw new Error('Failed to transfer USDT');
    }
  }

  // Monitor transaction status
  async monitorTransaction(txHash) {
    try {
      const receipt = await this.web3.eth.getTransactionReceipt(txHash);
      if (!receipt) {
        return { status: 'pending' };
      }

      return {
        status: receipt.status ? 'confirmed' : 'failed',
        gasUsed: receipt.gasUsed,
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Monitor transaction error:', error);
      throw new Error('Failed to monitor transaction');
    }
  }

  // Verify USDT balance
  async verifyUSDTBalance(amount) {
    try {
      const balance = await this.usdtContract.methods
        .balanceOf(this.adminWallet.address)
        .call();

      return BigInt(balance) >= BigInt(amount);
    } catch (error) {
      console.error('Balance verification error:', error);
      throw new Error('Failed to verify USDT balance');
    }
  }
}

module.exports = new BlockchainService(); 